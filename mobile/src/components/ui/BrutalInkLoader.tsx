import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  Easing,
  withSequence,
  withDelay
} from 'react-native-reanimated';
import { Colors } from '../../constants/colors';

interface BrutalInkLoaderProps {
  style?: StyleProp<ViewStyle>;
  color?: string;
  height?: number;
}

export function BrutalInkLoader({ 
  style, 
  color = Colors.ink,
  height = 4
}: BrutalInkLoaderProps) {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
        withDelay(200, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: `${progress.value * 100}%`,
    };
  });

  return (
    <View style={[styles.container, { height }, style]}>
      <Animated.View style={[styles.ink, animatedStyle, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  ink: {
    height: '100%',
  }
});
