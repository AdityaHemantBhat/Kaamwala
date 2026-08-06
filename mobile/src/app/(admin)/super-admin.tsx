import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { useToast } from '../../components/ui/ToastProvider';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';

export default function SuperAdminPanel() {
  const t = useT();
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('admins');
  const [admins, setAdmins] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [bannedIps, setBannedIps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [broadTitle, setBroadTitle] = useState('');
  const [broadBody, setBroadBody] = useState('');
  const [broadTargetRole, setBroadTargetRole] = useState('ALL');
  const [broadExpires, setBroadExpires] = useState('');
  const [payConfig, setPayConfig] = useState<any>(null);

  useEffect(() => { loadAll(); }, [activeTab]);

  async function loadAll() {
    setLoading(true);
    try {
      if (activeTab === 'admins') {
        const r = await apiClient.get('/admin/super/admins');
        setAdmins(r.data?.data || []);
      } else if (activeTab === 'logs') {
        const r = await apiClient.get('/admin/super/audit-log');
        setLogs(r.data?.data || []);
      } else if (activeTab === 'payments') {
        const r = await apiClient.get('/admin/super/payment-config');
        setPayConfig(r.data?.data || null);
      } else if (activeTab === 'security') {
        const r = await apiClient.get('/admin/banned-ips');
        setBannedIps(r.data?.data || []);
      }
    } catch {}
    finally { setLoading(false); }
  }

  const makeAdmin = async () => {
    if (!newPhone || newPhone.length < 10) return;
    setActionLoading(true);
    try {
      await apiClient.post('/admin/super/make-admin', { phone: `+91${newPhone}`, name: newName || 'Admin' });
      showToast({ message: t('Admin created successfully'), type: 'success' });
      setNewPhone(''); setNewName('');
      loadAll();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to create admin'), type: 'error' });
    } finally { setActionLoading(false); }
  };

  const removeAdmin = async (userId: string, name: string) => {
    try {
      await apiClient.post('/admin/super/remove-admin', { userId });
      showToast({ message: `${name} ${t('removed from admins')}`, type: 'success' });
      loadAll();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to remove'), type: 'error' });
    }
  };

  const unbanIp = async (ip: string) => {
    try {
      await apiClient.delete(`/admin/banned-ips/${ip}`);
      showToast({ message: t('IP unbanned successfully'), type: 'success' });
      loadAll();
    } catch (e: any) {
      showToast({ message: t('Failed to unban IP'), type: 'error' });
    }
  };

  const sendBroadcast = async () => {
    if (!broadTitle.trim() || !broadBody.trim()) return;
    setActionLoading(true);
    try {
      const r = await apiClient.post('/admin/super/broadcast', {
        title: broadTitle.trim(),
        body: broadBody.trim(),
        targetRole: broadTargetRole,
        expiresInHours: broadExpires ? parseInt(broadExpires, 10) : undefined,
      });
      showToast({ message: `${t('Sent to')} ${r.data?.data?.sent || 0} ${t('users')}`, type: 'success' });
      setBroadTitle(''); setBroadBody('');
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to broadcast'), type: 'error' });
    } finally { setActionLoading(false); }
  };

  const tabs = [
    { key: 'admins', icon: 'shield-account', label: t('Admins') },
    { key: 'create', icon: 'account-plus', label: t('Create') },
    { key: 'broadcast', icon: 'bullhorn', label: t('Broadcast') },
    { key: 'payments', icon: 'credit-card-outline', label: t('Payments') },
    { key: 'logs', icon: 'clipboard-list', label: t('Audit') },
    { key: 'security', icon: 'security', label: t('Security') },
  ];

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.deniedContainer}>
          <View style={styles.deniedIconCircle}>
            <MaterialCommunityIcons name="shield-lock-outline" size={48} color="#EA4335" />
          </View>
          <Text style={styles.deniedTitle}>{t('Access Denied')}</Text>
          <Text style={styles.deniedText}>{t('Only super administrators can access this secure panel.')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.superIcon}>
            <MaterialCommunityIcons name="shield-star" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.headerTitle}>{t('Super Admin')}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable key={tab.key} style={[styles.tabBtn, isActive && styles.tabBtnActive]} onPress={() => setActiveTab(tab.key)}>
              <MaterialCommunityIcons name={tab.icon as any} size={20} color={isActive ? '#1A73E8' : '#5F6368'} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
      >
        
        {/* Tab: Admins List */}
        {activeTab === 'admins' && (
          <>
            {loading ? <BrutalInkLoader /> : (
              admins.map(a => (
                <View key={a.id} style={styles.card}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(a.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={styles.adminInfo}>
                    <Text style={styles.adminName}>{a.name}</Text>
                    <Text style={styles.adminSub}>{a.phone}</Text>
                  </View>
                  
                  {a.role !== 'SUPER_ADMIN' && (
                    <Pressable onPress={() => removeAdmin(a.id, a.name)} style={styles.iconBtn}>
                      <MaterialCommunityIcons name="delete-outline" size={22} color="#EA4335" />
                    </Pressable>
                  )}
                  {a.role === 'SUPER_ADMIN' && (
                    <View style={styles.ownerBadge}>
                      <Text style={styles.ownerBadgeText}>{t('OWNER')}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* Tab: Create Admin */}
        {activeTab === 'create' && (
          <View style={styles.formContainer}>
            <View style={styles.formIconWrapper}>
              <MaterialCommunityIcons name="shield-account-outline" size={48} color="#1A73E8" />
            </View>
            <Text style={styles.formTitle}>{t('Promote New Admin')}</Text>
            <Text style={styles.formSubtitle}>{t('Grant dashboard access to a trusted team member.')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('Phone Number')}</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.prefix}>+91</Text>
                <TextInput 
                  style={styles.inputField}
                  placeholder={t('9999999999')} 
                  placeholderTextColor="#9AA0A6"
                  value={newPhone} 
                  onChangeText={setNewPhone} 
                  keyboardType="number-pad" 
                  maxLength={10} 
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('Admin Name')}</Text>
              <TextInput
                style={styles.inputStandard}
                placeholder={t('E.g., John Doe')}
                placeholderTextColor="#9AA0A6"
                value={newName}
                onChangeText={setNewName}
              />
            </View>

            <Pressable
              style={[styles.primaryBtn, newPhone.length < 10 && styles.btnDisabled]}
              onPress={makeAdmin}
              disabled={newPhone.length < 10 || actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color="#FFF" />
                  <Text style={styles.primaryBtnText}>{t('Promote to Admin')}</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* Tab: Broadcast */}
        {activeTab === 'broadcast' && (
          <View style={styles.formContainer}>
            <View style={styles.formIconWrapper}>
              <MaterialCommunityIcons name="bullhorn-outline" size={48} color="#FF5C00" />
            </View>
            <Text style={styles.formTitle}>{t('System Broadcast')}</Text>
            <Text style={styles.formSubtitle}>{t('Send targeted notifications with real-time dashboard marquee.')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('Target Audience')}</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['ALL', 'WORKER', 'CUSTOMER'].map((role) => (
                  <Pressable
                    key={role}
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#DDD' },
                      broadTargetRole === role && { backgroundColor: '#FF5C00', borderColor: '#FF5C00' }
                    ]}
                    onPress={() => setBroadTargetRole(role)}
                  >
                    <Text style={[
                      { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#666' },
                      broadTargetRole === role && { color: '#FFF' }
                    ]}>
                      {role === 'ALL' ? t('All Users') : role === 'WORKER' ? t('Workers Only') : t('Customers Only')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('Notification Title')}</Text>
              <TextInput
                style={styles.inputStandard}
                placeholder={t('E.g., System Maintenance')}
                placeholderTextColor="#9AA0A6"
                value={broadTitle}
                onChangeText={setBroadTitle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('Message Body')}</Text>
              <TextInput
                style={[styles.inputStandard, { minHeight: 100, textAlignVertical: 'top' }]}
                placeholder={t('Type your announcement here...')}
                placeholderTextColor="#9AA0A6"
                value={broadBody}
                onChangeText={setBroadBody}
                multiline
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('Show on Dashboard For (hours)')}</Text>
              <TextInput
                style={styles.inputStandard}
                placeholder={t('24 (default)')}
                placeholderTextColor="#9AA0A6"
                value={broadExpires}
                onChangeText={setBroadExpires}
                keyboardType="numeric"
              />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#666', marginTop: 4 }}>{t('Leave empty for 24 hours, max 168 hours (1 week)')}</Text>
            </View>

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: '#FF5C00' }, (!broadTitle.trim() || !broadBody.trim()) && styles.btnDisabled]}
              onPress={sendBroadcast}
              disabled={!broadTitle.trim() || !broadBody.trim() || actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <MaterialCommunityIcons name="send" size={20} color="#FFF" />
                  <Text style={styles.primaryBtnText}>
                    {broadTargetRole === 'ALL' ? t('Send to All Users') :
                     broadTargetRole === 'WORKER' ? t('Send to Workers Only') :
                     t('Send to Customers Only')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* Tab: Payments */}
        {activeTab === 'payments' && (
          <View style={{ gap: 12 }}>
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="shield-check-outline" size={18} color="#1A5C2A" />
              <Text style={styles.infoText}>
                {t('All customer payments settle to the Cashfree merchant account configured in the Cashfree dashboard. The app never holds merchant UPI/bank destinations, so payment routing cannot be tampered with here.')}
              </Text>
            </View>

            {!payConfig && (
              <ActivityIndicator size="large" color="#FF5C00" style={{ marginTop: 24 }} />
            )}

            {payConfig && (
              <>
                {[
                  { label: t('App environment'), value: payConfig.environment },
                  { label: t('Cashfree environment'), value: payConfig.cfEnv, warn: payConfig.isProduction && payConfig.cfEnv !== 'PRODUCTION' },
                  { label: t('Payment credentials'), value: payConfig.paymentsConfigured ? t('Configured') : t('MISSING'), ok: payConfig.paymentsConfigured },
                  { label: t('Payout credentials'), value: payConfig.payoutConfigured ? t('Configured') : t('MISSING'), ok: payConfig.payoutConfigured },
                  { label: t('AutoPay'), value: t('Managed by Cashfree'), ok: true },
                ].map((row) => (
                  <View key={row.label} style={styles.configRow}>
                    <Text style={styles.configLabel}>{row.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.configValue, row.warn && { color: '#C62828' }]}>{row.value}</Text>
                      {row.ok ? (
                        <MaterialCommunityIcons name="check-circle" size={16} color="#2E7D32" />
                      ) : (
                        <MaterialCommunityIcons name="alert-circle" size={16} color="#C62828" />
                      )}
                    </View>
                  </View>
                ))}

                {payConfig.mockPayoutsActive && (
                  <View style={styles.warnCard}>
                    <MaterialCommunityIcons name="alert-outline" size={16} color="#E65100" />
                    <Text style={styles.warnText}>
                      {t('Payout credentials are not configured — worker payouts are in dev-mock mode. Add CF_PAYOUT credentials to the backend env for real payouts.')}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Tab: Logs */}
        {activeTab === 'logs' && (
          <View style={{ gap: 12 }}>
            <Pressable 
              style={[styles.primaryBtn, { backgroundColor: '#1A73E8', marginBottom: 16 }]} 
              onPress={() => router.push('/(admin)/audit')}
            >
              <MaterialCommunityIcons name="account-search-outline" size={20} color="#FFF" />
              <Text style={styles.primaryBtnText}>{t('Search Specific User Logs')}</Text>
            </Pressable>

            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, marginBottom: 8, color: '#202124' }}>{t('Recent System Activity')}</Text>

            {loading ? <BrutalInkLoader /> : (
              logs.length === 0 ? (
                <Text style={styles.emptyText}>{t('No audit logs found')}</Text>
              ) : logs.map((l: any) => (
                <View key={l.id} style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <View style={styles.actionPill}>
                      <Text style={styles.actionPillText}>{t(l.action)}</Text>
                    </View>
                    <Text style={styles.logDate}>
                      {new Date(l.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <Text style={styles.logResource}>{t(l.resource)}: {l.resourceId}</Text>
                  <View style={styles.logFooter}>
                    <MaterialCommunityIcons name="account-circle-outline" size={14} color="#5F6368" />
                    <Text style={styles.logUser}>{t('By')} {l.user?.name || t('Unknown User')}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Tab: Security */}
        {activeTab === 'security' && (
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, marginBottom: 8, color: '#202124' }}>{t('Banned IP Addresses')}</Text>

            {loading ? <BrutalInkLoader /> : (
              bannedIps.length === 0 ? (
                <Text style={styles.emptyText}>{t('No IP bans active.')}</Text>
              ) : bannedIps.map((b: any) => (
                <View key={b.id} style={styles.card}>
                  <View style={[styles.avatar, { backgroundColor: '#FCE8E6' }]}>
                    <MaterialCommunityIcons name="ip-network-outline" size={24} color="#C5221F" />
                  </View>
                  <View style={styles.adminInfo}>
                    <Text style={styles.adminName}>{b.ip}</Text>
                    <Text style={styles.adminSub}>{b.reason || t('No reason provided')}</Text>
                    {b.expiresAt && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#EA4335', marginTop: 4 }}>{t('Expires:')} {new Date(b.expiresAt).toLocaleDateString()}</Text>}
                  </View>
                  <Pressable onPress={() => unbanIp(b.ip)} style={styles.iconBtn}>
                    <MaterialCommunityIcons name="delete-outline" size={22} color="#EA4335" />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  
  deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  deniedIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FCE8E6', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  deniedTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#202124', marginBottom: 8 },
  deniedText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#5F6368', textAlign: 'center', lineHeight: 22 },

  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 20, 
    paddingTop: 16, 
    paddingBottom: 16, 
    backgroundColor: '#F5F0E8', borderBottomWidth: 0
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  superIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#202124', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },

  tabContainer: { flexDirection: 'row', backgroundColor: '#F5F0E8', borderBottomWidth: 0 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', gap: 4 },
  tabBtnActive: { borderBottomColor: '#1A73E8' },
  tabText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#5F6368' },
  tabTextActive: { color: '#1A73E8', fontFamily: 'Inter_600SemiBold' },

  scrollContent: { padding: 16, gap: 12 },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#1A73E8' },
  adminInfo: { flex: 1, marginLeft: 12 },
  adminName: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#202124' },
  adminSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368', marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FCE8E6', justifyContent: 'center', alignItems: 'center' },
  ownerBadge: { backgroundColor: '#202124', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  ownerBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#FFFFFF', letterSpacing: 0.5 },

  formContainer: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  formIconWrapper: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F5F0E8', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 },
  formTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124', textAlign: 'center', marginBottom: 8 },
  formSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#5F6368', textAlign: 'center', marginBottom: 24 },
  
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#202124', marginBottom: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 12, borderWidth: 1, borderColor: '#F1F3F4' },
  prefix: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#5F6368', paddingLeft: 16 },
  inputField: { flex: 1, padding: 14, fontFamily: 'Inter_500Medium', fontSize: 15, color: '#202124' },
  inputStandard: { backgroundColor: '#F5F0E8', borderRadius: 12, borderWidth: 1, borderColor: '#F1F3F4', padding: 14, fontFamily: 'Inter_500Medium', fontSize: 15, color: '#202124' },

  primaryBtn: { flexDirection: 'row', backgroundColor: '#1A73E8', borderRadius: 12, paddingVertical: 14, justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFFFFF' },

  logCard: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, marginBottom: 12, borderWidth: 1, borderColor: '#F1F3F4' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  actionPill: { backgroundColor: '#E8F0FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  actionPillText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#1A73E8', letterSpacing: 0.5 },
  logDate: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#8A8A8A' },
  logResource: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#3C4043', marginBottom: 16, lineHeight: 20 },
  logFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F8F9FA' },
  logUser: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#5F6368' },

  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#8A8A8A', textAlign: 'center', marginTop: 40 },

  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#E8F5E9', borderRadius: 12, padding: 14 },
  infoText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: '#2E5B2E', lineHeight: 17 },
  configRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, elevation: 1 },
  configLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#5F6368' },
  configValue: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#0D0D0D' },
  warnCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFF3E0', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FFE0B2' },
  warnText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, color: '#E65100', lineHeight: 17 },
});
