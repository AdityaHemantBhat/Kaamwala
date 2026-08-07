import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SkeletonCustomerHome } from '../../components/ui/Skeleton';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationsStore } from '../../store/notifications.store';
import { apiClient } from '../../api/client';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useT } from '../../utils/i18n';
import { FeaturedBadge, isFeaturedActive } from '../../components/ui/FeaturedBadge';
import { RebookSheet } from '../../components/ui/RebookSheet';
import { formatMoneyWithSymbol } from '../../utils/money';
import { socketService } from '../../api/socket';
import { useRealtimeWalletRefresh } from '../../hooks/useRealtimeWalletRefresh';

const TIER_COLORS: Record<string, string> = { BRONZE: '#8B6B3D', SILVER: '#8A8A8A', GOLD: '#D4A017', PLATINUM: '#E5E4E2' };

export default function CustomerHome() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [city, setCity] = useState('Delhi');
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const [rebookSource, setRebookSource] = useState<any>(null);
  const [rebookVisible, setRebookVisible] = useState(false);

  const fetchUnread = async () => {
    try {
      const res = await apiClient.get('/notifications/unread-count');
      const count = res.data?.data?.count ?? 0;
      useNotificationsStore.getState().setUnreadCount(count);
    } catch {}
  };

  useEffect(() => {
    // Socket events keep the badge live in realtime; this interval is only a
    // fallback when the socket is down — skipping it while connected avoids a
    // pointless network call every 15 seconds.
    const interval = setInterval(() => {
      if (!socketService.isConnected()) fetchUnread();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch the unread badge on focus (fires on initial focus too — no separate
  // mount effect, which would duplicate the request and add rate-limit pressure).
  useFocusEffect(
    useCallback(() => {
      fetchUnread();
    }, [])
  );

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const geo = await Location.reverseGeocodeAsync(loc.coords);
          const resolvedCity = geo[0]?.city || 'Delhi';
          setCity(resolvedCity);
          fetchData(resolvedCity);
          return;
        }
      } catch {}
      fetchData();
    })();
    // fetchData is a plain function recreated every render (closure over `city`);
    // this mount-only effect must not re-run (and re-request location) each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchData(cityOverride?: string) {
    try {
      const res = await apiClient.get('/home', { params: { city: cityOverride || city } });
      setData(res.data?.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  // Realtime wallet + loyalty: a top-up / wallet payment / refund notification
  // (socket or foreground push) refetches /home so the wallet card and points
  // stay in sync without a manual pull-to-refresh. The wrapper always calls the
  // latest closure, so the resolved city is respected.
  useRealtimeWalletRefresh(() => fetchData());

  const h = new Date().getHours();
  const greeting = h < 12 ? t('Good morning') : h < 17 ? t('Good afternoon') : t('Good evening');
  const tier = data?.loyaltyTier || 'BRONZE';

  if (loading) {
    // Skeleton mirrors the real home layout (header → search → quick actions →
    // wallet → stats → trust → categories → suggestions) so there's no layout
    // jar when real data replaces it.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
        <SkeletonCustomerHome />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); fetchUnread(); }} tintColor="#0D0D0D" />}>

        {/* ── Header ── */}
        <View style={styles.sectionOuter}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.userName}>{user?.name?.split(' ')[0] || t('there')}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Pressable style={styles.iconCircle} onPress={() => router.push('/(customer)/notifications')}>
                <MaterialCommunityIcons name="bell-outline" size={20} color="#0D0D0D" />
                {unreadCount > 0 && (
                  <View style={{
                    position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10,
                    backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, elevation: 3,
                  }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#FFFFFF' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={styles.iconCircle} onPress={() => router.push('/(customer)/settings')}>
                <MaterialCommunityIcons name="cog-outline" size={20} color="#0D0D0D" />
              </Pressable>
            </View>
          </View>
          <Pressable style={styles.cityRow}>
            <MaterialCommunityIcons name="map-marker" size={14} color="#6B6B6B" />
            <Text style={styles.cityText}>{city}</Text>
          </Pressable>
        </View>

        {/* ── Search ── */}
        <View style={styles.sectionOuter}>
          <Pressable style={styles.searchBar} onPress={() => router.push({ pathname: '/(customer)/search', params: { category: '' } })}>
            <MaterialCommunityIcons name="magnify" size={20} color="#6B6B6B" style={{ marginRight: 10 }} />
            <Text style={styles.searchPlaceholder}>{t('What do you need?')}</Text>
          </Pressable>
        </View>

        {/* ── Quick actions ── */}
        <View style={[styles.sectionOuter, { flexDirection: 'row', gap: 10 }]}>
          {[
            { icon: 'lightning-bolt', label: t('Urgent'), color: '#FF5C00', route: '/(customer)/urgent' as const },
            { icon: 'clipboard-text-outline', label: t('Request'), color: '#6C5CE7', route: '/(customer)/post-request' as const },
            { icon: 'refresh', label: t('Re-Book'), color: '#D4A017', route: '/(customer)/rebook' as const },
          ].map(a => (
            <Pressable key={a.label} style={styles.quickActionCard} onPress={() => router.push(a.route)}>
              <MaterialCommunityIcons name={a.icon as any} size={22} color={a.color} />
              <Text style={[styles.quickActionLabel, { color: a.color }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Wallet ── */}
        <View style={styles.sectionOuter}>
          <Pressable style={styles.walletCard} onPress={() => router.push('/(customer)/payments')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={styles.walletLabel}>{t('Wallet')}</Text>
              <Text style={styles.walletLabel}>{data?.loyaltyPoints || 0} {t('pts')}</Text>
            </View>
            <Text style={styles.walletBalance}>{formatMoneyWithSymbol(data?.walletBalance)}</Text>
          </Pressable>
        </View>

        {/* ─── Stats ── */}
        <View style={[styles.sectionOuter, { flexDirection: 'row', gap: 8 }]}>
          {[
            { v: data?.completedBookings || 0, l: t('Done') },
            { v: formatMoneyWithSymbol(data?.totalSaved), l: t('Saved') },
            { v: data?.loyaltyPoints || 0, l: t('Points') },
          ].map(s => (
            <View key={s.l} style={styles.statCard}>
              <Text style={styles.statValue}>{s.v}</Text>
              <Text style={styles.statLabel}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* ── Loyalty tier ── */}
        {data?.loyaltyTier && (
          <View style={styles.sectionOuter}>
            <View style={styles.loyaltyCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MaterialCommunityIcons name="shield-star" size={18} color={TIER_COLORS[tier] || '#6B6B6B'} />
                <Text style={[styles.loyaltyTierName, { color: TIER_COLORS[tier] || '#6B6B6B' }]}>{t(tier.charAt(0) + tier.slice(1).toLowerCase())}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min((data?.loyaltyPoints || 0) / 600 * 100, 100)}%`, backgroundColor: TIER_COLORS[tier] || '#6B6B6B' }]} />
              </View>
            </View>
          </View>
        )}

        {/* ── Trust + Warranty ── */}
        <View style={styles.sectionOuter}>
          <View style={styles.trustCard}>
            {[
              t('100% verified professionals'),
              t('Transparent pricing'),
            ].map(t => (
              <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="shield-check" size={16} color="#1A5C2A" />
                <Text style={styles.trustText}>{t}</Text>
              </View>
            ))}
            <Pressable onPress={() => router.push('/(customer)/guarantee')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="shield-check" size={16} color="#1A5C2A" />
              <Text style={styles.trustText}>{t('3-month warranty on eligible parts')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#1A5C2A" />
            </Pressable>
          </View>
        </View>

        {/* ── Categories ── */}
        <View style={styles.sectionOuter}>
          <Text style={styles.sectionTitle}>{t('What do you need?')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              { n: t('Plumber'), i: 'pipe-wrench', c: 'PLUMBER' },
              { n: t('Electrician'), i: 'lightning-bolt', c: 'ELECTRICIAN' },
              { n: t('Carpenter'), i: 'saw-blade', c: 'CARPENTER' },
              { n: t('Maid'), i: 'broom', c: 'MAID' },
              { n: t('Driver'), i: 'car', c: 'DRIVER' },
              { n: t('Painter'), i: 'format-paint', c: 'PAINTER' },
              { n: t('AC Tech'), i: 'air-conditioner', c: 'AC_TECHNICIAN' },
              { n: t('Pest Control'), i: 'bug', c: 'PEST_CONTROL' },
              { n: t('Gardener'), i: 'flower', c: 'GARDENER' },
              { n: t('Cook'), i: 'food-apple', c: 'COOK' },
              { n: t('Tutor'), i: 'school', c: 'TUTOR' },
              { n: t('Nurse'), i: 'medical-bag', c: 'NURSE' },
              { n: t('Babysitter'), i: 'baby-face-outline', c: 'BABYSITTER' },
            ].map(s => (
              <Pressable key={s.n} style={styles.categoryChip}
                onPress={() => router.push({ pathname: '/(customer)/search', params: { category: s.c } })}>
                <MaterialCommunityIcons name={s.i as any} size={16} color="#6B6B6B" />
                <Text style={styles.categoryLabel}>{s.n}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Suggested workers ── */}
        {data?.suggestions?.length > 0 && (() => {
          const getReasonFormatting = (reason: string) => {
            const lower = reason.toLowerCase();
            if (lower.includes('guaranteed')) {
              return { icon: 'shield-check', color: '#1A5C2A', bg: '#E8F5E9' };
            }
            if (lower.includes('worked together') || lower.includes('past')) {
              return { icon: 'handshake', color: '#5E35B1', bg: '#EDE7F6' };
            }
            if (lower.includes('expert') || lower.includes('top')) {
              return { icon: 'star-circle', color: '#1A73E8', bg: '#E8F0FE' };
            }
            if (lower.includes('fast') || lower.includes('quick') || lower.includes('near')) {
              return { icon: 'lightning-bolt', color: '#E65100', bg: '#FFF3E0' };
            }
            return { icon: 'check-circle', color: '#5F6368', bg: '#F1F3F4' };
          };

          return (
            <View style={styles.sectionOuter}>
              <Text style={styles.sectionTitle}>{t('Suggested for you')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 24, paddingBottom: 8 }}>
                {data.suggestions.filter((w: any) => w && w.workerId).map((w: any, i: number) => {
                  const matchPct = Number.isFinite(w.score) ? Math.round((w.score / 135) * 100) : 0;
                  return (
                    <Pressable key={w.workerId} style={styles.suggestionCard} onPress={() => router.push(`/(customer)/worker/${w.workerId}`)}
                      accessibilityRole="button" accessibilityLabel={`View ${w.user?.name || t('worker')}'s profile`}>
                      <View style={styles.scoreBadge}>
                        <MaterialCommunityIcons name="check-decagram" size={14} color="#FF8C00" />
                        <Text style={styles.scoreText}>{matchPct}% {t('Match')}</Text>
                      </View>
                      <Text style={styles.workerName} numberOfLines={1}>{w.user?.name || t('Top Match')}</Text>
                      {w.reasons?.slice(0, 2).map((r: string, ri: number) => {
                        const fmt = getReasonFormatting(r);
                        return (
                          <View key={ri} style={[styles.reasonTag, { backgroundColor: fmt.bg }]}>
                            <MaterialCommunityIcons name={fmt.icon as any} size={12} color={fmt.color} style={{ marginRight: 4 }} />
                            <Text style={[styles.reasonText, { color: fmt.color }]} numberOfLines={2}>{r}</Text>
                          </View>
                        );
                      })}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          );
        })()}

        {/* ── Top workers ── */}
        {data?.topWorkers?.length > 0 && (
          <View style={styles.sectionOuter}>
            <Text style={styles.sectionTitle}>{t('Top rated')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 24 }}>
              {data.topWorkers.filter((w: any) => w && w.userId).map((w: any, i: number) => {
                const ratingText = typeof w.rating === 'number' ? w.rating.toFixed(1) : Number(w.rating) > 0 ? Number(w.rating).toFixed(1) : '—';
                return (
                <Pressable key={w.userId} style={styles.topWorkerCard} onPress={() => router.push(`/(customer)/worker/${w.userId}`)}
                  accessibilityRole="button" accessibilityLabel={`View ${w.user?.name || w.name || t('top worker')}'s profile`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MaterialCommunityIcons name="star" size={14} color="#FFD700" />
                      <Text style={styles.topWorkerRating}>{ratingText}</Text>
                    </View>
                    {isFeaturedActive(w.isFeatured, w.featuredUntil) && (
                      <FeaturedBadge featuredUntil={w.featuredUntil} isFeatured={w.isFeatured} compact />
                    )}
                    {w.isGuaranteed && <MaterialCommunityIcons name="shield-check-outline" size={16} color="#1A5C2A" />}
                  </View>
                  <Text style={styles.topWorkerName}>{w.user?.name || t('Worker')}</Text>
                  <Text style={styles.topWorkerCategory}>{t(w.category ? w.category.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : 'General')}</Text>
                  <Text style={styles.topWorkerRate}>₹{w.hourlyRate}/{t('hr')}</Text>
                </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Book again ── */}
        {data?.rebookWorkers?.length > 0 && (
          <View style={styles.sectionOuter}>
            <Text style={styles.sectionTitle}>{t('Book again')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 24 }}>
              {data.rebookWorkers.map((w: any, i: number) => {
                const workerName = w.worker?.name || t('Worker');
                const avatarUrl = w.worker?.avatarUrl;
                const price = Number(w.baseAmount || 0);
                return (
                  <View key={w.id} style={styles.rebookCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                      {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.rebookAvatar} />
                      ) : (
                        <View style={styles.rebookAvatarPlaceholder}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#F5F0E8' }}>{(workerName || 'W')[0].toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.rebookWorkerName} numberOfLines={1}>{workerName}</Text>
                        <Text style={styles.rebookService} numberOfLines={1}>{t(w.serviceName)}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.rebookDivider} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={styles.rebookPriceLabel}>{t('Last paid')}</Text>
                        <Text style={styles.rebookPrice}>₹{price.toLocaleString('en-IN')}</Text>
                      </View>
                      <Pressable
                        style={styles.rebookPill}
                        onPress={() => { setRebookSource(w); setRebookVisible(true); }}
                      >
                        <MaterialCommunityIcons name="history" size={14} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.rebookPillText}>{t('Book again')}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Referral ── */}
        {data?.referralCount > 0 && (
          <View style={styles.sectionOuter}>
            <Pressable style={styles.referralCard} onPress={() => router.push('/(customer)/referrals')}>
              <MaterialCommunityIcons name="gift" size={18} color="#FF5C00" />
              <Text style={styles.referralText}>{t('You\'ve earned')} ₹{data.referralEarnings} {t('from referrals')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color="#C8C0B0" />
            </Pressable>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <RebookSheet
        visible={rebookVisible}
        source={rebookSource}
        onClose={() => setRebookVisible(false)}
        onSuccess={() => fetchData()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionOuter: { paddingHorizontal: 24, marginBottom: 24, paddingTop: 12 },
  greeting: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B' },
  userName: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#0D0D0D', marginTop: 2 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cityText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(13,13,13,0.08)', paddingVertical: 14, paddingHorizontal: 16, elevation: 1 },
  searchPlaceholder: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#6B6B6B', flex: 1 },
  quickActionCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, alignItems: 'center', gap: 6, elevation: 1 },
  quickActionLabel: { fontFamily: 'Inter_400Regular', fontSize: 9 },
  walletCard: { backgroundColor: '#0D0D0D', borderRadius: 16, padding: 16 },
  walletLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#F5F0E8', opacity: 0.6 },
  walletBalance: { fontFamily: 'SpaceMono_700Bold', fontSize: 30, color: '#F5F0E8', letterSpacing: 1 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 2, elevation: 1 },
  statValue: { fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#0D0D0D' },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 9, color: '#6B6B6B' },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#0D0D0D', marginBottom: 10 },

  // Warranty

  // Tier
  loyaltyCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, elevation: 1 },
  loyaltyTierName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  progressBarBg: { height: 6, backgroundColor: '#E8E4DC', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FF5C00', borderRadius: 3 },

  // Categories
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 20, elevation: 1 },
  categoryLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#0D0D0D' },

  // Suggestions
  suggestionCard: { width: 220, padding: 16, marginRight: 16, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF5E5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 12 },
  scoreText: { fontFamily: 'SpaceMono_700Bold', fontSize: 11, color: '#D97706' },
  workerName: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#202124', marginBottom: 12 },
  reasonTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6, borderRadius: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  reasonText: { fontFamily: 'Inter_500Medium', fontSize: 11, flexShrink: 1, lineHeight: 16 },

  // Top workers
  topWorkerCard: { width: 160, padding: 16, marginRight: 12, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, borderWidth: 1, borderColor: '#F0F0F0' },
  topWorkerRating: { fontFamily: 'SpaceMono_700Bold', fontSize: 13, color: '#202124' },
  topWorkerName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#202124', marginTop: 4 },
  topWorkerCategory: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },
  topWorkerRate: { fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#1A73E8', marginTop: 8 },
  guaranteedBadge: { fontFamily: 'SpaceMono_700Bold', fontSize: 9, color: '#1A5C2A' },

  // Trust
  trustCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, gap: 6, elevation: 1 },
  trustText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B' },

  // Referral
  referralCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 1 },
  referralText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', flex: 1 },

  // Book again
  rebookCard: { width: 240, padding: 16, marginRight: 16, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  rebookAvatar: { width: 46, height: 46, borderRadius: 23 },
  rebookAvatarPlaceholder: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' },
  rebookWorkerName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#202124' },
  rebookService: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368', marginTop: 2 },
  rebookDivider: { height: 1, backgroundColor: '#F1F3F4', marginBottom: 12 },
  rebookPriceLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#5F6368', marginBottom: 2 },
  rebookPrice: { fontFamily: 'SpaceMono_700Bold', fontSize: 15, color: '#202124' },
  rebookPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A73E8', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, elevation: 2, shadowColor: '#1A73E8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  rebookPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FFFFFF' },
});
