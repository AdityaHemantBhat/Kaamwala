import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
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
import { Colors } from '../../constants/colors';
import { useT } from '../../utils/i18n';

const AnimatedImage = Animated.createAnimatedComponent(Image);

interface BrandLaunchScreenProps {
  onFinish?: () => void;
 /** Total time the launch screen is visible before it fades out. */
  duration?: number;
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
  duration = 5000,
}: BrandLaunchScreenProps) {
  const t = useT();
  const reduced = useReducedMotion();
  // Reduced motion: everything visible from the start. Otherwise wait until the
  // logo image finishes decoding before beginning the reveal.
  const [imgReady, setImgReady] = useState(reduced);

  // A bundled asset can fire `onLoad` synchronously during the first render
  // before this component has finished mounting. Setting React state in that
  // handler triggers React's "state update on a component that hasn't mounted
  // yet" warning, so defer the update by one tick to land after mount.
  const handleLogoLoaded = () => {
    setTimeout(() => setImgReady(true), 0);
  };

  const logoOp = useSharedValue(reduced ? 1 : 0);
  const logoScale = useSharedValue(reduced ? 1 : 0.9);
  const wordOp = useSharedValue(reduced ? 1 : 0);
  const wordY = useSharedValue(0);
  const tagOp = useSharedValue(reduced ? 1 : 0);
  const barW = useSharedValue(0);
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
    barW.value = withTiming(1, {
      duration: Math.max(total - 500, 600),
      easing: Easing.inOut(Easing.cubic),
    });

    const fadeMs = reduced ? 200 : 350;
    const timer = setTimeout(() => {
      overlayOp.value = withTiming(0, { duration: fadeMs, easing: Easing.out(Easing.cubic) });
      setTimeout(() => {
        if (onFinish) runOnJS(onFinish)();
      }, fadeMs + 40);
    }, total);

    return () => clearTimeout(timer);
  }, [imgReady]);

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
  const barStyle = useAnimatedStyle(() => ({ width: `${barW.value * 100}%` }));

  return (
    <Animated.View style={[styles.container, overlayStyle]}>
      <View style={styles.content}>
        <AnimatedImage
          source={require('../../../assets/android-icon-foreground.png')}
          style={[styles.logo, logoStyle]}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={handleLogoLoaded}
          onError={handleLogoLoaded}
        />

        <Animated.View style={[styles.wordWrap, wordStyle]}>
          <Wordmark size={34} />
        </Animated.View>

        <Animated.Text style={[styles.tagline, tagStyle]}>
          {t('The Honest Work Network')}
        </Animated.Text>

        {/* Hairline progress shimmer */}
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, barStyle]} />
        </View>
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
  logo: {
    width: 150,
    height: 150,
  },
  wordWrap: {
    marginTop: 26,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.inkFaint,
    marginTop: 12,
    letterSpacing: 0.2,
  },
  barTrack: {
    width: 170,
    height: 2,
    backgroundColor: Colors.creamDark,
    borderRadius: 1,
    overflow: 'hidden',
    marginTop: 38,
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.orange,
    borderRadius: 1,
  },
});
