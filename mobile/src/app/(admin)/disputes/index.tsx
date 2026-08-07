import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { apiClient } from '../../../api/client';
import { socketService } from '../../../api/socket';
import { t } from '../../../utils/i18n';

type FilterType = 'all' | 'PENDING' | 'CUSTOMER_REFUND' | 'WORKER_PAID' | 'SPLIT_50_50' | 'RE_DO_SERVICE' | 'CLOSED_NO_ACTION';

const STATUS_STYLE: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  PENDING: { label: 'Pending', icon: 'clock-outline', color: '#B06000', bg: '#FEF7E0' },
  CUSTOMER_REFUND: { label: 'Customer Refund', icon: 'currency-usd', color: '#137333', bg: '#E6F4EA' },
  WORKER_PAID: { label: 'Worker Paid', icon: 'account-cash', color: '#1A73E8', bg: '#E8F0FE' },
  SPLIT_50_50: { label: 'Split 50/50', icon: 'split-horizontal', color: '#D4A017', bg: '#FFF8E1' },
  RE_DO_SERVICE: { label: 'Re-do Service', icon: 'refresh', color: '#6C5CE7', bg: '#EDE9FE' },
  CLOSED_NO_ACTION: { label: 'Closed', icon: 'close-circle-outline', color: '#5F6368', bg: '#F1F3F4' },
};

export default function AdminDisputes() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [stats, setStats] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const r = await apiClient.get(`/disputes/admin?${params.toString()}`);
      setData(r.data?.data || []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search]);

  const loadStats = useCallback(async () => {
    try {
      const r = await apiClient.get('/disputes/admin/stats');
      setStats(r.data?.data);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
    loadStats();
  }, [load, loadStats]);

  useEffect(() => {
    socketService.connect();
    const handleRefresh = (data: any) => {
      if (data?.type === 'dispute') { load(); loadStats(); }
    };
    socketService.on('admin_refresh', handleRefresh);
    return () => { socketService.off('admin_refresh', handleRefresh); };
  }, [load, loadStats]);

  if (loading && !refreshing && data.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><BrutalInkLoader /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Disputes')}</Text>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{data.length}</Text></View>
      </View>

      {/* Stats Summary */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>{t('Total')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.pending}</Text>
            <Text style={styles.statLabel}>{t('Pending')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.resolved}</Text>
            <Text style={styles.statLabel}>{t('Resolved')}</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['all', 'PENDING', 'CUSTOMER_REFUND', 'WORKER_PAID', 'SPLIT_50_50', 'RE_DO_SERVICE', 'CLOSED_NO_ACTION'] as FilterType[]).map(filterType => {
            const label = filterType === 'all' ? t('All') : STATUS_STYLE[filterType]?.label || filterType;
            return (
              <Pressable key={filterType} style={[styles.tab, statusFilter === filterType && styles.tabActive]} onPress={() => setStatusFilter(filterType)}>
                <Text style={[styles.tabText, statusFilter === filterType && styles.tabTextActive]}>{label}</Text>
                {stats && STATUS_STYLE[filterType] && (
                  <View style={styles.tabCount}>
                    <Text style={styles.tabCountText}>{stats.byDecision?.[filterType] || 0}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: '#EAE2D6' }}>
          <MaterialCommunityIcons name="magnify" size={20} color="#8A8A8A" />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontFamily: 'Inter_500Medium', fontSize: 13, color: '#202124' }}
            placeholder={t('Search booking #, customer, worker...')}
            placeholderTextColor="#8A8A8A"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); loadStats(); }} tintColor="#FF5C00" />}
        keyboardShouldPersistTaps="handled"
      >
        {data.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="shield-alert-outline" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No disputes found')}</Text>
          </View>
        ) : data.map((item) => {
          const ss = STATUS_STYLE[item.decision] || STATUS_STYLE.PENDING;
          return (
            <Pressable
              key={item.id}
              style={styles.card}
              onPress={() => router.push(`/(admin)/disputes/${item.id}` as any)}
            >
              {/* Top: booking # + status */}
              <View style={styles.cardTop}>
                <View style={styles.cardInfo}>
                  <Text style={styles.bookingNumber}>#{item.bookingNumber}</Text>
                  <Text style={styles.amount}>₹{item.booking?.totalAmount || item.booking?.baseAmount || 0}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
                  <MaterialCommunityIcons name={ss.icon as any} size={12} color={ss.color} />
                  <Text style={[styles.statusText, { color: ss.color }]}>{ss.label}</Text>
                </View>
              </View>

              {/* Parties */}
              <View style={styles.partiesRow}>
                <View style={styles.partyBox}>
                  <MaterialCommunityIcons name="account-outline" size={14} color="#1A73E8" />
                  <Text style={styles.partyText}>{item.customer?.name || 'Customer'}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.partyBox}>
                  <MaterialCommunityIcons name="account-hard-hat" size={14} color="#D4A017" />
                  <Text style={styles.partyText}>{item.worker?.name || 'Worker'}</Text>
                </View>
              </View>

              {/* Reason snippet */}
              <View style={styles.reasonRow}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#FF5C00" />
                <Text style={styles.reasonText} numberOfLines={1}>{item.reason}</Text>
              </View>

              {/* Bottom: Date */}
              <View style={styles.cardBottom}>
                <Text style={styles.date}>{t('Raised on')} {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
            </Pressable>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#202124', flex: 1 },
  headerBadge: { backgroundColor: '#0D0D0D', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  headerBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFFFFF' },

  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, alignItems: 'center', elevation: 1 },
  statValue: { fontFamily: 'SpaceMono_700Bold', fontSize: 18, color: '#0D0D0D' },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', marginTop: 2 },

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAE2D6' },
  tabActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  tabText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: { marginLeft: 4, backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  tabCountText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FFFFFF' },

  scrollContent: { padding: 16, gap: 12 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 16 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#8A8A8A' },

  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardInfo: { flex: 1, gap: 2 },
  bookingNumber: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#202124' },
  amount: { fontFamily: 'SpaceMono_700Bold', fontSize: 16, color: '#FF5C00' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },

  partiesRow: { flexDirection: 'row', marginBottom: 8 },
  partyBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  partyText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#202124' },
  divider: { width: 1, backgroundColor: '#EAE2D6', marginHorizontal: 12, height: '100%' },

  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reasonText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368', flex: 1 },

  cardBottom: { borderTopWidth: 1, borderTopColor: '#EAE2D6', paddingTop: 8 },
  date: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },
});