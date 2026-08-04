import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../api/client';
import { deleteUploadedImage } from '../../api/media';
import { useToast } from '../../components/ui/ToastProvider';
import { useT } from '../../utils/i18n';
import { SkeletonGuaranteeBody } from '../../components/ui/SkeletonScreenLayouts';

const CLAIM_STATUS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  PENDING:  { label: 'Pending',  color: '#E65100', bg: '#FFF3E0', icon: 'clock-outline' },
  APPROVED: { label: 'Approved', color: '#2E7D32', bg: '#E8F5E9', icon: 'check-circle' },
  REJECTED: { label: 'Rejected', color: '#C62828', bg: '#FFEBEE', icon: 'close-circle' },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function GuaranteeScreen() {
  const t = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);

  // Raise-claim modal
  const [claimBooking, setClaimBooking] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([
      apiClient.get('/guarantee/eligible-bookings').catch(() => ({ data: { data: [] } })),
      apiClient.get('/guarantee/claims/mine').catch(() => ({ data: { data: [] } })),
    ]);
    setBookings(b.data?.data || []);
    setClaims(c.data?.data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickEvidence = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const asset of result.assets) {
        const fd = new FormData();
        fd.append('file', { uri: asset.uri, type: 'image/jpeg', name: 'claim.jpg' } as any);
        fd.append('purpose', 'guarantee');
        const up = await apiClient.post('/upload', fd);
        if (up.data?.data?.url) urls.push(up.data.data.url);
      }
      setEvidence(prev => [...prev, ...urls].slice(0, 6));
    } catch {
      showToast({ message: t('Failed to upload photos'), type: 'error' });
    } finally { setUploading(false); }
  };

  const submitClaim = async () => {
    if (!claimBooking) return;
    if (!reason.trim()) return showToast({ message: t('Please describe the problem'), type: 'error' });
    setSubmitting(true);
    try {
      await apiClient.post('/guarantee/claims', { bookingId: claimBooking.id, reason: reason.trim(), evidence });
      showToast({ message: t('Claim submitted'), type: 'success' });
      setClaimBooking(null); setReason(''); setEvidence([]);
      load();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to submit claim'), type: 'error' });
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Warranty & Claims')}</Text>
        </View>
        <SkeletonGuaranteeBody />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Warranty & Claims')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" colors={['#FF5C00']} />}
      >
        {/* Active warranty */}
        <View>
          <Text style={styles.sectionLabel}>{t('Active Warranty')}</Text>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="shield-check" size={20} color="#1A5C2A" />
            <Text style={styles.infoText}>{t('Eligible jobs carry a warranty on parts. Raise a claim if an issue comes up within the warranty period.')}</Text>
          </View>
          {bookings.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="shield-outline" size={40} color="#C8C0B0" />
              <Text style={styles.emptyText}>{t('No jobs under warranty right now')}</Text>
            </View>
          ) : (
            bookings.map((b) => {
              const hasPending = (b.guaranteeClaims || []).some((c: any) => c.status === 'PENDING');
              return (
                <View key={b.id} style={styles.bookingCard}>
                  <View style={styles.bookingTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookingService}>{b.serviceName}</Text>
                      <Text style={styles.bookingMeta}>#{b.bookingNumber} · {b.worker?.name}</Text>
                    </View>
                    <Text style={styles.warrantyUntil}>{t('Warranty till')} {fmtDate(b.warrantyExpiresAt)}</Text>
                  </View>
                  {(b.jobPhotos || []).length > 0 && (
                    <View style={styles.photoRow}>
                      {(b.jobPhotos as any[]).map((p: any) => (
                        <Image key={p.id} source={{ uri: p.afterUrl || p.beforeUrl }} style={styles.photoThumb} />
                      ))}
                    </View>
                  )}
                  {!hasPending && (
                    <Pressable style={styles.claimBtn} onPress={() => { setClaimBooking(b); setReason(''); setEvidence([]); }}>
                      <MaterialCommunityIcons name="file-document-edit-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.claimBtnText}>{t('Raise a claim')}</Text>
                    </Pressable>
                  )}
                  {hasPending && (
                    <Text style={styles.underReview}>{t('Claim under review — you\'ll hear from us soon.')}</Text>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* My claims */}
        <View style={{ marginTop: 8 }}>
          <Text style={styles.sectionLabel}>{t('My Claims')}</Text>
          {claims.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="file-document-outline" size={40} color="#C8C0B0" />
              <Text style={styles.emptyText}>{t('No claims yet')}</Text>
            </View>
          ) : (
            claims.map((c) => {
              const s = CLAIM_STATUS[c.status] || CLAIM_STATUS.PENDING;
              return (
                <View key={c.id} style={styles.claimCard}>
                  <View style={[styles.claimIcon, { backgroundColor: s.bg }]}>
                    <MaterialCommunityIcons name={s.icon as any} size={20} color={s.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.claimService}>{c.booking?.serviceName || t('Booking')}</Text>
                    <Text style={styles.claimReason} numberOfLines={2}>{c.reason}</Text>
                    <Text style={styles.claimDate}>{fmtDate(c.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusText, { color: s.color }]}>{t(s.label)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Raise-claim modal */}
      <Modal visible={!!claimBooking} transparent animationType="slide" onRequestClose={() => setClaimBooking(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setClaimBooking(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Raise a claim')}</Text>
            {claimBooking && (
              <Text style={styles.modalSub}>#{claimBooking.bookingNumber} · {claimBooking.serviceName} · {t('warranty till')} {fmtDate(claimBooking.warrantyExpiresAt)}</Text>
            )}

            <Text style={styles.inputLabel}>{t('Describe the issue')}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder={t('What went wrong with the job / part?')}
                placeholderTextColor="#B0A898"
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.inputLabel}>{t('Photos (optional but recommended)')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
              {evidence.map((url, i) => (
                <View key={url} style={styles.evidenceThumb}>
                  <Image source={{ uri: url }} style={styles.evidenceImg} />
                  <Pressable style={styles.evidenceRemove} onPress={() => { const url = evidence[i]; setEvidence(prev => prev.filter((_, x) => x !== i)); deleteUploadedImage(url); }}>
                    <MaterialCommunityIcons name="close" size={12} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
              {evidence.length < 6 && (
                <Pressable style={styles.addPhoto} onPress={pickEvidence} disabled={uploading}>
                  {uploading ? (
                    <ActivityIndicator size="small" color="#FF5C00" />
                  ) : (
                    <MaterialCommunityIcons name="camera-plus-outline" size={24} color="#FF5C00" />
                  )}
                </Pressable>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={submitClaim} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>{t('Submit claim')}</Text>
                )}
              </Pressable>
              <Pressable style={[styles.cancelBtn]} onPress={() => setClaimBooking(null)}>
                <Text style={styles.cancelBtnText}>{t('Cancel')}</Text>
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
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 6 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 8, marginTop: 14 },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E8F5E9', borderRadius: 12, padding: 12, marginBottom: 10 },
  infoText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: '#2E5B2E', lineHeight: 17 },
  emptyBox: { alignItems: 'center', paddingVertical: 32, gap: 10, backgroundColor: '#FFFFFF', borderRadius: 12 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#8A8478' },
  bookingCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1, gap: 10 },
  bookingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  bookingService: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#0D0D0D' },
  bookingMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  warrantyUntil: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#1A5C2A', textAlign: 'right' },
  photoRow: { flexDirection: 'row', gap: 8 },
  photoThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#F0EBE0' },
  claimBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF5C00', borderRadius: 10, paddingVertical: 11 },
  claimBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' },
  underReview: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#E65100', textAlign: 'center', paddingVertical: 6 },
  claimCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 8, elevation: 1 },
  claimIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  claimService: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' },
  claimReason: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  claimDate: { fontFamily: 'Inter_400Regular', fontSize: 10, color: '#9E9E9E', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 4 },
  modalSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginBottom: 16 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 6, marginTop: 8 },
  inputWrap: { backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E0D8CC' },
  input: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', paddingVertical: 12, minHeight: 90 },
  evidenceThumb: { position: 'relative' },
  evidenceImg: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#F0EBE0' },
  evidenceRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 72, height: 72, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#D5CDBE', alignItems: 'center', justifyContent: 'center' },
  submitBtn: { flex: 1, backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  submitBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  cancelBtn: { flex: 1, backgroundColor: '#E0D8CC', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' },
});
