import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator,
  Modal, TextInput, Linking, Image
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { useT } from '../../utils/i18n';
import { socketService } from '../../api/socket';
import { SkeletonWorkerBookingsBody } from '../../components/ui/SkeletonScreenLayouts';
import { CameraView, useCameraPermissions } from 'expo-camera';

const ORANGE = '#FF5C00';

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:     { label: 'New',      color: '#FF5C00', bg: '#FFF0E8' },
  NEGOTIATING: { label: 'Negotiating', color: '#B06000', bg: '#FFF3E0' },
  ACCEPTED:    { label: 'Accepted', color: '#2196F3', bg: '#E3F2FD' },
  ON_THE_WAY:  { label: 'On Way',   color: '#FF5C00', bg: '#FFF0E8' },
  IN_PROGRESS: { label: 'Working',  color: '#0D0D0D', bg: '#EDE8DC' },
  COMPLETED:   { label: 'Done',     color: '#4CAF50', bg: '#E8F5E9' },
  CANCELLED:   { label: 'Cancelled',color: '#F44336', bg: '#FFEBEE' },
};

// Human-readable labels for the status-update toast — the raw enum value
// (IN_PROGRESS) reads like a code, not a sentence.
const STATUS_LABEL: Record<string, string> = {
  PENDING:     'Pending',
  NEGOTIATING: 'Negotiating',
  ACCEPTED:    'Accepted',
  ON_THE_WAY:  'On the way',
  IN_PROGRESS: 'In progress',
  COMPLETED:   'Completed',
  CANCELLED:   'Cancelled',
  DISPUTED:    'Disputed',
};

export default function WorkerBookings() {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>({});
  const [otpModal, setOtpModal] = useState<{ visible: boolean; bookingId: string }>({ visible: false, bookingId: '' });
  const [otpValue, setOtpValue] = useState('');
  const [cancelModal, setCancelModal] = useState<{ visible: boolean; booking: any }>({ visible: false, booking: null });
  const [workerCancelReason, setWorkerCancelReason] = useState('');
  const [cancelReasonCategory, setCancelReasonCategory] = useState<string>('OTHER');
  const [workerCancelling, setWorkerCancelling] = useState(false);
  const [cancelPreview, setCancelPreview] = useState<any>(null);
  const [showManualOtp, setShowManualOtp] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // Negotiation / Counter Offer
  const [counterModal, setCounterModal] = useState<{ visible: boolean; booking: any }>({ visible: false, booking: null });
  const [counterAmount, setCounterAmount] = useState('');
  const [counterSubmitting, setCounterSubmitting] = useState(false);

  // Job-photo submission (before/after evidence for guarantee claims)
  const [photoModal, setPhotoModal] = useState<any>(null);
  const [photoBefore, setPhotoBefore] = useState<string | null>(null);
  const [photoAfter, setPhotoAfter] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoSubmitting, setPhotoSubmitting] = useState(false);

  const [completionModal, setCompletionModal] = useState<{ visible: boolean; booking: any }>({ visible: false, booking: null });
  const [completionPhotos, setCompletionPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Scope-change proposal (worker proposes; customer must approve)
  const [changeModal, setChangeModal] = useState<any>(null);
  const [changeReason, setChangeReason] = useState('');
  const [changeScope, setChangeScope] = useState('');
  const [changePrice, setChangePrice] = useState('');
  const [changeSubmitting, setChangeSubmitting] = useState(false);

  const loadBookings = useCallback(async () => {
    try {
      const res = await apiClient.get('/bookings');
      setBookings(res.data?.data || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { 
    loadBookings(); 
    
    socketService.connect();
    const handleStatusUpdate = () => {
      loadBookings();
    };

    // Track new messages for unread badges
    const handleNewMessage = (data: any) => {
      if (data?.bookingId) {
        setUnreadMessages(prev => ({
          ...prev,
          [data.bookingId]: (prev[data.bookingId] || 0) + 1
        }));
      }
    };
    
    socketService.on('booking_status_update', handleStatusUpdate);
    socketService.on('new_message', handleNewMessage);
    
    return () => {
      socketService.off('booking_status_update', handleStatusUpdate);
      socketService.off('new_message', handleNewMessage);
    };
  }, [loadBookings]);

  useEffect(() => {
    if (otpModal.visible && permission?.status !== 'granted') {
      requestPermission();
    }
  }, [otpModal.visible, permission?.status, requestPermission]);

  // Fetch cancellation preview so the worker sees the real refund amount for
  // post-"On My Way" cancellations of already-paid bookings.
  useEffect(() => {
    if (!cancelModal.visible || !cancelModal.booking?.id || cancelModal.booking?.cancelRequestStatus === 'PENDING_CUSTOMER') {
      setCancelPreview(null);
      return;
    }
    (async () => {
      try {
        const res = await apiClient.get(`/cancellations/${cancelModal.booking.id}/preview`);
        setCancelPreview(res.data?.data ?? null);
      } catch {
        setCancelPreview(null);
      }
    })();
  }, [cancelModal.visible, cancelModal.booking?.id, cancelModal.booking?.cancelRequestStatus]);

  const updateStatus = async (id: string, status: string, otp?: string, completionPhotos?: string[]) => {
    setUpdatingId(id);
    try {
      await apiClient.patch(`/bookings/${id}/status`, { status, otp, completionPhotos });
      showToast({ message: `${t('Status updated to')} ${t(STATUS_LABEL[status] || status)}`, type: 'success' });
      loadBookings();
      // Navigate to live tracking when going on the way
      if (status === 'ON_THE_WAY') {
        router.push(`/(worker)/live-tracking?bookingId=${id}`);
      }
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to update'), type: 'error' });
    } finally { setUpdatingId(null); }
  };

  const acceptOffer = async (id: string) => {
    setUpdatingId(id);
    try {
      await apiClient.post(`/negotiation/${id}/accept`);
      showToast({ message: t('Offer accepted!'), type: 'success' });
      loadBookings();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to accept offer'), type: 'error' });
    } finally { setUpdatingId(null); }
  };

  const submitCounterOffer = async () => {
    if (!counterModal.booking) return;
    const amount = parseFloat(counterAmount);
    if (isNaN(amount) || amount <= 0) return showToast({ message: t('Enter a valid amount'), type: 'error' });
    
    setCounterSubmitting(true);
    try {
      await apiClient.post(`/negotiation/${counterModal.booking.id}/make-offer`, {
        amount,
        message: 'Counter offer from worker'
      });
      showToast({ message: t('Counter offer sent!'), type: 'success' });
      setCounterModal({ visible: false, booking: null });
      setCounterAmount('');
      loadBookings();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to send counter offer'), type: 'error' });
    } finally { setCounterSubmitting(false); }
  };

  const uploadPhoto = async (uri: string): Promise<string> => {
    const fd = new FormData();
    fd.append('file', { uri, type: 'image/jpeg', name: 'job.jpg' } as any);
    fd.append('purpose', 'job');
    const up = await apiClient.post('/upload', fd);
    return up.data?.data?.url || uri;
  };

  const pickPhoto = async (which: 'before' | 'after') => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (r.canceled || !r.assets?.[0]) return;
    if (which === 'before') setPhotoBefore(r.assets[0].uri); else setPhotoAfter(r.assets[0].uri);
  };

  const submitPhotos = async () => {
    if (!photoModal) return;
    // Already has evidence (stale modal / re-tap) — nothing new to record, so the
    // flow just closes instead of silently submitting a duplicate.
    if ((photoModal.jobPhotos?.length ?? 0) > 0) {
      setPhotoModal(null); setPhotoBefore(null); setPhotoAfter(null); setPhotoCaption('');
      return;
    }
    if (!photoBefore || !photoAfter) return showToast({ message: t('Add both before and after photos'), type: 'error' });
    setPhotoSubmitting(true);
    try {
      const [beforeUrl, afterUrl] = await Promise.all([uploadPhoto(photoBefore), uploadPhoto(photoAfter)]);
      const res = await apiClient.post(`/guarantee/jobs/${photoModal.id}/photos`, { beforeUrl, afterUrl, caption: photoCaption.trim() || undefined });
      const photo = res.data?.data;
      // Reflect instantly so the card flips to "Photos Added" without waiting for
      // the refetch; loadBookings() then reconciles with the server.
      if (photo?.id) {
        setBookings(prev => prev.map(b => b.id === photoModal.id
          ? { ...b, jobPhotos: [{ id: photo.id, beforeUrl: photo.beforeUrl, afterUrl: photo.afterUrl, caption: photo.caption }] }
          : b
        ));
      }
      showToast({ message: t('Job photos submitted'), type: 'success' });
      setPhotoModal(null); setPhotoBefore(null); setPhotoAfter(null); setPhotoCaption('');
      loadBookings();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to submit photos'), type: 'error' });
    } finally { setPhotoSubmitting(false); }
  };

  const submitChange = async () => {
    if (!changeModal) return;
    const newPrice = Number(changePrice);
    if (!changeReason.trim()) return showToast({ message: t('Add a reason for the change'), type: 'error' });
    if (!changeScope.trim()) return showToast({ message: t('Describe the new scope of work'), type: 'error' });
    if (!newPrice || newPrice <= 0) return showToast({ message: t('Enter a valid new price'), type: 'error' });

    setChangeSubmitting(true);
    try {
      await apiClient.post(`/scope-changes/${changeModal.id}/propose`, {
        reason: changeReason.trim(),
        newScope: { description: changeScope.trim() },
        newPrice,
      });
      showToast({ message: t('Change proposed — waiting for customer approval'), type: 'success' });
      setChangeModal(null); setChangeReason(''); setChangeScope(''); setChangePrice('');
      loadBookings();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to propose change'), type: 'error' });
    } finally { setChangeSubmitting(false); }
  };

  const getNextAction = (booking: any) => {
    switch (booking.status) {
      case 'PENDING':
        return { label: t('Accept'), nextStatus: 'ACCEPTED', color: '#4CAF50' };
      case 'ACCEPTED':
        return { label: t('On My Way'), nextStatus: "ON_THE_WAY", color: ORANGE };
      case 'ON_THE_WAY':
        return { label: t('Start Work'), nextStatus: "IN_PROGRESS", color: '#0D0D0D', needsOtp: true };
      case 'IN_PROGRESS':
        return { label: t('Complete'), nextStatus: "COMPLETED", color: '#1A5C2A' };
      default:
        return null;
    }
  };

  const formatDate = (d?: string) => {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (d?: string) => {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const pickCompletionPhoto = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setCompletionPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const removeCompletionPhoto = (index: number) => {
    setCompletionPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const submitCompletionPhotos = async () => {
    if (!completionModal.booking) return;
    if (completionPhotos.length === 0) {
      return showToast({ message: t('Please add at least one photo'), type: 'error' });
    }
    
    setUploadingPhotos(true);
    try {
      const uploadedUrls: string[] = [];
      for (const uri of completionPhotos) {
        if (!uri.startsWith('http')) {
          const fd = new FormData();
          fd.append('file', { uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
          fd.append('purpose', 'completion');
          const up = await apiClient.post('/upload', fd);
          uploadedUrls.push(up.data?.data?.url || uri);
        } else {
          uploadedUrls.push(uri);
        }
      }
      
      await updateStatus(completionModal.booking.id, 'COMPLETED', undefined, uploadedUrls);
      setCompletionModal({ visible: false, booking: null });
      setCompletionPhotos([]);
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to upload photos'), type: 'error' });
    } finally {
      setUploadingPhotos(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('My Bookings')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <SkeletonWorkerBookingsBody />
      ) : (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBookings(); }} tintColor="#0D0D0D" />}
      >
        {bookings.length === 0 ? (
          <View style={styles.emptyBox}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#CCC" />
            </View>
            <Text style={styles.emptyTitle}>{t('No bookings yet')}</Text>
            <Text style={styles.emptySub}>{t('Bookings from customers will appear here')}</Text>
          </View>
        ) : (
          bookings.map((booking: any) => {
            const style = STATUS_STYLE[booking.status] || STATUS_STYLE.PENDING;
            const action = getNextAction(booking);
            const customerName = booking.customer?.name || t('Customer');
            return (
              <View key={booking.id} style={styles.bookingCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: style.color }]}>{t(style.label)}</Text>
                  </View>
                  <Text style={styles.cardDate}>{formatDate(booking.createdAt)}</Text>
                </View>

                {/* Service name */}
                <Text style={styles.serviceName}>{t(booking.serviceName)}</Text>

                {/* Customer info */}
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="account" size={16} color="#666" />
                  <Text style={styles.detailText}>{customerName}</Text>
                </View>

                {/* Notes from customer */}
                {booking.description && (
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="text" size={16} color="#666" />
                    <Text style={[styles.detailText, { flexShrink: 1 }]} numberOfLines={2}>{booking.description}</Text>
                  </View>
                )}

                {/* Schedule */}
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="calendar-clock" size={16} color="#666" />
                  <Text style={styles.detailText}>{formatDate(booking.scheduledAt)} · {formatTime(booking.scheduledAt)}</Text>
                </View>

                {/* Price — show what the worker actually earns, matching the accept modal */}
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="wallet-outline" size={16} color="#666" />
                  <Text style={styles.detailText}>{t('Earnings')}: ₹{booking.workerEarnings ?? booking.totalAmount ?? booking.baseAmount ?? 0}</Text>
                </View>

                {/* Actions */}
                <View style={styles.actionsRow}>
                  {booking.status === 'PENDING' || booking.status === 'NEGOTIATING' ? (
                    /* Pending bookings show Accept + Reject side-by-side with
                       equal spacing — the worker decides at a glance. */
                    <View style={styles.pendingActions}>
                      <Pressable
                        style={[styles.pendingActionBtn, styles.acceptBtn]}
                        onPress={() => booking.status === 'NEGOTIATING' ? acceptOffer(booking.id) : updateStatus(booking.id, 'ACCEPTED')}
                        disabled={updatingId === booking.id}
                        accessibilityRole="button"
                        accessibilityLabel={t('Accept booking')}
                      >
                        {updatingId === booking.id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="check" size={18} color="#FFF" />
                            <Text style={styles.actionBtnText}>{booking.status === 'NEGOTIATING' ? t('Accept Offer') : t('Accept')}</Text>
                          </>
                        )}
                      </Pressable>
                      {booking.status === 'NEGOTIATING' && (
                        <Pressable
                          style={[styles.pendingActionBtn, { backgroundColor: '#B06000' }]}
                          onPress={() => {
                            setCounterAmount('');
                            setCounterModal({ visible: true, booking });
                          }}
                        >
                          <MaterialCommunityIcons name="swap-horizontal" size={18} color="#FFF" />
                          <Text style={styles.actionBtnText}>{t('Counter')}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        style={[styles.pendingActionBtn, styles.rejectBtn]}
                        onPress={() => {
                          setCancelReasonCategory('OTHER');
                          setWorkerCancelReason('');
                          setCancelModal({ visible: true, booking });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Reject booking')}
                      >
                        <MaterialCommunityIcons name="close" size={18} color="#8B1A1A" />
                        <Text style={styles.rejectBtnText}>{t('Reject')}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    /* Primary action — all non-pending statuses keep the full-width CTA */
                    action && (
                      <Pressable
                        style={[styles.actionBtn, { backgroundColor: action.color }]}
                        onPress={() => {
                          if ((action as any).needsOtp) {
                            setOtpValue('');
                            setOtpModal({ visible: true, bookingId: booking.id });
                          } else if (action.nextStatus === 'COMPLETED') {
                            setCompletionPhotos([]);
                            setCompletionModal({ visible: true, booking });
                          } else {
                            updateStatus(booking.id, action.nextStatus);
                          }
                        }}
                        disabled={updatingId === booking.id}
                      >
                        {updatingId === booking.id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={styles.actionBtnText}>{action.label}</Text>
                        )}
                      </Pressable>
                    )
                  )}

                  {/* Secondary actions */}
                  <View style={styles.secondaryRow}>
                    {/* Job photos — before/after evidence for guarantee claims.
                        Once submitted, the button is replaced by a static
                        "Photos Added" state so it can't be mistaken for a pending
                        task or submitted twice. */}
                    {booking.status === 'COMPLETED' && (
                      (booking.jobPhotos?.length ?? 0) > 0 ? (
                        <View style={[styles.secondaryBtn, styles.photosAddedPill]}>
                          <MaterialCommunityIcons name="check-circle-outline" size={16} color="#1A5C2A" />
                          <Text style={styles.photosAddedText}>{t('Photos Added')}</Text>
                        </View>
                      ) : (
                        <Pressable
                          style={[styles.secondaryBtn, { backgroundColor: '#1A5C2A' }]}
                          onPress={() => { setPhotoModal(booking); setPhotoBefore(null); setPhotoAfter(null); setPhotoCaption(''); }}
                        >
                          <MaterialCommunityIcons name="camera-outline" size={16} color="#FFF" />
                          <Text style={styles.actionBtnText}>{t('Add Job Photos')}</Text>
                        </Pressable>
                      )
                    )}

                    {/* Propose scope change — active bookings only */}
                    {['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(booking.status) && (
                      <Pressable
                        style={[styles.secondaryBtn, { backgroundColor: '#B06000' }]}
                        onPress={() => { setChangeModal(booking); setChangeReason(''); setChangeScope(''); setChangePrice(''); }}
                      >
                        <MaterialCommunityIcons name="file-document-edit-outline" size={16} color="#FFF" />
                        <Text style={styles.actionBtnText}>{t('Propose Change')}</Text>
                      </Pressable>
                    )}

                    {/* Chat — active bookings only */}
                    {(booking.status === 'ACCEPTED' || booking.status === 'ON_THE_WAY' || booking.status === 'IN_PROGRESS' || booking.status === 'PENDING' || booking.status === 'NEGOTIATING') && (
                      <Pressable
                        style={({ pressed }) => [
                          styles.chatIconBtn,
                          { backgroundColor: pressed ? '#1EA653' : '#25D366' }
                        ]}
                        onPress={() => {
                          setUnreadMessages(prev => ({ ...prev, [booking.id]: 0 }));
                          router.push(`/(worker)/chat?bookingId=${booking.id}`);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Open chat')}
                      >
                        <MaterialCommunityIcons name="message-text" size={20} color="#FFF" />
                        {unreadMessages[booking.id] > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                              {unreadMessages[booking.id] > 99 ? '99+' : unreadMessages[booking.id]}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    )}

                    {/* Cancel — ACCEPTED / ON_THE_WAY (PENDING uses the Reject button above) */}
                    {(booking.status === 'ACCEPTED' || booking.status === 'ON_THE_WAY') && (
                      <Pressable
                        style={[styles.iconBtn, { backgroundColor: '#8B1A1A' }]}
                        onPress={() => {
                          setCancelReasonCategory('OTHER');
                          setWorkerCancelReason('');
                          setCancelModal({ visible: true, booking });
                        }}
                      >
                        <MaterialCommunityIcons name="close" size={20} color="#FFF" />
                      </Pressable>
                    )}

                    {/* Live tracking */}
                    {(booking.status === 'ON_THE_WAY' || booking.status === 'IN_PROGRESS') && (
                      <Pressable
                        style={[styles.iconBtn, { backgroundColor: '#2196F3' }]}
                        onPress={() => router.push(`/(worker)/live-tracking?bookingId=${booking.id}`)}
                      >
                        <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#FFF" />
                      </Pressable>
                    )}
                  </View>

                  {/* Scope-change proposal status */}
                  {(booking.scopeChanges || []).length > 0 && (
                    <Text style={styles.changeStatus}>
                      {(booking.scopeChanges || []).map((c: any) =>
                        c.status === 'PENDING' ? t('Change pending customer approval') : c.status === 'APPROVED' ? t('Change approved') : t('Change rejected')
                      ).join(' · ')}
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      )}

      {/* OTP Modal */}
      <Modal visible={otpModal.visible} transparent animationType="fade" onRequestClose={() => { setOtpModal({ visible: false, bookingId: '' }); setOtpValue(''); setShowManualOtp(false); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          {/* KeyboardAvoidingView lifts the card above the keyboard so the manual
              OTP field + Verify stay visible while typing (edge-to-edge safe). */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ width: '100%', maxHeight: '85%' }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginBottom: 8 }}>{t('Scan QR to Start')}</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666', marginBottom: 20, textAlign: 'center' }}>
              {t('Scan the QR code on the customer\'s screen or enter the 4-digit code below')}
            </Text>

            <View style={{ width: 250, height: 250, borderRadius: 24, overflow: 'hidden', backgroundColor: '#F0F0F0', marginBottom: 24, borderWidth: 3, borderColor: '#FF5C00' }}>
              {permission?.granted ? (
                <CameraView
                  style={{ flex: 1 }}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => {
                    if (data && data.length === 4 && /^\d+$/.test(data)) {
                      setOtpValue(data);
                      updateStatus(otpModal.bookingId, 'IN_PROGRESS', data);
                      setOtpModal({ visible: false, bookingId: '' });
                    }
                  }}
                />
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                  <MaterialCommunityIcons name="camera-off" size={32} color="#CCC" />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: '#999', textAlign: 'center', marginTop: 8 }}>
                    {t('Camera disabled')}
                  </Text>
                </View>
              )}
            </View>

            {showManualOtp ? (
              <>
                <TextInput
                  style={{ width: '100%', borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 24, fontFamily: 'SpaceMono_700Bold', textAlign: 'center', letterSpacing: 8, marginBottom: 16 }}
                  placeholder="0000"
                  placeholderTextColor="#CCC"
                  keyboardType="number-pad"
                  maxLength={4}
                  value={otpValue}
                  onChangeText={setOtpValue}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <Pressable
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center' }}
                    onPress={() => { setOtpModal({ visible: false, bookingId: '' }); setShowManualOtp(false); }}
                  >
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>{t('Cancel')}</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#0D0D0D', alignItems: 'center', opacity: otpValue.length === 4 ? 1 : 0.4 }}
                    onPress={() => {
                      if (otpValue.length === 4) {
                        updateStatus(otpModal.bookingId, 'IN_PROGRESS', otpValue);
                        setOtpModal({ visible: false, bookingId: '' });
                        setShowManualOtp(false);
                      }
                    }}
                    disabled={otpValue.length !== 4}
                  >
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Verify')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={{ width: '100%' }}>
                <Pressable
                  style={{ width: '100%', paddingVertical: 14, borderRadius: 16, backgroundColor: '#FFF0E8', alignItems: 'center', marginBottom: 12 }}
                  onPress={async () => {
                    try {
                      await apiClient.post(`/bookings/${otpModal.bookingId}/send-arrival-otp`);
                      showToast({ message: t('OTP sent to customer via SMS'), type: 'success' });
                      setShowManualOtp(true);
                    } catch {
                      showToast({ message: t('Failed to send OTP SMS'), type: 'error' });
                      setShowManualOtp(true);
                    }
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FF5C00' }}>{t('Get Instant OTP via SMS')}</Text>
                </Pressable>
                <Pressable
                  style={{ width: '100%', paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center' }}
                  onPress={() => setOtpModal({ visible: false, bookingId: '' })}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>{t('Cancel')}</Text>
                </Pressable>
              </View>
            )}
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Worker Cancel Modal */}
      <Modal visible={cancelModal.visible} transparent animationType="slide" onRequestClose={() => setCancelModal({ visible: false, booking: null })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          {/* KeyboardAvoidingView lifts the sheet above the keyboard so the reason
              field + actions stay visible. The sheet keeps its own internal
              reason-list ScrollView, so no outer KASV (would fight the flex:1).
              flex:1 gives the KAV a definite height so the sheet's minHeight:60%
              and flex:1 reason list still resolve. */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1, justifyContent: 'flex-end', maxHeight: '90%' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: '60%' }}>
            
            {cancelModal.booking?.cancelRequestStatus === 'PENDING_CUSTOMER' ? (
              <View style={{ alignItems: 'center', flex: 1 }}>
                <MaterialCommunityIcons name="clock-outline" size={48} color="#FF5C00" style={{ marginBottom: 16 }} />
                <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginBottom: 8, textAlign: 'center' }}>{t('Waiting for Customer')}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#666', textAlign: 'center', marginBottom: 32 }}>
                  {t('We have sent a cancellation confirmation request to the customer. If they do not respond within 5 minutes, you can mark them as unreachable.')}
                </Text>
                
                <Pressable
                  style={{ width: '100%', paddingVertical: 14, borderRadius: 16, backgroundColor: '#FFF0E8', alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={() => Linking.openURL(`tel:${cancelModal.booking?.customer?.phone || ''}`)}
                >
                  <MaterialCommunityIcons name="phone" size={20} color="#FF5C00" />
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FF5C00' }}>{t('Call Customer')}</Text>
                </Pressable>
                
                <Pressable
                  style={{ width: '100%', paddingVertical: 14, borderRadius: 16, backgroundColor: '#E3F2FD', alignItems: 'center', marginBottom: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                  onPress={() => {
                    setCancelModal({ visible: false, booking: null });
                    router.push(`/(worker)/chat?bookingId=${cancelModal.booking?.id}`);
                  }}
                >
                  <MaterialCommunityIcons name="message-text-outline" size={20} color="#2196F3" />
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#2196F3' }}>{t('Message Customer')}</Text>
                </Pressable>
                
                <Pressable
                  style={{ width: '100%', paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#8B1A1A', alignItems: 'center', marginBottom: 12 }}
                  onPress={async () => {
                    setWorkerCancelling(true);
                    try {
                      await apiClient.patch(`/bookings/${cancelModal.booking.id}/status`, {
                        status: 'CANCELLED',
                        reasonCategory: 'CUSTOMER_UNREACHABLE',
                        cancelReason: workerCancelReason,
                      });
                      showToast({ message: t('Booking cancelled'), type: 'success' });
                      setCancelModal({ visible: false, booking: null });
                      loadBookings();
                    } catch (e: any) {
                      showToast({ message: e?.response?.data?.error || t('Failed to cancel'), type: 'error' });
                    } finally { setWorkerCancelling(false); }
                  }}
                  disabled={workerCancelling}
                >
                  {workerCancelling ? <ActivityIndicator size="small" color="#8B1A1A" /> : <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#8B1A1A' }}>{t('Customer Isn\'t Responding')}</Text>}
                </Pressable>

                <Pressable
                  style={{ width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center', marginTop: 'auto' }}
                  onPress={() => setCancelModal({ visible: false, booking: null })}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>{t('Close')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginBottom: 8 }}>{t('Cancel Booking')}</Text>
                
                {(cancelModal.booking?.status === 'PENDING' || cancelModal.booking?.status === 'ACCEPTED') && (
                  <View style={{ backgroundColor: '#FFF4E5', padding: 12, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#E65100" />
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#E65100', flex: 1 }}>
                      {t('Frequent cancellations of accepted bookings may affect your reliability rating.')}
                    </Text>
                  </View>
                )}

                {(cancelModal.booking?.status === 'ON_THE_WAY' || cancelModal.booking?.status === 'IN_PROGRESS') && (
                  <View style={{ backgroundColor: '#E8F5E9', padding: 12, borderRadius: 8, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="check-circle-outline" size={20} color="#2E7D32" />
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#2E7D32', flex: 1 }}>
                      {(cancelPreview?.refundIfCancelled ?? 0) > 0
                        ? `${t('No fee is charged, but this booking was already paid — the customer will receive a full refund of')} ₹${cancelPreview.refundIfCancelled}.`
                        : t('No fee is charged to you or the customer for this cancellation.')}
                    </Text>
                  </View>
                )}

                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#333', marginBottom: 12 }}>{t('Why are you cancelling?')}</Text>
                
                <ScrollView style={{ marginBottom: 16, flex: 1 }}>
                  {[
                    { id: 'CUSTOMER_REQUESTED', label: 'Customer requested cancellation' },
                    { id: 'CUSTOMER_UNREACHABLE', label: 'Customer is not responding' },
                    { id: 'WRONG_LOCATION', label: 'Wrong/invalid customer location' },
                    { id: 'UNABLE_TO_PERFORM', label: 'Unable to perform the requested work' },
                    { id: 'EMERGENCY', label: 'Emergency / personal issue' },
                    { id: 'SAFETY', label: 'Safety concern' },
                    { id: 'OTHER', label: 'Other' },
                  ].map(reason => (
                    <Pressable
                      key={reason.id}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}
                      onPress={() => setCancelReasonCategory(reason.id)}
                    >
                      <MaterialCommunityIcons 
                        name={cancelReasonCategory === reason.id ? "radiobox-marked" : "radiobox-blank"} 
                        size={22} 
                        color={cancelReasonCategory === reason.id ? "#FF5C00" : "#CCC"} 
                      />
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_500Medium', color: cancelReasonCategory === reason.id ? '#0D0D0D' : '#666', marginLeft: 12 }}>
                        {t(reason.label)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {cancelReasonCategory === 'OTHER' && (
                  <TextInput
                    style={{ width: '100%', borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
                    placeholder={t('Please specify (required)')}
                    placeholderTextColor="#AAA"
                    multiline
                    value={workerCancelReason}
                    onChangeText={setWorkerCancelReason}
                    maxLength={300}
                  />
                )}

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 'auto' }}>
                  <Pressable
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center' }}
                    onPress={() => { setCancelModal({ visible: false, booking: null }); setWorkerCancelReason(''); }}
                  >
                    <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#333' }}>{t('Keep Booking')}</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#8B1A1A', alignItems: 'center', opacity: (cancelReasonCategory === 'OTHER' && workerCancelReason.trim().length < 3) ? 0.4 : 1 }}
                    onPress={async () => {
                      if (cancelReasonCategory === 'OTHER' && workerCancelReason.trim().length < 3) return;
                      setWorkerCancelling(true);
                      try {
                        const res = await apiClient.patch(`/bookings/${cancelModal.booking.id}/status`, {
                          status: 'CANCELLED',
                          reasonCategory: cancelReasonCategory,
                          cancelReason: workerCancelReason,
                        });
                        if (res.data?.data?.requires_confirmation) {
                          showToast({ message: t('Request sent to customer'), type: 'success' });
                          // Keep modal open, but state might change via socket.
                          // To instantly reflect locally before socket:
                          setCancelModal(prev => ({
                            ...prev,
                            booking: { ...prev.booking, cancelRequestStatus: 'PENDING_CUSTOMER', cancelRequestAt: new Date().toISOString() }
                          }));
                          loadBookings();
                        } else {
                          showToast({ message: t('Booking cancelled'), type: 'success' });
                          setCancelModal({ visible: false, booking: null });
                          loadBookings();
                        }
                      } catch (e: any) {
                        showToast({ message: e?.response?.data?.error || t('Failed to cancel'), type: 'error' });
                      } finally { setWorkerCancelling(false); }
                    }}
                    disabled={(cancelReasonCategory === 'OTHER' && workerCancelReason.trim().length < 3) || workerCancelling}
                  >
                    {workerCancelling ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={{ fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Cancel Booking')}</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Job photos modal — before/after evidence for guarantee claims */}
      <Modal visible={!!photoModal} transparent animationType="slide" onRequestClose={() => setPhotoModal(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPhotoModal(null)} />
          {/* KAV lifts the caption field above the keyboard (edge-to-edge safe on Android). */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ maxHeight: '85%' }}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Add Job Photos')}</Text>
            {photoModal && (
              <Text style={styles.modalSub}>#{photoModal.bookingNumber} · {t(photoModal.serviceName)}</Text>
            )}
            <Text style={styles.photoHint}>{t('Before/after photos help customers raise and verify warranty claims on your work.')}</Text>

            <View style={styles.photoGrid}>
              <Pressable style={[styles.photoSlot, photoBefore && styles.photoSlotFilled]} onPress={() => pickPhoto('before')}>
                {photoBefore ? (
                  <Image source={{ uri: photoBefore }} style={styles.photoSlotImg} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="camera-outline" size={28} color="#FF5C00" />
                    <Text style={styles.photoSlotLabel}>{t('Before')}</Text>
                  </>
                )}
              </Pressable>
              <Pressable style={[styles.photoSlot, photoAfter && styles.photoSlotFilled]} onPress={() => pickPhoto('after')}>
                {photoAfter ? (
                  <Image source={{ uri: photoAfter }} style={styles.photoSlotImg} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="camera-plus-outline" size={28} color="#FF5C00" />
                    <Text style={styles.photoSlotLabel}>{t('After')}</Text>
                  </>
                )}
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>{t('Caption (optional)')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder={t('e.g. Replaced faulty water pipe')}
                placeholderTextColor="#B0A898"
                value={photoCaption}
                onChangeText={setPhotoCaption}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable style={[styles.photoSubmitBtn, photoSubmitting && { opacity: 0.5 }]} onPress={submitPhotos} disabled={photoSubmitting}>
                {photoSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.photoSubmitText}>{t('Submit photos')}</Text>
                )}
              </Pressable>
              <Pressable style={[styles.photoCancelBtn]} onPress={() => setPhotoModal(null)}>
                <Text style={styles.photoCancelText}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Scope-change proposal modal */}
      <Modal visible={!!changeModal} transparent animationType="slide" onRequestClose={() => setChangeModal(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setChangeModal(null)} />
          {/* KAV lifts the three scope-change fields above the keyboard. */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ maxHeight: '85%' }}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <MaterialCommunityIcons name="file-document-edit-outline" size={22} color="#B06000" />
              <Text style={styles.modalTitle}>{t('Propose Scope Change')}</Text>
            </View>
            {changeModal && (
              <Text style={styles.modalSub}>
                #{changeModal.bookingNumber} · {t(changeModal.serviceName)} · {t('current')} ₹{changeModal.negotiatedAmount ?? changeModal.baseAmount ?? 0}
              </Text>
            )}
            <Text style={styles.photoHint}>{t('The customer must approve before the price changes. Original scope is never changed without approval.')}</Text>

            <Text style={styles.inputLabel}>{t('Reason for change')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                placeholder={t('e.g. Found a leak in the main line')}
                placeholderTextColor="#B0A898"
                value={changeReason}
                onChangeText={setChangeReason}
                multiline
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.inputLabel}>{t('New scope of work')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                placeholder={t('e.g. Replace main supply line + fix two joints')}
                placeholderTextColor="#B0A898"
                value={changeScope}
                onChangeText={setChangeScope}
                multiline
                textAlignVertical="top"
              />
            </View>

            <Text style={styles.inputLabel}>{t('New price (₹)')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder={t('e.g. 1200')}
                placeholderTextColor="#B0A898"
                value={changePrice}
                onChangeText={setChangePrice}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable style={[styles.photoSubmitBtn, { backgroundColor: '#B06000' }, changeSubmitting && { opacity: 0.5 }]} onPress={submitChange} disabled={changeSubmitting}>
                {changeSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.photoSubmitText}>{t('Send for approval')}</Text>
                )}
              </Pressable>
              <Pressable style={[styles.photoCancelBtn]} onPress={() => setChangeModal(null)}>
                <Text style={styles.photoCancelText}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* Counter Offer Modal */}
      <Modal visible={counterModal.visible} transparent animationType="fade" onRequestClose={() => setCounterModal({ visible: false, booking: null })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior="padding" automaticOffset>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginBottom: 16 }}>{t('Counter Offer')}</Text>
            
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666', marginBottom: 8 }}>{t('Enter your price (₹)')}</Text>
              <TextInput
                style={{ width: '100%', borderWidth: 1, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 16, fontFamily: 'Inter_500Medium' }}
                placeholder="0"
                keyboardType="numeric"
                value={counterAmount}
                onChangeText={setCounterAmount}
                autoFocus
              />
            </View>

            <Pressable
              style={{ width: '100%', paddingVertical: 16, borderRadius: 16, backgroundColor: '#0D0D0D', alignItems: 'center', marginBottom: 12 }}
              onPress={submitCounterOffer}
              disabled={counterSubmitting}
            >
              {counterSubmitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Send Counter Offer')}</Text>
              )}
            </Pressable>
            
            <Pressable
              style={{ width: '100%', paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center' }}
              onPress={() => setCounterModal({ visible: false, booking: null })}
            >
              <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>{t('Cancel')}</Text>
            </Pressable>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* Completion Modal */}
      <Modal visible={completionModal.visible} transparent animationType="slide" onRequestClose={() => setCompletionModal({ visible: false, booking: null })}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCompletionModal({ visible: false, booking: null })} />
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ maxHeight: '85%' }}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Complete Booking')}</Text>
            {completionModal.booking && (
              <Text style={styles.modalSub}>#{completionModal.booking.bookingNumber} · {t(completionModal.booking.serviceName)}</Text>
            )}
            <Text style={styles.photoHint}>{t('Please upload at least one photo of the completed work. This serves as proof of work for the customer before they pay.')}</Text>
            
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              {completionPhotos.map((photo, idx) => (
                <View key={idx} style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden' }}>
                  <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} />
                  <Pressable
                    style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 2 }}
                    onPress={() => removeCompletionPhoto(idx)}
                  >
                    <MaterialCommunityIcons name="close" size={16} color="#FFF" />
                  </Pressable>
                </View>
              ))}
              <Pressable
                style={{ width: 80, height: 80, borderRadius: 12, borderWidth: 1, borderColor: '#DDD', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' }}
                onPress={pickCompletionPhoto}
              >
                <MaterialCommunityIcons name="camera-plus-outline" size={24} color="#666" />
                <Text style={{ fontSize: 10, color: '#666', marginTop: 4 }}>{t('Add Photo')}</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={[styles.photoSubmitBtn, { backgroundColor: '#1A5C2A' }, uploadingPhotos && { opacity: 0.5 }]} onPress={submitCompletionPhotos} disabled={uploadingPhotos}>
                {uploadingPhotos ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.photoSubmitText}>{t('Submit & Complete')}</Text>
                )}
              </Pressable>
              <Pressable style={[styles.photoCancelBtn]} onPress={() => setCompletionModal({ visible: false, booking: null })}>
                <Text style={styles.photoCancelText}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D' },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#666' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#999', textAlign: 'center', paddingHorizontal: 40 },

  bookingCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  cardDate: { fontSize: 12, color: '#999', fontFamily: 'SpaceMono_400Regular' },
  serviceName: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailText: { fontSize: 13, color: '#666', fontFamily: 'Inter_400Regular' },
  actionsRow: { gap: 10, marginTop: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F0EDE5' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16, gap: 6,
  },
  actionBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  // Accept + Reject on the same row, equal width.
  pendingActions: { flexDirection: 'row', gap: 10 },
  pendingActionBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16, gap: 6,
  },
  acceptBtn: { backgroundColor: '#4CAF50' },
  rejectBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#8B1A1A',
  },
  rejectBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#8B1A1A' },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 8 },
  secondaryBtn: {
    flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, gap: 6,
  },
  // Static "done" state shown once the worker has submitted before/after photos
  photosAddedPill: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: '#1A5C2A',
  },
  photosAddedText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#1A5C2A',
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  // Improved chat button with better styling and accessibility
  chatIconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#25D366', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 3.84,
  },
  // Unread message badge on chat button
  unreadBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 4, elevation: 4,
    borderWidth: 2, borderColor: '#FFFFFF',
  },
  unreadBadgeText: {
    fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FFFFFF', textAlign: 'center',
  },
  // Job-photo modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 4 },
  modalSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginBottom: 12 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 6, marginTop: 8 },
  inputWrapper: { backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E0D8CC' },
  input: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', paddingVertical: 12 },
  photoHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', lineHeight: 17, marginBottom: 12 },
  photoGrid: { flexDirection: 'row', gap: 12 },
  photoSlot: {
    flex: 1, aspectRatio: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: '#D5CDBE', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  photoSlotFilled: { borderStyle: 'solid', borderColor: '#1A5C2A' },
  photoSlotImg: { width: '100%', height: '100%', borderRadius: 14 },
  photoSlotLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B' },
  photoSubmitBtn: { flex: 1, backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  photoSubmitText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  photoCancelBtn: { flex: 1, backgroundColor: '#E0D8CC', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  photoCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' },
  changeStatus: {
    fontFamily: 'Inter_500Medium', fontSize: 11, color: '#B06000',
    textAlign: 'center', marginTop: 6,
  },
});