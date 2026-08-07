import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useT } from '../../utils/i18n';
import { useRouter } from 'expo-router';
import { apiClient } from '../../api/client';
import { SkeletonReferralsBody } from '../../components/ui/SkeletonScreenLayouts';

export default function ReferralScreen() {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [codeRes, statsRes, lbRes] = await Promise.all([
          apiClient.get('/referral/code'),
          apiClient.get('/referral/stats'),
          apiClient.get('/referral/leaderboard').catch(() => ({ data: { data: [] } })),
        ]);
        setCode(codeRes.data?.data?.code || '');
        setStats(statsRes.data?.data);
        setLeaderboard(lbRes.data?.data || []);
      } catch {  }
      finally { setLoading(false); }
    })();
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${t('Join KaamWala and get ₹50 free credit! Use my code')} ${code} → kaamwala.app/ref/${code}`,
      });
    } catch {}
  };

  const handleCopy = () => {
    try {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 12, gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Refer & Earn')}</Text>
        </View>
        <SkeletonReferralsBody />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 12, gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Refer & Earn')}</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* ═══ Hero ═══ */}
        <Animated.View entering={FadeInDown.delay(50).duration(300)}>
          <View style={styles.hero}>
            <View style={styles.heroRing}>
              <View style={styles.heroIcon}>
                <MaterialCommunityIcons name="gift" size={36} color="#FF5C00" />
              </View>
            </View>
            <Text style={styles.heroTitle}>{t('Share the love, earn rewards')}</Text>
            <Text style={styles.heroSub}>
              {t('Referral description')}
            </Text>
          </View>
        </Animated.View>

        {/* ═══ Referral Code Card ═══ */}
        <Animated.View entering={FadeInDown.delay(100).duration(300)}>
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>{t('Your referral code')}</Text>
            <Text style={styles.codeValue}>{code}</Text>
            <View style={styles.codeActions}>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [
                  styles.codeAction,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <MaterialCommunityIcons
                  name={copied ? 'check-circle' : 'content-copy'}
                  size={20}
                  color={copied ? '#1A5C2A' : '#FF5C00'}
                />
                <Text
                  style={[
                    styles.codeActionText,
                    copied && { color: '#1A5C2A' },
                  ]}
                >
                  {copied ? t('Copied!') : t('Copy')}
                </Text>
              </Pressable>
              <View style={styles.codeDivider} />
              <Pressable
                onPress={handleShare}
                style={({ pressed }) => [
                  styles.codeAction,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <MaterialCommunityIcons name="share-variant" size={20} color="#FF5C00" />
                <Text style={styles.codeActionText}>{t('Share')}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ═══ Invite Friends Button ═══ */}
        <Animated.View entering={FadeInDown.delay(150).duration(300)}>
          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.inviteBtn,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
          >
            <MaterialCommunityIcons name="share-variant" size={20} color="#FFFFFF" />
            <Text style={styles.inviteBtnText}>{t('Invite Friends')}</Text>
          </Pressable>
        </Animated.View>

        {/* ═══ Stats ═══ */}
        {stats && (
          <Animated.View entering={FadeInDown.delay(200).duration(300)}>
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.totalReferrals}</Text>
                <Text style={styles.statLabel}>{t('Friends joined')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>₹{stats.totalEarned || 0}</Text>
                <Text style={styles.statLabel}>{t('Total earned')}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ═══ {t('How it works')} ═══ */}
        <Animated.View entering={FadeInDown.delay(250).duration(300)}>
          <Text style={styles.sectionTitle}>{t('How it works')}</Text>
          <View style={styles.stepsContainer}>
            {[
              { num: '1', text: t('Share your code') },
              { num: '2', text: t('They sign up') },
              { num: '3', text: t('They book first service') },
              { num: '4', text: t('You get ₹75') },
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNumCircle}>
                  <Text style={styles.stepNumText}>{step.num}</Text>
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
                {i < 3 && <View style={styles.stepConnector} />}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ═══ Leaderboard ═══ */}
        {leaderboard.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300).duration(300)}>
            <Text style={styles.sectionTitle}>{t('Top referrers')}</Text>
            <View style={styles.lbContainer}>
              {leaderboard.slice(0, 5).map((l: any, i: number) => {
                return (
                  <View
                    key={i}
                    style={[
                      styles.lbRow,
                      i < leaderboard.length - 1 && styles.lbBorder,
                    ]}
                  >
                    <View style={styles.lbRank}>
                      <Text style={styles.lbRankText}>
                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}
                      </Text>
                    </View>
                    <Text style={styles.lbName}>{l.name}</Text>
                    <View style={styles.lbCount}>
                      <MaterialCommunityIcons name="account" size={14} color="#6B6B6B" />
                      <Text style={styles.lbCountText}>{l.referrals}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  container: { flex: 1 },
  content: { paddingHorizontal: 28, paddingTop: 8, gap: 20, paddingBottom: 40 },
  loaderBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: '#0D0D0D',
  },

  // ── Hero ──
  hero: { alignItems: 'center', paddingVertical: 16 },
  heroRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: '#0D0D0D',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },

  // ── Code Card ──
  codeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  codeLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#6B6B6B',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  codeValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 34,
    color: '#0D0D0D',
    letterSpacing: 8,
    marginBottom: 20,
  },
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  codeDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(13,13,13,0.08)',
  },
  codeActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#FF5C00',
  },

  // ── Invite Button ──
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF5C00',
    paddingVertical: 16,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#FF5C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  inviteBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  // ── Stats ──
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 28,
    color: '#0D0D0D',
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(13,13,13,0.08)',
    marginVertical: 4,
  },

  // ── Steps ──
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#0D0D0D',
    marginBottom: 16,
  },
  stepsContainer: { paddingLeft: 4, gap: 0 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
    position: 'relative',
  },
  stepNumCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF5C00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    zIndex: 1,
  },
  stepNumText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  stepText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#2A2A2A',
    paddingTop: 5,
    paddingBottom: 16,
    flex: 1,
  },
  stepConnector: {
    position: 'absolute',
    left: 15,
    top: 32,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,92,0,0.2)',
  },

  // ── Leaderboard ──
  lbContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  lbBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(13,13,13,0.06)',
  },
  lbRank: {
    width: 36,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lbRankText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#6B6B6B',
  },
  lbName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#0D0D0D',
    flex: 1,
    marginLeft: 8,
  },
  lbCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F0E8',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lbCountText: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 13,
    color: '#0D0D0D',
  },
});