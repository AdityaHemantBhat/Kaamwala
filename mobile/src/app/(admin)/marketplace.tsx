import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';

type Tab = 'flags' | 'analytics' | 'observations';

export default function AdminMarketplace() {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('flags');
  const [flags, setFlags] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [f, a, o] = await Promise.all([
        apiClient.get('/admin-marketplace/flags').catch(() => ({ data: { data: { flags: {} } } })),
        apiClient.get('/admin-marketplace/analytics?hours=24').catch(() => ({ data: { data: { byType: [] } } })),
        apiClient.get('/admin-marketplace/observations?limit=50').catch(() => ({ data: { data: [] } })),
      ]);
      setFlags(f.data?.data?.flags || {});
      setAnalytics(a.data?.data?.byType || []);
      setObservations(o.data?.data || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleFlag = async (flag: string, enabled: boolean) => {
    try {
      await apiClient.put(`/admin-marketplace/flags/${flag}`, { enabled });
      setFlags((prev: any) => ({ ...prev, [flag]: enabled }));
    } catch {}
  };

  const originColor = (o: string) => {
    const map: Record<string, string> = { COMPLETED_SERVICE: '#137333', FINAL_AGREED: '#1A73E8', CUSTOMER_ENTERED: '#B06000' };
    return map[o] || '#5F6368';
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
        <Text style={styles.headerTitle}>{t('Marketplace')}</Text>
      </View>

      <View style={styles.tabRow}>
        {(['flags', 'analytics', 'observations'] as Tab[]).map(tb => (
          <Pressable key={tb} style={[styles.tab, tab === tb && styles.tabActive]} onPress={() => setTab(tb)}>
            <Text style={[styles.tabText, tab === tb && styles.tabTextActive]}>{t(tb.charAt(0).toUpperCase() + tb.slice(1))}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
      >
        {tab === 'flags' && (
          <>
            <Text style={styles.sectionHint}>{t('Controlled feature rollout (backend-authoritative, audited)')}</Text>
            {flags && Object.entries(flags).map(([key, val]) => (
              <View key={key} style={styles.card}>
                <View style={styles.flagRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.flagName}>{t(key.replace(/_/g, ' '))}</Text>
                  </View>
                  <Switch
                    value={!!val}
                    onValueChange={v => toggleFlag(key, v)}
                    trackColor={{ true: '#FF5C00' }}
                    thumbColor="#FFF"
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'analytics' && (
          <>
            <Text style={styles.sectionHint}>{t('Marketplace events — last 24h (informational, not financial truth)')}</Text>
            {analytics.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="chart-line" size={40} color="#D2D2D2" />
                <Text style={styles.emptyText}>{t('No events yet')}</Text>
              </View>
            ) : analytics.map((a: any) => (
              <View key={a.type} style={styles.card}>
                <View style={styles.flagRow}>
                  <Text style={styles.flagName}>{t(a.type.replace(/_/g, ' '))}</Text>
                  <View style={styles.countBadge}><Text style={styles.countText}>{a._count}</Text></View>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'observations' && (
          <>
            <Text style={styles.sectionHint}>{t('Raw pricing observations (risk-aware, recommendation-exposed flagged)')}</Text>
            {observations.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="chart-box-outline" size={40} color="#D2D2D2" />
                <Text style={styles.emptyText}>{t('No observations yet')}</Text>
              </View>
            ) : observations.map((o: any) => (
              <View key={o.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.catName}>{o.category ? t(o.category.replace(/_/g, ' ')) : undefined} · {o.zone || t('global')}</Text>
                  <View style={[styles.originPill, { backgroundColor: originColor(o.origin) + '20' }]}>
                    <Text style={[styles.originText, { color: originColor(o.origin) }]}>{o.origin ? t(o.origin.replace(/_/g, ' ')) : undefined}</Text>
                  </View>
                </View>
                <View style={styles.metricRow}>
                  <View style={styles.metric}><Text style={styles.metricValue}>₹{o.unitRate}</Text><Text style={styles.metricLabel}>{t('Rate')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{o.pricingUnit}</Text><Text style={styles.metricLabel}>{t('Unit')}</Text></View>
                  <View style={styles.metric}><Text style={styles.metricValue}>{Math.round((o.riskScore || 0) * 100)}%</Text><Text style={styles.metricLabel}>{t('Risk')}</Text></View>
                </View>
                {(o.recommendationExposed || o.experimentVersion) && (
                  <View style={styles.warnRow}>
                    {o.recommendationExposed && <Text style={styles.warnText}>{t('⚠ recommendation-exposed')}</Text>}
                    {o.experimentVersion && <Text style={styles.warnText}>{t('· A/B')} {o.experimentVersion}</Text>}
                  </View>
                )}
                <Text style={styles.meta}>{new Date(o.observedAt).toLocaleDateString()} {new Date(o.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, elevation: 1, gap: 8 },
  flagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flagName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124', textTransform: 'capitalize' },
  countBadge: { backgroundColor: '#FF5C00', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  countText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFF' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124', textTransform: 'capitalize' },
  originPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  originText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.3 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, padding: 8 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#202124' },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: '#8A8A8A', marginTop: 2 },
  warnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  warnText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#B06000' },
  meta: { fontFamily: 'SpaceMono_400Regular', fontSize: 10, color: '#8A8A8A' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#8A8A8A' },
});
