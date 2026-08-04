import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useRouter } from 'expo-router';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';

export default function AdminLeads() {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [planFilter, setPlanFilter] = useState('ALL');

  const load = useCallback(async () => {
    const res = await apiClient.get('/admin/leads').catch(() => ({ data: { data: [] } }));
    setRows(res.data?.data || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = planFilter === 'ALL' ? rows : rows.filter((r) => r.plan === planFilter);
  const freeOverLimit = rows.filter((r) => r.plan === 'FREE' && r.leadsUsed >= r.limit).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Worker Leads')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{rows.length}</Text>
          <Text style={styles.summaryLabel}>{t('Workers')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{rows.reduce((s, r) => s + (r.leadsUsed || 0), 0)}</Text>
          <Text style={styles.summaryLabel}>{t('Leads used')}</Text>
        </View>
        <View style={[styles.summaryItem, { borderRightWidth: 0 }]}>
          <Text style={[styles.summaryValue, { color: '#C62828' }]}>{freeOverLimit}</Text>
          <Text style={styles.summaryLabel}>{t('At/over limit')}</Text>
        </View>
      </View>

      {/* Plan filter */}
      <View style={styles.filterRow}>
        {['ALL', 'FREE', 'PRO', 'ELITE'].map((f) => (
          <Pressable key={f} style={[styles.chip, planFilter === f && styles.chipActive]} onPress={() => setPlanFilter(f)}>
            <Text style={[styles.chipText, planFilter === f && styles.chipTextActive]}>{t(f)}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <SkeletonCard rows={5} avatar />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="link-off" size={40} color="#C8C0B0" />
              <Text style={styles.emptyText}>{t('No workers found')}</Text>
            </View>
          ) : (
            filtered.map((r) => {
              const isFree = r.plan === 'FREE';
              const over = isFree && r.leadsUsed >= r.limit;
              return (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={[styles.avatar, { backgroundColor: isFree ? '#F1F3F4' : '#FFF0E8' }]}>
                      <MaterialCommunityIcons name="account-hard-hat" size={18} color={isFree ? '#6B6B6B' : '#FF5C00'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.phone}>{r.phone}</Text>
                    </View>
                    <View style={[styles.planPill, { backgroundColor: isFree ? '#F1F3F4' : '#FFF0E8' }]}>
                      <Text style={[styles.planText, { color: isFree ? '#5F6368' : '#FF5C00' }]}>{t(r.plan)}</Text>
                    </View>
                  </View>
                  <View style={styles.usageRow}>
                    <Text style={styles.usageLabel}>
                      {isFree ? `${t('Leads this month:')} ${r.leadsUsed} / ${r.limit}` : `${t('Leads this month:')} ${r.leadsUsed} · ${t('Unlimited')}`}
                    </Text>
                    {over && <Text style={styles.overBadge}>{t('At limit')}</Text>}
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: isFree ? `${Math.min((r.leadsUsed / r.limit) * 100, 100)}%` : '100%', backgroundColor: over ? '#C62828' : '#FF5C00' }]} />
                  </View>
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' },
  summaryRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', marginHorizontal: 20, borderRadius: 12, paddingVertical: 14, elevation: 1 },
  summaryItem: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#F0EBE0' },
  summaryValue: { fontFamily: 'SpaceMono_700Bold', fontSize: 18, color: '#0D0D0D' },
  summaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#6B6B6B', marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0D8CC' },
  chipActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#6B6B6B' },
  chipTextActive: { color: '#FFFFFF' },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40, gap: 10 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#8A8478' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, elevation: 1, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' },
  phone: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginTop: 1 },
  planPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  planText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usageLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#5F6368' },
  overBadge: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#C62828' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#F0EBE0', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
