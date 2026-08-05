import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { t, useT } from '../../utils/i18n';
import { useBookingStore } from '../../store/booking.store';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { apiClient } from '../../api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { SkeletonCustomerBookingsBody } from '../../components/ui/SkeletonScreenLayouts';
import BookingAddressPicker from '../../components/ui/BookingAddressPicker';
import { formatMoneyWithSymbol } from '../../utils/money';
import LottieView from 'lottie-react-native';
import { socketService } from '../../api/socket';

// ─── Types ─────────────────────────────────────────────────────────────────

type BookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

interface Booking {
  id: string;
  serviceName: string;
  category: string;
  status: BookingStatus;
  workerName: string;
  scheduledDate: string;
  scheduledTime: string;
  price: number;
  type?: string;
  cancelRequestStatus?: string;
}

interface StatusStyle {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bg: string;
}

// ─── Status & Category configuration ──────────────────────────────────────



const CATEGORY_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  plumbing:    'pipe-wrench',
  electrician: 'flash-outline',
  cleaning:    'broom',
  painting:    'format-color-fill',
  carpentry:   'saw-blade',
  appliances:  'fridge-industrial-outline',
  packing:     'package-variant-closed',
  gardening:   'tree-outline',
  'pest-control': 'bug-outline',
  disinfection: 'spray-bottle',
};



const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'];

// ─── Helpers ───────────────────────────────────────────────────────────────

const getCategoryIcon = (
  category?: string
): keyof typeof MaterialCommunityIcons.glyphMap => {
  if (!category) return 'tools';
  const key = category.toLowerCase().trim();
  return CATEGORY_ICONS[key] || 'tools';
};

const formatDisplayDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr || '—';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr || '—';
  }
};

const formatDisplayTime = (timeStr: string): string => {
  if (!timeStr) return '—';
  try {
    if (timeStr.includes('T') || timeStr.includes('Z')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }
    }
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const hours = parseInt(parts[0], 10);
    const mins = parts[1].padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${mins} ${ampm}`;
  } catch {
    return timeStr;
  }
};

const formatPrice = (price: unknown): string => {
  const num = Number(price);
  return isNaN(num) ? '0' : num.toLocaleString('en-IN');
};

// ─── Component ────────────────────────────────────────────────────────────

export default function CustomerBookings() {
  const t = useT();

  const STATUS_STYLE = useMemo(() => ({
    'PENDING':     { label: t('PENDING'),     icon: 'clock-outline',            color: '#FF5C00', bg: '#FFF0E8' },
    'ACCEPTED':    { label: t('ACCEPTED'),    icon: 'check-circle-outline',     color: '#2196F3', bg: '#E3F2FD' },
    'ON_THE_WAY':  { label: t('ON THE WAY'),  icon: 'truck-delivery-outline',   color: '#FF5C00', bg: '#FFF0E8' },
    'IN_PROGRESS': { label: t('IN PROGRESS'), icon: 'wrench-outline',           color: '#0D0D0D', bg: '#EDE8DC' },
    'COMPLETED':   { label: t('COMPLETED'),   icon: 'check-decagram-outline',   color: '#4CAF50', bg: '#E8F5E9' },
    'CANCELLED':   { label: t('CANCELLED'),   icon: 'close-circle-outline',     color: '#F44336', bg: '#FFEBEE' },
  }), [t]);

  const FILTER_TABS = useMemo(() => [
    { key: 'ALL',       label: t('All') },
    { key: 'ACTIVE',    label: t('Active') },
    { key: 'COMPLETED', label: t('Completed') },
    { key: 'CANCELLED', label: t('Cancelled') },
  ], [t]);
  const router = useRouter();
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [payModal, setPayModal] = useState<{ visible: boolean; booking: any; isSuccess?: boolean; isFailed?: boolean; errorMessage?: string }>({ visible: false, booking: null });
  const [paying, setPaying] = useState(false);
  const [rateModal, setRateModal] = useState<{ visible: boolean; bookingId: string; workerName: string }>({ visible: false, bookingId: '', workerName: '' });
  const [rating, setRating] = useState(0);
  const [respondingChangeId, setRespondingChangeId] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [cancelModal, setCancelModal] = useState<{ visible: boolean; booking: any }>({ visible: false, booking: null });
  const [cancelReason, setCancelReason] = useState('');
  const [cancelCategory, setCancelCategory] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [pendingFee, setPendingFee] = useState(0);
  const [cancelPreview, setCancelPreview] = useState<any>(null);

  // ── Booking Flow State ──
  const { pendingWorkerBookingId, pendingWorkerData, pendingService, clearPendingBooking } = useBookingStore();
  const [bookModalVisible, setBookModalVisible] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [bookingDate, setBookingDate] = useState<Date>(new Date());
  const [creatingBooking, setCreatingBooking] = useState(false);
  // Service location — the customer picks the exact address the worker will
  // navigate to. Defaults to their saved default address.
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);

  const selectedAddress = useMemo(
    () => addresses.find((a: any) => a.id === selectedAddressId) || null,
    [addresses, selectedAddressId],
  );

  // Load the customer's saved addresses. Async + non-blocking — the booking
  // modal renders immediately and the address list fills in as it arrives.
  const loadAddresses = useCallback(async () => {
    try {
      const res = await apiClient.get('/addresses');
      const addrs = Array.isArray(res.data?.data) ? res.data.data : [];
      setAddresses(addrs);
      setSelectedAddressId((prev) => prev || addrs.find((a: any) => a.isDefault)?.id || addrs[0]?.id || null);
    } catch {}
  }, []);

  // Open the "Send Booking Request" modal INSTANTLY using the worker + service
  // the profile screen cached in the store. Addresses load in the background —
  // the modal never waits on a network call to appear.
  useEffect(() => {
    if (!pendingWorkerBookingId) return;
    const workerData = pendingWorkerData || null;
    setSelectedWorker(workerData);
    setSelectedService(pendingService ?? workerData?.services?.[0] ?? null);
    setBookModalVisible(true);
    // Consumed — allows re-booking the same worker later in the session.
    clearPendingBooking();
    loadAddresses();
    if (!workerData) {
      // Edge case (deep link / cold start): no cached worker — fetch in the
      // background so the sheet still populates.
      (async () => {
        try {
          const res = await apiClient.get(`/workers/${pendingWorkerBookingId}`);
          setSelectedWorker(res.data?.data);
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWorkerBookingId]);

  const handleCreateBooking = async () => {
    if (!selectedWorker) return;
    // The booking must carry the exact service location or the worker will be
    // sent to the wrong address.
    if (!selectedAddressId) {
      showToast({ message: t('Please select a service location'), type: 'error' });
      return;
    }
    setCreatingBooking(true);
    try {
      const payload = {
        workerId: selectedWorker.userId,
        serviceCategory: selectedWorker.category,
        serviceName: selectedService ? selectedService.name : `General ${selectedWorker.category.charAt(0) + selectedWorker.category.slice(1).toLowerCase().replace(/_/g, ' ')}`,
        description: 'Direct booking from profile',
        scheduledAt: bookingDate.toISOString(),
        baseAmount: selectedService ? selectedService.basePrice : selectedWorker.hourlyRate,
        addressId: selectedAddressId,
      };
      await apiClient.post('/bookings', payload);
      showToast({ message: t('Booking request sent successfully!'), type: 'success' });
      setBookModalVisible(false);
      clearPendingBooking();
      fetchBookings();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to create booking'), type: 'error' });
    } finally {
      setCreatingBooking(false);
    }
  };

  // ── Data fetching ──────────────────────────────────────────────────────

  const fetchBookings = useCallback(async () => {
    try {
      const res = await apiClient.get('/bookings');
      const raw = res.data?.data ?? res.data ?? [];
      setBookings(Array.isArray(raw) ? raw : []);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const respondToChange = useCallback(async (changeId: string, decision: 'APPROVED' | 'REJECTED') => {
    setRespondingChangeId(changeId);
    try {
      await apiClient.post(`/scope-changes/${changeId}/respond`, { decision });
      showToast({ message: decision === 'APPROVED' ? t('Change approved — price updated') : t('Change rejected'), type: 'success' });
      fetchBookings();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to respond'), type: 'error' });
    } finally { setRespondingChangeId(null); }
  }, [fetchBookings]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiClient.get('/home');
      const profile = res.data?.data;
      setWalletBalance(profile?.walletBalance || profile?.customerProfile?.walletBalance || 0);
    } catch {}
  }, []);

    useEffect(() => {
    fetchBookings();
    fetchProfile();
    
    socketService.connect();
    const handleStatusUpdate = (updatedBooking?: any) => {
      fetchBookings();
      if (updatedBooking?.cancelRequestStatus === 'PENDING_CUSTOMER' && cancelModal.booking?.id !== updatedBooking.id) {
        setCancelModal({ visible: true, booking: updatedBooking });
      }
    };
    socketService.on('booking_status_update', handleStatusUpdate);
    
    return () => {
      socketService.off('booking_status_update', handleStatusUpdate);
    };
  }, [fetchBookings]);

  useEffect(() => {
    const pendingBooking = bookings.find(b => b.cancelRequestStatus === 'PENDING_CUSTOMER');
    if (pendingBooking && !cancelModal.visible) {
      setCancelModal({ visible: true, booking: pendingBooking });
    }
  }, [bookings]);

  const handleCancelBooking = useCallback(async () => {
    if (!cancelModal.booking) return;
    setCancelling(true);
    try {
      await apiClient.patch(`/bookings/${cancelModal.booking.id}/status`, {
        status: 'CANCELLED',
        reasonCategory: cancelCategory || 'OTHER',
        cancelReason: cancelReason || undefined,
      });
      showToast({ message: t('Booking cancelled successfully'), type: 'success' });
      setCancelModal({ visible: false, booking: null });
      setCancelReason('');
      setCancelCategory('');
      fetchBookings();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to cancel'), type: 'error' });
    } finally { setCancelling(false); }
  }, [cancelModal.booking, cancelCategory, cancelReason, fetchBookings]);

  // Fetch pending cancellation fee (shown as a banner on the list)
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/cancellations/pending-fee');
        setPendingFee(res.data?.data?.pendingCancellationFee || 0);
      } catch {}
    })();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookings();
  }, [fetchBookings]);

  // Fetch cancellation preview — the server is the single source of truth for
  // the fee (plan eligibility, expiry, and post-"On My Way" state).
  useEffect(() => {
    if (!cancelModal.visible || !cancelModal.booking?.id || cancelModal.booking.cancelRequestStatus === 'PENDING_CUSTOMER') {
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
  }, [cancelModal.visible, cancelModal.booking?.id]);

  // ── Derived state ──────────────────────────────────────────────────────

  const filteredBookings = useMemo(() => {
    if (activeTab === 'ALL') return bookings;
    if (activeTab === 'ACTIVE')
      return bookings.filter((b) => ACTIVE_STATUSES.includes(b.status));
    return bookings.filter((b) => b.status === activeTab);
  }, [bookings, activeTab]);

  const tabCounts = useMemo(
    () => ({
      ALL: bookings.length,
      ACTIVE: bookings.filter((b) => ACTIVE_STATUSES.includes(b.status)).length,
      COMPLETED: bookings.filter((b) => b.status === 'COMPLETED').length,
      CANCELLED: bookings.filter((b) => b.status === 'CANCELLED').length,
    }),
    [bookings]
  );

  // ── Render helpers ─────────────────────────────────────────────────────

  const renderBookingItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const cfg = STATUS_STYLE[item.status as BookingStatus] || STATUS_STYLE.PENDING;
      const icon = getCategoryIcon(item.category || item.serviceCategory);
      const price = formatPrice(item.totalAmount || item.price || 0);
      const workerName = item.workerName || item.worker?.name || t('Worker');
      const scheduleDate = item.scheduledDate || item.scheduledAt;
      const scheduleTime = item.scheduledTime || item.scheduledAt;

      return (
        <Animated.View
          entering={FadeInUp.delay(80 * index).duration(300)}
          style={styles.cardWrapper}
        >
          <View style={styles.bookingCard}>
            {/* ── Top row: category icon, service name, status badge ── */}
            <View style={styles.cardTopRow}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons
                  name={icon}
                  size={18}
                  color="#0D0D0D"
                />
              </View>

              <View style={styles.cardTitleWrap}>
                <Text style={styles.cardServiceName} numberOfLines={1}>
                  {t(item.serviceName)}
                </Text>
              </View>

              <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[styles.statusBadgeText, { color: cfg.color }]}>
                  {cfg.label}
                </Text>
              </View>
            </View>

            {/* ── Worker name ── */}
            <View style={styles.detailRow}>
              <MaterialCommunityIcons
                name="account-outline"
                size={15}
                color="#9E9E9E"
                style={styles.detailIcon}
              />
              <Text style={styles.detailText} numberOfLines={1}>
                {workerName}
              </Text>
            </View>

            {/* ── Scheduled date & time ── */}
            <View style={styles.detailRow}>
              <MaterialCommunityIcons
                name="calendar-clock-outline"
                size={15}
                color="#9E9E9E"
                style={styles.detailIcon}
              />
              <Text style={styles.detailText}>
                {formatDisplayDate(scheduleDate)}
                {'  ·  '}
                {formatDisplayTime(scheduleTime)}
              </Text>
            </View>

            {/* ── Divider ── */}
            <View style={styles.divider} />

            {/* ── Bottom row: price + action button ── */}
            <View style={styles.cardBottomRow}>
              <View style={styles.priceBlock}>
                <Text style={styles.priceLabel}>{t('Total')}</Text>
                <Text style={styles.priceAmount}>{'₹'}{price}</Text>
              </View>

              <View style={styles.actionRow}>
                {item.status === 'PENDING' && (
                  <View style={styles.actionGroup}>
                    <View style={[styles.actionPill, { backgroundColor: '#FFF0E8' }]}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color="#FF5C00" style={{ marginRight: 4 }} />
                      <Text style={[styles.actionPillText, { color: '#FF5C00' }]}>{t('Waiting for worker')}</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.actionPill, styles.cancelActionPill]}
                      onPress={() => setCancelModal({ visible: true, booking: item })}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="close" size={14} color="#8B1A1A" style={{ marginRight: 4 }} />
                      <Text style={[styles.actionPillText, { color: '#8B1A1A' }]}>{t('Cancel')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {(item.status === 'ACCEPTED' || item.status === 'ON_THE_WAY' || item.status === 'IN_PROGRESS') && (
                  <View style={styles.actionGroup}>
                    <TouchableOpacity
                      style={styles.actionPill}
                      onPress={() => router.push(`/(customer)/live-tracking?bookingId=${item.id}`)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.actionPillText}>{t('Track')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionPill, { backgroundColor: '#25D366' }]}
                      onPress={() => router.push(`/(worker)/chat?bookingId=${item.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.actionPillText}>{t('Chat')}</Text>
                    </TouchableOpacity>
                    {(item.status === 'ACCEPTED' || item.status === 'ON_THE_WAY') && (
                      <TouchableOpacity
                        style={[styles.actionPill, styles.cancelActionPill]}
                        onPress={() => setCancelModal({ visible: true, booking: item })}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="close" size={14} color="#8B1A1A" style={{ marginRight: 4 }} />
                        <Text style={[styles.actionPillText, { color: '#8B1A1A' }]}>{t('Cancel')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {item.status === 'COMPLETED' && item.paymentStatus !== 'PAID' && (
                  <TouchableOpacity
                    style={styles.actionPill}
                    onPress={() => setPayModal({ visible: true, booking: item })}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="shield-check" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.actionPillText}>{t('Pay Now')}</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'COMPLETED' && item.paymentStatus === 'PAID' && !item.hasReview && (
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: '#D4A017' }]}
                    onPress={() => setRateModal({ visible: true, bookingId: item.id, workerName: item.workerName || item.worker?.name || t('Worker') })}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="star" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.actionPillText}>{t('Rate')}</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'COMPLETED' && (
                  <TouchableOpacity
                    style={[styles.actionPill, styles.actionPillSecondary]}
                    onPress={() => router.push({ pathname: '/(customer)/rebook', params: { bookingId: item.id } })}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name="refresh"
                      size={14}
                      color="#FF5C00"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.actionPillText, { color: '#FF5C00' }]}>{t('Re-book')}</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'COMPLETED' && item.paymentStatus === 'PAID' && !item.hasDispute && (
                  <TouchableOpacity
                    style={[styles.actionPill, { backgroundColor: '#FFF0E8', borderWidth: 1, borderColor: '#FF5C00' }]}
                    onPress={() => router.push({ pathname: '/(customer)/disputes/create', params: { bookingId: item.id } })}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name="alert-circle-outline"
                      size={14}
                      color="#FF5C00"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.actionPillText, { color: '#FF5C00' }]}>{t('Raise Dispute')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Scope-change requests — pending proposal + history */}
            {(item.scopeChanges || []).length > 0 && (
              <View style={styles.scopeBox}>
                {(item.scopeChanges || []).map((ch: any) => {
                  const isPending = ch.status === 'PENDING';
                  const diff = Number(ch.priceDifference || 0);
                  return (
                    <View key={ch.id} style={[styles.scopeRow, isPending && styles.scopeRowPending]}>
                      <MaterialCommunityIcons
                        name={isPending ? 'file-document-edit-outline' : ch.status === 'APPROVED' ? 'check-circle' : 'close-circle'}
                        size={16}
                        color={isPending ? '#FF5C00' : ch.status === 'APPROVED' ? '#2E7D32' : '#C62828'}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.scopeTitle}>
                          {isPending ? t('Change requested by your worker') : t('Change') + ' ' + (ch.status === 'APPROVED' ? t('approved') : t('rejected'))}
                        </Text>
                        {ch.reason ? <Text style={styles.scopeReason} numberOfLines={2}>{ch.reason}</Text> : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <Text style={styles.scopeOld}>₹{ch.oldPrice ?? 0}</Text>
                          <MaterialCommunityIcons name="arrow-right" size={13} color="#8A8A8A" />
                          <Text style={styles.scopeNew}>₹{ch.newPrice ?? 0}</Text>
                          {diff !== 0 && (
                            <Text style={[styles.scopeDiff, { color: diff > 0 ? '#C62828' : '#2E7D32' }]}>
                              {diff > 0 ? `+₹${diff}` : `−₹${Math.abs(diff)}`}
                            </Text>
                          )}
                        </View>
                      </View>
                      {isPending && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            style={styles.scopeApprove}
                            onPress={() => respondToChange(ch.id, 'APPROVED')}
                            disabled={respondingChangeId === ch.id}
                            activeOpacity={0.7}
                          >
                            {respondingChangeId === ch.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.scopeApproveText}>{t('Approve')}</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.scopeReject}
                            onPress={() => respondToChange(ch.id, 'REJECTED')}
                            disabled={respondingChangeId === ch.id}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.scopeRejectText}>{t('Reject')}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Animated.View>
      );
    },
    [router, respondToChange, respondingChangeId]
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconRing}>
        <MaterialCommunityIcons
          name={
            bookings.length === 0
              ? 'calendar-blank-outline'
              : 'filter-remove-outline'
          }
          size={52}
          color="#9E9E9E"
        />
      </View>
      <Text style={styles.emptyTitle}>
        {bookings.length === 0 ? t('No Bookings Yet') : t('No Matches')}
      </Text>
      <Text style={styles.emptyDesc}>
        {bookings.length === 0
          ? t('Browse services and book your first service today!')
          : t('No bookings to display')}
      </Text>
    </View>
  );

  // ── Loading state ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SkeletonCustomerBookingsBody />
      </SafeAreaView>
    );
  }

  // ── Main UI ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/home')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('My Bookings')}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.headerCountChip}>
            <Text style={styles.headerCount}>
              {bookings.length}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Filter Tabs ── */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={FILTER_TABS}
          keyExtractor={(tab) => tab.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: tab }) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                style={[styles.filterTab, isActive && styles.filterTabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    isActive && styles.filterTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.filterCountBadge,
                    isActive && styles.filterCountBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterCountText,
                      isActive && styles.filterCountTextActive,
                    ]}
                  >
                    {tabCounts[tab.key as keyof typeof tabCounts]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Pending cancellation fee banner ── */}
      {pendingFee > 0 && (
        <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4, backgroundColor: '#FFF0E8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FF5C00', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="alert" size={20} color="#FF5C00" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FF5C00' }}>{t('Pending cancellation fee')}: ₹{pendingFee}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B' }}>{t('This fee will be collected on your next booking payment')}</Text>
          </View>
        </View>
      )}

      {/* ── Content ── */}
      {filteredBookings.length > 0 ? (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item.id}
          renderItem={renderBookingItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0D0D0D"
              colors={['#FF5C00']}
              progressBackgroundColor="#F5F0E8"
            />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      ) : (
        renderEmptyState()
      )}
    {/* Authentic Payment Modal (Google Pay Style) */}
      <Modal visible={payModal.visible} transparent animationType={(payModal.isSuccess || payModal.isFailed) ? 'fade' : 'slide'} onRequestClose={() => setPayModal({ visible: false, booking: null })}>
        {payModal.isSuccess ? (
          <View style={{ flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <LottieView
                source={require('../../../assets/animations/success.json')}
                autoPlay
                loop={false}
                style={{ width: 150, height: 150, marginBottom: 24 }}
              />
              <Animated.Text entering={FadeInUp.delay(300).duration(500)} style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: '#FFF', marginBottom: 12, textAlign: 'center' }}>
                {t('Payment Successful')}
              </Animated.Text>
              <Animated.Text entering={FadeInUp.delay(500).duration(500)} style={{ fontSize: 16, fontFamily: 'Inter_500Medium', color: '#A0A0A0', textAlign: 'center', marginBottom: 32 }}>
                {t('Paid securely to')} <Text style={{ color: '#FFF', fontFamily: 'Inter_600SemiBold' }}>{payModal.booking?.worker?.name || t('Worker')}</Text>
              </Animated.Text>
              
              <Animated.View entering={FadeInUp.delay(700).duration(500)} style={{ paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#333', width: '100%', alignItems: 'center', marginBottom: 40 }}>
                <Text style={{ fontSize: 48, fontFamily: 'SpaceMono_700Bold', color: '#4ADE80', letterSpacing: -1 }}>
                  ₹{payModal.booking?.totalAmount || 0}
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(900).duration(500)} style={{ width: '100%' }}>
                <TouchableOpacity
                  style={{ backgroundColor: '#FFF', borderRadius: 100, paddingVertical: 18, width: '100%', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }}
                onPress={() => {
                  const bookingId = payModal.booking?.id;
                  const workerName = payModal.booking?.worker?.name;
                  setPayModal({ visible: false, booking: null, isSuccess: false });
                  setTimeout(() => setRateModal({ visible: true, bookingId, workerName }), 500);
                }}
              >
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: '#0D0D0D' }}>{t('Done')}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        ) : payModal.isFailed ? (
          <View style={{ flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
              <LottieView
                source={require('../../../assets/animations/failed.json')}
                autoPlay
                loop={false}
                style={{ width: 150, height: 150, marginBottom: 24 }}
              />
              <Animated.Text entering={FadeInUp.delay(300).duration(500)} style={{ fontSize: 28, fontFamily: 'Inter_700Bold', color: '#FFF', marginBottom: 12, textAlign: 'center' }}>
                {t('Payment Failed')}
              </Animated.Text>
              <Animated.Text entering={FadeInUp.delay(500).duration(500)} style={{ fontSize: 16, fontFamily: 'Inter_500Medium', color: '#FF5C00', textAlign: 'center', marginBottom: 32 }}>
                {payModal.errorMessage || t('Something went wrong')}
              </Animated.Text>
              
              <Animated.View entering={FadeInUp.delay(700).duration(500)} style={{ width: '100%' }}>
                <TouchableOpacity
                  style={{ backgroundColor: '#FFF', borderRadius: 100, paddingVertical: 18, width: '100%', alignItems: 'center', elevation: 4 }}
                  onPress={() => {
                    setPayModal(prev => ({ ...prev, isFailed: false, errorMessage: undefined }));
                  }}
                >
                <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: '#0D0D0D' }}>{t('Try Again')}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        ) : (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12 }}>
            <View style={{ width: 36, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 24 }} />
            
            {/* Merchant Info */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF0E8', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <MaterialCommunityIcons name="account-circle" size={32} color="#FF5C00" />
              </View>
              <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>
                {t('Paying')} <Text style={{ fontFamily: 'Inter_600SemiBold', color: '#0D0D0D' }}>{payModal.booking?.worker?.name || t('Worker')}</Text> {t('for')}
              </Text>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginTop: 4 }}>{t(payModal.booking?.serviceName)}</Text>
            </View>

            {/* Amount Breakdown (if previous cancellation fee exists) */}
            {payModal.booking?.totalAmount > payModal.booking?.baseAmount ? (
              <View style={{ backgroundColor: '#F9F9F9', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#EEE' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>{t('Service')}</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0D0D0D' }}>₹{payModal.booking?.baseAmount}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#FF5C00' }}>{t('Previous cancellation charge')}</Text>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FF5C00' }}>₹{payModal.booking?.totalAmount - payModal.booking?.baseAmount}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: '#DDD', marginBottom: 12 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: '#0D0D0D' }}>{t('Total')}</Text>
                  <Text style={{ fontSize: 24, fontFamily: 'SpaceMono_700Bold', color: '#0D0D0D', letterSpacing: -1 }}>₹{payModal.booking?.totalAmount}</Text>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center', marginBottom: 32 }}>
                <Text style={{ fontSize: 48, fontFamily: 'SpaceMono_700Bold', color: '#0D0D0D', letterSpacing: -2 }}>
                  ₹{payModal.booking?.totalAmount || 0}
                </Text>
              </View>
            )}

            {/* Pay with Wallet Button */}
            {walletBalance >= (payModal.booking?.totalAmount || 0) && (
              <TouchableOpacity
                style={{ backgroundColor: '#FF5C00', borderRadius: 100, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: '#FF5C00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}
                onPress={async () => {
                  if (!payModal.booking) return;
                  setPaying(true);
                  try {
                    await apiClient.post('/payments/pay-via-wallet', {
                      bookingId: payModal.booking.id,
                      amount: payModal.booking.totalAmount || 0,
                    });
                    fetchBookings();
                    fetchProfile();
                    setPayModal((prev) => ({ ...prev, isSuccess: true }));
                  } catch (e: any) {
                    const errorMsg = e?.response?.data?.error || e.message || t('Payment failed');
                    setPayModal(prev => ({ ...prev, isFailed: true, errorMessage: errorMsg }));
                  } finally { setPaying(false); }
                }}
                disabled={paying}
              >
                {paying ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="wallet" size={20} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Pay with Wallet')} ({formatMoneyWithSymbol(walletBalance)})</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Secure Pay Button */}
            <TouchableOpacity
              style={{ backgroundColor: '#000', borderRadius: 100, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
              onPress={async () => {
                if (!payModal.booking) return;
                setPaying(true);
                try {
                  const orderRes = await apiClient.post('/payments/create-order', {
                    bookingId: payModal.booking.id,
                    amount: payModal.booking.totalAmount || 0,
                  });
                  const order = orderRes.data?.data;
                  if (!order?.orderId) throw new Error(t('Failed to initialize payment'));

                  const { startCashfreePayment } = require('../../utils/cashfree');
                  const paymentResult = await startCashfreePayment(order.paymentSessionId, order.orderId);

                  if (paymentResult.status === 'SUCCESS') {
                    await apiClient.post('/payments/verify', {
                      bookingId: payModal.booking.id,
                      orderId: order.orderId,
                      isMock: paymentResult.isMock
                    });
                    fetchBookings();
                    setPayModal((prev) => ({ ...prev, isSuccess: true }));
                  } else {
                    throw new Error(t('Payment cancelled'));
                  }
                } catch (e: any) {
                  const errorMsg = e?.response?.data?.error || e.message || t('Payment failed');
                  setPayModal(prev => ({ ...prev, isFailed: true, errorMessage: errorMsg }));
                } finally { setPaying(false); }
              }}
              disabled={paying}
            >
              {paying ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="shield-check" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Pay securely')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ paddingVertical: 14, alignItems: 'center' }}
              onPress={() => setPayModal({ visible: false, booking: null })}
            >
              <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>{t('Cancel Transaction')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        )}
      </Modal>

      {/* Rating Modal */}
      <Modal visible={rateModal.visible} transparent animationType="slide" onRequestClose={() => setRateModal({ visible: false, bookingId: '', workerName: '' })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', textAlign: 'center' }}>{t('Rate')} {rateModal.workerName}</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6B6B6B', textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
              {t('How was your experience?')}
            </Text>

            {/* Star Rating */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                  <MaterialCommunityIcons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={40}
                    color={star <= rating ? '#D4A017' : '#CCC'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={{ borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Inter_400Regular', color: '#0D0D0D', minHeight: 80, textAlignVertical: 'top', marginBottom: 20 }}
              placeholder={t('Write a review (optional)')}
              placeholderTextColor="#AAA"
              multiline
              value={reviewText}
              onChangeText={setReviewText}
              maxLength={500}
            />

            <TouchableOpacity
              style={{ backgroundColor: '#D4A017', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: rating === 0 ? 0.5 : 1 }}
              onPress={async () => {
                if (rating === 0) return;
                setSubmittingReview(true);
                try {
                  await apiClient.post('/reviews', { bookingId: rateModal.bookingId, rating, comment: reviewText });
                  showToast({ message: t('Review submitted!'), type: 'success' });
                  setRateModal({ visible: false, bookingId: '', workerName: '' });
                  setRating(0);
                  setReviewText('');
                  fetchBookings();
                } catch (e: any) {
                  showToast({ message: e?.response?.data?.error || t('Failed to submit review'), type: 'error' });
                } finally { setSubmittingReview(false); }
              }}
              disabled={rating === 0 || submittingReview}
            >
              {submittingReview ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Submit Review')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{ alignItems: 'center', paddingVertical: 8 }}
              onPress={() => setRateModal({ visible: false, bookingId: '', workerName: '' })}
            >
              <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B6B6B' }}>{t('Skip')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Cancellation Modal ── */}
      <Modal visible={cancelModal.visible} transparent animationType="slide" onRequestClose={() => setCancelModal({ visible: false, booking: null })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            
            {cancelModal.booking?.cancelRequestStatus === 'PENDING_CUSTOMER' ? (
              <View>
                <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', textAlign: 'center', marginBottom: 12 }}>{t('Cancellation Request')}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6B6B6B', textAlign: 'center', marginBottom: 20 }}>
                  {t('Your worker says that you requested to cancel this booking.')}
                </Text>
                
                {/* No fee — the cancellation was requested by the worker */}
                {cancelModal.booking?.status === 'ON_THE_WAY' && (
                  <View style={{ backgroundColor: '#E8F5E9', borderRadius: 12, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#4CAF50' }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: '#2E7D32', textAlign: 'center' }}>
                      {t('No cancellation fee applies — your worker requested this cancellation.')}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={{ backgroundColor: '#8B1A1A', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
                  onPress={async () => {
                    setCancelling(true);
                    try {
                      await apiClient.post(`/bookings/${cancelModal.booking.id}/cancel/confirm`);
                      showToast({ message: t('Booking cancelled'), type: 'success' });
                      setCancelModal({ visible: false, booking: null });
                      fetchBookings();
                    } catch (e: any) {
                      showToast({ message: e?.response?.data?.error || t('Failed to cancel'), type: 'error' });
                    } finally { setCancelling(false); }
                  }}
                  disabled={cancelling}
                >
                  {cancelling ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Confirm & Cancel')}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ backgroundColor: '#F5F0E8', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
                  onPress={async () => {
                    setCancelling(true);
                    try {
                      await apiClient.post(`/bookings/${cancelModal.booking.id}/cancel/deny`);
                      showToast({ message: t('Request denied'), type: 'success' });
                      setCancelModal({ visible: false, booking: null });
                      fetchBookings();
                    } catch (e: any) {
                      showToast({ message: e?.response?.data?.error || t('Failed to deny request'), type: 'error' });
                    } finally { setCancelling(false); }
                  }}
                  disabled={cancelling}
                >
                  {cancelling ? <ActivityIndicator size="small" color="#0D0D0D" /> : <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0D0D0D' }}>{t('I Didn\'t Request This')}</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', textAlign: 'center' }}>{t('Cancel Service?')}</Text>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6B6B6B', textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
                  {t(cancelModal.booking?.serviceName)}
                </Text>

                {/* Fee notice based on the server-side cancellation preview */}
                {cancelPreview?.postOnTheWay && (
                  <View style={{ backgroundColor: cancelPreview.isFree ? '#E8F5E9' : '#FFF0E8', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: cancelPreview.isFree ? '#4CAF50' : '#FF5C00' }}>
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: cancelPreview.isFree ? '#2E7D32' : '#FF5C00', textAlign: 'center' }}>
                      {cancelPreview.isFree
                        ? t('Free cancellation included with your subscription.')
                        : `${t('Your worker is already on the way. Cancelling now will incur a fee of')} ₹${cancelPreview.fee} (${t('added to your next booking')}).`
                      }
                    </Text>
                  </View>
                )}

                {/* Reason selector */}
                <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0D0D0D', marginBottom: 10 }}>{t('Reason for cancelling')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {[
                    { id: 'CHANGE_OF_PLAN', label: 'Change of plan' },
                    { id: 'WORKER_DELAY', label: 'Worker is delayed' },
                    { id: 'FOUND_ALTERNATIVE', label: 'Found an alternative' },
                    { id: 'EMERGENCY', label: 'Emergency' },
                    { id: 'WORKER_REQUESTED_CANCEL', label: 'Worker asked me to cancel' }
                  ].map((reason) => (
                    <TouchableOpacity
                      key={reason.id}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                        backgroundColor: cancelCategory === reason.id ? '#FFEBEE' : '#F5F0E8',
                        borderWidth: 1, borderColor: cancelCategory === reason.id ? '#8B1A1A' : 'transparent',
                      }}
                      onPress={() => setCancelCategory(reason.id)}
                    >
                      <Text style={{
                        fontSize: 12, fontFamily: 'Inter_500Medium',
                        color: cancelCategory === reason.id ? '#8B1A1A' : '#6B6B6B',
                      }}>
                        {t(reason.label)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>


                {/* Optional reason text */}
                <TextInput
                  style={{ borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Inter_400Regular', color: '#0D0D0D', minHeight: 60, textAlignVertical: 'top', marginBottom: 20 }}
                  placeholder={t('Add details (optional)')}
                  placeholderTextColor="#AAA"
                  multiline
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  maxLength={300}
                />

                {/* Actions */}
                <TouchableOpacity
                  style={{ backgroundColor: '#8B1A1A', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: cancelCategory ? 1 : 0.5 }}
                  onPress={handleCancelBooking}
                  disabled={!cancelCategory || cancelling}
                >
                  {cancelling ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Confirm Cancellation')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ alignItems: 'center', paddingVertical: 8 }}
                  onPress={() => setCancelModal({ visible: false, booking: null })}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B6B6B' }}>{t('Go Back')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Create Booking Modal ── */}
      <Modal visible={bookModalVisible} transparent animationType="slide" onRequestClose={() => setBookModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            
            {selectedWorker && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    {selectedWorker.user?.avatarUrl ? (
                      <Image source={{ uri: selectedWorker.user.avatarUrl }} style={{ width: 50, height: 50, borderRadius: 25 }} />
                    ) : (
                      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#F5F0E8' }}>{selectedWorker.user?.name?.[0]?.toUpperCase() || 'W'}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' }}>{t('Book')} {selectedWorker.user?.name}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B' }}>{t(selectedWorker.category?.replace(/_/g, ' '))}</Text>
                  </View>
                </View>

                {/* Service Selection */}
                {selectedWorker.services && selectedWorker.services.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 10 }}>{t('Select Service')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                      {selectedWorker.services.map((srv: any) => (
                        <TouchableOpacity
                          key={srv.id}
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: selectedService?.id === srv.id ? '#FF5C00' : '#DDD',
                            backgroundColor: selectedService?.id === srv.id ? '#FFF0E8' : '#FFF',
                            minWidth: 120,
                          }}
                          onPress={() => setSelectedService(srv)}
                        >
                          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: selectedService?.id === srv.id ? '#FF5C00' : '#0D0D0D' }}>{srv.name}</Text>
                          <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 13, color: '#0D0D0D', marginTop: 4 }}>₹{srv.basePrice}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Service location — exact coords the worker navigates to.
                    Opens a picker that supports switching addresses AND adding a
                    brand-new address without leaving the modal. */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 10 }}>{t('Service Location')} *</Text>
                  {addressPickerOpen ? (
                    <BookingAddressPicker
                      addresses={addresses}
                      selectedAddressId={selectedAddressId}
                      onSelect={(addrId) => { setSelectedAddressId(addrId); setAddressPickerOpen(false); }}
                      onAdd={(addr) => {
                        setAddresses((prev) => [...prev, addr]);
                        setSelectedAddressId(addr.id);
                        setAddressPickerOpen(false);
                      }}
                      onClose={() => setAddressPickerOpen(false)}
                    />
                  ) : selectedAddress ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0E8', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FF5C00' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <MaterialCommunityIcons name="map-marker-outline" size={14} color="#FF5C00" />
                          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#0D0D0D' }}>
                            {selectedAddress.label || t('Address')}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B' }} numberOfLines={2}>
                          {[selectedAddress.line1, selectedAddress.landmark, selectedAddress.city].filter(Boolean).join(', ')}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setAddressPickerOpen(true)}
                        hitSlop={10}
                        style={{ marginLeft: 10, padding: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('Change address')}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={18} color="#FF5C00" />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={{ backgroundColor: '#FFF0E8', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FF5C00', alignItems: 'center' }}
                      onPress={() => setAddressPickerOpen(true)}
                    >
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FF5C00' }}>{t('Add a service location')}</Text>
                    </Pressable>
                  )}
                </View>

                {/* Info Note */}
                <View style={{ backgroundColor: '#F5F0E8', padding: 12, borderRadius: 12, marginBottom: 20 }}>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', textAlign: 'center' }}>
                    {t('The worker will be notified immediately')}
                  </Text>
                </View>

                <TouchableOpacity
                  style={{ backgroundColor: '#FF5C00', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
                  onPress={handleCreateBooking}
                  disabled={creatingBooking}
                >
                  {creatingBooking ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Send Booking Request')}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ alignItems: 'center', paddingVertical: 8 }}
                  onPress={() => {
                    setBookModalVisible(false);
                    clearPendingBooking();
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B6B6B' }}>{t('Cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Layout ──
  safe: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: '#0D0D0D',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCountChip: {
    backgroundColor: '#FF5C00',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  headerCount: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },

  // ── Filter Tabs ──
  filterContainer: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(13,13,13,0.08)',
    backgroundColor: '#F5F0E8',
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(13,13,13,0.08)',
    gap: 5,
  },
  filterTabActive: {
    backgroundColor: '#FF5C00',
    borderColor: '#FF5C00',
  },
  filterTabText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#9E9E9E',
    letterSpacing: 0.5,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  filterCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(13,13,13,0.06)',
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  filterCountText: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: '#9E9E9E',
  },
  filterCountTextActive: {
    color: '#FFFFFF',
    fontFamily: 'SpaceMono_700Bold',
  },

  // ── List ──
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
    flexGrow: 1,
  },
  cardWrapper: {
    marginBottom: 14,
  },

  // ── Booking Card ──
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },

  // Card Top Row
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE8DC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardTitleWrap: {
    flex: 1,
    marginRight: 8,
  },
  cardServiceName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#0D0D0D',
  },

  // Status Badge
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // ── Card: Details ──
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  detailIcon: {
    marginRight: 8,
    width: 18,
    textAlign: 'center',
  },
  detailText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    flexShrink: 1,
  },

  // ── Card: Divider ──
  divider: {
    height: 1,
    backgroundColor: 'rgba(13,13,13,0.06)',
    marginVertical: 12,
  },

  // ── Card: Bottom Row ──
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Fixed-width so the action pills can never push into / overlap the total.
  priceBlock: {
    flexShrink: 0,
    marginRight: 8,
  },
  priceLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#9E9E9E',
    marginBottom: 2,
  },
  priceAmount: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 20,
    color: '#0D0D0D',
  },
  // Fills the space next to the price and wraps its pills onto extra lines when
  // a booking shows several actions (e.g. Rate + Re-book + Raise Dispute), so
  // they never collide with the total.
  actionRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionGroup: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5C00',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionPillSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FF5C00',
  },
  cancelActionPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#8B1A1A',
  },
  actionPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#9E9E9E',
    marginTop: 14,
  },

  // ── Empty State ──
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: 'rgba(13,13,13,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EDE8DC',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#0D0D0D',
    marginTop: 8,
    marginBottom: 8,
  },
  emptyDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },

  // Scope-change request card
  scopeBox: { gap: 8, marginTop: 2 },
  scopeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F5F0E8', borderRadius: 10, padding: 12,
  },
  scopeRowPending: { backgroundColor: '#FFF0E8', borderWidth: 1, borderColor: '#FFE0C2' },
  scopeTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#0D0D0D' },
  scopeReason: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368', marginTop: 2, lineHeight: 16 },
  scopeOld: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#8A8A8A', textDecorationLine: 'line-through' },
  scopeNew: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#0D0D0D' },
  scopeDiff: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  scopeApprove: {
    backgroundColor: '#2E7D32', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center', minWidth: 68,
  },
  scopeApproveText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFFFFF' },
  scopeReject: {
    backgroundColor: '#FCE8E6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center', justifyContent: 'center', minWidth: 64,
  },
  scopeRejectText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#C62828' },
});