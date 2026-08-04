import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { t } from '../../utils/i18n';

type FilterType = 'all' | 'PENDING' | 'VERIFIED' | 'REJECTED';

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  VERIFIED:   { color: '#137333', bg: '#E6F4EA' },
  REJECTED:   { color: '#C5221F', bg: '#FCE8E6' },
  PENDING:    { color: '#B06000', bg: '#FEF7E0' },
  UNVERIFIED: { color: '#5F6368', bg: '#F1F3F4' },
};

export default function AdminWorkers() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const load = async () => {
    try {
      const r = await apiClient.get('/admin/workers/verifications');
      setData(r.data?.data || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const handleVerify = async (id: string, status: string) => {
    try { await apiClient.put(`/admin/workers/verify/${id}`, { status }); load(); } catch {}
  };

  const filtered = filter === 'all' ? data : data.filter(w => w.verificationStatus === filter);
  const counts = {
    all: data.length,
    PENDING: data.filter(w => w.verificationStatus === 'PENDING' || w.verificationStatus === 'UNVERIFIED').length,
    VERIFIED: data.filter(w => w.verificationStatus === 'VERIFIED').length,
    REJECTED: data.filter(w => w.verificationStatus === 'REJECTED').length,
  };

  if (loading) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}><BrutalInkLoader /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Workers Verification')}</Text>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{data.length}</Text></View>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabRow}>
        {(['all', 'PENDING', 'VERIFIED', 'REJECTED'] as FilterType[]).map(filterType => (
          <Pressable key={filterType} style={[styles.tab, filter === filterType && styles.tabActive]} onPress={() => setFilter(filterType)}>
            <Text style={[styles.tabText, filter === filterType && styles.tabTextActive]}>
              {filterType === 'all' ? t('All') : t(filterType.charAt(0) + filterType.slice(1).toLowerCase())}
            </Text>
            <View style={[styles.tabCount, filter === filterType && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, filter === filterType && styles.tabCountTextActive]}>{counts[filterType]}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-hard-hat" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No workers found')}</Text>
          </View>
        ) : filtered.map((w: any) => {
          const ss = STATUS_STYLE[w.verificationStatus] || STATUS_STYLE.UNVERIFIED;
          const isPending = w.verificationStatus === 'UNVERIFIED' || w.verificationStatus === 'PENDING';
          return (
            <View key={w.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: ss.bg }]}>
                  <Text style={[styles.avatarText, { color: ss.color }]}>{(w.user?.name || 'W')[0]}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.name}>{w.user?.name || w.user?.phone || 'Unknown'}</Text>
                  <Text style={styles.phone}>{w.user?.phone}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: ss.bg }]}>
                  <Text style={[styles.statusText, { color: ss.color }]}>{w.verificationStatus || 'UNVERIFIED'}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                {w.category && (
                  <View style={styles.chip}>
                    <MaterialCommunityIcons name="briefcase-outline" size={14} color="#5F6368" />
                    <Text style={styles.chipText}>{w.category.replace(/_/g, ' ')}</Text>
                  </View>
                )}
                {w.city && (
                  <View style={styles.chip}>
                    <MaterialCommunityIcons name="map-marker-outline" size={14} color="#5F6368" />
                    <Text style={styles.chipText}>{w.city}</Text>
                  </View>
                )}
                {w.experienceYears ? (
                  <View style={styles.chip}>
                    <MaterialCommunityIcons name="star-outline" size={14} color="#5F6368" />
                    <Text style={styles.chipText}>{w.experienceYears}yrs</Text>
                  </View>
                ) : null}
              </View>

              {isPending && (
                <View style={styles.actionRow}>
                  <Pressable onPress={() => handleVerify(w.id, 'REJECTED')} style={styles.rejectBtn}>
                    <MaterialCommunityIcons name="close" size={16} color="#C5221F" />
                    <Text style={styles.rejectText}>{t('Reject')}</Text>
                  </Pressable>
                  <Pressable onPress={() => handleVerify(w.id, 'VERIFIED')} style={styles.approveBtn}>
                    <MaterialCommunityIcons name="check" size={16} color="#137333" />
                    <Text style={styles.approveText}>{t('Approve')}</Text>
                  </Pressable>
                </View>
              )}
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
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  cardInfo: { flex: 1 },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  phone: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368', marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.3 },

  detailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 6 },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },

  actionRow: { flexDirection: 'row', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F3F4' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FCE8E6' },
  rejectText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#C5221F' },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E6F4EA' },
  approveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#137333' },
});
