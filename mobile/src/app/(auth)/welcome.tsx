import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useT } from '../../utils/i18n';
import { BrandMark } from '../../components/ui/BrandMark';

export default function WelcomeScreen() {
  const router = useRouter();
  const t = useT();

  const heroOp = useSharedValue(0);
  const heroScale = useSharedValue(0.6);
  const titleOp = useSharedValue(0);
  const titleY = useSharedValue(24);
  const subOp = useSharedValue(0);
  const btn1Op = useSharedValue(0);
  const btn1Y = useSharedValue(20);
  const btn2Op = useSharedValue(0);
  const btn2Y = useSharedValue(20);
  const footerOp = useSharedValue(0);

  const handleSplashFinish = () => {
    heroOp.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    heroScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    titleOp.value = withDelay(250, withTiming(1, { duration: 600 }));
    titleY.value = withDelay(250, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    subOp.value = withDelay(450, withTiming(1, { duration: 500 }));
    btn1Op.value = withDelay(650, withTiming(1, { duration: 500 }));
    btn1Y.value = withDelay(650, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
    btn2Op.value = withDelay(800, withTiming(1, { duration: 500 }));
    btn2Y.value = withDelay(800, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
    footerOp.value = withDelay(1000, withTiming(1, { duration: 500 }));
  };

  const heroAnim = useAnimatedStyle(() => ({ opacity: heroOp.value, transform: [{ scale: heroScale.value }] }));
  const tStyle = useAnimatedStyle(() => ({ opacity: titleOp.value, transform: [{ translateY: titleY.value }] }));
  const sStyle = useAnimatedStyle(() => ({ opacity: subOp.value }));
  const b1Style = useAnimatedStyle(() => ({ opacity: btn1Op.value, transform: [{ translateY: btn1Y.value }] }));
  const b2Style = useAnimatedStyle(() => ({ opacity: btn2Op.value, transform: [{ translateY: btn2Y.value }] }));
  const fStyle = useAnimatedStyle(() => ({ opacity: footerOp.value }));

  // Trigger entry animations on mount
  useEffect(() => {
    handleSplashFinish();
    // One-shot entry animation; handleSplashFinish is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F0E8" />

      {/* Top brand indicator */}
      <View style={styles.brandBar}>
        <View style={styles.brandChip}>
          <BrandMark size={18} />
          <Text style={styles.brandLabel}>KaamWala</Text>
        </View>
      </View>

      {/* Hero — the Bond mark */}
      <View style={styles.heroSection}>
        <Animated.View style={[{ alignItems: 'center' }, heroAnim]}>
          <View style={styles.heroRing}>
            <View style={styles.heroIconBg}>
              <BrandMark size={52} />
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Headline content */}
      <View style={styles.contentSection}>
        <Animated.View style={tStyle}>
          <Text style={styles.headline}>{t('Find the right')}</Text>
          <Text style={styles.headline}>{t('person for the job.')}</Text>
        </Animated.View>
        <Animated.Text style={[styles.subheadline, sStyle]}>
          {t("India's most trusted local service marketplace.")}
        </Animated.Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonsSection}>
        <Animated.View style={[{ width: '100%' }, b1Style]}>
          <Pressable
            onPress={() => router.push({ pathname: '/(auth)/phone', params: { role: 'CUSTOMER' } })}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.primaryBtnPressed,
            ]}
          >
            <MaterialCommunityIcons name="magnify" size={20} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>{t('I need a worker')}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#FFFFFF" style={{ opacity: 0.7 }} />
          </Pressable>
        </Animated.View>

        <Animated.View style={[{ width: '100%' }, b2Style]}>
          <Pressable
            onPress={() => router.push({ pathname: '/(auth)/phone', params: { role: 'WORKER' } })}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.secondaryBtnPressed,
            ]}
          >
            <MaterialCommunityIcons name="account-hard-hat" size={20} color="#FF5C00" />
            <Text style={styles.secondaryBtnText}>{t("I'm a worker")}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#FF5C00" style={{ opacity: 0.4 }} />
          </Pressable>
        </Animated.View>
      </View>

      {/* Social proof footer */}
      <Animated.View style={[styles.footer, fStyle]}>
        <View style={styles.footerDivider} />
        <Text style={styles.footerText}>
          {t('Trusted by')} <Text style={styles.footerHighlight}>10,000+</Text> {t('users across India')}
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    paddingHorizontal: 28,
  },

 /* ── Brand bar ── */
  brandBar: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(13,13,13,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  brandLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#0D0D0D',
    letterSpacing: 0.3,
    marginLeft: 8,
  },

 /* ── Hero ── */
  heroSection: {
    flex: 1.1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroIconBg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#0D0D0D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },

 /* ── Content ── */
  contentSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  headline: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 32,
    color: '#0D0D0D',
    lineHeight: 40,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subheadline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: '#6B6B6B',
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: '80%',
  },

 /* ── Buttons ── */
  buttonsSection: {
    gap: 14,
    marginBottom: 24,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5C00',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 10,
    elevation: 3,
    shadowColor: '#FF5C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  primaryBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(13,13,13,0.08)',
    elevation: 1,
    shadowColor: '#0D0D0D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  secondaryBtnPressed: {
    backgroundColor: 'rgba(255,92,0,0.04)',
    borderColor: 'rgba(255,92,0,0.2)',
    transform: [{ scale: 0.98 }],
  },
  secondaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#0D0D0D',
  },

 /* ── Footer ── */
  footer: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  footerDivider: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(13,13,13,0.06)',
    marginBottom: 16,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    textAlign: 'center',
  },
  footerHighlight: {
    fontFamily: 'Inter_600SemiBold',
    color: '#FF5C00',
  },
});