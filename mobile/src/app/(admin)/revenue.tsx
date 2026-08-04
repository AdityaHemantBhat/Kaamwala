import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';

const { width } = Dimensions.get('window');

export default function AdminRevenue() {
  const t = useT();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { 
      const r = await apiClient.get('/admin/revenue'); 
      setData(r.data?.data); 
    } catch {} finally { 
      setLoading(false); 
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}><BrutalInkLoader /></View>
      </SafeAreaView>
    );
  }

  const fmt = (n: number) => (n || 0).toLocaleString('en-IN');
  const breakdown = data?.breakdown;
  const subscribers = data?.subscribers;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Financials')}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0F9D58" />}
      >
        {data && (
          <>
            {/* Master Revenue Card */}
            <View style={[styles.card, { backgroundColor: '#1A73E8', overflow: 'hidden' }]}>
              <View style={styles.cardBgDecor} />
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardSubtitle, { color: '#E8F0FE' }]}>{t('Total Platform Revenue')}</Text>
                <View style={styles.iconCircleWhite}>
                  <MaterialCommunityIcons name="chart-line" size={16} color="#1A73E8" />
                </View>
              </View>
              <Text style={[styles.amountHero, { color: '#FFFFFF' }]}>
                ₹{fmt(data.totalRevenue)}
              </Text>
            </View>

            {/* Sub-Stats Row */}
            <View style={styles.statsRow}>
              <View style={[styles.card, styles.subCard]}>
                <View style={[styles.iconCircleSmall, { backgroundColor: '#E6F4EA' }]}>
                  <MaterialCommunityIcons name="calendar-month" size={16} color="#0F9D58" />
                </View>
                <Text style={styles.subCardTitle}>{t('This Month')}</Text>
                <Text style={styles.subCardAmount}>₹{fmt(data.monthlyRevenue)}</Text>
              </View>

              <View style={[styles.card, styles.subCard]}>
                <View style={[styles.iconCircleSmall, { backgroundColor: '#FCE8E6' }]}>
                  <MaterialCommunityIcons name="percent" size={16} color="#EA4335" />
                </View>
                <Text style={styles.subCardTitle}>{t('GMV This Month')}</Text>
                <Text style={styles.subCardAmount}>₹{fmt(data.monthlyFees)}</Text>
              </View>
            </View>

            {/* ──── Revenue Breakdown ──── */}
            {breakdown && (
              <View style={[styles.card, { padding: 0, marginTop: 8 }]}>
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle}>{t('Revenue Breakdown')}</Text>
                </View>

                {/* Platform Fees */}
                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownLeft}>
                    <View style={[styles.breakdownDot, { backgroundColor: '#1A73E8' }]} />
                    <View>
                      <Text style={styles.breakdownLabel}>{t('Platform Fees')}</Text>
                      <Text style={styles.breakdownSub}>{t('From completed bookings')}</Text>
                    </View>
                  </View>
                  <View style={styles.breakdownRight}>
                    <Text style={styles.breakdownTotal}>₹{fmt(breakdown.platformFees?.total)}</Text>
                    <Text style={styles.breakdownMonthly}>₹{fmt(breakdown.platformFees?.monthly)} {t('this month')}</Text>
                  </View>
                </View>

                {/* Subscriptions */}
                <View style={styles.breakdownItem}>
                  <View style={styles.breakdownLeft}>
                    <View style={[styles.breakdownDot, { backgroundColor: '#FF5C00' }]} />
                    <View>
                      <Text style={styles.breakdownLabel}>{t('Subscriptions')}</Text>
                      <Text style={styles.breakdownSub}>{t('Customer + Worker plans')}</Text>
                    </View>
                  </View>
                  <View style={styles.breakdownRight}>
                    <Text style={styles.breakdownTotal}>₹{fmt(breakdown.subscriptions?.total)}</Text>
                    <Text style={styles.breakdownMonthly}>₹{fmt(breakdown.subscriptions?.monthly)} {t('this month')}</Text>
                  </View>
                </View>

                {/* Penalties */}
                <View style={[styles.breakdownItem, { borderBottomWidth: 0 }]}>
                  <View style={styles.breakdownLeft}>
                    <View style={[styles.breakdownDot, { backgroundColor: '#EA4335' }]} />
                    <View>
                      <Text style={styles.breakdownLabel}>{t('Penalties')}</Text>
                      <Text style={styles.breakdownSub}>{breakdown.penalties?.count || 0} {t('violations enforced')}</Text>
                    </View>
                  </View>
                  <View style={styles.breakdownRight}>
                    <Text style={styles.breakdownTotal}>₹{fmt(breakdown.penalties?.total)}</Text>
                    <Text style={styles.breakdownMonthly}>₹{fmt(breakdown.penalties?.monthly)} {t('this month')}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ──── Active Subscribers ──── */}
            {subscribers && (
              <View style={styles.statsRow}>
                <View style={[styles.card, styles.subCard]}>
                  <View style={[styles.iconCircleSmall, { backgroundColor: '#FFF3E0' }]}>
                    <MaterialCommunityIcons name="account-star" size={16} color="#FF5C00" />
                  </View>
                  <Text style={styles.subCardTitle}>{t('Customer Subs')}</Text>
                  <Text style={styles.subCardAmount}>{subscribers.customers || 0}</Text>
                  <Text style={styles.subCardHint}>{t('Plus / Pro active')}</Text>
                </View>

                <View style={[styles.card, styles.subCard]}>
                  <View style={[styles.iconCircleSmall, { backgroundColor: '#E8F5E9' }]}>
                    <MaterialCommunityIcons name="shield-star" size={16} color="#0F9D58" />
                  </View>
                  <Text style={styles.subCardTitle}>{t('Worker Subs')}</Text>
                  <Text style={styles.subCardAmount}>{subscribers.workers || 0}</Text>
                  <Text style={styles.subCardHint}>{t('Pro / Elite active')}</Text>
                </View>
              </View>
            )}

            {/* Top Categories */}
            {data.topCategories?.length > 0 && (
              <View style={[styles.card, { padding: 0, marginTop: 8 }]}>
                <View style={styles.listHeader}>
                  <Text style={styles.listTitle}>{t('Top Categories by Revenue')}</Text>
                </View>
                {data.topCategories.map((c: any, i: number, arr: any[]) => (
                  <View key={i} style={[styles.listItem, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.listItemLeft}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankBadgeText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.categoryText}>{c.category ? t(c.category.replace(/_/g, ' ')) : undefined}</Text>
                    </View>
                    <Text style={styles.categoryAmount}>₹{c.revenue?.toLocaleString('en-IN')}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
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
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 16, 
    paddingBottom: 16, 
    backgroundColor: '#F5F0E8', borderBottomWidth: 0
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },

  scrollContent: { padding: 16, gap: 16 },

  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderRadius: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }
  },
  cardBgDecor: { position: 'absolute', right: -40, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.1)' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardSubtitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  iconCircleWhite: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  amountHero: { fontFamily: 'Inter_700Bold', fontSize: 40, letterSpacing: -0.5 },

  statsRow: { flexDirection: 'row', gap: 12 },
  subCard: { flex: 1, padding: 20, borderRadius: 20 },
  iconCircleSmall: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  subCardTitle: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368', marginBottom: 4 },
  subCardAmount: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },
  subCardHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9AA0A6', marginTop: 2 },

  listHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F3F4' },
  listTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F3F4' },
  listItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F5F0E8', justifyContent: 'center', alignItems: 'center' },
  rankBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#5F6368' },
  categoryText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#202124', textTransform: 'capitalize' },
  categoryAmount: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#1A73E8' },

  // Revenue breakdown styles
  breakdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F3F4' },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  breakdownDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124' },
  breakdownSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9AA0A6', marginTop: 1 },
  breakdownRight: { alignItems: 'flex-end' },
  breakdownTotal: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#202124' },
  breakdownMonthly: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#0F9D58', marginTop: 2 },
});
