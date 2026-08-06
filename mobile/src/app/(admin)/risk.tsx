import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, RefreshControl, StyleSheet, Modal, TextInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';

type Tab = 'anomalies' | 'flagged' | 'media';

const SEV_COLOR: Record<string, string> = { high: '#C5221F', medium: '#B06000', low: '#137333' };

export default function AdminRisk() {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('anomalies');
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [flagged, setFlagged] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = async () => {
    try {
      const [a, f, m] = await Promise.all([
        apiClient.get('/risk/anomalies').catch(() => ({ data: { data: [] } })),
        apiClient.get('/risk/flagged-cancellations').catch(() => ({ data: { data: [] } })),
        apiClient.get('/upload/admin/media?limit=40').catch(() => ({ data: { data: [] } })),
      ]);
      setAnomalies(a.data?.data || []);
      setFlagged(f.data?.data || []);
      setMedia(m.data?.data || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const resolveFlag = async (id: string) => {
    setResolving(id);
    try {
      await apiClient.patch(`/risk/cancellations/${id}/resolve`, { note: note || 'Reviewed by admin' });
      setNote('');
      load();
    } catch {} finally { setResolving(null); }
  };

  const deleteMedia = async (id: string) => {
    try {
      await apiClient.delete(`/upload/admin/media/${id}`);
      load();
    } catch {}
  };

  if (loading) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.center}><BrutalInkLoader /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Risk & Anomalies')}</Text>
      </View>

      <View style={styles.tabRow}>
        {(['anomalies', 'flagged', 'media'] as Tab[]).map(tb => (
          <Pressable key={tb} style={[styles.tab, tab === tb && styles.tabActive]} onPress={() => setTab(tb)}>
            <Text style={[styles.tabText, tab === tb && styles.tabTextActive]}>
              {tb === 'anomalies' ? t('Anomalies') : tb === 'flagged' ? t('Farming Flags') : t('Media')}
            </Text>
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
        {tab === 'anomalies' && (
          <>
            <Text style={styles.hint}>{t('Suspicious market patterns  — auto-detected, thresholds configurable.')}</Text>
            {anomalies.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="shield-check-outline" size={48} color="#8A8A8A" />
                <Text style={styles.emptyText}>{t('No anomalies detected')}</Text>
              </View>
            ) : anomalies.map((a: any, i: number) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.type}>{a.type ? t(a.type.replace(/_/g, ' ')) : undefined}</Text>
                  <View style={[styles.sevPill, { backgroundColor: (SEV_COLOR[a.severity] || '#137333') + '20' }]}>
                    <Text style={[styles.sevText, { color: SEV_COLOR[a.severity] || '#137333' }]}>{t(a.severity)}</Text>
                  </View>
                </View>
                <Text style={styles.detail}>{a.detail}</Text>
              </View>
            ))}
          </>
        )}

        {tab === 'flagged' && (
          <>
            <Text style={styles.hint}>{t('Repeated request→accept→travel→cancel patterns . Compensation is held pending review.')}</Text>
            {flagged.length === 0 ? (
              <View style={styles.empty}><MaterialCommunityIcons name="check-decagram-outline" size={48} color="#8A8A8A" /><Text style={styles.emptyText}>{t('No flagged cancellations')}</Text></View>
            ) : flagged.map((f: any) => (
              <View key={f.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.type}>{f.reviewFlag ? t(f.reviewFlag.replace(/_/g, ' ')) : undefined}</Text>
                  <Text style={styles.date}>{new Date(f.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.detail}>{t('Booking')} #{f.booking?.bookingNumber} · {t('comp')} ₹{f.workerCompensation || 0}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder={t('Review note')}
                    placeholderTextColor="#9AA0A6"
                    value={note}
                    onChangeText={setNote}
                  />
                  <Pressable style={styles.submitBtn} onPress={() => resolveFlag(f.id)} disabled={resolving === f.id}>
                    {resolving === f.id ? <Text style={styles.submitText}>…</Text> : <Text style={styles.submitText}>{t('Resolve')}</Text>}
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'media' && (
          <>
            <Text style={styles.hint}>{t('Uploaded media by purpose — moderation / removal .')}</Text>
            {media.length === 0 ? (
              <View style={styles.empty}><MaterialCommunityIcons name="image-off-outline" size={48} color="#8A8A8A" /><Text style={styles.emptyText}>{t('No media uploaded')}</Text></View>
            ) : media.map((m: any) => (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.type}>{m.purpose || t('general')} · {m.mime}</Text>
                  <Text style={styles.date}>{new Date(m.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.detail}>
                  {m.uploadedByUser?.name || t('Unknown')} · {(m.size / 1024).toFixed(0)}KB · {(m.requestId ? t('request') : m.bookingId ? t('booking') : t('orphan'))}
                </Text>
                <Pressable style={[styles.submitBtn, { backgroundColor: '#C5221F' }]} onPress={() => deleteMedia(m.id)}>
                  <Text style={styles.submitText}>{t('Remove')}</Text>
                </Pressable>
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
  hint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#8A8A8A', marginBottom: 4 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, elevation: 1, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124', textTransform: 'uppercase' },
  detail: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368' },
  date: { fontFamily: 'SpaceMono_400Regular', fontSize: 10, color: '#8A8A8A' },
  sevPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sevText: { fontFamily: 'Inter_700Bold', fontSize: 10, textTransform: 'uppercase' },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, fontFamily: 'Inter_400Regular', fontSize: 13, color: '#202124' },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FF5C00', alignItems: 'center', justifyContent: 'center' },
  submitText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FFF' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#8A8A8A' },
});
