import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { apiClient } from '../../../api/client';
import { socketService } from '../../../api/socket';
import { useT } from '../../../utils/i18n';

type TabType = 'all' | 'CUSTOMER' | 'WORKER';

const STATUS_STYLES: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  open:        { label: 'Open',        icon: 'alert-circle-outline',  color: '#C5221F', bg: '#FCE8E6' },
  in_progress: { label: 'In Progress', icon: 'progress-clock',       color: '#B06000', bg: '#FEF7E0' },
  resolved:    { label: 'Resolved',    icon: 'check-circle-outline',  color: '#137333', bg: '#E6F4EA' },
  closed:      { label: 'Closed',      icon: 'lock-outline',          color: '#5F6368', bg: '#F1F3F4' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   '#EA4335',
  medium: '#FBBC04',
  low:    '#34A853',
};

export default function AdminTickets() {
  const t = useT();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const load = async () => {
    try {
      const r = await apiClient.get('/admin/tickets');
      setData(r.data?.data || []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    socketService.connect();
    const handleRefresh = () => { load(); };
    socketService.on('admin_refresh', handleRefresh);
    return () => { socketService.off('admin_refresh', handleRefresh); };
  }, []);

  const filtered = activeTab === 'all'
    ? data
    : data.filter(t => t.user?.role === activeTab);

  const counts = {
    all: data.length,
    CUSTOMER: data.filter(t => t.user?.role === 'CUSTOMER').length,
    WORKER: data.filter(t => t.user?.role === 'WORKER').length,
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><BrutalInkLoader /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Tickets')}</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{data.length}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['all', 'CUSTOMER', 'WORKER'] as TabType[]).map(tab => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'all' ? t('All') : tab === 'CUSTOMER' ? t('Customers') : t('Workers')}
            </Text>
            <View style={[styles.tabCount, activeTab === tab && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, activeTab === tab && styles.tabCountTextActive]}>
                {counts[tab]}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="ticket-confirmation-outline" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No tickets found')}</Text>
          </View>
        ) : filtered.map((tk: any) => {
          const ss = STATUS_STYLES[tk.status] || STATUS_STYLES.open;
          const pc = PRIORITY_COLORS[tk.priority] || '#5F6368';
          const isCustomer = tk.user?.role === 'CUSTOMER';

          return (
            <Pressable
              key={tk.id}
              style={styles.card}
              onPress={() => router.push(`/(admin)/tickets/${tk.id}`)}
            >
              {/* Top row: avatar + subject + status */}
              <View style={styles.cardTop}>
                <View style={[styles.avatar, isCustomer ? styles.avatarCustomer : styles.avatarWorker]}>
                  <Text style={styles.avatarText}>{tk.user?.name?.[0] || '?'}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.subject} numberOfLines={1}>{tk.subject || t('No Subject')}</Text>
                  <Text style={styles.userName} numberOfLines={1}>
                    {tk.user?.name || t('Unknown')}
                    <Text style={styles.userRole}> · {isCustomer ? t('Customer') : t('Worker')}</Text>
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: ss.bg }]}>
                  <MaterialCommunityIcons name={ss.icon as any} size={12} color={ss.color} />
                  <Text style={[styles.statusText, { color: ss.color }]}>{t(ss.label)}</Text>
                </View>
              </View>

              {/* Preview message */}
              {tk.messages?.[0]?.message && (
                <Text style={styles.preview} numberOfLines={2}>
                  {tk.messages[0].message}
                </Text>
              )}

              {/* Bottom row: priority + date */}
              <View style={styles.cardBottom}>
                <View style={styles.priorityRow}>
                  <MaterialCommunityIcons name="flag" size={14} color={pc} />
                  <Text style={[styles.priorityText, { color: pc }]}>{t((tk.priority || 'medium').toUpperCase())}</Text>
                </View>
                <Text style={styles.date}>
                  {new Date(tk.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
            </Pressable>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: '#F5F0E8',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#202124', flex: 1 },
  headerBadge: { backgroundColor: '#0D0D0D', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  headerBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFFFFF' },

  // Tabs
  tabRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#EAE2D6',
  },
  tabActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#5F6368' },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
    backgroundColor: '#F1F3F4',
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  tabCountText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#5F6368' },
  tabCountTextActive: { color: '#FFFFFF' },

  // List
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 12 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 16 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#8A8A8A' },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarCustomer: { backgroundColor: '#E8F0FE' },
  avatarWorker: { backgroundColor: '#FFF0E8' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#202124' },
  cardInfo: { flex: 1 },
  subject: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  userName: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368', marginTop: 2 },
  userRole: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.3 },

  preview: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A8A', lineHeight: 18, marginLeft: 4 },

  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 4 },
  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priorityText: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.3 },
  date: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A' },
});
