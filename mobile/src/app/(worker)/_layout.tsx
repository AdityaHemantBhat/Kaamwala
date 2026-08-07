import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Stack, useRouter, Redirect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationsStore } from '../../store/notifications.store';
import { socketService } from '../../api/socket';
import { apiClient } from '../../api/client';
import { useToast } from '../../components/ui/ToastProvider';
import { useNotificationBanner } from '../../components/ui/NotificationBannerProvider';
import { UrgentJobModal } from '../../components/ui/UrgentJobModal';
import { useT } from '../../utils/i18n';

export default function WorkerLayout() {
  const t = useT();
  const { showToast } = useToast();
  const { showBanner } = useNotificationBanner();
  const router = useRouter();
  const { user } = useAuthStore();

  const [incomingBooking, setIncomingBooking] = useState<any>(null);
  const [urgentRequest, setUrgentRequest] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    socketService.connect();

    const handler = (notif: any) => {
      showBanner(notif);
      useNotificationsStore.getState().bumpUnread();
    };
    socketService.on('new_notification', handler);

    const bookingHandler = (booking: any) => {
      setIncomingBooking(booking);
    };
    socketService.on('new_booking_request', bookingHandler);

    const urgentHandler = (req: any) => {
      setUrgentRequest(req);
    };
    socketService.on('urgent_request', urgentHandler);

    const urgentCancelHandler = (data: any) => {
      setUrgentRequest((current: any) => {
        if (current && current.requestId === data.requestId) {
          return null;
        }
        return current;
      });
    };
    socketService.on('urgent_cancelled', urgentCancelHandler);

    const urgentOfferIncreaseHandler = (data: any) => {
      setUrgentRequest((current: any) => {
        if (current && current.requestId === data.requestId) {
          return { ...current, currentOffer: data.newOffer };
        }
        return current;
      });
    };
    socketService.on('urgent_offer_increased', urgentOfferIncreaseHandler);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        socketService.connect();
      }
      appState.current = nextState;
    });

    return () => {
      socketService.off('new_notification', handler);
      socketService.off('new_booking_request', bookingHandler);
      socketService.off('urgent_request', urgentHandler);
      socketService.off('urgent_cancelled', urgentCancelHandler);
      socketService.off('urgent_offer_increased', urgentOfferIncreaseHandler);
      sub.remove();
    };
  }, [showBanner]);

  const handleAccept = async () => {
    if (!incomingBooking) return;
    setActionLoading(true);
    try {
      await apiClient.patch(`/bookings/${incomingBooking.id}/status`, { status: 'ACCEPTED' });
      showToast({ message: t('Booking accepted!'), type: 'success' });
      setIncomingBooking(null);
      setTimeout(() => {
        router.push('/(worker)/bookings');
      }, 0);
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to accept'), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!incomingBooking) return;
    setActionLoading(true);
    try {
      await apiClient.patch(`/bookings/${incomingBooking.id}/status`, { status: 'CANCELLED', reasonCategory: 'OTHER', cancelReason: 'Worker rejected' });
      setIncomingBooking(null);
    } catch {
      showToast({ message: t('Failed to reject'), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptUrgent = async () => {
    if (!urgentRequest) return;
    setActionLoading(true);
    try {
      await apiClient.post('/urgent/accept', { requestId: urgentRequest.requestId, offerVersion: urgentRequest.offerVersion });
      showToast({ message: t('Urgent booking secured!'), type: 'success' });
      setUrgentRequest(null);
      setTimeout(() => {
        router.push('/(worker)/bookings');
      }, 0);
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to accept'), type: 'error' });
      setUrgentRequest(null); // Someone else probably got it
    } finally {
      setActionLoading(false);
    }
  };

  if (user?.isBanned) {
    return <Redirect href="/(banned)" />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="bookings" />
        <Stack.Screen name="live-tracking" />
        <Stack.Screen name="portfolio" />
        <Stack.Screen name="achievements" />
        <Stack.Screen name="browse-requests" />
        <Stack.Screen name="earnings" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="leaderboard" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="support" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="verification" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="training" />
      </Stack>

      <Modal visible={!!incomingBooking} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24, width: '100%', alignItems: 'center' }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF0E8', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <MaterialCommunityIcons name="bell-ring" size={28} color="#FF5C00" />
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#0D0D0D', marginBottom: 8 }}>{t('New Booking Request!')}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#6B6B6B', textAlign: 'center', marginBottom: 20 }}>
              {t('You have received a direct booking request for')} {t(incomingBooking?.serviceName)}.
            </Text>

            <View style={{ width: '100%', backgroundColor: '#F5F0E8', padding: 16, borderRadius: 12, marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#6B6B6B' }}>{t('Earnings')}:</Text>
                <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 16, color: '#2E7D32' }}>₹{incomingBooking?.workerEarnings}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#6B6B6B' }}>{t('Scheduled for')}:</Text>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#0D0D0D' }}>
                  {incomingBooking?.scheduledAt ? new Date(incomingBooking.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('Now')}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#F5F5F5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#DDD' }}
                onPress={handleReject}
                disabled={actionLoading}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#6B6B6B' }}>{t('Reject')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={handleAccept}
                disabled={actionLoading}
              >
                {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFF' }}>{t('Accept')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <UrgentJobModal 
        visible={!!urgentRequest} 
        job={urgentRequest} 
        onAccept={handleAcceptUrgent} 
        onDismiss={() => setUrgentRequest(null)} 
      />
    </>
  );
}