import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SkeletonWorkerDashboard } from '../../components/ui/Skeleton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useAuthStore } from '../../store/auth.store';
import { useNotificationsStore } from '../../store/notifications.store';
import { useT } from '../../utils/i18n';
import { useToast } from '../../components/ui/ToastProvider';
import { socketService } from '../../api/socket';
import { apiClient } from '../../api/client';
import { useRealtimeWalletRefresh } from '../../hooks/useRealtimeWalletRefresh';
export default function WorkerDashboard() {
  const t = useT();
  
  const router = useRouter();
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [isOnline, setIsOnline] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const [city, setCity] = useState('');

  useEffect(() => {
    socketService.connect();

    const handleRefresh = (data: any) => {
      if (data?.type === 'verification') {
        loadData();
      }
    };

    socketService.on('worker_refresh', handleRefresh);

    return () => {
      socketService.off('worker_refresh', handleRefresh);
    };
  }, []);

  const fetchUnread = async () => {
    try {
      const res = await apiClient.get('/notifications/unread-count');
      const count = res.data?.data?.count ?? 0;
      useNotificationsStore.getState().setUnreadCount(count);
    } catch {}
  };

  useEffect(() => { fetchUnread(); }, []);

  useEffect(() => {
    // Socket events keep the badge live in realtime; this interval is only a
    // fallback when the socket is down — skipping it while connected avoids a
    // pointless network call every 15 seconds.
    const interval = setInterval(() => {
      if (!socketService.isConnected()) fetchUnread();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUnread();
    }, [])
  );

  useEffect(() => { loadData(); }, []);

  // Realtime wallet balance: a payment received / top-up / refund / withdrawal
  // notification (socket or foreground push) refetches stats so the wallet card
  // stays in sync without a manual pull-to-refresh.
  useRealtimeWalletRefresh(loadData);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const geo = await Location.reverseGeocodeAsync(loc.coords);
          setCity(geo[0]?.city || geo[0]?.subregion || '');
        }
      } catch {}
    })();
  }, []);

  async function loadData() {
    try {
      const [statsRes, jobsRes, bookingsRes] = await Promise.all([
        apiClient.get('/workers/stats').catch(() => ({ data: { data: {} } })),
        apiClient.get('/jobs').catch(() => ({ data: { data: { jobs: [] } } })),
        apiClient.get('/bookings').catch(() => ({ data: { data: [] } })),
      ]);
      const stats = statsRes.data?.data || {};
      const jobs = jobsRes.data?.data?.jobs || [];
      const bookings = bookingsRes.data?.data || [];

      const recentFromJobs = jobs.slice(0, 3).map((j: any) => ({
        id: j.id, title: j.title, amount: j.price, status: j.status === 'ACTIVE' ? 'in-progress' : 'completed', type: 'job'
      }));
      const recentFromBookings = bookings.filter((b: any) => b.status !== 'PENDING').slice(0, 3).map((b: any) => ({
        id: b.id, title: b.serviceName, amount: b.workerEarnings ?? b.totalAmount ?? b.baseAmount, status: b.status === 'COMPLETED' ? 'completed' : 'in-progress', type: 'booking'
      }));
      stats.recentJobs = [...recentFromBookings, ...recentFromJobs].slice(0, 5);
      stats.jobCount = jobs.length;

      setStats(stats);
      if (typeof stats.isAvailable === 'boolean') {
        setIsOnline(stats.isAvailable);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  const totalEarned = stats?.totalEarned || 0;
  const completedJobs = stats?.completedJobs || 0;
  const rating = stats?.rating || 0;
  const totalRatings = stats?.totalRatings || 0;

  const getTier = () => {
    const pJobs = 100, pRating = 4.8;
    const gJobs = 50, gRating = 4.5;
    const sJobs = 20, sRating = 4.0;
    
    if (completedJobs >= pJobs && rating >= pRating) return { name: 'Platinum', color: '#607D8B', bg: '#ECEFF1', next: null };
    if (completedJobs >= gJobs && rating >= gRating) return { name: 'Gold', color: '#F57F17', bg: '#FFF8E1', next: { name: 'Platinum', j: pJobs, r: pRating } };
    if (completedJobs >= sJobs && rating >= sRating) return { name: 'Silver', color: '#757575', bg: '#F5F5F5', next: { name: 'Gold', j: gJobs, r: gRating } };
    return { name: 'Bronze', color: '#795548', bg: '#EFEBE9', next: { name: 'Silver', j: sJobs, r: sRating } };
  };
  const tier = getTier();

  if (loading) {
    // Skeleton mirrors the real dashboard blocks 1:1 (header → toggle →
    // gamification → tier → stats → quick actions → activity) so there's no
    // layout jar when real data replaces it.
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <SkeletonWorkerDashboard />
      </SafeAreaView>
    );
  }

  const greeting =
    new Date().getHours() < 12
      ? t('Good morning')
      : new Date().getHours() < 17
        ? t('Good afternoon')
        : t('Good evening');

  const quickActions = [
    { icon: 'calendar-text-outline' as const, label: t('My Bookings'), route: '/(worker)/bookings' as const },
    { icon: 'clipboard-text-search-outline' as const, label: t('Browse Requests'), route: '/(worker)/browse-requests' as const },
    { icon: 'briefcase-outline' as const, label: t('My Jobs'), route: '/(worker)/jobs' as const },
    { icon: 'image-multiple-outline' as const, label: t('Portfolio'), route: '/(worker)/portfolio' as const },
    { icon: 'wallet-outline' as const, label: t('Earnings'), route: '/(worker)/earnings' as const },
    { icon: 'school-outline' as const, label: t('Training Hub'), route: '/(worker)/training' as const },
  ];

  const recentActivities = stats?.recentJobs || [];

  const toggleOnline = async (val: boolean) => {
    setIsOnline(val);
    try {
      // Toggle online status immediately — no waiting for GPS
      await apiClient.put('/workers/online', { isAvailable: val });
      showToast({ type: 'success', message: val ? t('You are now online') : t('You are now offline') });

      // Send location in the background if available
      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            await apiClient.put('/workers/online', { isAvailable: val, lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        } catch {}
      })();
    } catch {
      setIsOnline(!val);
      showToast({ type: 'error', message: t('Failed to update availability') });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor="#0D0D0D"
            colors={['#FF5C00']}
          />
        }
      >
        {/* ─── Header — profile row ─── */}
        <View style={styles.profileRow}>
          <Pressable
            onPress={() => router.push('/(worker)/profile')}
            style={styles.profileLeft}
          >
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarBox}>
                <Text style={styles.avatarText}>
                  {(user?.name || 'W')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.greetingText}>{greeting}</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {user?.name?.split(' ')[0] || t('Worker')}
                </Text>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: isOnline ? '#2E7D32' : '#BDBDBD' },
                  ]}
                />
                {stats?.verificationStatus === 'VERIFIED' && (
                  <MaterialCommunityIcons name="check-decagram" size={14} color="#2E7D32" />
                )}
                <View style={{ backgroundColor: tier.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: tier.color }}>{t(tier.name)}</Text>
                </View>
              </View>
              {city ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}><MaterialCommunityIcons name="map-marker" size={12} color="#9E9E9E" /><Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E' }}>{city}</Text></View> : null}
              <View style={styles.ratingRow}>
                <MaterialCommunityIcons name="star" size={12} color="#FF5C00" />
                <Text style={styles.ratingText}>
                  {rating > 0 ? rating.toFixed(1) : '---'}
                </Text>
                <Text style={styles.ratingCount}>({totalRatings})</Text>
              </View>
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => router.push('/(worker)/notifications')}
              style={styles.iconCircle}
            >
              <MaterialCommunityIcons name="bell-outline" size={22} color="#0D0D0D" />
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push('/(worker)/settings')}
              style={styles.iconCircle}
            >
              <MaterialCommunityIcons name="cog-outline" size={22} color="#0D0D0D" />
            </Pressable>
          </View>
        </View>

        {/* ─── Online toggle card ─── */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleLeft}>
            <Text style={styles.toggleLabel}>{t('Available for work')}</Text>
            <Text style={styles.toggleSub}>
              {isOnline ? t('Customers can find you') : t('Tap to start receiving jobs')}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={toggleOnline}
            trackColor={{ false: '#E0E0E0', true: '#FF5C00' }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* ─── Gamification Widgets ─── */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          {/* Earnings Goal */}
          <Pressable 
            style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
            onPress={() => {
              // Can add navigation to an edit goal screen or a modal here later
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#6B6B6B' }}>{t('Weekly Goal')}</Text>
              <MaterialCommunityIcons name="target" size={16} color="#FF5C00" />
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', marginBottom: 4 }}>
              ₹{totalEarned.toLocaleString('en-IN')} <Text style={{ fontSize: 12, color: '#9E9E9E' }}>/ ₹{stats?.weeklyEarningsGoal || 5000}</Text>
            </Text>
            <View style={{ height: 6, backgroundColor: '#F5F0E8', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
              <View style={{ height: '100%', width: `${Math.min((totalEarned / (stats?.weeklyEarningsGoal || 5000)) * 100, 100)}%`, backgroundColor: '#FF5C00', borderRadius: 3 }} />
            </View>
          </Pressable>

          {/* Daily Streak */}
          <View style={{ width: 110, backgroundColor: '#FFF4E5', borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#FF9800', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
            <MaterialCommunityIcons name="fire" size={32} color="#FF9800" style={{ marginBottom: 4 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#E65100' }}>
              {stats?.streakDays || 0}
            </Text>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: '#E65100', textAlign: 'center' }}>
              {t('Day Streak')}
            </Text>
          </View>
        </View>

        {/* ─── Tier Progress ─── */}
        {tier.next && (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#6B6B6B' }}>{t('Next Tier')}: <Text style={{ color: tier.color, fontFamily: 'Inter_700Bold' }}>{t(tier.next.name)}</Text></Text>
              <MaterialCommunityIcons name="star-shooting" size={16} color={tier.color} />
            </View>
            {(() => {
              // A metric that already meets the target shows as "met ✓" with a
              // full bar — never a confusing "5.0 / 4" (or "30 / 25") fraction.
              const jobsMet = completedJobs >= tier.next.j;
              const ratingMet = rating >= tier.next.r;
              const jobsPct = jobsMet ? 100 : Math.min((completedJobs / tier.next.j) * 100, 100);
              const ratingPct = ratingMet ? 100 : Math.min((rating / tier.next.r) * 100, 100);

              let blocker: string | null = null;
              if (!jobsMet && !ratingMet) {
                blocker = `${t('Need')} ${tier.next.j - completedJobs} ${tier.next.j - completedJobs === 1 ? t('more job') : t('more jobs')} ${t('and rating')} ${tier.next.r} ${t('for')} ${tier.next.name}`;
              } else if (!jobsMet) {
                blocker = `${t('Need')} ${tier.next.j - completedJobs} ${tier.next.j - completedJobs === 1 ? t('more job') : t('more jobs')} ${t('for')} ${tier.next.name}`;
              } else if (!ratingMet) {
                blocker = `${t('Need')} ${t('rating')} ${tier.next.r} ${t('for')} ${tier.next.name}`;
              }

              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: '#9E9E9E', marginBottom: 4 }}>
                        {t('Jobs')}: {completedJobs}{jobsMet ? ' ✓' : ` / ${tier.next.j}`}
                      </Text>
                      <View style={{ height: 4, backgroundColor: '#F5F0E8', borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${jobsPct}%`, backgroundColor: tier.color, borderRadius: 2 }} />
                      </View>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: '#9E9E9E', marginBottom: 4 }}>
                        {t('Rating')}: {rating > 0 ? rating.toFixed(1) : '0'}{ratingMet ? ' ✓' : ` / ${tier.next.r}`}
                      </Text>
                      <View style={{ height: 4, backgroundColor: '#F5F0E8', borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${ratingPct}%`, backgroundColor: tier.color, borderRadius: 2 }} />
                      </View>
                    </View>
                  </View>
                  {blocker && (
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: '#8A8A8A', marginTop: 10, textAlign: 'center' }}>
                      {blocker}
                    </Text>
                  )}
                </>
              );
            })()}
          </View>
        )}

        {/* ─── Leaderboard & Heatmap Widgets ─── */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          {/* Leaderboard Rank — tap to open the full City/Area/Global leaderboard */}
          {stats?.cityPercentile && (
            <Pressable
              style={({ pressed }) => [{ flex: 1, backgroundColor: '#FFF0E8', borderRadius: 16, padding: 16, elevation: 1 }, pressed && { opacity: 0.7 }]}
              onPress={() => router.push('/(worker)/leaderboard')}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <MaterialCommunityIcons name="trophy-variant" size={24} color="#FF5C00" />
                <View style={{ backgroundColor: '#0D0D0D', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FFFFFF' }}>{t('Top')} {stats.cityPercentile}%</Text>
                </View>
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' }}>#{stats.cityRank || 1}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: '#B85500' }}>{t('Earner in your city')}</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#B85500" />
              </View>
            </Pressable>
          )}

          {/* Demand Heatmap Alert */}
          {stats?.openRequestsCount > 0 && (
            <View style={{ flex: 1, backgroundColor: '#E8EAF6', borderRadius: 16, padding: 16, elevation: 1 }}>
              <MaterialCommunityIcons name="map-marker-radius" size={24} color="#3F51B5" style={{ marginBottom: 8 }} />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#1A237E' }}>{t('High Demand')}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#3949AB', marginTop: 2, lineHeight: 16 }}>
                {stats.openRequestsCount} {t('requests for')} {stats?.category ? t(stats.category.replace(/_/g, ' ')) : t('your services')} {t('nearby!')}
              </Text>
            </View>
          )}
        </View>

        {/* ─── Stats row ─── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <MaterialCommunityIcons name="currency-inr" size={20} color="#2E7D32" />
            </View>
            <Text style={styles.statValue}>₹{totalEarned.toLocaleString('en-IN')}</Text>
            <Text style={styles.statLabel}>{t('Earnings')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#FFF3E0' }]}>
              <MaterialCommunityIcons name="briefcase-check" size={20} color="#E65100" />
            </View>
            <Text style={styles.statValue}>{completedJobs}</Text>
            <Text style={styles.statLabel}>{t('Jobs Done')}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: '#E3F2FD' }]}>
              <MaterialCommunityIcons name="star" size={20} color="#1565C0" />
            </View>
            <Text style={styles.statValue}>{rating > 0 ? rating.toFixed(1) : '---'}</Text>
            <Text style={styles.statLabel}>{t('Rating')}</Text>
          </View>
        </View>

        {/* ─── Quick actions ─── */}
        <Text style={styles.sectionLabel}>{t('Quick Actions')}</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action) => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [
                styles.actionTile,
                pressed && styles.actionTilePressed,
              ]}
              onPress={() => router.push(action.route)}
            >
              <View style={styles.actionIconWrap}>
                <MaterialCommunityIcons name={action.icon} size={26} color="#FF5C00" />
              </View>
              <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ─── Recent Activity ─── */}
        <Text style={styles.sectionLabel}>{t('Recent Activity')}</Text>
        <View style={styles.activityCard}>
          {recentActivities.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#999' }}>{t('No recent activity')}</Text>
            </View>
          ) : recentActivities.map((item: any, index: number) => (
            <Pressable
              key={item.id}
              style={[
                styles.activityRow,
                index < recentActivities.length - 1 && styles.activityRowBorder,
              ]}
              onPress={() => router.push(item.type === 'job' ? '/(worker)/jobs' : '/(worker)/bookings')}
            >
              <View style={styles.activityLeft}>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {t(item.title)}
                </Text>
                <Text style={styles.activityAmount}>₹{item.amount}</Text>
              </View>
              <View
                style={[
                  styles.activityBadge,
                  {
                    backgroundColor:
                      item.status === 'completed' ? '#E8F5E9' : '#FFF3E0',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.activityBadgeText,
                    {
                      color: item.status === 'completed' ? '#2E7D32' : '#E65100',
                    },
                  ]}
                >
                  {item.status === 'completed' ? t('Completed') : t('In Progress')}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ─── Wallet Balance ─── */}
        <Pressable
          style={({ pressed }) => [
            styles.walletCard,
            pressed && styles.walletCardPressed,
          ]}
          onPress={() => router.push('/(worker)/earnings')}
        >
          <View style={styles.walletLeft}>
            <View style={styles.walletIcon}>
              <MaterialCommunityIcons name="wallet-outline" size={24} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.walletLabel}>{t('Wallet Balance')}</Text>
              <Text style={styles.walletAmount}>
                ₹{stats?.walletBalance?.toLocaleString('en-IN') || 0}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
        </Pressable>

        {/* ─── Achievements teaser ─── */}
        <Pressable
          style={({ pressed }) => [
            styles.achievementCard,
            pressed && styles.achievementCardPressed,
          ]}
          onPress={() => router.push('/(worker)/achievements')}
        >
          <MaterialCommunityIcons name="trophy-outline" size={22} color="#FF5C00" />
          <Text style={styles.achievementText}>{t('View your achievements & badges')}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#0D0D0D" />
        </Pressable>


        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 20 },
  loaderBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ─── Header ───
  profileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarBox: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#F5F0E8' },
  profileInfo: { marginLeft: 12, flex: 1 },
  greetingText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#757575' },
  displayName: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ratingText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#0D0D0D' },
  ratingCount: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  unreadBadge: { position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, elevation: 3 },
  unreadText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#FFFFFF' },

  // ─── Online toggle ───
  toggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, padding: 16 },
  toggleLeft: { flex: 1 },
  toggleLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#0D0D0D' },
  toggleSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E', marginTop: 2 },

  // ─── Stats row ───
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, padding: 14, alignItems: 'center' },
  statIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  // ─── Section label ───
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#0D0D0D', textTransform: 'uppercase', letterSpacing: 0.5 },

  // ─── Quick actions ───
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  actionTile: { width: '31.5%', aspectRatio: 1, backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, justifyContent: 'center', alignItems: 'center', padding: 8 },
  actionTilePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  actionIconWrap: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,92,0,0.06)', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#333333', textAlign: 'center' },

  // ─── Recent activity ───
  activityCard: { backgroundColor: '#FFFFFF', borderRadius: 16, elevation: 1, overflow: 'hidden' },
  activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5F0E8' },
  activityLeft: { flex: 1, marginRight: 12 },
  activityTitle: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#0D0D0D' },
  activityAmount: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#2E7D32', marginTop: 2 },
  activityBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  activityBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },

  // ─── Wallet card ───
  walletCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0D0D0D', borderRadius: 16, padding: 18 },
  walletCardPressed: { opacity: 0.9 },
  walletLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  walletIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  walletLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  walletAmount: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#FFFFFF', marginTop: 2 },

  // ─── Achievement teaser ───
  achievementCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, padding: 16 },
  achievementCardPressed: { opacity: 0.85 },
  achievementText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#0D0D0D', flex: 1 },

  // ─── Logout ───
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  logoutBtnPressed: { opacity: 0.6 },
  logoutText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#9E9E9E' },
});
