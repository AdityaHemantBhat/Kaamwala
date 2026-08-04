import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { apiClient } from '../../../api/client';
import { useToast } from '../../../components/ui/ToastProvider';
import { t } from '../../../utils/i18n';

export default function AdminVerificationDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'REJECT' | 'RESUBMISSION'>('REJECT');
  const [rejectionReason, setRejectionReason] = useState('DOCUMENT_UNREADABLE');
  const [rejectionNote, setRejectionNote] = useState('');

  const REJECTION_REASONS = [
    { value: 'DOCUMENT_UNREADABLE', label: t('Document Unreadable') },
    { value: 'DOCUMENT_INCOMPLETE', label: t('Document Incomplete') },
    { value: 'WRONG_DOCUMENT_TYPE', label: t('Wrong Document Type') },
    { value: 'SELFIE_UNCLEAR', label: t('Selfie Unclear') },
    { value: 'INFO_COULD_NOT_BE_REVIEWED', label: t('Information Could Not Be Reviewed') },
    { value: 'DOCUMENT_APPEARS_INVALID', label: t('Document Appears Invalid') },
    { value: 'OTHER', label: 'Other' },
  ];

  const load = async () => {
    try { 
      const r = await apiClient.get(`/admin/workers/verifications/${id}`); 
      setDetail(r.data?.data); 
    } catch (e: any) {
      showToast({ message: e.message || 'Failed to load details', type: 'error' });
      router.back();
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleAction = async (decision: 'APPROVE' | 'REJECT' | 'RESUBMISSION' | 'REVOKE') => {
    if (decision === 'APPROVE' || decision === 'REVOKE') {
      submitDecision(decision);
    } else {
      setActionType(decision);
      setModalVisible(true);
    }
  };

  const submitDecision = async (decision: string) => {
    setActionLoading(true);
    try {
      const payload: any = { decision };
      if (decision === 'REJECT' || decision === 'RESUBMISSION') {
        payload.rejectionReason = rejectionReason;
        payload.rejectionNote = rejectionNote;
      }
      await apiClient.post(`/admin/workers/verifications/${id}/review`, payload);
      showToast({ message: `Verification ${decision.toLowerCase()}ed successfully`, type: 'success' });
      setModalVisible(false);
      load(); // Reload to see new status
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || 'Action failed', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !detail) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}><BrutalInkLoader /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('Review')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, detail.status === 'PENDING_REVIEW' ? { backgroundColor: '#FEF0E3', borderColor: '#F57C00' } : detail.status === 'APPROVED' ? { backgroundColor: '#E6F4EA', borderColor: '#137333' } : { backgroundColor: '#FCE8E6', borderColor: '#C5221F' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <MaterialCommunityIcons 
              name={detail.status === 'PENDING_REVIEW' ? 'clock-outline' : detail.status === 'APPROVED' ? 'check-circle' : 'close-circle'} 
              size={20} 
              color={detail.status === 'PENDING_REVIEW' ? '#E65100' : detail.status === 'APPROVED' ? '#137333' : '#C5221F'} 
            />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: detail.status === 'PENDING_REVIEW' ? '#E65100' : detail.status === 'APPROVED' ? '#137333' : '#C5221F' }}>
              {detail.status === 'PENDING_REVIEW' ? t('Pending Review') : detail.status === 'APPROVED' ? t('Approved') : t('Rejected')}
            </Text>
          </View>
          {detail.status !== 'PENDING_REVIEW' && detail.reviewedAt && (
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368', marginLeft: 28 }}>
              Reviewed on {new Date(detail.reviewedAt).toLocaleString()}
            </Text>
          )}
        </View>

        {/* Worker Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="account-outline" size={20} color="#1A73E8" />
            <Text style={styles.sectionTitle}>{t('Worker Information')}</Text>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Name')}</Text>
              <Text style={styles.infoText}>{detail.worker.name}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Phone')}</Text>
              <Text style={styles.infoText}>{detail.worker.phone}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Category')}</Text>
              <Text style={styles.infoText}>{detail.workerProfile.category}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Location')}</Text>
              <Text style={styles.infoText}>{detail.workerProfile.city}, {detail.workerProfile.state}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Joined')}</Text>
              <Text style={styles.infoText}>{new Date(detail.worker.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
        </View>

        {/* Consent Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="shield-check-outline" size={20} color="#1A73E8" />
            <Text style={styles.sectionTitle}>{t('Consent Provided')}</Text>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.label}>{t('Consent Date')}</Text>
              <Text style={styles.infoText}>{new Date(detail.consent.at).toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Documents */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#1A73E8" />
            <Text style={styles.sectionTitle}>{t(detail.proofType + ' Documents')}</Text>
          </View>
          {detail.docs.map((doc: any, index: number) => (
            <View key={index} style={styles.docContainer}>
              <Text style={styles.docTitle}>{t(doc.side)}</Text>
              {doc.signedUrl ? (
                <View style={styles.imageWrapper}>
                  <Image source={{ uri: doc.signedUrl }} style={styles.docImage} contentFit="contain" />
                </View>
              ) : (
                <View style={styles.noImage}><Text style={{ color: '#80868B', fontFamily: 'Inter_500Medium' }}>{t('Image unavailable')}</Text></View>
              )}
            </View>
          ))}
        </View>

        {/* History */}
        {detail.history && detail.history.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="history" size={20} color="#1A73E8" />
              <Text style={styles.sectionTitle}>{t('Previous Submissions')}</Text>
            </View>
            {detail.history.map((h: any, i: number) => (
              <View key={i} style={styles.historyItem}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124' }}>{t(h.status)}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368' }}>{new Date(h.submittedAt).toLocaleDateString()}</Text>
                </View>
                {h.rejectionReason && <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#C5221F' }}>{t('Reason')}: {t(h.rejectionReason)}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      {detail.status === 'PENDING_REVIEW' && (
        <View style={styles.actionFooter}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FCE8E6', flex: 1 }]} onPress={() => handleAction('REJECT')}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#C5221F' }}>{t('Reject')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#E8F0FE', flex: 1.5 }]} onPress={() => handleAction('RESUBMISSION')}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#1A73E8' }}>{t('Resubmit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#137333', flex: 1.5 }]} onPress={() => handleAction('APPROVE')}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFF' }}>{t('Approve')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal for Reject / Resubmit */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{actionType === 'REJECT' ? t('Reject Submission') : t('Request Resubmission')}</Text>

            <Text style={styles.label}>{t('Reason')}</Text>
            <ScrollView style={{ maxHeight: 150, marginBottom: 16 }}>
              {REJECTION_REASONS.map(r => (
                <TouchableOpacity key={r.value} style={[styles.reasonOption, rejectionReason === r.value && styles.reasonOptionSelected]} onPress={() => setRejectionReason(r.value)}>
                  <Text style={{ color: rejectionReason === r.value ? '#FFF' : '#333' }}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>{t('Additional Note (Optional)')}</Text>
            <TextInput
              style={styles.textInput}
              placeholder={t('Provide more details to the worker...')}
              multiline
              value={rejectionNote}
              onChangeText={setRejectionNote}
            />

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: '#F5F5F5' }]} onPress={() => setModalVisible(false)}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#666' }}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: actionType === 'REJECT' ? '#D32F2F' : '#1976D2' }]} onPress={() => submitDecision(actionType)} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Confirm')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingVertical: 16
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#202124', flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
  statusBanner: { padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  section: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    padding: 20, 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16
  },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#202124' },
  infoGrid: {
    gap: 16
  },
  infoCol: {
    gap: 4
  },
  infoText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#202124' },
  label: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#8A8A8A' },
  docContainer: { marginBottom: 24 },
  docTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#5F6368', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  imageWrapper: {
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  docImage: { width: '100%', height: 280, backgroundColor: '#000' },
  noImage: { width: '100%', height: 200, backgroundColor: '#F1F3F4', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  historyItem: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingVertical: 12 },
  actionFooter: { 
    position: 'absolute', bottom: 0, left: 0, right: 0, 
    backgroundColor: '#FFF', 
    flexDirection: 'row', 
    padding: 16, 
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10
  },
  actionBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F5F0E8', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, marginBottom: 16, color: '#202124' },
  reasonOption: { padding: 16, borderRadius: 12, backgroundColor: '#FFFFFF', marginBottom: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  reasonOptionSelected: { backgroundColor: '#0D0D0D' },
  textInput: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, fontFamily: 'Inter_400Regular', fontSize: 15, minHeight: 100, textAlignVertical: 'top', color: '#202124', elevation: 1, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
});
