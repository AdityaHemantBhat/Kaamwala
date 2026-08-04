import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Dimensions, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp, withTiming, useSharedValue, useAnimatedStyle, Easing, withSpring } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';
import { SkeletonAchievementsBody } from '../../components/ui/SkeletonScreenLayouts';

const { width } = Dimensions.get('window');

const BADGE_DETAILS: Record<string, { icon: string; labelKey: string; descKey: string; color: string }> = {
  FIRST_JOB: { icon: 'star-outline', labelKey: 'FIRST JOB', descKey: 'Complete your first job', color: '#4CAF50' },
  RISING_STAR: { icon: 'star', labelKey: 'RISING STAR', descKey: '10 jobs with 4.5+ rating', color: '#2196F3' },
  TRUSTED_PRO: { icon: 'shield-check', labelKey: 'TRUSTED PRO', descKey: '50 jobs, 4.7+, no disputes', color: '#9C27B0' },
  CENTURY: { icon: 'trophy-award', labelKey: 'CENTURY', descKey: 'Complete 100 jobs', color: '#E91E63' },
  SPEED_DEMON: { icon: 'lightning-bolt', labelKey: 'SPEED DEMON', descKey: '10 jobs within estimate time', color: '#FFC107' },
  PHOTO_PRO: { icon: 'image-multiple', labelKey: 'PHOTO PRO', descKey: '20 approved before/after photos', color: '#00BCD4' },
  PERFECT_WEEK: { icon: 'calendar-check', labelKey: 'PERFECT WEEK', descKey: '7 jobs in 7 days, all 5-star', color: '#FF5722' },
  TOP_EARNER: { icon: 'currency-inr', labelKey: 'TOP EARNER', descKey: 'Earn ₹50,000 total', color: '#8BC34A' },
};

const ALL_BADGES = Object.keys(BADGE_DETAILS);

export default function WorkerAchievements() {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [earnedBadges, setEarnedBadges] = useState<string[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);

  // Animated progress bar
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiClient.get('/workers/achievements');
        const earned = (res.data?.data || []).map((a: any) => a.badge);
        setEarnedBadges(earned);
        
        // Animate progress bar after data loads
        const targetProgress = earned.length / ALL_BADGES.length;
        progressWidth.value = withTiming(targetProgress, {
          duration: 1200,
          easing: Easing.out(Easing.exp),
        });
      } catch (e) {
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [progressWidth]);

  const animatedProgressStyle = useAnimatedStyle(() => {
    return {
      width: `${progressWidth.value * 100}%`,
    };
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Achievements')}</Text>
        </View>
        <View style={styles.loaderBox}>
          <SkeletonAchievementsBody />
        </View>
      </SafeAreaView>
    );
  }

  const selectedDetails = selectedBadge ? BADGE_DETAILS[selectedBadge] : null;
  const isSelectedEarned = selectedBadge ? earnedBadges.includes(selectedBadge) : false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Achievements')}</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Hero Section */}
        <Animated.View entering={FadeInDown.duration(600).springify()}>
          <LinearGradient
            colors={['#FF5C00', '#FF8F00']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroRingOuter}>
              <View style={styles.heroRingInner}>
                <MaterialCommunityIcons name="trophy" size={48} color="#FF5C00" />
              </View>
            </View>
            <Text style={styles.heroTitle}>{t('Your Achievements')}</Text>
            <Text style={styles.heroSub}>{t('Keep up the great work!')}</Text>
          </LinearGradient>
        </Animated.View>

        {/* Progress Tracker */}
        <Animated.View entering={FadeInDown.delay(200).duration(600).springify()} style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>{t('Badges Earned')}</Text>
            <Text style={styles.progressCount}>{earnedBadges.length} / {ALL_BADGES.length}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <Animated.View style={[styles.progressBarFill, animatedProgressStyle]} />
          </View>
        </Animated.View>

        {/* Badge Grid */}
        <View style={styles.grid}>
          {ALL_BADGES.map((badge, i) => {
            const details = BADGE_DETAILS[badge];
            const earned = earnedBadges.includes(badge);

            return (
              <Animated.View
                key={badge}
                entering={FadeInUp.delay(i * 100 + 300).duration(500).springify()}
              >
                <View style={[styles.badgeCard, !earned && styles.badgeCardLocked]}>
                  <Pressable
                    style={styles.badgePressable}
                    onPress={() => setSelectedBadge(badge)}
                    android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
                  >
                    <View style={{ position: 'relative', marginBottom: 12 }}>
                      <View style={[styles.badgeIconBg, { backgroundColor: earned ? details.color + '20' : '#F0EBE0' }]}>
                        <MaterialCommunityIcons
                          name={(details.icon || 'trophy') as any}
                          size={32}
                          color={earned ? details.color : '#B0A898'}
                        />
                      </View>
                      {!earned && (
                        <View style={styles.lockOverlay}>
                          <MaterialCommunityIcons name="lock" size={16} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.badgeLabel, !earned && { color: '#B0A898' }]}>
                      {earned ? t(details.labelKey) : '???'}
                    </Text>
                    <Text style={[styles.badgeDesc, !earned && { color: '#C8C0B0' }]} numberOfLines={2}>
                      {earned ? t(details.descKey) : t('Keep working to unlock')}
                    </Text>
                  </Pressable>
                </View>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      {/* Interactive Bottom Sheet Modal */}
      <Modal visible={!!selectedBadge} transparent animationType="fade" onRequestClose={() => setSelectedBadge(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedBadge(null)} />
          {selectedDetails && (
            <Animated.View entering={FadeInDown.duration(300).springify()} style={styles.modalContent}>
              <View style={styles.modalHandle} />
              
              <View style={[styles.modalIconBg, { backgroundColor: isSelectedEarned ? selectedDetails.color + '20' : '#F0EBE0' }]}>
                <MaterialCommunityIcons
                  name={selectedDetails.icon as any}
                  size={64}
                  color={isSelectedEarned ? selectedDetails.color : '#B0A898'}
                />
                {!isSelectedEarned && (
                  <View style={[styles.lockOverlay, { width: 32, height: 32, borderRadius: 16, bottom: 0, right: 0 }]}>
                    <MaterialCommunityIcons name="lock" size={20} color="#FFFFFF" />
                  </View>
                )}
              </View>

              <Text style={[styles.modalTitle, !isSelectedEarned && { color: '#B0A898' }]}>
                {isSelectedEarned ? t(selectedDetails.labelKey) : t('Locked Badge')}
              </Text>
              
              <Text style={styles.modalDesc}>
                {t(selectedDetails.descKey)}
              </Text>

              <View style={[styles.modalStatusBadge, { backgroundColor: isSelectedEarned ? '#E8F5E9' : '#FFF3E0' }]}>
                <MaterialCommunityIcons 
                  name={isSelectedEarned ? "check-decagram" : "progress-clock"} 
                  size={16} 
                  color={isSelectedEarned ? "#4CAF50" : "#FF9800"} 
                />
                <Text style={[styles.modalStatusText, { color: isSelectedEarned ? "#4CAF50" : "#FF9800" }]}>
                  {isSelectedEarned ? t('Unlocked') : t('Keep working to unlock')}
                </Text>
              </View>

              <Pressable style={styles.modalCloseBtn} onPress={() => setSelectedBadge(null)}>
                <Text style={styles.modalCloseText}>{t('Close')}</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(13,13,13,0.04)', borderRadius: 20 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', marginLeft: 12 },
  loaderBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 12 },
  
  heroCard: {
    borderRadius: 24, padding: 32, alignItems: 'center', elevation: 8,
    shadowColor: '#FF5C00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    marginBottom: 24,
  },
  heroRingOuter: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  heroRingInner: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', elevation: 4,
  },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  heroSub: { fontFamily: 'Inter_500Medium', fontSize: 14, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },

  progressSection: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 24, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#0D0D0D' },
  progressCount: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FF5C00' },
  progressBarBg: { height: 10, backgroundColor: '#F0EBE0', borderRadius: 5, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FF5C00', borderRadius: 5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  
  badgeCard: {
    width: (width - 56) / 2, backgroundColor: '#FFFFFF', borderRadius: 20,
    marginBottom: 16, elevation: 2, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  badgePressable: { padding: 20, alignItems: 'center' },
  badgeCardLocked: { opacity: 0.7, elevation: 0, borderWidth: 1, borderColor: '#F0EBE0', backgroundColor: '#FAFAFA' },

  badgeIconBg: {
    width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center',
  },
  
  lockOverlay: {
    position: 'absolute', bottom: -4, right: -4,
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#9E9E9E',
    justifyContent: 'center', alignItems: 'center', elevation: 3,
    borderWidth: 2, borderColor: '#FFFFFF'
  },

  badgeLabel: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#0D0D0D', textAlign: 'center', marginBottom: 6 },
  badgeDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', textAlign: 'center', lineHeight: 16 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    padding: 32, alignItems: 'center', elevation: 10,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, marginBottom: 24,
  },
  modalIconBg: {
    width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 24,
  },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#0D0D0D', textAlign: 'center', marginBottom: 12 },
  modalDesc: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#6B6B6B', textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 20 },
  
  modalStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 32,
  },
  modalStatusText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  
  modalCloseBtn: {
    backgroundColor: '#F5F0E8', width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center',
  },
  modalCloseText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#0D0D0D' },
});