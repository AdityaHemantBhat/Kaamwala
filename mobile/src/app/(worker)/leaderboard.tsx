import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Platform
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import Animated, { FadeIn, FadeInDown, SlideInDown, useAnimatedStyle, withSpring, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useT } from '../../utils/i18n';

const ACCENT = '#FF5C00';
const ACCENT_DARK = '#B85500';
const ACCENT_BG = '#FFF0E8';
const ACCENT_BORDER = '#FFD9B8';

const SCOPES = [
  { key: 'city', label: 'City', icon: 'city-variant-outline' },
  { key: 'area', label: 'Area', icon: 'map-marker-radius-outline' },
  { key: 'global', label: 'Global', icon: 'earth' },
] as const;

const METRICS = [
  { key: 'earnings' as const, label: 'Earnings', icon: 'currency-inr' },
  { key: 'rating' as const, label: 'Rating', icon: 'star' },
];

function fmtINR(n: number): string {
  return '₹' + Math.round(n || 0).toLocaleString('en-IN');
}

const PodiumSpot = ({ worker, rank, metric, isMe }: { worker: any, rank: number, metric: string, isMe: boolean }) => {
  const t = useT();
  const isFirst = rank === 1;
  const isSecond = rank === 2;
  const isThird = rank === 3;
  
  const heightVal = useSharedValue(0);
  
  useEffect(() => {
    heightVal.value = withSpring(isFirst ? 140 : isSecond ? 110 : 90, { damping: 12 });
  }, [rank]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightVal.value,
  }));

  if (!worker) {
    return (
      <View style={[styles.podiumSpotContainer, { opacity: 0.3 }]}>
        <View style={styles.podiumEmpty}>
          <Text style={styles.podiumEmptyText}>{rank}</Text>
        </View>
      </View>
    );
  }

  const value = metric === 'rating' ? `${(worker.rating || 0).toFixed(1)} ★` : fmtINR(worker.totalEarned || 0);
  
  const colors: [string, string] = isFirst ? ['#FFD700', '#FDB931'] :
                 isSecond ? ['#E0E0E0', '#BDBDBD'] :
                 ['#CD7F32', '#A0522D'];

  return (
    <View style={[styles.podiumSpotContainer, isFirst && { zIndex: 10, elevation: 10, marginTop: -20 }]}>
      <Animated.View entering={FadeInDown.delay(rank * 100).springify()}>
        <View style={styles.podiumAvatarContainer}>
          {isFirst && (
            <MaterialCommunityIcons name="crown" size={24} color="#FFD700" style={styles.crownIcon} />
          )}
          {worker.user?.avatarUrl ? (
            <Image source={{ uri: worker.user.avatarUrl }} style={[styles.podiumAvatar, isFirst && styles.podiumAvatarFirst]} />
          ) : (
            <View style={[styles.podiumAvatar, isFirst && styles.podiumAvatarFirst, styles.avatarFallback]}>
              <Text style={[styles.avatarInitial, isFirst && { fontSize: 20 }]}>{(worker.user?.name || 'W')[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={[styles.podiumRankBadge, { backgroundColor: colors[0] }]}>
            <Text style={styles.podiumRankText}>{rank}</Text>
          </View>
        </View>
        
        <Text style={[styles.podiumName, isMe && { color: ACCENT_DARK }]} numberOfLines={1}>
          {worker.user?.name?.split(' ')[0] || t('Worker')}
        </Text>
        <Text style={styles.podiumValue}>{value}</Text>
      </Animated.View>

      <Animated.View style={[styles.podiumBarBase, animatedStyle]}>
        <LinearGradient
          colors={colors}
          style={styles.podiumBarGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.podiumBarGlow} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
};

export default function LeaderboardScreen() {
  const router = useRouter();
  const t = useT();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [scope, setScope] = useState<string>('city');
  const [metric, setMetric] = useState<'earnings' | 'rating'>('earnings');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await apiClient
      .get(`/workers/leaderboard?scope=${scope}&metric=${metric}&limit=100`)
      .catch(() => ({ data: { data: null } }));
    setData(res.data?.data || null);
    setLoading(false);
    setRefreshing(false);
  }, [scope, metric]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const myId = user?.id;
  const workers: any[] = data?.workers || [];
  
  const top3 = [
    workers[1] || null, // 2nd
    workers[0] || null, // 1st
    workers[2] || null, // 3rd
  ];
  
  const restWorkers = workers.slice(3);
  const myData = data?.myStats || workers.find(w => w.userId === myId);
  const myRank = data?.myRank;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{t('Leaderboard')}</Text>
          <Text style={styles.headerSubtitle}>{t('See how you stack up')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.tabGroup}>
          {SCOPES.map((s) => {
            const active = scope === s.key;
            return (
              <Pressable
                key={s.key}
                style={[styles.tabSegment, active && styles.tabSegmentActive]}
                onPress={() => setScope(s.key)}
              >
                <Text style={[styles.tabSegmentText, active && styles.tabSegmentTextActive]}>{t(s.label)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.metricGroup}>
          {METRICS.map((m) => {
            const active = metric === m.key;
            return (
              <Pressable key={m.key} style={[styles.metricChip, active && styles.metricChipActive]} onPress={() => setMetric(m.key)}>
                <MaterialCommunityIcons name={m.icon as any} size={14} color={active ? '#FFFFFF' : '#0D0D0D'} />
                <Text style={[styles.metricText, active && styles.metricTextActive]}>{t(m.label)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading && workers.length === 0 ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ACCENT} />}
          >
            {workers.length > 0 ? (
              <>
                <View style={styles.podiumSection}>
                  <PodiumSpot worker={top3[0]} rank={2} metric={metric} isMe={top3[0]?.userId === myId} />
                  <PodiumSpot worker={top3[1]} rank={1} metric={metric} isMe={top3[1]?.userId === myId} />
                  <PodiumSpot worker={top3[2]} rank={3} metric={metric} isMe={top3[2]?.userId === myId} />
                </View>

                <View style={styles.listSection}>
                  {restWorkers.map((w, index) => {
                    const isMe = w.userId === myId;
                    const value = metric === 'rating' ? `${(w.rating || 0).toFixed(1)} ★` : fmtINR(w.totalEarned || 0);
                    return (
                      <Animated.View key={w.id} entering={FadeInDown.delay(300 + index * 50).springify()}>
                        <View style={[styles.row, isMe && styles.rowMe]}>
                          <View style={styles.rankBox}>
                            <Text style={styles.rankNum}>{w.rank}</Text>
                          </View>
                          {w.user?.avatarUrl ? (
                            <Image source={{ uri: w.user.avatarUrl }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatar, styles.avatarFallback]}>
                              <Text style={styles.avatarInitial}>{(w.user?.name || 'W')[0].toUpperCase()}</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.name, isMe && { color: ACCENT_DARK, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                              {w.user?.name || t('Worker')} {isMe && t('(You)')}
                            </Text>
                            <Text style={styles.sub} numberOfLines={1}>
                              {[w.city, w.state].filter(Boolean).join(', ') || '—'}
                            </Text>
                          </View>
                          <View style={styles.valueBox}>
                            <Text style={styles.value}>{value}</Text>
                          </View>
                        </View>
                      </Animated.View>
                    );
                  })}
                </View>
              </>
            ) : (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="trophy-outline" size={64} color="#C8C0B0" />
                <Text style={styles.emptyTitle}>{t('No Data Yet')}</Text>
                <Text style={styles.emptyText}>{t('Complete jobs to appear on the leaderboard')}</Text>
              </View>
            )}
            <View style={{ height: 120 + insets.bottom }} /> 
          </ScrollView>

          {/* Sticky Bottom Bar for Current User */}
          {myRank && (
            <Animated.View entering={SlideInDown.delay(500)} style={[styles.stickyBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.stickyInner}>
                <View style={styles.stickyRankBox}>
                  <Text style={styles.stickyRankLabel}>{t('Rank')}</Text>
                  <Text style={styles.stickyRankNum}>#{myRank}</Text>
                </View>
                <View style={styles.stickyDivider} />
                <View style={styles.stickyMeBox}>
                  <Text style={styles.stickyMeTitle}>{t('You')}</Text>
                  <Text style={styles.stickyMeSub}>{t('Keep pushing to climb higher!')}</Text>
                </View>
                <View style={styles.stickyValueBox}>
                  <Text style={styles.stickyValueTitle}>{t(METRICS.find(m => m.key === metric)?.label || '')}</Text>
                  <Text style={styles.stickyValue}>
                    {metric === 'rating' ? `${(myData?.rating || 0).toFixed(1)} ★` : fmtINR(myData?.totalEarned || 0)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { 
    paddingHorizontal: 20, 
    paddingTop: 10,
    paddingBottom: 20, 
    flexDirection: 'row', 
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#111827' },
  headerSubtitle: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B7280', marginTop: 2 },

  filtersContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    zIndex: 10,
  },
  
  tabGroup: { 
    flexDirection: 'row', 
    backgroundColor: '#F3F4F6', 
    borderRadius: 12, 
    padding: 4,
    marginBottom: 12,
  },
  tabSegment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabSegmentActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  tabSegmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#6B7280' },
  tabSegmentTextActive: { color: '#111827' },

  metricGroup: { flexDirection: 'row', gap: 8 },
  metricChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  metricChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  metricText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#111827' },
  metricTextActive: { color: '#FFFFFF' },

  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flexGrow: 1, paddingBottom: 20 },

  // Podium
  podiumSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  podiumSpotContainer: {
    alignItems: 'center',
    width: '30%',
    marginHorizontal: '1.5%',
  },
  podiumAvatarContainer: {
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  crownIcon: {
    position: 'absolute',
    top: -20,
    zIndex: 2,
  },
  podiumAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: ACCENT_BG,
  },
  podiumAvatarFirst: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  podiumRankBadge: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  podiumRankText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  podiumName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#374151',
    marginTop: 4,
  },
  podiumValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 12,
  },
  podiumBarBase: {
    width: '100%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  podiumBarGradient: {
    flex: 1,
    width: '100%',
  },
  podiumBarGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  podiumEmpty: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginBottom: 20
  },
  podiumEmptyText: { fontFamily: 'Inter_700Bold', color: '#9CA3AF' },

  // List Section
  listSection: {
    paddingHorizontal: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, 
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  rowMe: { 
    backgroundColor: ACCENT_BG, 
    borderColor: ACCENT_BORDER, 
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  rankBox: { width: 30, alignItems: 'center' },
  rankNum: { fontFamily: 'SpaceMono_700Bold', fontSize: 16, color: '#9CA3AF' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: ACCENT_BG },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: 'Inter_700Bold', fontSize: 18, color: ACCENT },
  name: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#111827' },
  sub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B7280', marginTop: 2 },
  valueBox: { alignItems: 'flex-end' },
  value: { fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#111827' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#374151' },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  // Sticky Bottom Bar
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  stickyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
  },
  stickyRankBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  stickyRankLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },
  stickyRankNum: { fontFamily: 'SpaceMono_700Bold', fontSize: 24, color: '#FFFFFF', marginTop: 2 },
  stickyDivider: { width: 1, height: 30, backgroundColor: '#374151', marginHorizontal: 16 },
  stickyMeBox: { flex: 1 },
  stickyMeTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFFFFF' },
  stickyMeSub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  stickyValueBox: { alignItems: 'flex-end', backgroundColor: '#1F2937', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  stickyValueTitle: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  stickyValue: { fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#10B981', marginTop: 2 },
});
