import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  ScrollView,
  Dimensions,
  Keyboard,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useT } from '../../utils/i18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeaturedBadge, isFeaturedActive } from '../../components/ui/FeaturedBadge';
import * as Location from 'expo-location';
import { apiClient } from '../../api/client';

// ─── Layout Constants ─────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const H_PADDING = 20;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP) / 2;

// ─── Categories (must match backend ServiceCategory enum) ────────────────────
const CATEGORIES = [
  { label: 'All', value: '' },
  { label: 'Plumber', value: 'PLUMBER' },
  { label: 'Electrician', value: 'ELECTRICIAN' },
  { label: 'Carpenter', value: 'CARPENTER' },
  { label: 'Painter', value: 'PAINTER' },
  { label: 'Maid', value: 'MAID' },
  { label: 'AC Tech', value: 'AC_TECHNICIAN' },
  { label: 'Gardener', value: 'GARDENER' },
  { label: 'Pest Control', value: 'PEST_CONTROL' },
  { label: 'Cook', value: 'COOK' },
  { label: 'Driver', value: 'DRIVER' },
  { label: 'Tutor', value: 'TUTOR' },
  { label: 'Nurse', value: 'NURSE' },
  { label: 'Babysitter', value: 'BABYSITTER' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Worker {
  id: string;
  name?: string;
  user?: { name?: string; id?: string; avatar?: string; avatarUrl?: string };
  category?: string;
  rating?: number;
  totalRatings?: number;
  hourlyRate?: number;
  distance?: number;
  distanceKm?: number | null;
  avatarUrl?: string;
  completedJobs?: number;
  isGuaranteed?: boolean;
  isUrgent?: boolean;
  isAvailable?: boolean;
  verificationStatus?: string;
  isFeatured?: boolean;
  featuredUntil?: string | null;
}

// ─── Category Icons (keyed by backend enum value) ─────────────────────────────
const CATEGORY_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  '': 'view-grid',
  PLUMBER: 'pipe-wrench',
  ELECTRICIAN: 'lightning-bolt',
  CARPENTER: 'saw-blade',
  PAINTER: 'format-paint',
  MAID: 'broom',
  AC_TECHNICIAN: 'air-conditioner',
  GARDENER: 'flower',
  PEST_CONTROL: 'bug',
  COOK: 'food-apple',
  DRIVER: 'car',
  TUTOR: 'school',
  NURSE: 'medical-bag',
  BABYSITTER: 'baby-face-outline',
};

// ─── Search area ──────────────────────────────────────────────────────────────
interface SearchArea {
  lat?: number;
  lng?: number;
  city?: string;
  state?: string;
  source: 'location' | 'address' | 'none';
}

// Resolve the customer's service area for search, preferring live location and
// falling back to their saved (default) address. A customer who declined the
// location permission but saved an address still gets workers near that
// address — Amazon-style "deliver to your area" — instead of a blank, area-less
// result set. Returns source:'none' when there's nothing to anchor on.
async function resolveSearchArea(): Promise<SearchArea> {
  // 1. Live location (permission prompt shows only the first time).
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geo = await Location.reverseGeocodeAsync(loc.coords);
      const g = geo[0];
      if (g) {
        return {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          city: g.city || g.subregion || undefined,
          state: g.region || undefined,
          source: 'location',
        };
      }
    }
  } catch {
    // Location unavailable — fall through to the saved address.
  }

  // 2. Saved (default) address — it always carries coordinates.
  try {
    const res = await apiClient.get('/addresses');
    const list: any[] = res.data?.data || [];
    const addr = list.find((a) => a.isDefault) || list[0];
    if (addr && typeof addr.latitude === 'number' && typeof addr.longitude === 'number') {
      return {
        lat: addr.latitude,
        lng: addr.longitude,
        city: addr.city,
        state: addr.state,
        source: 'address',
      };
    }
  } catch {
    // No saved address either — search without area context.
  }

  return { source: 'none' };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SearchScreen() {
  const router = useRouter();
  const searchInputRef = useRef<TextInput>(null);
  const t = useT();
  // Category passed from the home screen chips (e.g. PLUMBER) — pre-select it.
  const { category } = useLocalSearchParams<{ category?: string }>();
  const initialCategory =
    typeof category === 'string' && category ? category.toUpperCase() : '';

  // ── State ─────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anchor point for search — live location when permission is granted,
  // otherwise the customer's saved (default) address. Resolved on focus and
  // read by fetchWorkers so every request sends the same area.
  const areaRef = useRef<SearchArea>({ source: 'none' });
  const [areaLabel, setAreaLabel] = useState('');

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null);
  const fetchSeqRef = useRef(0);

  const fetchWorkers = useCallback(
    async (query?: string, category?: string, isRefresh?: boolean) => {
      // Cancel any in-flight search and bump a sequence counter so a slow,
      // stale response can never overwrite a newer one (race-condition guard).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++fetchSeqRef.current;

      try {
        if (isRefresh) setRefreshing(true);
        else if (!query && !category) setLoading(true);
        setError(null);

        const params: Record<string, string> = {};
        if (query && query.trim()) params.search = query.trim();
        if (category && category !== 'All') params.category = category.toUpperCase();

        // Send the resolved search area so the backend can radius-filter around
        // it (live location) or fall back to city/state matching (saved address).
        const area = areaRef.current;
        if (typeof area.lat === 'number' && typeof area.lng === 'number') {
          params.lat = String(area.lat);
          params.lng = String(area.lng);
        }
        if (area.city) params.city = area.city;
        if (area.state) params.state = area.state;

        const res = await apiClient.get('/workers/search', { params, signal: controller.signal });
        if (seq !== fetchSeqRef.current) return; // superseded by a newer query

        const data = res.data?.data || res.data?.workers || res.data || [];
        setWorkers(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return; // aborted, not an error
        if (seq !== fetchSeqRef.current) return; // stale
        setError(e?.message || t('Failed to load workers'));
        setWorkers([]);
      } finally {
        if (seq === fetchSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [t],
  );

  // The route param can resolve after the first render — keep the chip in sync
  // so the tapped category (e.g. PLUMBER) stays highlighted, not "All".
  useEffect(() => {
    if (initialCategory) setSelectedCategory(initialCategory);
  }, [initialCategory]);

  // Search is a tab that stays mounted between visits, so stale state would
  // otherwise persist. Reset to a fresh search whenever the screen regains
  // focus (fresh navigation from home, back, etc.).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Reset to a fresh search immediately on focus — no stale results flash.
      setSearchQuery('');
      setSelectedCategory(initialCategory);
      setError(null);
      setWorkers([]);
      setLoading(true);

      // Fetch immediately with whatever area we already have. This also aborts
      // any in-flight request from the previous visit — without it, a slow stale
      // response can land while the area is being resolved below and repopulate
      // the list with the wrong category (electricians flashing in a plumber
      // search), because the stale request's sequence still matched.
      fetchWorkers('', initialCategory || undefined);

      // Then resolve the search area (permission prompt on first visit, then a
      // saved-address fallback) so workers get scoped to the customer's area
      // even when they declined the location permission. Refetching here refines
      // the fast initial results instead of blocking the whole screen on a GPS
      // fix (which is why the search felt slow).
      (async () => {
        const area = await resolveSearchArea();
        if (cancelled) return;
        areaRef.current = area;
        setAreaLabel(area.source === 'none' ? '' : area.city || area.state || '');
        fetchWorkers('', initialCategory || undefined);
      })();

      return () => {
        cancelled = true;
      };
    }, [fetchWorkers, initialCategory])
  );

  // ── Debounced search ──────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchWorkers(searchQuery, selectedCategory);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, selectedCategory, fetchWorkers]);

  // Abort any in-flight search when the screen unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    fetchWorkers(searchQuery, selectedCategory, true);
  }, [searchQuery, selectedCategory, fetchWorkers]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    Keyboard.dismiss();
    searchInputRef.current?.blur();
  }, []);

  const handleCategoryPress = useCallback((cat: string) => {
    setSelectedCategory(cat);
    Keyboard.dismiss();
  }, []);

  const handleWorkerPress = useCallback(
    (worker: Worker) => {
      const workerId = worker.user?.id || worker.id;
      if (workerId) {
        router.push(`/(customer)/worker/${workerId}` as any);
      }
    },
    [router],
  );

  // ── Render Helpers ────────────────────────────────────────────────────────
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // ── Worker Card ───────────────────────────────────────────────────────────
  const renderWorkerCard = useCallback(
    ({ item }: { item: Worker }) => {
      const workerName = item.user?.name || item.name || t('Service Provider');
      const initials = getInitials(workerName);
      const rating = item.rating ?? 0;
      const rate = item.hourlyRate ?? 0;
      const jobs = item.completedJobs ?? 0;
      const distance = item.distanceKm ?? item.distance ?? null;
      const category = item.category || 'General';

      return (
        <Pressable
          onPress={() => handleWorkerPress(item)}
          style={({ pressed }) => [
            styles.cardWrapper,
            pressed && styles.cardWrapperPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`View ${workerName}'s profile`}
        >
          <View style={styles.workerCard}>
            {/* ── Badges ─────────────────────────────────────────────── */}
            {(item.isGuaranteed || item.isUrgent || item.verificationStatus === 'VERIFIED' || isFeaturedActive(item.isFeatured, item.featuredUntil)) && (
              <View style={styles.cardBadgeRow}>
                {isFeaturedActive(item.isFeatured, item.featuredUntil) && (
                  <FeaturedBadge featuredUntil={item.featuredUntil} isFeatured={item.isFeatured} compact />
                )}
                {item.verificationStatus === 'VERIFIED' && (
                  <View style={[styles.badgePill, { backgroundColor: '#E8F5E9' }]}>
                    <MaterialCommunityIcons name="check-decagram" size={8} color="#2E7D32" />
                    <Text style={[styles.badgeText, { color: '#2E7D32' }]}>{t('Verified')}</Text>
                  </View>
                )}
                {item.isGuaranteed && (
                  <View style={[styles.badgePill, styles.badgeGuaranteed]}>
                    <MaterialCommunityIcons
                      name="check-decagram"
                      size={8}
                      color="#4CAF50"
                    />
                    <Text style={[styles.badgeText, { color: '#4CAF50' }]}>
                      {t('Guaranteed')}
                    </Text>
                  </View>
                )}
                {item.isUrgent && (
                  <View style={[styles.badgePill, styles.badgeUrgent]}>
                    <MaterialCommunityIcons
                      name="alert-decagram"
                      size={8}
                      color="#F44336"
                    />
                    <Text style={[styles.badgeText, { color: '#F44336' }]}>
                      {t('Urgent')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Availability Dot ──────────────────────────────────────── */}
            <View
              style={[
                styles.availabilityDot,
                {
                  backgroundColor: item.isAvailable ? '#4CAF50' : 'rgba(13,13,13,0.08)',
                },
              ]}
            />

            {/* ── Avatar ──────────────────────────────────────────────── */}
            <View style={styles.avatarOuter}>
              {(item.avatarUrl || item.user?.avatarUrl) ? (
                <Image
                  source={{ uri: (item.avatarUrl || item.user?.avatarUrl) as string }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
            </View>

            {/* ── Name ────────────────────────────────────────────────── */}
            <Text style={styles.cardName} numberOfLines={1}>
              {workerName}
            </Text>

            {/* ── Rating ──────────────────────────────────────────────── */}
            <View style={styles.cardRatingRow}>
              <MaterialCommunityIcons
                name="star"
                size={11}
                color="#FF5C00"
              />
              <Text style={styles.cardRatingText}>{rating.toFixed(1)}</Text>
              <Text style={styles.cardRatingTotal}>
                ({item.totalRatings ?? 0})
              </Text>
            </View>

            <View style={styles.cardCategoryPill}>
              <Text style={styles.cardCategoryText} numberOfLines={1}>
                {t(category.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '))}
              </Text>
            </View>

            {/* ── Divider ─────────────────────────────────────────────── */}
            <View style={styles.cardDivider} />

            {/* ── Stats Row ───────────────────────────────────────────── */}
            <View style={styles.cardStatsRow}>
              <View style={styles.cardStat}>
                <MaterialCommunityIcons
                  name="briefcase-check-outline"
                  size={10}
                  color="#9E9E9E"
                />
                <Text style={styles.cardStatText}>{jobs}</Text>
              </View>
              {distance !== null && (
                <View style={styles.cardStat}>
                  <MaterialCommunityIcons
                    name="map-marker-outline"
                    size={10}
                    color="#9E9E9E"
                  />
                  <Text style={styles.cardStatText}>
                    {distance < 1
                      ? `${Math.round(distance * 1000)}m`
                      : `${distance.toFixed(1)}km`}
                  </Text>
                </View>
              )}
            </View>

            {/* ── Price Row ───────────────────────────────────────────── */}
            <View style={styles.cardPriceRow}>
              {rate > 0 ? (
                <>
                  <Text style={styles.cardPriceSymbol}>₹</Text>
                  <Text style={styles.cardPriceValue}>{rate}</Text>
                  <Text style={styles.cardPriceUnit}>/{t('hr')}</Text>
                </>
              ) : (
                <Text style={styles.cardPriceValue}>—</Text>
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [handleWorkerPress, t],
  );

  // ── Empty State ──────────────────────────────────────────────────────────
  const renderEmptyState = useCallback(() => {
    const hasFilters = searchQuery.trim().length > 0 || selectedCategory !== '';
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconRing}>
          <MaterialCommunityIcons
            name={hasFilters ? 'account-search-outline' : 'account-group-outline'}
            size={48}
            color="#9E9E9E"
          />
        </View>
        <Text style={styles.emptyTitle}>{t('No Workers Found')}</Text>
        <Text style={styles.emptySubtitle}>
          {hasFilters
            ? t('No results for your current search. Try a different keyword or category.')
            : t('No workers are currently listed. Check back soon!')}
        </Text>
        {hasFilters && (
          <Pressable
            style={styles.clearFilterBtn}
            onPress={() => {
              setSearchQuery('');
              setSelectedCategory('');
              Keyboard.dismiss();
            }}
          >
            <Text style={styles.clearFilterBtnText}>{t('Clear Filters')}</Text>
          </Pressable>
        )}
      </View>
    );
  }, [searchQuery, selectedCategory, t]);

  // ── Error State ──────────────────────────────────────────────────────────
  const renderErrorState = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconRing, { borderColor: '#F44336' }]}>
          <MaterialCommunityIcons
            name="wifi-strength-off-outline"
            size={48}
            color="#F44336"
          />
        </View>
        <Text style={styles.emptyTitle}>{t('Connection Error')}</Text>
        <Text style={styles.emptySubtitle}>
          {error || t('Something went wrong. Please check your connection and try again.')}
        </Text>
        <Pressable
          style={styles.clearFilterBtn}
          onPress={() => fetchWorkers(searchQuery, selectedCategory)}
        >
          <Text style={styles.clearFilterBtnText}>{t('Retry')}</Text>
        </Pressable>
      </View>
    ),
    [error, fetchWorkers, searchQuery, selectedCategory, t],
  );

  // ── Results Header ───────────────────────────────────────────────────────
  const renderListHeader = useCallback(
    () =>
      !loading && !error && workers.length > 0 ? (
        <View style={styles.resultsHeader}>
          <View style={styles.resultsCountRow}>
            <MaterialCommunityIcons
              name="account-check"
              size={14}
              color="#9E9E9E"
            />
            <Text style={styles.resultsCountText}>
              {workers.length} {t('worker')}{workers.length !== 1 ? t('s') : ''} {t('found')}
            </Text>
          </View>
          <View style={styles.resultsCountLine} />
        </View>
      ) : null,
    [loading, error, workers.length, t],
  );

  // ── Skeleton Loading ─────────────────────────────────────────────────────
  const renderSkeletons = () => (
    <View style={styles.skeletonGrid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonBadgeRow}>
            <View style={[styles.skeletonPill, { width: 56 }]} />
          </View>
          <View style={styles.skeletonAvatar} />
          <View style={[styles.skeletonLine, { width: '75%', height: 12 }]} />
          <View style={[styles.skeletonLine, { width: '45%', height: 10, marginTop: 6 }]} />
          <View style={[styles.skeletonPill, { width: 60, marginTop: 8 }]} />
          <View style={[styles.skeletonDivider, { marginTop: 10 }]} />
          <View style={styles.skeletonStatRow}>
            <View style={[styles.skeletonLine, { width: 32, height: 10 }]} />
            <View style={[styles.skeletonLine, { width: 40, height: 10 }]} />
          </View>
          <View style={[styles.skeletonLine, { width: '55%', height: 14, marginTop: 8 }]} />
        </View>
      ))}
    </View>
  );

  // ── Main Render ──────────────────────────────────────────────────────────
  const showLoadingSkeleton = loading && !refreshing && workers.length === 0;
  const showErrorState = !loading && error && workers.length === 0;
  const showContent = !showLoadingSkeleton && !showErrorState;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{t('Search')}</Text>
      </View>

      {/* ── Area Bar ────────────────────────────────────────────────────── */}
      {areaLabel ? (
        <View style={styles.areaBar}>
          <MaterialCommunityIcons
            name="map-marker-radius"
            size={13}
            color="#FF5C00"
          />
          <Text style={styles.areaBarText} numberOfLines={1}>
            {t('Showing workers near')} {areaLabel}
          </Text>
        </View>
      ) : null}

      {/* ── Search Bar ──────────────────────────────────────────────────── */}
      <View style={styles.searchOuter}>
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <MaterialCommunityIcons
              name="magnify"
              size={18}
              color="#9E9E9E"
              style={styles.searchIcon}
            />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder={t('Search by name, skill or category...')}
              placeholderTextColor="#9E9E9E"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={clearSearch}
                style={styles.searchClearBtn}
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={16}
                  color="#9E9E9E"
                />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Loading Indicator ─────────────────────────────────────────── */}
        {loading && !refreshing && (
          <View style={styles.loaderBarWrapper}>
            <ActivityIndicator size="small" color="#FF5C00" />
          </View>
        )}

        {/* ── Category Chips ────────────────────────────────────────────── */}
        <View style={styles.chipsOuter}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            keyboardShouldPersistTaps="handled"
          >
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.value;
              const iconName = CATEGORY_ICONS[cat.value];
              return (
                <Pressable
                  key={cat.value}
                  style={({ pressed }) => [
                    styles.chip,
                    isActive && styles.chipActive,
                    pressed && !isActive && styles.chipPressed,
                  ]}
                  onPress={() => handleCategoryPress(cat.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Filter by')} ${t(cat.label)}`}
                  accessibilityState={{ selected: isActive }}
                >
                  {iconName && (
                    <MaterialCommunityIcons
                      name={iconName}
                      size={13}
                      color={isActive ? '#FFFFFF' : '#9E9E9E'}
                      style={styles.chipIcon}
                    />
                  )}
                  <Text
                    style={[styles.chipText, isActive && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {t(cat.label)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── Content Area ────────────────────────────────────────────────── */}
      {showLoadingSkeleton && (
        <View style={styles.loadingContainer}>
          {renderSkeletons()}
        </View>
      )}

      {showErrorState && (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListEmptyComponent={renderErrorState}
          contentContainerStyle={styles.listErrorContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0D0D0D"
              colors={['#FF5C00']}
              progressBackgroundColor="#F5F0E8"
            />
          }
        />
      )}

      {showContent && (
        <FlatList
          data={workers}
          renderItem={renderWorkerCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={[
            styles.listContent,
            workers.length === 0 && styles.listContentEmpty,
          ]}
          columnWrapperStyle={workers.length > 0 ? styles.columnWrapper : undefined}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyState}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0D0D0D"
              colors={['#FF5C00']}
              progressBackgroundColor="#F5F0E8"
            />
          }
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={6}
          windowSize={5}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────
  safe: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },

  // ── Top Bar ─────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
  },
  topBarTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: '#0D0D0D',
  },

  // ── Area Bar ────────────────────────────────────────────────────────────
  areaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: H_PADDING,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFF0E8',
    alignSelf: 'flex-start',
    maxWidth: SCREEN_WIDTH - H_PADDING * 2,
  },
  areaBarText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#FF5C00',
    flexShrink: 1,
  },

  // ── Search ──────────────────────────────────────────────────────────────
  searchOuter: {
    zIndex: 10,
    backgroundColor: '#F5F0E8',
  },
  searchContainer: {
    paddingHorizontal: H_PADDING,
    paddingTop: 6,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#0D0D0D',
    height: '100%',
    paddingVertical: 0,
  },
  searchClearBtn: {
    paddingLeft: 6,
  },

  // ── Loader Bar ──────────────────────────────────────────────────────────
  loaderBarWrapper: {
    paddingHorizontal: H_PADDING,
    marginBottom: 6,
    alignItems: 'center',
  },

  // ── Category Chips ──────────────────────────────────────────────────────
  chipsOuter: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(13,13,13,0.08)',
    backgroundColor: '#F5F0E8',
  },
  chipsContent: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(13,13,13,0.08)',
  },
  chipActive: {
    backgroundColor: '#FF5C00',
    borderColor: '#FF5C00',
  },
  chipPressed: {
    backgroundColor: '#EDE8DC',
  },
  chipIcon: {
    marginRight: 5,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#9E9E9E',
    letterSpacing: 0.3,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },

  // ── Results Header ──────────────────────────────────────────────────────
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    gap: 8,
  },
  resultsCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  resultsCountText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#9E9E9E',
  },
  resultsCountLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(13,13,13,0.08)',
  },

  // ── List ────────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listErrorContent: {
    flexGrow: 1,
    paddingHorizontal: H_PADDING,
  },
  columnWrapper: {
    gap: CARD_GAP,
    alignItems: 'stretch',
  },

  // ── Worker Card ─────────────────────────────────────────────────────────
  cardWrapper: {
    flex: 1,
    marginBottom: CARD_GAP,
  },
  cardWrapperPressed: {
    opacity: 0.92,
  },
  workerCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    position: 'relative',
  },

  // Card Badges
  cardBadgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    minHeight: 16,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeGuaranteed: {
    backgroundColor: '#E8F5E9',
  },
  badgeUrgent: {
    backgroundColor: '#FFEBEE',
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 7,
    letterSpacing: 0.3,
  },

  // Availability Dot
  availabilityDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Avatar
  avatarOuter: {
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EDE8DC',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F5F0E8',
  },
  avatarInitials: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#0D0D0D',
  },

  // Name
  cardName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#0D0D0D',
    textAlign: 'center',
    marginBottom: 4,
  },

  // Rating
  cardRatingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    marginBottom: 8,
  },
  cardRatingText: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    color: '#0D0D0D',
  },
  cardRatingTotal: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: '#9E9E9E',
  },

  // Category Pill
  cardCategoryPill: {
    alignSelf: 'center',
    backgroundColor: '#FFF0E8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 10,
  },
  cardCategoryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 8,
    color: '#FF5C00',
    letterSpacing: 0.5,
  },

  // Divider
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(13,13,13,0.06)',
    marginBottom: 8,
  },

  // Stats
  cardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardStatText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: '#9E9E9E',
  },

  // Price
  cardPriceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    gap: 1,
  },
  cardPriceSymbol: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    color: '#FF5C00',
  },
  cardPriceValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 17,
    color: '#0D0D0D',
  },
  cardPriceUnit: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 9,
    color: '#9E9E9E',
  },

  // ── Empty / Error State ─────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  emptyIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(13,13,13,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EDE8DC',
    marginBottom: 18,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: '#0D0D0D',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  clearFilterBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FF5C00',
  },
  clearFilterBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FF5C00',
    letterSpacing: 0.3,
  },

  // ── Loading Skeleton ────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  skeletonCard: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    paddingTop: 10,
    elevation: 1,
    marginBottom: 0,
  },
  skeletonBadgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
    minHeight: 16,
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignSelf: 'center',
    backgroundColor: '#EDE8DC',
    marginBottom: 8,
  },
  skeletonLine: {
    alignSelf: 'center',
    backgroundColor: '#EDE8DC',
    borderRadius: 4,
    height: 12,
  },
  skeletonPill: {
    height: 14,
    backgroundColor: '#EDE8DC',
    borderRadius: 7,
  },
  skeletonDivider: {
    height: 1,
    backgroundColor: 'rgba(13,13,13,0.06)',
  },
  skeletonStatRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
});