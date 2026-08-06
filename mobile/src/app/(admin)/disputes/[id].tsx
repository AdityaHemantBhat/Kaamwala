import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, TextInput, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useT } from '../../../utils/i18n';
import { apiClient } from '../../../api/client';
import { useToast } from '../../../components/ui/ToastProvider';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { useAuthStore } from '../../../store/auth.store';

const STATUS_STYLE: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  PENDING: { color: '#B06000', bg: '#FEF7E0', icon: 'clock-outline', label: 'Pending' },
  CUSTOMER_REFUND: { color: '#137333', bg: '#E6F4EA', icon: 'currency-usd', label: 'Customer Refunded' },
  WORKER_PAID: { color: '#1A73E8', bg: '#E8F0FE', icon: 'account-cash', label: 'Worker Paid' },
  SPLIT_50_50: { color: '#D4A017', bg: '#FFF8E1', icon: 'split-horizontal', label: 'Split 50/50' },
  RE_DO_SERVICE: { color: '#6C5CE7', bg: '#EDE9FE', icon: 'refresh', label: 'Re-do Service' },
  CLOSED_NO_ACTION: { color: '#5F6368', bg: '#F1F3F4', icon: 'close-circle-outline', label: 'Closed' },
};

export default function DisputeDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();

  const [dispute, setDispute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [resolution, setResolution] = useState<'CUSTOMER_REFUND' | 'WORKER_PAID' | 'SPLIT_50_50' | 'RE_DO_SERVICE' | 'CLOSED_NO_ACTION'>('CUSTOMER_REFUND');
  const [adminNotes, setAdminNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string>('');

  const load = async () => {
    try {
      const r = await apiClient.get(`/disputes/${id}`);
      setDispute(r.data?.data);
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to load dispute'), type: 'error' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleResolve = async () => {
    setActionLoading(true);
    try {
      const payload: any = { decision: resolution, adminNotes };
      if (resolution === 'CUSTOMER_REFUND' || resolution === 'SPLIT_50_50') {
        payload.refundAmount = parseFloat(refundAmount) || 0;
      }
      await apiClient.put(`/disputes/${id}/resolve`, payload);
      showToast({ message: t('Dispute resolved successfully'), type: 'success' });
      setModalVisible(false);
      load();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to resolve'), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // `raisedByRole` is CUSTOMER or WORKER — the resolve action belongs to the
  // ADMIN viewing this screen, so gate on the viewer's role, not the raiser's.
  const viewerRole = useAuthStore((s) => s.user?.role);
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(viewerRole || '');

  if (loading || !dispute) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}><BrutalInkLoader /></View>
      </SafeAreaView>
    );
  }

  const ss = STATUS_STYLE[dispute.decision] || STATUS_STYLE.PENDING;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Dispute Details')}</Text>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{dispute.bookingNumber}</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: ss.bg, borderColor: ss.color }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <MaterialCommunityIcons name={ss.icon as any} size={20} color={ss.color} />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: ss.color }}>
              {t(dispute.decision)}
            </Text>
          </View>
          {dispute.decision !== 'PENDING' && dispute.resolvedAt && (
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368', marginLeft: 28 }}>
              {t('Resolved on')} {new Date(dispute.resolvedAt).toLocaleString()}
            </Text>
          )}
        </View>

        {/* Booking Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#1A73E8" />
            <Text style={styles.sectionTitle}>{t('Booking Information')}</Text>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Booking #')}</Text>
              <Text style={styles.infoText}>{dispute.bookingNumber}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Total Amount')}</Text>
              <Text style={styles.infoText}>₹{dispute.booking?.totalAmount || dispute.booking?.baseAmount || 0}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Date')}</Text>
              <Text style={styles.infoText}>{new Date(dispute.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
        </View>

        {/* Parties */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="account-multiple-outline" size={20} color="#1A73E8" />
            <Text style={styles.sectionTitle}>{t('Parties')}</Text>
          </View>
          <View style={styles.partyRow}>
            <View style={styles.partyBox}>
              <View style={[styles.partyAvatar, { backgroundColor: '#E8F0FE' }]}>
                <MaterialCommunityIcons name="account-outline" size={20} color="#1A73E8" />
              </View>
              <View style={styles.partyInfo}>
                <Text style={styles.partyRole}>{t('Customer')}</Text>
                <Text style={styles.partyName}>{dispute.customer.name}</Text>
                <Text style={styles.partyPhone}>{dispute.customer.phone}</Text>
              </View>
            </View>
            <View style={styles.partyBox}>
              <View style={[styles.partyAvatar, { backgroundColor: '#FFF8E1' }]}>
                <MaterialCommunityIcons name="account-hard-hat" size={20} color="#D4A017" />
              </View>
              <View style={styles.partyInfo}>
                <Text style={styles.partyRole}>{t('Worker')}</Text>
                <Text style={styles.partyName}>{dispute.worker.name}</Text>
                <Text style={styles.partyPhone}>{dispute.worker.phone}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Dispute Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#FF5C00" />
            <Text style={styles.sectionTitle}>{t('Dispute Details')}</Text>
          </View>
          <View style={styles.detailBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('Raised By')}</Text>
              <Text style={styles.detailValue}>
                {dispute.raisedByName} ({t(dispute.raisedByRole)})
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('Reason')}</Text>
              <Text style={styles.detailValue}>{dispute.reason}</Text>
            </View>
            {dispute.adminNotes && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('Admin Notes')}</Text>
                <Text style={styles.detailValue}>{dispute.adminNotes}</Text>
              </View>
            )}
            {dispute.refundAmount && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('Refund Amount')}</Text>
                <Text style={styles.detailValue}>₹{dispute.refundAmount}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Evidence */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="file-document-outline" size={20} color="#1A73E8" />
            <Text style={styles.sectionTitle}>{t('Evidence')}</Text>
          </View>
          <View style={styles.evidenceSection}>
            <View style={styles.evidenceCol}>
              <Text style={styles.evidenceLabel}>{t('Customer Evidence')}</Text>
              {dispute.customerEvidence.length > 0 ? (
                <View style={styles.evidenceGrid}>
                  {dispute.customerEvidence.map((url: string, idx: number) => (
                    <Pressable key={idx} style={styles.evidenceItem} onPress={() => { setSelectedImage(url); setImageModalVisible(true); }}>
                      <Image source={{ uri: url }} style={styles.evidenceImage} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.noEvidence}>{t('No evidence provided')}</Text>
              )}
            </View>
            <View style={styles.evidenceCol}>
              <Text style={styles.evidenceLabel}>{t('Worker Evidence')}</Text>
              {dispute.workerEvidence.length > 0 ? (
                <View style={styles.evidenceGrid}>
                  {dispute.workerEvidence.map((url: string, idx: number) => (
                    <Pressable key={idx} style={styles.evidenceItem} onPress={() => { setSelectedImage(url); setImageModalVisible(true); }}>
                      <Image source={{ uri: url }} style={styles.evidenceImage} />
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.noEvidence}>{t('No evidence provided')}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Timeline */}
        {dispute.timeline && dispute.timeline.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="history" size={20} color="#1A73E8" />
              <Text style={styles.sectionTitle}>{t('Timeline')}</Text>
            </View>
            <View style={styles.timeline}>
              {dispute.timeline.map((entry: any, idx: number) => (
                <View key={idx} style={styles.timelineItem}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineAction}>{t(entry.action.replace(/_/g, ' '))}</Text>
                    <Text style={styles.timelineTime}>{new Date(entry.at).toLocaleString()}</Text>
                    {entry.note && <Text style={styles.timelineNote}>{entry.note}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Admin Actions */}
        {isAdmin && dispute.decision === 'PENDING' && (
          <View style={styles.actionSection}>
            <Text style={styles.actionTitle}>{t('Admin Actions')}</Text>
            <Pressable style={styles.resolveBtn} onPress={() => setModalVisible(true)}>
              <MaterialCommunityIcons name="gavel" size={20} color="#FFF" />
              <Text style={styles.resolveBtnText}>{t('Resolve Dispute')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Resolution Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          {/* KAV lifts the sheet above the keyboard so the refund amount + notes
              stay reachable; the sheet caps at 80% so content scrolls internally. */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ maxHeight: '85%' }}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('Resolve Dispute')}</Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{t('Decision')}</Text>
              <View style={styles.decisionOptions}>
                {[
                  { value: 'CUSTOMER_REFUND', label: t('Customer Refund'), color: '#137333' },
                  { value: 'WORKER_PAID', label: t('Worker Paid'), color: '#1A73E8' },
                  { value: 'SPLIT_50_50', label: t('Split 50/50'), color: '#D4A017' },
                  { value: 'RE_DO_SERVICE', label: t('Re-do Service'), color: '#6C5CE7' },
                  { value: 'CLOSED_NO_ACTION', label: t('Close No Action'), color: '#5F6368' },
                ].map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[styles.decisionOption, resolution === opt.value && styles.decisionOptionSelected, { borderColor: opt.color }]}
                    onPress={() => setResolution(opt.value as any)}
                  >
                    <Text style={[styles.decisionOptionText, resolution === opt.value && { color: '#FFF' }, { color: opt.color }]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {(resolution === 'CUSTOMER_REFUND' || resolution === 'SPLIT_50_50') && (
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>{t('Refund Amount (₹)')}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder={t('Enter amount')}
                  keyboardType="numeric"
                  value={refundAmount}
                  onChangeText={setRefundAmount}
                />
              </View>
            )}

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>{t('Admin Notes (Optional)')}</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 80 }]}
                placeholder={t('Add resolution notes...')}
                multiline
                value={adminNotes}
                onChangeText={setAdminNotes}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: '#F5F5F5' }]} onPress={() => setModalVisible(false)}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#666' }}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable style={[styles.actionBtn, { flex: 1, backgroundColor: '#137333' }]} onPress={handleResolve} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Confirm')}</Text>}
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Image Modal */}
      <Modal visible={imageModalVisible} transparent animationType="fade">
        <View style={styles.imageModalOverlay}>
          <Pressable onPress={() => setImageModalVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.imageModalContent}>
            <Pressable onPress={() => setImageModalVisible(false)} style={styles.imageModalClose}>
              <MaterialCommunityIcons name="close" size={28} color="#FFF" />
            </Pressable>
            <Image source={{ uri: selectedImage }} style={styles.imageModalImage} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124', flex: 1 },
  headerBadge: { backgroundColor: '#0D0D0D', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  headerBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFFFFF' },

  content: { padding: 16, gap: 16 },

  statusBanner: { padding: 16, borderRadius: 12, borderWidth: 1 },

  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#202124' },

  infoGrid: { flexDirection: 'row', gap: 8 },
  infoCol: { flex: 1, gap: 4 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#8A8A8A', textTransform: 'uppercase' },
  infoText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124' },

  partyRow: { flexDirection: 'row', gap: 12 },
  partyBox: { flex: 1, flexDirection: 'row', gap: 12, backgroundColor: '#F5F0E8', padding: 12, borderRadius: 12 },
  partyAvatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  partyInfo: { flex: 1, justifyContent: 'center', gap: 2 },
  partyRole: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#8A8A8A', textTransform: 'uppercase' },
  partyName: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#202124' },
  partyPhone: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368' },

  detailBox: { backgroundColor: '#F5F0E8', padding: 12, borderRadius: 12, gap: 12 },
  detailRow: { flexDirection: 'row', gap: 12 },
  detailLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#5F6368', width: 100 },
  detailValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#202124', flex: 1 },

  evidenceSection: { flexDirection: 'row', gap: 16 },
  evidenceCol: { flex: 1, gap: 8 },
  evidenceLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#5F6368' },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evidenceItem: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: '#EDE8DC' },
  evidenceImage: { width: '100%', height: '100%' },
  noEvidence: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A8A', fontStyle: 'italic' },

  timeline: { gap: 12 },
  timelineItem: { flexDirection: 'row', gap: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5C00', marginTop: 4 },
  timelineContent: { flex: 1, gap: 2 },
  timelineAction: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#202124' },
  timelineTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },
  timelineNote: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368' },

  actionSection: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 12 },
  actionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#202124' },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#137333', paddingVertical: 14, borderRadius: 12 },
  resolveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFF' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 16, maxHeight: '80%' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124', textAlign: 'center' },
  modalField: { gap: 8 },
  modalLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#202124' },
  decisionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  decisionOption: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: '#EAE2D6', backgroundColor: '#F5F0E8' },
  decisionOptionSelected: { backgroundColor: '#137333', borderColor: '#137333' },
  decisionOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  textInput: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#EAE2D6', fontFamily: 'Inter_500Medium', fontSize: 14, color: '#202124' },
  actionBtn: { paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  imageModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  imageModalContent: { position: 'relative', maxWidth: '95%', maxHeight: '90%' },
  imageModalClose: { position: 'absolute', top: -40, right: 0, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  imageModalImage: { width: 350, height: 500, borderRadius: 8 },
});