import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Skeleton } from '../../../components/ui/Skeleton';
import { apiClient } from '../../../api/client';
import { useToast } from '../../../components/ui/ToastProvider';
import { t } from '../../../utils/i18n';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { deleteUploadedImage } from '../../../api/media';

export default function CreateDisputeScreen() {
  const { bookingId } = useLocalSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const r = await apiClient.get(`/bookings/${bookingId}`);
      setBooking(r.data?.data);
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || 'Failed to load booking', type: 'error' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [bookingId]);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      showToast({ message: t('Please enter a reason for the dispute'), type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/disputes', {
        bookingId,
        reason,
        evidence: evidenceUrls
      });
      showToast({ message: t('Dispute raised successfully'), type: 'success' });
      router.back();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to raise dispute'), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const pickEvidence = () => {
    Alert.alert(t('Add Evidence'), t('Choose photo source'), [
      { text: t('Camera'), onPress: handleCamera },
      { text: t('Gallery'), onPress: handleGallery },
      { text: t('Cancel'), style: 'cancel' }
    ]);
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast({ message: t('Camera permission required'), type: 'error' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      await uploadEvidence(result.assets[0].uri);
    }
  };

  const handleGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      await uploadEvidence(result.assets[0].uri);
    }
  };

  const uploadEvidence = async (uri: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', { uri, name: `evidence_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
      fd.append('purpose', 'dispute');
      const up = await apiClient.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = up.data?.data?.url;
      if (url) {
        setEvidenceUrls(prev => [...prev, url]);
      } else {
        showToast({ message: t('Failed to upload evidence'), type: 'error' });
      }
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to upload evidence'), type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const removeEvidence = (idx: number) => {
    const url = evidenceUrls[idx];
    setEvidenceUrls(prev => prev.filter((_, i) => i !== idx));
    // Free the Cloudinary storage immediately — don't leave a dead upload behind.
    deleteUploadedImage(url);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Raise Dispute')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          {/* Booking summary card */}
          <View style={styles.bookingCard}>
            <View style={styles.bookingHeader}>
              <Skeleton width="55%" height={16} />
              <Skeleton width={56} height={20} borderRadius={8} />
            </View>
            <View style={styles.bookingDetails}>
              <Skeleton width="70%" height={13} />
              <Skeleton width="85%" height={13} />
              <Skeleton width="40%" height={13} />
            </View>
          </View>

          {/* Important notice */}
          <View style={styles.noticeCard}>
            <Skeleton width={20} height={20} borderRadius={10} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width="95%" height={12} />
              <Skeleton width="70%" height={12} />
            </View>
          </View>

          {/* Reason input section */}
          <View style={styles.section}>
            <Skeleton width="40%" height={14} />
            <Skeleton height={112} borderRadius={12} />
            <Skeleton width={48} height={11} style={{ alignSelf: 'flex-end' }} />
          </View>

          {/* Evidence section */}
          <View style={styles.section}>
            <View style={styles.evidenceHeader}>
              <Skeleton width="42%" height={14} />
              <Skeleton width={92} height={34} borderRadius={8} />
            </View>
            <Skeleton height={64} borderRadius={12} />
          </View>

          {/* Submit button */}
          <Skeleton height={54} borderRadius={14} />
        </View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{t('Booking not found')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Raise Dispute')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        contentContainerStyle={styles.content}>
        {/* Booking Summary */}
        <View style={styles.bookingCard}>
          <View style={styles.bookingHeader}>
            <Text style={styles.bookingTitle}>{booking.serviceName || 'Service'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: '#E6F4EA' }]}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#137333' }}>{booking.status}</Text>
            </View>
          </View>
          <View style={styles.bookingDetails}>
            <View style={styles.bookingDetailRow}>
              <MaterialCommunityIcons name="account-outline" size={16} color="#5F6368" />
              <Text style={styles.bookingDetailText}>{booking.workerName || booking.worker?.name || 'Worker'}</Text>
            </View>
            <View style={styles.bookingDetailRow}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={16} color="#5F6368" />
              <Text style={styles.bookingDetailText}>
                {new Date(booking.scheduledAt).toLocaleDateString()} · {booking.scheduleTime}
              </Text>
            </View>
            <View style={styles.bookingDetailRow}>
              <MaterialCommunityIcons name="currency-inr" size={16} color="#5F6368" />
              <Text style={styles.bookingDetailText}>₹{booking.totalAmount || booking.baseAmount || 0}</Text>
            </View>
          </View>
        </View>

        {/* Important Notice */}
        <View style={styles.noticeCard}>
          <MaterialCommunityIcons name="information-outline" size={20} color="#FF5C00" />
          <Text style={styles.noticeText}>
            {t('Disputes must be raised within 48 hours of job completion. Provide clear evidence to support your claim.')}
          </Text>
        </View>

        {/* Reason Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Reason for Dispute')}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={t('Describe the issue...')}
            placeholderTextColor="#C8C0B0"
            multiline
            numberOfLines={5}
            value={reason}
            onChangeText={setReason}
          />
          <Text style={styles.charCount}>{reason.length} / 500</Text>
        </View>

        {/* Evidence */}
        <View style={styles.section}>
          <View style={styles.evidenceHeader}>
            <Text style={styles.sectionTitle}>{t('Evidence (Optional)')}</Text>
            <Pressable style={[styles.addEvidenceBtn, uploading && styles.addEvidenceBtnDisabled]} onPress={pickEvidence} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator size="small" color="#FF5C00" />
              ) : (
                <>
                  <MaterialCommunityIcons name="plus" size={18} color="#FF5C00" />
                  <Text style={styles.addEvidenceBtnText}>{t('Add Photos')}</Text>
                </>
              )}
            </Pressable>
          </View>

          {evidenceUrls.length > 0 && (
            <View style={styles.evidenceGrid}>
              {evidenceUrls.map((url, idx) => (
                <View key={idx} style={styles.evidenceItem}>
                  <Image source={{ uri: url }} style={styles.evidenceImage} />
                  <Pressable style={styles.removeEvidenceBtn} onPress={() => removeEvidence(idx)}>
                    <MaterialCommunityIcons name="close" size={16} color="#FFF" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {evidenceUrls.length === 0 && (
            <View style={styles.noEvidence}>
              <MaterialCommunityIcons name="camera-outline" size={32} color="#D2D2D2" />
              <Text style={styles.noEvidenceText}>{t('No evidence added')}</Text>
            </View>
          )}
        </View>

        {/* Submit Button */}
        <Pressable style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="large" color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>{t('Submit Dispute')}</Text>
          )}
        </Pressable>

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontFamily: 'Inter_500Medium', fontSize: 16, color: '#8A8A8A' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124', flex: 1 },

  content: { padding: 16, gap: 16 },

  bookingCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 12 },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookingTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#202124' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },

  bookingDetails: { gap: 8 },
  bookingDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingDetailText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#202124', flex: 1 },

  noticeCard: { flexDirection: 'row', gap: 12, backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12 },
  noticeText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: '#B06000' },

  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124' },

  textInput: { backgroundColor: '#F5F0E8', borderRadius: 12, padding: 14, fontFamily: 'Inter_500Medium', fontSize: 14, color: '#202124', borderWidth: 1, borderColor: '#EAE2D6' },
  charCount: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', textAlign: 'right' },

  evidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addEvidenceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF8E1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addEvidenceBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FF5C00' },
  addEvidenceBtnDisabled: { opacity: 0.6 },

  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  evidenceItem: { position: 'relative', width: 80, height: 80, borderRadius: 10, overflow: 'hidden' },
  evidenceImage: { width: '100%', height: '100%' },
  removeEvidenceBtn: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },

  noEvidence: { alignItems: 'center', padding: 20, gap: 8, backgroundColor: '#F5F0E8', borderRadius: 12 },
  noEvidenceText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A8A' },

  submitBtn: { backgroundColor: '#FF5C00', borderRadius: 14, paddingVertical: 16, alignItems: 'center', elevation: 3 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFF' },
});