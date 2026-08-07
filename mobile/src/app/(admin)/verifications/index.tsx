import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { apiClient } from '../../../api/client';
import { socketService } from '../../../api/socket';
import { t } from '../../../utils/i18n';

type FilterType = 'all' | 'PENDING_REVIEW' | 'APPROVED' | 'RESUBMISSION_REQUIRED' | 'REJECTED';

const STATUS_STYLE: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  PENDING_REVIEW:        { label: t('Pending'),      icon: 'clock-outline',            color: '#B06000', bg: '#FEF7E0' },
  APPROVED:              { label: t('Approved'),     icon: 'check-circle-outline',     color: '#137333', bg: '#E6F4EA' },
  RESUBMISSION_REQUIRED: { label: t('Resubmit'),     icon: 'refresh',                  color: '#1A73E8', bg: '#E8F0FE' },
  REJECTED:              { label: t('Rejected'),     icon: 'close-circle-outline',     color: '#C5221F', bg: '#FCE8E6' },
};

export default function AdminVerifications() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('PENDING_REVIEW');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search) params.append('search', search);

      const r = await apiClient.get(`/admin/workers/verifications?${params.toString()}`);
      setData(r.data?.data || []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    socketService.connect();
    const handleRefresh = (data: any) => {
      if (data?.type === 'verification') load();
    };
    socketService.on('admin_refresh', handleRefresh);

    return () => {
      socketService.off('admin_refresh', handleRefresh);
    };
  }, [load]);

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
        <Text style={styles.headerTitle}>{t('Verifications')}</Text>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{data.length}</Text></View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['all', 'PENDING_REVIEW', 'APPROVED', 'RESUBMISSION_REQUIRED', 'REJECTED'] as FilterType[]).map(filterType => {
            const label = filterType === 'all' ? t('All') : STATUS_STYLE[filterType]?.label || filterType;
            return (
              <Pressable key={filterType} style={[styles.tab, statusFilter === filterType && styles.tabActive]} onPress={() => setStatusFilter(filterType)}>
                <Text style={[styles.tabText, statusFilter === filterType && styles.tabTextActive]}>
                  {label}
                </Text>
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
            placeholder={t('Search workers...')}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
        keyboardShouldPersistTaps="handled"
      >
        {data.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="clipboard-text-off-outline" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No verifications found')}</Text>
          </View>
        ) : data.map((item) => {
          const ss = STATUS_STYLE[item.status] || STATUS_STYLE.PENDING_REVIEW;
          return (
            <Pressable 
              key={item.id} 
              style={styles.card}
              onPress={() => router.push(`/(admin)/verifications/${item.id}` as any)}
            >
              {/* Top: icon + name + status */}
              <View style={styles.cardTop}>
                <View style={styles.serviceIcon}>
                  <MaterialCommunityIcons name="shield-account-outline" size={20} color="#1A73E8" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.serviceName} numberOfLines={1}>{item.worker?.name || item.worker?.phone || 'Unknown'}</Text>
                  {item.worker?.name && <Text style={styles.category}>{item.worker.phone}</Text>}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
                  <MaterialCommunityIcons name={ss.icon as any} size={12} color={ss.color} />
                  <Text style={[styles.statusText, { color: ss.color }]}>{ss.label}</Text>
                </View>
              </View>

              {/* Participant row for proof info */}
              <View style={styles.participantRow}>
                <View style={styles.participantBox}>
                  <MaterialCommunityIcons name="card-account-details-outline" size={14} color="#5F6368" />
                  <Text style={styles.participantText}>{item.proofType}</Text>
                </View>
              </View>

              {/* Bottom: Date */}
              <View style={styles.cardBottom}>
                <Text style={styles.date}>{t('Submitted on')} {new Date(item.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
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

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAE2D6' },
  tabActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#5F6368' },
  tabTextActive: { color: '#FFFFFF' },

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
  participantBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  participantText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },

  cardBottom: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  date: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },
});
