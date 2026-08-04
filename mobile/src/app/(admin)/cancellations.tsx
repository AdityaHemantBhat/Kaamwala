import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { socketService } from '../../api/socket';
import { useT } from '../../utils/i18n';

const FEE_STYLE: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  PENDING:  { label: 'Pending',  icon: 'clock-outline',         color: '#B06000', bg: '#FEF7E0' },
  PAID:     { label: 'Paid',     icon: 'check-circle-outline',  color: '#137333', bg: '#E6F4EA' },
  WAIVED:   { label: 'Waived',   icon: 'tag-off-outline',       color: '#5F6368', bg: '#F1F3F4' },
  REFUNDED: { label: 'Refunded', icon: 'cash-refund',           color: '#1A73E8', bg: '#E8F0FE' },
};

const TABS = ['', 'PENDING', 'PAID', 'WAIVED', 'REFUNDED'] as const;

export default function AdminCancellations() {
  const t = useT();
  const router = useRouter();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [feeFilter, setFeeFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchRecords = async (p = 1, filter = '') => {
    setLoading(true);
    try {
      const params: any = { page: p, limit: 20 };
      if (filter) params.feeStatus = filter;
      const r = await apiClient.get('/cancellations/admin/all', { params });
      setRecords(r.data?.data?.records || []);
      setTotal(r.data?.data?.total || 0);
      setPage(p);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchRecords(1, feeFilter);

    socketService.connect();
    const handleRefresh = () => { fetchRecords(1, feeFilter); };
    socketService.on('admin_refresh', handleRefresh);

    return () => {
      socketService.off('admin_refresh', handleRefresh);
    };
  }, [feeFilter]);

  const handleWaive = async (id: string) => {
    setActionLoading(id);
    try {
      await apiClient.patch(`/cancellations/admin/${id}/waive`, { reason: 'Admin waived' });
      fetchRecords(page, feeFilter);
    } catch (e: any) {
      console.error('Failed to waive fee:', e);
    }
    finally { setActionLoading(null); }
  };

  const handleRefund = async (id: string) => {
    setActionLoading(id);
    try {
      await apiClient.patch(`/cancellations/admin/${id}/refund`);
      fetchRecords(page, feeFilter);
    } catch (e: any) {
      console.error('Failed to refund fee:', e);
    }
    finally { setActionLoading(null); }
  };

  if (loading && records.length === 0) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}><BrutalInkLoader /></View>
    </SafeAreaView>
  );

  const counts = (f: string) => {
    if (f === '') return total;
    return records.filter((r: any) => r.feeStatus === f).length;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Cancellations')}</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{total}</Text>
        </View>
      </View>

      {/* Fee-status tabs with counts */}
      <View style={styles.tabRow}>
        {TABS.map((f) => {
          const active = feeFilter === f;
          return (
            <Pressable
              key={f}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setFeeFilter(f)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t(f) || t('ALL')}</Text>
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{counts(f)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading && records.length > 0} onRefresh={() => fetchRecords(page, feeFilter)} tintColor="#FF5C00" />}
      >
        {records.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="cancel" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No cancellation records found')}</Text>
          </View>
        ) : records.map((r: any) => {
          const ss = FEE_STYLE[r.feeStatus] || FEE_STYLE.PENDING;
          const b = r.booking || {};
          return (
            <View key={r.id} style={styles.card}>
              {/* Top: icon + service + fee status */}
              <View style={styles.cardTop}>
                <View style={styles.serviceIcon}>
                  <MaterialCommunityIcons name="close-circle-outline" size={20} color="#EA4335" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.serviceName} numberOfLines={1}>{b.serviceName || t('Service')}</Text>
                  <Text style={styles.category}>#{b.bookingNumber || t('N/A')}</Text>
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
                  <Text style={styles.participantText} numberOfLines={1}>{b.customer?.name || t('Customer')}</Text>
                </View>
                <MaterialCommunityIcons name="arrow-right" size={14} color="#BDBDBD" />
                <View style={styles.participantBox}>
                  <MaterialCommunityIcons name="account-hard-hat" size={14} color="#5F6368" />
                  <Text style={styles.participantText} numberOfLines={1}>{b.worker?.name || t('Worker')}</Text>
                </View>
              </View>

              {/* Details: cancelled by / plan / reason */}
              <View style={styles.detailsBox}>
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="account-cancel-outline" size={14} color="#5F6368" />
                  <Text style={styles.detailText}>{t('By')} {t(r.cancelledBy)} · {t(r.customerPlan)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="text-box-search-outline" size={14} color="#5F6368" />
                  <Text style={styles.detailText}>{r.reasonCategory || t('N/A')}</Text>
                </View>
                {r.cancelReason && (
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="comment-text-outline" size={14} color="#5F6368" />
                    <Text style={[styles.detailText, { fontStyle: 'italic', color: '#8A8A8A' }]} numberOfLines={2}>{r.cancelReason}</Text>
                  </View>
                )}
              </View>

              {/* Worker compensation / review flag / health penalty */}
              {(r.workerCompensation > 0 || r.reviewFlag || r.workerPenaltyApplied) && (
                <View style={styles.compBox}>
                  {r.workerCompensation > 0 && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="hand-coin-outline" size={14} color="#137333" />
                      <Text style={[styles.detailText, { color: '#137333' }]}>{t('Worker compensation')} ₹{r.workerCompensation}</Text>
                    </View>
                  )}
                  {r.reviewFlag && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="alert-octagon-outline" size={14} color="#C5221F" />
                      <Text style={[styles.detailText, { color: '#C5221F' }]}>⚠ {t(r.reviewFlag.replace(/_/g, ' '))} — {t('held for review')}</Text>
                    </View>
                  )}
                  {r.workerPenaltyApplied && (
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="heart-off-outline" size={14} color="#C5221F" />
                      <Text style={[styles.detailText, { color: '#C5221F' }]}>
                        {t('Worker health penalized')} · {t('risk')} {r.workerRiskScore ?? 0}/100
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Footer: fee + date */}
              <View style={styles.cardBottom}>
                <Text style={styles.amount}>₹{r.feeAmount ?? 0}</Text>
                <Text style={styles.date}>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>

              {/* Actions for PENDING fees */}
              {r.feeStatus === 'PENDING' && r.feeAmount > 0 && (
                <View style={styles.actionRow}>
                  <Pressable style={styles.waiveBtn} onPress={() => handleWaive(r.id)} disabled={actionLoading === r.id}>
                    {actionLoading === r.id ? <ActivityIndicator size="small" color="#5F6368" /> : (
                      <>
                        <MaterialCommunityIcons name="close-circle-outline" size={16} color="#5F6368" />
                        <Text style={styles.waiveBtnText}>{t('Waive Fee')}</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable style={styles.refundBtn} onPress={() => handleRefund(r.id)} disabled={actionLoading === r.id}>
                    {actionLoading === r.id ? <ActivityIndicator size="small" color="#1A73E8" /> : (
                      <>
                        <MaterialCommunityIcons name="cash-refund" size={16} color="#1A73E8" />
                        <Text style={styles.refundBtnText}>{t('Refund')}</Text>
                      </>
                    )}
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
  serviceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FCE8E6', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  serviceName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  category: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.3 },

  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5F0E8', padding: 12, borderRadius: 12 },
  participantBox: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  participantText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },

  detailsBox: { gap: 6, paddingTop: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368' },
  compBox: { gap: 6, paddingTop: 4 },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F3F4', paddingTop: 12 },
  amount: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#202124' },
  date: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },

  actionRow: { flexDirection: 'row', gap: 12, paddingTop: 4 },
  waiveBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#EAE2D6' },
  waiveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#5F6368' },
  refundBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E8F0FE' },
  refundBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1A73E8' },
});
