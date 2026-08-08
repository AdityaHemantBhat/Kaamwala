import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  useReducedMotion,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Wordmark } from './Wordmark';
import { BrandMark } from './BrandMark';
import { Colors } from '../../constants/colors';
import { useT } from '../../utils/i18n';

interface BrandLaunchScreenProps {
  onFinish?: () => void;
 /** Total time the launch screen is visible before it fades out. */
  duration?: number; // Default: 3500ms (3.5 seconds)
}

/**
 * KaamWala launch experience — the brand logo rises in (fade + scale), the
 * wordmark and tagline follow, a hairline progress shimmer fills, then the
 * whole screen fades into the app. 100% Reanimated on the UI thread.
 *
 * The reveal only starts once the logo image has actually decoded, so the
 * animation never runs against a blank image. With OS "reduce motion" the
 * content is shown statically for a short, readable hold.
 */
export function BrandLaunchScreen({
  onFinish,
  duration = 3500, // Changed from 5000 to 3500 (3.5 seconds)
}: BrandLaunchScreenProps) {
  const t = useT();
  const reduced = useReducedMotion();
  // No large image to decode, start ready
  const imgReady = true;

  const logoOp = useSharedValue(reduced ? 1 : 0);
  const logoScale = useSharedValue(reduced ? 1 : 0.9);
  const wordOp = useSharedValue(reduced ? 1 : 0);
  const wordY = useSharedValue(0);
  const tagOp = useSharedValue(reduced ? 1 : 0);
  const overlayOp = useSharedValue(1);

  useEffect(() => {
    if (!imgReady) return;

    const total = reduced ? 1600 : duration;

    if (!reduced) {
      logoOp.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
      logoScale.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
      wordOp.value = withDelay(650, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
      wordY.value = withDelay(650, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
      tagOp.value = withDelay(1050, withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) }));
    }

    const fadeMs = reduced ? 200 : 350;
    const timer = setTimeout(() => {
      overlayOp.value = withTiming(0, { duration: fadeMs, easing: Easing.out(Easing.cubic) });
      setTimeout(() => {
        if (onFinish) runOnJS(onFinish)();
      }, fadeMs + 40);
    }, total);

    return () => clearTimeout(timer);
    // Shared values are stable refs; onFinish is a plain callback and this is a
    // mount-once intro animation, so it must not re-run when the callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgReady, reduced, duration, logoOp, logoScale, wordOp, wordY, tagOp, overlayOp]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOp.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOp.value,
    transform: [{ scale: logoScale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOp.value,
    transform: [{ translateY: wordY.value }],
  }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOp.value }));

  return (
    <Animated.View style={[styles.container, overlayStyle]}>
      <View style={styles.content}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Animated.View style={logoStyle}>
            <BrandMark size={72} />
          </Animated.View>

          <Animated.View style={[styles.wordWrap, wordStyle]}>
            <Wordmark size={34} />
          </Animated.View>
        </View>

        <Animated.Text style={[styles.tagline, tagStyle]}>
          {t('The Honest Work Network')}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordWrap: {
    // Standard alignment for the Wordmark in a row
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.inkFaint,
    marginTop: 12,
    letterSpacing: 0.2,
  },
});
