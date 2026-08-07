import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BanUserModal, BanData } from '../../../components/admin/BanUserModal';
import { apiClient } from '../../../api/client';
import { useToast } from '../../../components/ui/ToastProvider';
import { t } from '../../../utils/i18n';

export default function UserDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Ban Modal State
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleBanConfirm = async (banData: BanData) => {
    setActionLoading(true);
    try {
      await apiClient.post(`/admin/users/${id}/ban`, {
        type: banData.banType,
        reason: banData.banReason.trim(),
        durationDays: banData.banType === 'TEMPORARY' ? parseInt(banData.banDurationDays, 10) : undefined,
        banIp: banData.banIp
      });
      showToast({ message: t('User banned successfully'), type: 'success' });
      setBanModalVisible(false);
      loadData();
    } catch (e: any) {
      showToast({ message: t(e?.response?.data?.error || 'Failed to ban user'), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const res = await apiClient.get(`/admin/users/${id}/audit`);
      setData(res.data?.data);
    } catch (e: any) {
      showToast({ message: t(e?.response?.data?.error || 'Failed to load user'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUnban = async () => {
    setActionLoading(true);
    try {
      await apiClient.post(`/admin/users/${id}/unban`);
      showToast({ message: t('User unbanned successfully'), type: 'success' });
      loadData();
    } catch (e: any) {
      showToast({ message: t(e?.response?.data?.error || 'Failed to unban user'), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}><ActivityIndicator size="large" color="#FF5C00" /></View>
      </SafeAreaView>
    );
  }

  if (!data?.user) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('User Not Found')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatTimelineDetails = (log: any) => {
    if (!log.newValue) return null;

    if (typeof log.newValue === 'string') {
      return log.newValue;
    }

    try {
      const data = typeof log.newValue === 'object' ? log.newValue : JSON.parse(log.newValue);

      if (log.action === 'BAN_USER') {
        return `${t('Ban Type')}: ${data.type || t('Unknown')}\n${t('Reason')}: ${data.reason || t('N/A')}${data.durationDays ? `\n${t('Duration')}: ${data.durationDays} ${t('days')}` : ''}\n${t('IP Banned')}: ${data.banIp ? t('Yes') : t('No')}`;
      }

      if (log.action === 'ADMIN_UNBAN' || log.action === 'UNBAN_USER') {
        return data.note || data.reason || t('User was unbanned');
      }

      // Generic object formatting
      const parts = [];
      for (const [key, value] of Object.entries(data)) {
        if (key === 'timestamp' || key === 'id') continue;
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}: ${value}`);
      }
      return parts.join('\n');
    } catch {
      return JSON.stringify(log.newValue);
    }
  };

  const { user, timeline } = data;
  const isBanned = user.isBanned;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('User Profile')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.section}>
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: user.role === 'WORKER' ? '#FFF0E6' : '#E8F0FE' }]}>
              <Text style={[styles.avatarText, { color: user.role === 'WORKER' ? '#FF5C00' : '#1A73E8' }]}>
                {(user.name || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.name || t('Unknown User')}</Text>
              <Text style={styles.profilePhone}>{user.phone}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.roleBadge, { backgroundColor: user.role === 'WORKER' ? '#FFF0E6' : '#E8F0FE' }]}>
                  <Text style={[styles.roleBadgeText, { color: user.role === 'WORKER' ? '#FF5C00' : '#1A73E8' }]}>{user.role}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isBanned ? '#FCE8E6' : '#E6F4EA' }]}>
                  <Text style={[styles.statusBadgeText, { color: isBanned ? '#C5221F' : '#137333' }]}>
                    {isBanned ? t('BANNED') : t('ACTIVE')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <Text style={styles.joinedText}>{t('Joined on')} {new Date(user.createdAt).toLocaleDateString()}</Text>
        </View>

        {/* Worker Stats (if applicable) */}
        {user.workerProfile && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{user.workerProfile.completedJobs || 0}</Text>
              <Text style={styles.statLabel}>{t('Jobs Done')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{user.workerProfile.rating > 0 ? user.workerProfile.rating.toFixed(1) : '—'}</Text>
              <Text style={styles.statLabel}>{t('Rating')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>₹{user.workerProfile.walletBalance || 0}</Text>
              <Text style={styles.statLabel}>{t('Wallet')}</Text>
            </View>
          </View>
        )}

        {/* Activity Timeline */}
        <Text style={styles.sectionTitle}>{t('Activity Timeline')}</Text>
        <View style={styles.timelineContainer}>
          {timeline.length === 0 ? (
            <Text style={styles.emptyText}>{t('No recent activity found.')}</Text>
          ) : (
            timeline.map((log: any, index: number) => (
              <View key={log.id || index} style={styles.timelineItem}>
                <View style={styles.timelineLine} />
                <View style={[styles.timelineDot, { 
                  backgroundColor: log.type === 'audit' ? '#673AB7' : log.type === 'login' ? '#0F9D58' : '#FF5C00' 
                }]} />
                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeader}>
                    <Text style={styles.timelineAction}>{log.action || t('Logged In')}</Text>
                    <Text style={styles.timelineDate}>
                      {new Date(log.createdAt).toLocaleDateString()} {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {log.newValue && (
                    <Text style={styles.timelineDetails}>
                      {formatTimelineDetails(log)}
                    </Text>
                  )}
                  {log.ip && <Text style={styles.timelineIp}>{t('IP:')} {log.ip}</Text>}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Action Footer */}
      <View style={styles.actionFooter}>
        {isBanned ? (
          <Pressable style={[styles.actionBtn, { backgroundColor: '#2E7D32' }]} onPress={handleUnban} disabled={actionLoading}>
            {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.actionBtnText}>{t('Unban User')}</Text>}
          </Pressable>
        ) : (
          <Pressable style={[styles.actionBtn, { backgroundColor: '#D32F2F' }]} onPress={() => setBanModalVisible(true)}>
            <Text style={styles.actionBtnText}>{t('Ban User')}</Text>
          </Pressable>
        )}
      </View>

      {/* Ban Configuration Modal */}
      <BanUserModal
        visible={banModalVisible}
        onClose={() => setBanModalVisible(false)}
        onConfirm={handleBanConfirm}
        loading={actionLoading}
        userId={id as string}
      />

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
  
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  profileInfo: { marginLeft: 16, flex: 1 },
  profileName: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },
  profilePhone: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#5F6368', marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  roleBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  joinedText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A8A', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 16, marginTop: 8 },

  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { 
    flex: 1, 
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    padding: 16, 
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368', marginTop: 4 },

  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#5F6368', marginBottom: 16, paddingHorizontal: 4 },
  
  timelineContainer: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#8A8A8A', textAlign: 'center', padding: 20 },
  timelineItem: { flexDirection: 'row', paddingBottom: 24, position: 'relative' },
  timelineLine: { position: 'absolute', left: 5, top: 20, bottom: 0, width: 2, backgroundColor: '#F0F0F0' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  timelineContent: { marginLeft: 16, flex: 1 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  timelineAction: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124', flex: 1 },
  timelineDate: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#8A8A8A', marginLeft: 8 },
  timelineDetails: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368', marginTop: 4 },
  timelineIp: { fontFamily: 'SpaceMono_400Regular', fontSize: 11, color: '#9E9E9E', marginTop: 4 },

  actionFooter: { 
    position: 'absolute', bottom: 0, left: 0, right: 0, 
    backgroundColor: '#FFF', 
    flexDirection: 'row', 
    padding: 16, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10
  },
  actionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFFFFF' }
});
