import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useT } from '../../utils/i18n';
import { apiClient } from '../../api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { RebookSheet } from '../../components/ui/RebookSheet';
import { SkeletonRebookListBody } from '../../components/ui/SkeletonScreenLayouts';

const formatDisplayDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const formatCategory = (value?: string): string => {
  if (!value) return '';
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

export default function CustomerRebook() {
  const t = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ bookingId?: string }>();

  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetSource, setSheetSource] = useState<any>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await apiClient.get('/bookings');
      const raw = res.data?.data ?? res.data ?? [];
      const completed = (Array.isArray(raw) ? raw : []).filter((b: any) => b.status === 'COMPLETED');
      setBookings(completed);
    } catch {
      showToast({ message: t('Could not load bookings'), type: 'error' });
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t, showToast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Support deep-linking from the bookings screen: auto-open the sheet for a
  // specific booking id once the list has loaded.
  useEffect(() => {
    if (!loading && params.bookingId) {
      const target = bookings.find((b: any) => b.id === params.bookingId);
      if (target) {
        setSheetSource(target);
        setSheetVisible(true);
      }
    }
  }, [loading, params.bookingId, bookings]);

  const openRebook = (booking: any) => {
    setSheetSource(booking);
    setSheetVisible(true);
  };

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const workerName = item.worker?.name || t('Worker');
      const avatarUrl = item.worker?.avatarUrl;
      const price = Number(item.baseAmount || item.totalAmount || 0);
      const category = formatCategory(item.serviceCategory);
      const lastServed = item.completedAt || item.scheduledAt;

      return (
        <View style={styles.card}>
          {/* Top row: avatar + worker + price */}
          <View style={styles.cardTop}>
            <View style={styles.avatarCircle}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{(workerName || 'W')[0].toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.workerName} numberOfLines={1}>{workerName}</Text>
              <Text style={styles.workerCategory} numberOfLines={1}>{t(category) || t('Service provider')}</Text>
            </View>
            <View style={styles.priceBox}>
              <Text style={styles.priceAmount}>₹{price.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          {/* Service name */}
          <View style={styles.serviceRow}>
            <MaterialCommunityIcons name="wrench-outline" size={14} color="#9E9E9E" />
            <Text style={styles.serviceName} numberOfLines={1}>{t(item.serviceName)}</Text>
          </View>

          {/* Last served */}
          <View style={styles.serviceRow}>
            <MaterialCommunityIcons name="history" size={14} color="#9E9E9E" />
            <Text style={styles.serviceName}>
              {t('Last served')} {formatDisplayDate(lastServed)}
            </Text>
          </View>

          {/* Rebook pill */}
          <View style={styles.cardFooter}>
            <Pressable
              style={styles.rebookPill}
              onPress={() => openRebook(item)}
            >
              <MaterialCommunityIcons name="refresh" size={14} color="#FF5C00" style={{ marginRight: 4 }} />
              <Text style={styles.rebookPillText}>{t('Re-book')}</Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [t]
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconRing}>
        <MaterialCommunityIcons name="calendar-refresh-outline" size={52} color="#9E9E9E" />
      </View>
      <Text style={styles.emptyTitle}>{t('No completed bookings yet')}</Text>
      <Text style={styles.emptyDesc}>{t('Your past services will appear here to book again in one tap.')}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Book again')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <SkeletonRebookListBody />
      ) : bookings.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBookings(); }}
              tintColor="#0D0D0D"
              colors={['#FF5C00']}
              progressBackgroundColor="#F5F0E8"
            />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
        />
      )}

      <RebookSheet
        visible={sheetVisible}
        source={sheetSource}
        onClose={() => setSheetVisible(false)}
        onSuccess={() => fetchBookings()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#0D0D0D' },

  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, flexGrow: 1 },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: '#F5F0E8' },
  workerName: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#0D0D0D' },
  workerCategory: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  priceBox: {
    backgroundColor: '#FFF0E8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priceAmount: { fontFamily: 'SpaceMono_700Bold', fontSize: 16, color: '#FF5C00' },

  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  serviceName: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', flexShrink: 1 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  rebookPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FF5C00',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rebookPillText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FF5C00' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(13,13,13,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EDE8DC',
    marginBottom: 20,
  },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 8 },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 20,
  },
});
