import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, RefreshControl, StyleSheet, TextInput, Modal } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';
import { useAuthStore } from '../../store/auth.store';

type Tab = 'market' | 'seed' | 'floors' | 'urgent' | 'audit';

const CATEGORIES = ['PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER', 'PAINTER', 'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER', 'COOK', 'TUTOR', 'SECURITY_GUARD', 'NURSE', 'BABYSITTER'];

export default function AdminPricing() {
  const t = useT();
  const router = useRouter();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<Tab>('market');
  const [market, setMarket] = useState<any[]>([]);
  const [urgent, setUrgent] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [seeds, setSeeds] = useState<Record<string, string>>({});
  const [floors, setFloors] = useState<any>({ minHourly: '150', perCategory: {} });
  const [floorConfirm, setFloorConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ urgentMultiplier: '', searchRoundSeconds: '', maxOfferMultiplier: '', cancellationCompensation: '', maxBoostAmount: '', warrantyMonths: '' });

  const load = async () => {
    try {
      const [m, u, a, s, f] = await Promise.all([
        apiClient.get('/admin-pricing/market').catch(() => ({ data: { data: [] } })),
        apiClient.get('/admin-pricing/urgent-settings').catch(() => ({ data: { data: {} } })),
        apiClient.get('/admin-pricing/audit?limit=30').catch(() => ({ data: { data: [] } })),
        apiClient.get('/admin-pricing/seed').catch(() => ({ data: { data: { seeds: {} } } })),
        apiClient.get('/admin-pricing/floors').catch(() => ({ data: { data: { minHourly: 150, perCategory: {} } } })),
      ]);
      setMarket(m.data?.data || []);
      const uData = u.data?.data || {};
      setUrgent(uData);
      setForm({
        urgentMultiplier: String(uData.urgentMultiplier || 1.3),
        searchRoundSeconds: String(uData.searchRoundSeconds || 300),
        maxOfferMultiplier: String(uData.maxOfferMultiplier || 3),
        cancellationCompensation: String(uData.cancellationCompensation || 50),
        maxBoostAmount: String(uData.maxBoostAmount || 1000),
        warrantyMonths: String(uData.warrantyMonths ?? 3),
      });
      setAudit(a.data?.data || []);
      const seedData = s.data?.data?.seeds || {};
      setSeeds(Object.fromEntries(CATEGORIES.map(c => [c, seedData[c] != null ? String(seedData[c]) : ''])));
      const floorData = f.data?.data || { minHourly: 150, perCategory: {} };
      setFloors({ minHourly: String(floorData.minHourly ?? 150), perCategory: floorData.perCategory || {} });
      setFloorConfirm(false);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const saveSeeds = async () => {
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      for (const c of CATEGORIES) {
        const v = seeds[c];
        if (v && !isNaN(Number(v))) payload[c] = Number(v);
      }
      await apiClient.put('/admin-pricing/seed', { seeds: payload });
      load();
    } catch (e: any) { alert(e?.response?.data?.error || t('Failed to save seeds')); }
    finally { setSaving(false); }
  };

  const saveFloors = async () => {
    setSaving(true);
    try {
      const perCategory: Record<string, number> = {};
      for (const c of CATEGORIES) {
        const v = (floors.perCategory || {})[c];
        if (v && !isNaN(Number(v))) perCategory[c] = Number(v);
      }
      await apiClient.put('/admin-pricing/floors', {
        minHourly: Number(floors.minHourly),
        perCategory,
        confirm: floorConfirm,
      });
      setFloorConfirm(false);
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.error || '';
      if (msg.includes('EXTREME_CHANGE')) {
        setFloorConfirm(true);
        alert(msg.split('|')[1] || t('Large change detected. Save again to confirm.'));
      } else {
        alert(msg || t('Failed to save floors'));
      }
    } finally { setSaving(false); }
  };

  const saveUrgent = async () => {
    try {
      const payload: any = {
        urgentMultiplier: parseFloat(form.urgentMultiplier),
        searchRoundSeconds: parseInt(form.searchRoundSeconds),
        maxOfferMultiplier: parseInt(form.maxOfferMultiplier),
        maxBoostAmount: parseFloat(form.maxBoostAmount),
        warrantyMonths: parseInt(form.warrantyMonths),
      };
      if (isSuperAdmin) payload.cancellationCompensation = parseFloat(form.cancellationCompensation);
      await apiClient.put('/admin-pricing/urgent-settings', payload);
      setEditing(false);
      load();
    } catch {}
  };

  if (loading) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}><BrutalInkLoader /></View>
    </SafeAreaView>
  );

  const confColor = (c: number) => c >= 60 ? '#137333' : c >= 30 ? '#B06000' : '#C5221F';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Market Pricing')}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['market', 'seed', 'floors', 'urgent', 'audit'] as Tab[]).map(tb => (
          <Pressable key={tb} style={[styles.tab, tab === tb && styles.tabActive]} onPress={() => setTab(tb)}>
            <Text style={[styles.tabText, tab === tb && styles.tabTextActive]}>{tb === 'market' ? t('Market') : tb === 'seed' ? t('Seeds') : tb === 'floors' ? t('Floors') : tb === 'urgent' ? t('Urgent') : t('Audit')}</Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
      >
        {tab === 'market' && (
          <>
            <Text style={styles.sectionHint}>{t('Live market references by category (backend-computed, confidence-weighted)')}</Text>
            {market.map((m: any) => (
              <View key={m.category} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.catName}>{t(m.category.replace(/_/g, ' '))}</Text>
                  <View style={[styles.confPill, { backgroundColor: confColor(m.confidence || 0) + '20' }]}>
                    <Text style={[styles.confText, { color: confColor(m.confidence || 0) }]}>{m.confidence || 0}% {t('conf')}</Text>
                  </View>
                </View>
                <View style={styles.metricRow}>
                  <View style={styles.metric}><Text style={styles.metricValue}>₹{m.reference ?? '—'}</Text><Text style={styles.metricLabel}>{t('Reference')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{m.sample || 0}</Text><Text style={styles.metricLabel}>{t('Sample')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{m.effectiveSample || 0}</Text><Text style={styles.metricLabel}>{t('Effective')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>₹{m.currentAvg || 0}</Text><Text style={styles.metricLabel}>{t('Avg')}</Text></View>
                </View>
                <Text style={styles.meta}>{m.fallbackSource || '—'} · v{m.algorithmVersion?.split('_').pop() || '?'}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'seed' && (
          <>
            <Text style={styles.sectionHint}>{t('Researched seed/reference prices (₹, flat) — used when local evidence is thin. Never invented automatically .')}</Text>
            <View style={styles.card}>
              {CATEGORIES.map(c => (
                <View key={c} style={styles.settingRow}>
                  <Text style={styles.settingLabel}>{t(c.replace(/_/g, ' '))}</Text>
                  <TextInput
                    style={[styles.input, { width: 110, paddingVertical: 8 }]}
                    value={seeds[c]}
                    onChangeText={s => setSeeds({ ...seeds, [c]: s })}
                    keyboardType="numeric"
                    placeholder="—"
                    placeholderTextColor="#9AA0A6"
                  />
                </View>
              ))}
              <Pressable style={styles.submitBtn} onPress={saveSeeds} disabled={saving}>
                {saving ? <Text style={styles.submitText}>{t('Saving…')}</Text> : <Text style={styles.submitText}>{t('Save Seeds')}</Text>}
              </Pressable>
            </View>
          </>
        )}

        {tab === 'floors' && (
          <>
            <Text style={styles.sectionHint}>{t('Platform minimum floors — independent from market reference (no ratcheting, ). Extreme changes need confirmation.')}</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>{t('Min Hourly Floor (₹/hr)')}</Text>
                <TextInput
                  style={[styles.input, { width: 110, paddingVertical: 8 }]}
                  value={floors.minHourly}
                  onChangeText={s => setFloors({ ...floors, minHourly: s })}
                  keyboardType="numeric"
                />
              </View>
              {CATEGORIES.map(c => (
                <View key={c} style={styles.settingRow}>
                  <Text style={styles.settingLabel}>{t(c.replace(/_/g, ' '))} {t('flat override (₹)')}</Text>
                  <TextInput
                    style={[styles.input, { width: 110, paddingVertical: 8 }]}
                    value={(floors.perCategory || {})[c] != null ? String((floors.perCategory || {})[c]) : ''}
                    onChangeText={s => setFloors({ ...floors, perCategory: { ...(floors.perCategory || {}), [c]: s } })}
                    keyboardType="numeric"
                    placeholder={t('auto')}
                    placeholderTextColor="#9AA0A6"
                  />
                </View>
              ))}
              {floorConfirm && (
                <Text style={[styles.meta, { color: '#C5221F' }]}>{t('⚠ Large change detected — press Save again to confirm.')}</Text>
              )}
              <Pressable style={styles.submitBtn} onPress={saveFloors} disabled={saving}>
                {saving ? <Text style={styles.submitText}>{t('Saving…')}</Text> : <Text style={styles.submitText}>{t('Save Floors')}</Text>}
              </Pressable>
            </View>
          </>
        )}

        {tab === 'urgent' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('Urgent Settings')}</Text>
              {!editing && (
                <Pressable style={styles.editBtn} onPress={() => setEditing(true)}>
                  <MaterialCommunityIcons name="pencil" size={14} color="#FFF" /><Text style={styles.editText}>{t('Edit')}</Text>
                </Pressable>
              )}
            </View>

            {editing ? (
              <View style={styles.card}>
                {[
                  { key: 'urgentMultiplier', label: t('Urgent Multiplier'), hint: t('1.0–5.0 (default 1.3)') },
                  { key: 'searchRoundSeconds', label: t('Search Round (seconds)'), hint: t('30–1800 (default 300)') },
                  { key: 'maxOfferMultiplier', label: t('Max Offer × Base'), hint: t('1–10 (default 3)') },
                  { key: 'maxBoostAmount', label: t('Max Single Boost ₹'), hint: t('Per offer increase') },
                  { key: 'cancellationCompensation', label: t('Travel Compensation ₹'), hint: t('Worker compensation'), locked: !isSuperAdmin },
                  { key: 'warrantyMonths', label: t('Warranty (months)'), hint: t('0–24 (0 = off, default 3)') },
                ].map(f => (
                  <View key={f.key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput
                      style={[styles.input, f.locked && { backgroundColor: '#F1F3F4', color: '#9AA0A6' }]}
                      value={(form as any)[f.key]}
                      onChangeText={s => setForm({ ...form, [f.key]: s })}
                      editable={!f.locked}
                      keyboardType="numeric"
                      placeholder={f.hint}
                      placeholderTextColor="#9AA0A6"
                    />
                    {f.locked && <Text style={{ fontSize: 11, fontFamily: 'Inter_500Medium', color: '#B06000', marginTop: 4 }}>{t('Only super admins can change the cancellation fee.')}</Text>}
                  </View>
                ))}
                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => { setEditing(false); load(); }}><Text style={styles.cancelText}>{t('Cancel')}</Text></Pressable>
                  <Pressable style={styles.submitBtn} onPress={saveUrgent}><Text style={styles.submitText}>{t('Save')}</Text></Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                {[
                  { label: t('Urgent Multiplier'), value: `${urgent?.urgentMultiplier ?? 1.3}x` },
                  { label: t('Search Round'), value: `${urgent?.searchRoundSeconds ?? 300}s` },
                  { label: t('Max Offer × Base'), value: `${urgent?.maxOfferMultiplier ?? 3}x` },
                  { label: t('Max Single Boost'), value: `₹${urgent?.maxBoostAmount ?? 1000}` },
                  { label: t('Travel Compensation'), value: `₹${urgent?.cancellationCompensation ?? 50}` },
                  { label: t('Warranty'), value: `${urgent?.warrantyMonths ?? 3} ${t('month')}${(urgent?.warrantyMonths ?? 3) === 1 ? '' : 's'}` },
                ].map((r, i) => (
                  <View key={i} style={styles.settingRow}>
                    <Text style={styles.settingLabel}>{r.label}</Text>
                    <Text style={styles.settingValue}>{r.value}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'audit' && (
          <>
            <Text style={styles.sectionHint}>{t('Pricing audit trail — why each reference existed')}</Text>
            {audit.map((a: any) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.catName}>{a.category ? t(a.category.replace(/_/g, ' ')) : undefined} · {a.pricingUnit}</Text>
                  <Text style={styles.meta}>{new Date(a.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={styles.metricRow}>
                  <View style={styles.metric}><Text style={styles.metricValue}>₹{a.referencePrice}</Text><Text style={styles.metricLabel}>{t('Reference')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{a.confidence}%</Text><Text style={styles.metricLabel}>{t('Conf')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{a.effectiveSample}</Text><Text style={styles.metricLabel}>{t('Sample')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{a.fallbackSource}</Text><Text style={styles.metricLabel}>{t('Fallback')}</Text></View>
                </View>
                <Text style={styles.meta}>{a.zone || t('global')} · {a.algorithmVersion}</Text>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, elevation: 1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#202124' },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAE2D6' },
  tabActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#5F6368' },
  tabTextActive: { color: '#FFF' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 },
  sectionHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#8A8A8A', marginBottom: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#202124' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF5C00', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  editText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FFF' },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, elevation: 1, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124', textTransform: 'capitalize' },
  confPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  confText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, padding: 8 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#202124' },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: '#8A8A8A', marginTop: 2 },
  meta: { fontFamily: 'SpaceMono_400Regular', fontSize: 10, color: '#8A8A8A' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F3F4' },
  settingLabel: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368' },
  settingValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#202124' },
  field: { gap: 4, marginBottom: 8 },
  fieldLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368' },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#202124' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F3F4', alignItems: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#5F6368' },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FF5C00', alignItems: 'center' },
  submitText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFF' },
});
