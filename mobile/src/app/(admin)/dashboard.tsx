import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { apiClient } from '../../api/client';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { socketService } from '../../api/socket';
import { useT } from '../../utils/i18n';

const { width } = Dimensions.get('window');

export default function AdminDashboard() {
  const t = useT();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        apiClient.get('/admin/dashboard').catch(() => ({ data: { data: {} } })),
        apiClient.get('/admin/workers/verifications').catch(() => ({ data: { data: [] } })),
      ]);
      setStats(s.data?.data || {});
      setVerifications(v.data?.data || []);
    } catch {  }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Reload on focus (when coming back from any admin page)
  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  useEffect(() => {
    loadData();

    socketService.connect();
    const handleRefresh = () => { loadData(); };
    socketService.on('admin_refresh', handleRefresh);

    return () => {
      socketService.off('admin_refresh', handleRefresh);
    };
  }, [loadData]);

  const totalUsers = stats?.totalUsers || 0;
  const totalWorkers = stats?.totalWorkers || 0;
  const activeBookings = stats?.activeBookings || 0;
  const totalRevenue = stats?.revenue || 0;
  const pendingVerifications = verifications.filter((v: any) => v.status === 'PENDING_REVIEW');
  const pendingCount = pendingVerifications.length; // Pending Verifications
  const pendingWithdrawals = stats?.pendingWithdrawals || 0;

  if (loading) {
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
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerGreeting}>{t('Welcome,')} {user?.name?.split(' ')[0] || t('Admin')}</Text>
          <Text style={styles.headerSubtitle}>{t('Platform overview')}</Text>
        </View>
        <Pressable onPress={() => { logout(); router.replace('/(auth)/welcome'); }} style={styles.exitBtn}>
          <MaterialCommunityIcons name="logout" size={20} color="#F44336" />
        </Pressable>
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#FF5C00" />}
      >

        {/* Revenue Card */}
        <View style={styles.revenueCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSubtitle}>{t('Total Revenue')}</Text>
            <View style={styles.iconCircleSuccess}>
              <MaterialCommunityIcons name="trending-up" size={16} color="#0F9D58" />
            </View>
          </View>
          <Text style={styles.revenueAmount}>
            ₹{totalRevenue.toLocaleString('en-IN')}
          </Text>
          <View style={styles.revenueLegendRow}>
            {[
              { label: 'Users', value: totalUsers, color: '#4285F4' },
              { label: 'Workers', value: totalWorkers, color: '#FF5C00' },
              { label: 'Active', value: activeBookings, color: '#673AB7' },
            ].map(m => (
              <View key={m.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: m.color }]} />
                <Text style={styles.legendText}>{m.value} {t(m.label)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#E8F0FE' }]}>
              <MaterialCommunityIcons name="account-group" size={24} color="#4285F4" />
            </View>
            <Text style={styles.statValue}>{totalUsers}</Text>
            <Text style={styles.statLabel}>{t('Users')}</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FFF0E6' }]}>
              <MaterialCommunityIcons name="account-hard-hat" size={24} color="#FF5C00" />
            </View>
            <Text style={styles.statValue}>{totalWorkers}</Text>
            <Text style={styles.statLabel}>{t('Workers')}</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#F3E5F5' }]}>
              <MaterialCommunityIcons name="clipboard-list" size={24} color="#673AB7" />
            </View>
            <Text style={styles.statValue}>{activeBookings}</Text>
            <Text style={styles.statLabel}>{t('Active')}</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FCE8E6' }]}>
              <MaterialCommunityIcons name="shield-check" size={24} color="#EA4335" />
            </View>
            <Text style={styles.statValue}>{pendingCount}</Text>
            <Text style={styles.statLabel}>{t('Pending')}</Text>
          </View>
        </View>

        {/* Management Menu */}
        <Text style={styles.sectionTitle}>{t('Management')}</Text>
        <View style={styles.menuContainer}>
          {[
            { icon: 'account-group', label: 'Users', route: '/(admin)/users', color: '#4285F4' },
            { icon: 'shield-account', label: 'Verifications', route: '/(admin)/verifications', color: '#FF5C00', badge: pendingCount > 0 ? pendingCount.toString() : undefined },
            { icon: 'clipboard-list', label: 'Bookings', route: '/(admin)/bookings', color: '#673AB7' },
            { icon: 'cancel', label: 'Cancellations', route: '/(admin)/cancellations', color: '#EA4335' },
            { icon: 'tag-multiple', label: 'Issues', route: '/(admin)/issues', color: '#1A73E8' },
            { icon: 'chart-timeline-variant', label: 'Market Pricing', route: '/(admin)/pricing', color: '#00897B' },
            { icon: 'alert-octagon-outline', label: 'Risk & Anomalies', route: '/(admin)/risk', color: '#C5221F' },
            { icon: 'view-dashboard-outline', label: 'Marketplace', route: '/(admin)/marketplace', color: '#6C5CE7' },
            { icon: 'currency-inr', label: 'Revenue', route: '/(admin)/revenue', color: '#0F9D58' },
            { icon: 'wallet', label: 'Withdrawals', route: '/(admin)/withdrawals', color: '#F4B400', badge: pendingWithdrawals > 0 ? pendingWithdrawals.toString() : undefined },
            { icon: 'ticket', label: 'Support Tickets', route: '/(admin)/tickets', color: '#E91E63', badge: stats?.openTickets > 0 ? stats.openTickets.toString() : undefined },
            { icon: 'shield-check-outline', label: 'Guarantee Claims', route: '/(admin)/guarantee', color: '#1A5C2A' },
            { icon: 'link-variant', label: 'Worker Leads', route: '/(admin)/leads', color: '#00897B' },
            ...(user?.role === 'SUPER_ADMIN' ? [{ icon: 'shield-account', label: 'Super Admin', route: '/(admin)/super-admin', color: '#000000' }] : []),
          ].map((item: any, i, arr) => (
            <Pressable
              key={item.label}
              style={[styles.menuItem, i === arr.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => router.push(item.route as any)}
              accessibilityRole="button"
              accessibilityLabel={t(item.label)}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: item.color + '15' }]}>
                <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{t(item.label)}</Text>
              
              {item.badge ? (
                <View style={styles.menuBadge}>
                  <Text style={styles.menuBadgeText}>{item.badge}</Text>
                </View>
              ) : null}
              
              <MaterialCommunityIcons name="chevron-right" size={20} color="#BDBDBD" />
            </Pressable>
          ))}
        </View>

        {/* Pending Verifications */}
        {pendingVerifications.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sectionTitle}>{t('Pending Verifications')}</Text>
            <View style={{ gap: 12 }}>
              {pendingVerifications.slice(0, 3).map((v: any, i: number) => (
                <View key={v.id || i} style={styles.verificationCard}>
                  <View style={styles.verificationAvatar}>
                    <Text style={styles.verificationAvatarText}>{(v.user?.name || v.name || t('W')).charAt(0)}</Text>
                  </View>
                  <View style={styles.verificationInfo}>
                    <Text style={styles.verificationName}>{v.user?.name || v.name || t('Worker')}</Text>
                    <Text style={styles.verificationSubtitle}>{t(v.category || 'N/A')} • {v.city || t('Location Pending')}</Text>
                  </View>
                  <Pressable
                    style={styles.reviewBtn}
                    onPress={() => router.push('/(admin)/verifications')}
                  >
                    <Text style={styles.reviewBtnText}>{t('Review')}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { 
    paddingHorizontal: 24, 
    paddingTop: 24, 
    paddingBottom: 16, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  headerTextContainer: { flex: 1 },
  headerGreeting: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#202124' },
  headerSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#5F6368', marginTop: 4 },
  exitBtn: { 
    width: 44, height: 44, 
    borderRadius: 22, 
    backgroundColor: '#FCE8E6', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 24 },
  
  revenueCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 24, 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 10, 
    shadowOffset: { width: 0, height: 4 } 
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardSubtitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#5F6368', textTransform: 'uppercase', letterSpacing: 0.5 },
  iconCircleSuccess: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E6F4EA', justifyContent: 'center', alignItems: 'center' },
  revenueAmount: { fontFamily: 'Inter_700Bold', fontSize: 36, color: '#202124', marginBottom: 20 },
  revenueLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { 
    width: (width - 52) / 2, 
    backgroundColor: '#FFFFFF', 
    borderRadius: 20, 
    padding: 20, 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 8, 
    shadowOffset: { width: 0, height: 2 } 
  },
  statIconContainer: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#202124', marginBottom: 4 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },

  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#5F6368', marginBottom: 12, paddingHorizontal: 4 },
  
  menuContainer: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    elevation: 2, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 8, 
    shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden'
  },
  menuItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F3F4' 
  },
  menuIconContainer: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124', flex: 1, marginLeft: 16 },
  menuBadge: { backgroundColor: '#EA4335', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 12 },
  menuBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#FFFFFF' },

  verificationCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF', 
    borderRadius: 20, 
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  verificationAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center' },
  verificationAvatarText: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#FFFFFF' },
  verificationInfo: { flex: 1, marginLeft: 16 },
  verificationName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  verificationSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368', marginTop: 4 },
  reviewBtn: { backgroundColor: '#E8F0FE', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
  reviewBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#1A73E8' }
});
