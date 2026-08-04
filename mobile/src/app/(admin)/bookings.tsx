import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { socketService } from '../../api/socket';
import { useT } from '../../utils/i18n';

type FilterType = 'all' | 'PENDING' | 'ACCEPTED' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const STATUS_STYLE: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  PENDING:     { label: 'Pending',     icon: 'clock-outline',            color: '#B06000', bg: '#FEF7E0' },
  ACCEPTED:    { label: 'Accepted',    icon: 'check-circle-outline',     color: '#1A73E8', bg: '#E8F0FE' },
  ON_THE_WAY:  { label: 'On Way',      icon: 'truck-delivery-outline',   color: '#FF5C00', bg: '#FFF0E8' },
  IN_PROGRESS: { label: 'In Progress', icon: 'wrench-outline',           color: '#673AB7', bg: '#F3E5F5' },
  COMPLETED:   { label: 'Completed',   icon: 'check-decagram-outline',   color: '#137333', bg: '#E6F4EA' },
  CANCELLED:   { label: 'Cancelled',   icon: 'close-circle-outline',     color: '#C5221F', bg: '#FCE8E6' },
};

export default function AdminBookings() {
  const t = useT();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const load = async () => {
    try {
      const params: any = {};
      if (filter !== 'all') params.status = filter;
      const r = await apiClient.get('/admin/bookings', { params });
      setData(r.data?.data?.bookings || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    load();
    socketService.connect();
    const handleRefresh = () => { load(); };
    socketService.on('admin_refresh', handleRefresh);
    return () => { socketService.off('admin_refresh', handleRefresh); };
  }, [filter]);

  const counts: Record<string, number> = {
    all: data.length,
    PENDING: data.filter(b => b.status === 'PENDING').length,
    COMPLETED: data.filter(b => b.status === 'COMPLETED').length,
    CANCELLED: data.filter(b => b.status === 'CANCELLED').length,
    IN_PROGRESS: data.filter(b => ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(b.status)).length,
  };

  if (loading) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}><BrutalInkLoader /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Bookings')}</Text>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{data.length}</Text></View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['all', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as FilterType[]).map((tabKey) => (
          <Pressable key={tabKey} style={[styles.tab, filter === tabKey && styles.tabActive]} onPress={() => setFilter(tabKey)} accessibilityRole="button" accessibilityLabel={`${t('Filter by')} ${tabKey}`} accessibilityState={{ selected: filter === tabKey }}>
            <Text style={[styles.tabText, filter === tabKey && styles.tabTextActive]}>
              {t(tabKey === 'all' ? 'All' : tabKey === 'IN_PROGRESS' ? 'Active' : tabKey.charAt(0) + tabKey.slice(1).toLowerCase())}
            </Text>
            <View style={[styles.tabCount, filter === tabKey && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, filter === tabKey && styles.tabCountTextActive]}>{counts[tabKey]}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
      >
        {data.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="clipboard-text-off-outline" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No bookings found')}</Text>
          </View>
        ) : data.map((b: any) => {
          const ss = STATUS_STYLE[b.status] || STATUS_STYLE.PENDING;
          return (
            <View key={b.id} style={styles.card}>
              {/* Top: icon + service name + status */}
              <View style={styles.cardTop}>
                <View style={styles.serviceIcon}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#1A73E8" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.serviceName} numberOfLines={1}>{b.serviceName || t('Service')}</Text>
                  <Text style={styles.category}>{t(b.serviceCategory?.replace(/_/g, ' ') || '')}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
                  <MaterialCommunityIcons name={ss.icon as any} size={12} color={ss.color} />
                  <Text style={[styles.statusText, { color: ss.color }]}>{t(ss.label)}</Text>
                </View>
              </View>

              {/* Participants */}
              <View style={styles.participantRow}>
                <View style={styles.participantBox}>
                  <MaterialCommunityIcons name="account-outline" size={14} color="#5F6368" />
                  <Text style={styles.participantText}>{b.customer?.name || t('Customer')}</Text>
                </View>
                <MaterialCommunityIcons name="arrow-right" size={14} color="#BDBDBD" />
                <View style={styles.participantBox}>
                  <MaterialCommunityIcons name="account-hard-hat" size={14} color="#5F6368" />
                  <Text style={styles.participantText}>{b.worker?.name || t('Unassigned')}</Text>
                </View>
              </View>

              {/* Footer: amount + date */}
              <View style={styles.cardBottom}>
                <Text style={styles.amount}>₹{b.totalAmount?.toLocaleString('en-IN') || 0}</Text>
                <Text style={styles.date}>{new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
            </View>
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

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAE2D6' },
  tabActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#5F6368' },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: '#F1F3F4' },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  tabCountText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#5F6368' },
  tabCountTextActive: { color: '#FFFFFF' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 16 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#8A8A8A' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  serviceName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  category: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.3 },

  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F0E8', padding: 12, borderRadius: 12 },
  participantBox: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  participantText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#202124' },
  date: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },
});
