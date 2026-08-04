import React from 'react';
import { View, StyleSheet, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';

interface BrutalCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  offset?: number;
  bg?: string;
  noPadding?: boolean;
}

export function BrutalCard({ 
  children, 
  style, 
  onPress, 
  offset = 4, 
  bg = Colors.cream,
  noPadding = false 
}: BrutalCardProps) {
  const isPressed = useSharedValue(false);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: withSpring(isPressed.value ? offset : 0, { stiffness: 400, damping: 20 }) },
        { translateY: withSpring(isPressed.value ? offset : 0, { stiffness: 400, damping: 20 }) },
      ],
    };
  });

  if (onPress) {
    return (
      <View style={[styles.container, style]}>
        {/* Shadow View */}
        <View style={[styles.shadow, { top: offset, left: offset, backgroundColor: Colors.ink }]} />
        
        {/* Foreground Animated View */}
        <Pressable
          onPressIn={() => (isPressed.value = true)}
          onPressOut={() => (isPressed.value = false)}
          onPress={onPress}
          style={styles.pressable}
        >
          <Animated.View style={[
            styles.card, 
            animatedStyle, 
            { backgroundColor: bg },
            !noPadding && styles.padding
          ]}>
            {children}
          </Animated.View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Shadow View */}
      <View style={[styles.shadow, { top: offset, left: offset, backgroundColor: Colors.ink }]} />
      
      {/* Foreground View */}
      <View style={[
        styles.card, 
        { backgroundColor: bg },
        !noPadding && styles.padding
      ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  shadow: {
    position: 'absolute',
    right: -4, // Default, overridden by top/left logic but needs bounds
    bottom: -4,
    width: '100%',
    height: '100%',
  },
  pressable: {
    width: '100%',
  },
  card: {
    width: '100%',
    borderWidth: 2,
    borderColor: Colors.ink,
  },
  padding: {
    padding: 16,
  }
});
