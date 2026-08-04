import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { apiClient } from '../../api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useT } from '../../utils/i18n';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:  { label: 'Pending',  color: '#E65100', bg: '#FFF3E0' },
  APPROVED: { label: 'Approved', color: '#2E7D32', bg: '#E8F5E9' },
  REJECTED: { label: 'Rejected', color: '#C62828', bg: '#FFEBEE' },
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function AdminGuarantee() {
  const t = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');
  const [activeClaim, setActiveClaim] = useState<any>(null);
  const [note, setNote] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    const url = filter === 'ALL' ? '/guarantee/admin/claims' : `/guarantee/admin/claims?status=${filter}`;
    const res = await apiClient.get(url).catch(() => ({ data: { data: [] } }));
    setClaims(res.data?.data || []);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!activeClaim) return;
    setActing(true);
    try {
      await apiClient.put(`/guarantee/admin/claims/${activeClaim.id}/resolve`, { decision, note: note.trim() || undefined });
      showToast({ message: `${t('Claim')} ${decision.toLowerCase()}`, type: 'success' });
      setActiveClaim(null); setNote('');
      load();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed'), type: 'error' });
    } finally { setActing(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Guarantee Claims')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter */}
      <View style={styles.filterRow}>
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{t(f)}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <SkeletonCard rows={4} avatar />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
        >
          {claims.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="file-document-check-outline" size={40} color="#C8C0B0" />
              <Text style={styles.emptyText}>{t('No claims')}</Text>
            </View>
          ) : (
            claims.map((c) => {
              const statusKey = String(c?.status || 'PENDING');
              const s = STATUS[statusKey] || STATUS.PENDING;
              return (
                <View key={c.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.serviceName}>{c.booking?.serviceName || t('Booking')}</Text>
                    <View style={[styles.badge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.badgeText, { color: s.color }]}>{t(s.label)}</Text>
                    </View>
                  </View>
                  <Text style={styles.bookingRef}>#{c.booking?.bookingNumber} · {fmtDate(c.createdAt)}</Text>
                  <Text style={styles.reason} numberOfLines={3}>{c.reason}</Text>
                  <Text style={styles.party}>
                    {t('Customer:')} {c.customer?.name || '—'} · {c.customer?.phone || ''}
                  </Text>
                  <Text style={styles.party}>
                    {t('Worker:')} {c.workerProfile?.user?.name || '—'} · {c.workerProfile?.user?.phone || ''}
                  </Text>
                  {c.evidence?.length > 0 && (
                    <Text style={styles.evidenceCount}>{c.evidence.length} {t('photo(s) attached')}</Text>
                  )}
                  {c.status === 'PENDING' && (
                    <Pressable style={styles.reviewBtn} onPress={() => { setActiveClaim(c); setNote(''); }}>
                      <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.reviewBtnText}>{t('Review claim')}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Review modal */}
      <Modal visible={!!activeClaim} transparent animationType="slide" onRequestClose={() => setActiveClaim(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveClaim(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Review claim')}</Text>
            {activeClaim && (
              <Text style={styles.modalSub}>
                #{activeClaim.booking?.bookingNumber} · {activeClaim.booking?.serviceName}
              </Text>
            )}
            <Text style={styles.inputLabel}>{t('Resolution note (optional)')}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder={t('e.g. Approved — part replaced free of charge')}
                placeholderTextColor="#B0A898"
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable style={[styles.approveBtn, acting && { opacity: 0.5 }]} onPress={() => decide('APPROVED')} disabled={acting}>
                {acting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.approveText}>{t('Approve')}</Text>}
              </Pressable>
              <Pressable style={[styles.rejectBtn, acting && { opacity: 0.5 }]} onPress={() => decide('REJECTED')} disabled={acting}>
                {acting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.rejectText}>{t('Reject')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0D8CC' },
  filterChipActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#6B6B6B' },
  filterTextActive: { color: '#FFFFFF' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#8A8478' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, elevation: 1, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#0D0D0D', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  bookingRef: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B' },
  reason: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#0D0D0D', lineHeight: 18 },
  party: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B' },
  evidenceCount: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#1A73E8' },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF5C00', borderRadius: 10, paddingVertical: 11, marginTop: 4 },
  reviewBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 4 },
  modalSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginBottom: 14 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 6 },
  inputWrap: { backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E0D8CC' },
  input: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', paddingVertical: 12, minHeight: 80 },
  approveBtn: { flex: 1, backgroundColor: '#2E7D32', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  approveText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  rejectBtn: { flex: 1, backgroundColor: '#C62828', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  rejectText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
});
