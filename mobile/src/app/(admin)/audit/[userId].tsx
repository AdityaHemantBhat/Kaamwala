import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { BanUserModal, BanData } from '../../../components/admin/BanUserModal';
import { apiClient } from '../../../api/client';
import { useT } from '../../../utils/i18n';

export default function AdminAuditTimeline() {
  const t = useT();
  const { userId } = useLocalSearchParams();
  const router = useRouter();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/admin/users/${userId}/audit`);
      setData(res.data?.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const [showBanModal, setShowBanModal] = useState(false);
  const [acting, setActing] = useState(false);

  const handleBanConfirm = async (banData: BanData) => {
    setActing(true);
    try {
      await apiClient.post(`/admin/users/${userId}/ban`, {
        type: banData.banType,
        reason: banData.banReason,
        durationDays: banData.banType === 'TEMPORARY' ? parseInt(banData.banDurationDays) : undefined,
        banIp: banData.banIp
      });
      setShowBanModal(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to ban user');
    } finally {
      setActing(false);
    }
  };

  const handleUnban = async () => {
    try {
      await apiClient.post(`/admin/users/${userId}/unban`);
      load();
    } catch (e: any) {
      Alert.alert(t('Error'), e.response?.data?.message || t('Failed to unban user'));
    }
  };

  useEffect(() => { load(); }, [load]);

  if (loading) return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.center}><BrutalInkLoader /></View></SafeAreaView>;
  if (!data) return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.center}><Text>{t('Failed to load audit logs.')}</Text></View></SafeAreaView>;

  const { user, timeline } = data;

  const getLogIcon = (type: string, action: string, success?: boolean) => {
    if (type === 'login') return success ? { i: 'login', c: '#137333', bg: '#E6F4EA' } : { i: 'alert-circle', c: '#C5221F', bg: '#FCE8E6' };
    if (type === 'analytics') return { i: 'chart-box-outline', c: '#673AB7', bg: '#F3E5F5' };
    
    if (action.includes('BAN')) return { i: 'gavel', c: '#C5221F', bg: '#FCE8E6' };
    if (action.includes('PAYMENT') || action.includes('WALLET')) return { i: 'currency-inr', c: '#B06000', bg: '#FEF7E0' };
    if (action.includes('BOOKING')) return { i: 'calendar-check', c: '#1A73E8', bg: '#E8F0FE' };
    if (action.includes('TICKET')) return { i: 'ticket', c: '#E91E63', bg: '#FCE4EC' };
    if (action.includes('VERIF')) return { i: 'shield-check', c: '#137333', bg: '#E6F4EA' };
    
    return { i: 'history', c: '#5F6368', bg: '#F1F3F4' };
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{user?.name}{t("'s Audit Log")}</Text>
          <Text style={styles.headerSub}>{t(user?.role)} • {user?.phone}</Text>
        </View>
        {user?.isBanned ? (
          <Pressable style={[styles.banBtn, { backgroundColor: '#137333' }]} onPress={handleUnban}>
            <Text style={styles.banBtnText}>{t('Unban')}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.banBtn} onPress={() => setShowBanModal(true)}>
            <Text style={styles.banBtnText}>{t('Ban User')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* User Summary Card */}
        <View style={styles.summaryCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>{t('Overview')}</Text>
            {user?.isBanned && (
              <View style={styles.bannedBadge}>
                <Text style={styles.bannedText}>{t('BANNED')}</Text>
              </View>
            )}
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Joined:')}</Text>
            <Text style={styles.summaryValue}>{new Date(user?.createdAt).toLocaleDateString()}</Text>
          </View>
          {user?.role === 'WORKER' && (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('Wallet:')}</Text>
                <Text style={styles.summaryValue}>₹{user?.workerProfile?.walletBalance}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t('Jobs Done:')}</Text>
                <Text style={styles.summaryValue}>{user?.workerProfile?.completedJobs}</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.timelineTitle}>{t('Activity Timeline')}</Text>
        
        {timeline.length === 0 ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="text-box-search-outline" size={48} color="#D2D2D2" />
            <Text style={{ fontFamily: 'Inter_500Medium', color: '#8A8A8A', marginTop: 12 }}>{t('No logs found for this user.')}</Text>
          </View>
        ) : (
          <View style={styles.timelineContainer}>
            {timeline.map((log: any, index: number) => {
              const isLast = index === timeline.length - 1;
              const iconData = getLogIcon(log.type, log.action || '', log.success);
              
              return (
                <View key={log.id} style={styles.timelineRow}>
                  {/* Left Line & Icon */}
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineIconBg, { backgroundColor: iconData.bg }]}>
                      <MaterialCommunityIcons name={iconData.i as any} size={16} color={iconData.c} />
                    </View>
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  
                  {/* Right Content */}
                  <View style={styles.timelineContent}>
                    <View style={styles.logHeader}>
                      <Text style={styles.logAction}>
                        {log.type === 'login'
                          ? (log.success ? t('Successful Login') : t('Failed Login Attempt'))
                          : t(String(log.action).replace(/_/g, ' '))}
                      </Text>
                      <Text style={styles.logTime}>
                        {new Date(log.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    
                    {log.type === 'login' && !log.success && (
                      <Text style={styles.logDetailText}>{t('Reason:')} {log.failReason || t('Unknown')}</Text>
                    )}
                    
                    {(log.type === 'audit' || log.type === 'analytics') && log.newValue && (
                      <View style={styles.jsonBox}>
                        {typeof log.newValue === 'object' && log.newValue !== null ? (
                          Object.entries(log.newValue).map(([k, v]) => (
                            <View key={k} style={styles.payloadRow}>
                              <Text style={styles.payloadKey}>
                                {k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:
                              </Text>
                              <Text style={styles.payloadValue}>
                                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.jsonText}>{String(log.newValue)}</Text>
                        )}
                      </View>
                    )}
                    
                    {(log.ip || log.resource) && (
                      <Text style={styles.logMeta}>
                        {log.ip ? `${t('IP:')} ${log.ip} ` : ''}
                        {log.resource ? `${log.ip ? '• ' : ''}${t('Res:')} ${log.resource}` : ''}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Ban Modal */}
      <BanUserModal
        visible={showBanModal}
        onClose={() => setShowBanModal(false)}
        onConfirm={handleBanConfirm}
        loading={acting}
        userId={data?.id}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EAE2D6' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#202124' },
  headerSub: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#5F6368' },

  content: { padding: 16 },

  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 24 },
  bannedBadge: { backgroundColor: '#FCE8E6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  bannedText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#C5221F' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#5F6368' },
  summaryValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124' },

  timelineTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#202124', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  timelineContainer: { gap: 0 },
  timelineRow: { flexDirection: 'row' },
  timelineLeft: { width: 40, alignItems: 'center' },
  timelineIconBg: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#EAE2D6', marginVertical: 4 },
  
  timelineContent: { flex: 1, paddingBottom: 24, paddingLeft: 8 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  logAction: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#202124', flex: 1 },
  logTime: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', marginLeft: 8 },
  logDetailText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#C5221F', marginTop: 4 },
  jsonBox: { backgroundColor: '#F8F9FA', padding: 12, borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#F1F3F4' },
  jsonText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#3C4043' },
  payloadRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  payloadKey: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#5F6368', marginRight: 4 },
  payloadValue: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#202124', flex: 1, flexWrap: 'wrap' },
  logMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', marginTop: 10 },

  banBtn: { backgroundColor: '#C5221F', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  banBtnText: { fontFamily: 'Inter_600SemiBold', color: '#FFF', fontSize: 13 },
});
