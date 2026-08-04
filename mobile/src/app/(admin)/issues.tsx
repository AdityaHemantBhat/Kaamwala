import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';

type Tab = 'established' | 'candidates' | 'archived';

const CATEGORIES = ['PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER', 'PAINTER', 'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER', 'COOK', 'TUTOR', 'SECURITY_GUARD', 'NURSE', 'BABYSITTER'];

export default function AdminIssues() {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('established');
  const [category, setCategory] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newIssue, setNewIssue] = useState({ canonicalId: '', label: '', category: 'PLUMBER', aliases: '' });

  const load = async () => {
    try {
      let r;
      if (tab === 'candidates') {
        const params: any = { lifecycle: 'CANDIDATE' };
        if (category) params.category = category;
        r = await apiClient.get('/issues/admin/candidates', { params });
      } else {
        const params: any = {};
        if (category) params.category = category;
        if (tab === 'archived') params.lifecycle = 'ARCHIVED';
        r = await apiClient.get('/issues/admin/list', { params });
      }
      setData(r.data?.data || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, [tab, category]);

  const setLifecycle = async (id: string, lifecycle: string) => {
    try { await apiClient.patch(`/issues/admin/${id}/lifecycle`, { lifecycle }); load(); } catch {}
  };

  const resolveCandidate = async (candidateId: string, action: string, issueId?: string) => {
    try { await apiClient.post('/issues/admin/resolve-candidate', { candidateId, action, issueId }); load(); } catch {}
  };

  const createIssue = async () => {
    if (!newIssue.canonicalId || !newIssue.label) return;
    try {
      await apiClient.post('/issues/admin/create', {
        category: newIssue.category,
        canonicalId: newIssue.canonicalId,
        label: newIssue.label,
        aliases: newIssue.aliases.split(',').map(s => s.trim()).filter(Boolean),
      });
      setShowCreate(false);
      setNewIssue({ canonicalId: '', label: '', category: 'PLUMBER', aliases: '' });
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
        <Text style={styles.headerTitle}>{t('Issues')}</Text>
        <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>{data.length}</Text></View>
        {tab === 'established' && (
          <Pressable style={styles.addBtn} onPress={() => setShowCreate(true)}>
            <MaterialCommunityIcons name="plus" size={18} color="#FFF" />
          </Pressable>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['established', 'candidates', 'archived'] as Tab[]).map((tabKey) => (
          <Pressable key={tabKey} style={[styles.tab, tab === tabKey && styles.tabActive]} onPress={() => setTab(tabKey)}>
            <Text style={[styles.tabText, tab === tabKey && styles.tabTextActive]}>{t(tabKey.charAt(0).toUpperCase() + tabKey.slice(1))}</Text>
          </Pressable>
        ))}
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        <Pressable style={[styles.catChip, !category && styles.catChipActive]} onPress={() => setCategory('')}>
          <Text style={[styles.catText, !category && styles.catTextActive]}>{t('All')}</Text>
        </Pressable>
        {CATEGORIES.map(c => (
          <Pressable key={c} style={[styles.catChip, category === c && styles.catChipActive]} onPress={() => setCategory(c)}>
            <Text style={[styles.catText, category === c && styles.catTextActive]}>{t(c.replace(/_/g, ' '))}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
      >
        {data.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="tag-multiple-outline" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No issues found')}</Text>
          </View>
        ) : data.map((item: any) => (
          <View key={item.id} style={styles.card}>
            {tab === 'candidates' ? (
              <>
                <View style={styles.cardTop}>
                  <View style={styles.iconCircle}><MaterialCommunityIcons name="lightbulb-outline" size={18} color="#FF5C00" /></View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.issueLabel}>{item.phrase}</Text>
                    <Text style={styles.issueMeta}>{t(item.category)} · {item.occurrenceCount}× · {item.uniqueUsers} {t('users')} · {t('risk')} {item.riskScore}</Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <Pressable style={styles.dangerBtn} onPress={() => resolveCandidate(item.id, 'reject')}>
                    <Text style={styles.dangerText}>{t('Reject')}</Text>
                  </Pressable>
                  <Pressable style={styles.approveBtn} onPress={() => {
                    // Promote as standalone issue
                    (async () => {
                      try {
                        await apiClient.post('/issues/admin/create', { category: item.category, canonicalId: item.phrase.replace(/\s+/g, '_').toUpperCase(), label: item.phrase.replace(/\b\w/g, (c: string) => c.toUpperCase()) });
                        await resolveCandidate(item.id, 'approve', '');
                        load();
                      } catch {}
                    })();
                  }}>
                    <Text style={styles.approveText}>{t('Promote')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.cardTop}>
                  <View style={styles.iconCircle}><MaterialCommunityIcons name="tag-outline" size={18} color="#1A73E8" /></View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.issueLabel}>{item.label}</Text>
                    <Text style={styles.issueCanonical}>{item.canonicalId} · {t(item.category)}</Text>
                    {item.aliases?.length > 0 && (
                      <View style={styles.aliasRow}>
                        {item.aliases.slice(0, 4).map((a: any) => (
                          <View key={a.alias} style={styles.aliasChip}><Text style={styles.aliasText}>{a.alias}</Text></View>
                        ))}
                      </View>
                    )}
                    <Text style={styles.issueMeta}>{item.usageCount} {t('uses')} · {item.uniqueUsers} {t('users')} · {item.completedCount} {t('completed')}</Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  {item.lifecycle === 'ESTABLISHED' ? (
                    <Pressable style={styles.warnBtn} onPress={() => setLifecycle(item.id, 'ARCHIVED')}>
                      <Text style={styles.warnText}>{t('Archive')}</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.approveBtn} onPress={() => setLifecycle(item.id, 'ESTABLISHED')}>
                      <Text style={styles.approveText}>{t('Reactivate')}</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('New Issue')}</Text>
            <TextInput style={styles.input} placeholder={t('Canonical ID (e.g. TAP_INSTALLATION)')} placeholderTextColor="#9AA0A6" value={newIssue.canonicalId} onChangeText={s => setNewIssue({ ...newIssue, canonicalId: s })} autoCapitalize="characters" />
            <TextInput style={styles.input} placeholder={t('Display Label')} placeholderTextColor="#9AA0A6" value={newIssue.label} onChangeText={s => setNewIssue({ ...newIssue, label: s })} />
            <TextInput style={styles.input} placeholder={t('Aliases (comma separated)')} placeholderTextColor="#9AA0A6" value={newIssue.aliases} onChangeText={s => setNewIssue({ ...newIssue, aliases: s })} />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setShowCreate(false)}><Text style={styles.cancelText}>{t('Cancel')}</Text></Pressable>
              <Pressable style={styles.submitBtn} onPress={createIssue}><Text style={styles.submitText}>{t('Create')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', elevation: 1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#202124', flex: 1 },
  headerBadge: { backgroundColor: '#0D0D0D', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  headerBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFF' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center' },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAE2D6' },
  tabActive: { backgroundColor: '#0D0D0D', borderColor: '#0D0D0D' },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#5F6368' },
  tabTextActive: { color: '#FFF' },
  catRow: { paddingHorizontal: 20, paddingBottom: 10, gap: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EAE2D6' },
  catChipActive: { backgroundColor: '#FF5C00', borderColor: '#FF5C00' },
  catText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#5F6368' },
  catTextActive: { color: '#FFF' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 10 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 16 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#8A8A8A' },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, elevation: 1, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F0FE', justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1 },
  issueLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124' },
  issueCanonical: { fontFamily: 'SpaceMono_400Regular', fontSize: 10, color: '#8A8A8A', marginTop: 2 },
  aliasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  aliasChip: { backgroundColor: '#F5F0E8', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  aliasText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: '#5F6368' },
  issueMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', marginTop: 6 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F3F4' },
  dangerBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FCE8E6', alignItems: 'center' },
  dangerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#C5221F' },
  warnBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FEF7E0', alignItems: 'center' },
  warnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#B06000' },
  approveBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#E6F4EA', alignItems: 'center' },
  approveText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#137333' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, gap: 12 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#202124', textAlign: 'center', marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#202124' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F3F4', alignItems: 'center' },
  cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#5F6368' },
  submitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#FF5C00', alignItems: 'center' },
  submitText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFF' },
});
