import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface BrandMarkProps {
  size?: number;
  color?: string;
  accentColor?: string;
  mono?: boolean;
  animated?: boolean;
  preloader?: boolean;
}

export function BrandMark({
  size = 80,
  animated = false,
  preloader = false,
}: BrandMarkProps) {
  const markScale = useSharedValue(preloader || animated ? 0.88 : 1);
  const markOp = useSharedValue(preloader ? 0 : 1);

  useEffect(() => {
    if (preloader) {
      markScale.value = withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) });
      markOp.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    } else if (animated) {
      markScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    }
  }, [preloader, animated, markScale, markOp]);

  const markStyle = useAnimatedStyle(() => ({ 
    transform: [{ scale: markScale.value }],
    opacity: markOp.value 
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={markStyle}>
        <Image 
          source={require('../../../assets/icon.png')} 
          style={{ width: size, height: size, borderRadius: size * 0.2 }}
          contentFit="cover"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
