import React from 'react';
import { View, Text, StyleSheet, Pressable, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BrutalInkLoader } from './BrutalInkLoader';
import { useT } from '../../utils/i18n';

interface BrutalButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
}

export function BrutalButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = true
}: BrutalButtonProps) {
  const t = useT();
  const isPressed = useSharedValue(false);
  const offset = variant === 'ghost' ? 0 : 3;

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: withSpring(isPressed.value ? offset : 0, { stiffness: 400, damping: 20 }) },
        { translateY: withSpring(isPressed.value ? offset : 0, { stiffness: 400, damping: 20 }) },
      ],
    };
  });

  const getBgColor = () => {
    if (disabled && variant !== 'ghost') return Colors.creamDark;
    if (variant === 'primary') return Colors.orange;
    if (variant === 'secondary') return Colors.cream;
    return 'transparent';
  };

  const getBorderColor = () => {
    if (disabled) return Colors.inkHair;
    if (variant === 'ghost') return 'transparent';
    return Colors.ink;
  };

  if (variant === 'ghost') {
    return (
      <Pressable
        onPressIn={() => (isPressed.value = true)}
        onPressOut={() => (isPressed.value = false)}
        onPress={onPress}
        disabled={disabled || loading}
        style={[styles.ghostContainer, fullWidth && { width: '100%' }, style]}
        accessibilityRole="button"
        accessibilityLabel={loading ? t('Loading') : title}
        accessibilityState={{ disabled: disabled || loading }}
      >
        <Animated.View style={[styles.ghostInner, animatedStyle]}>
          {icon && <MaterialCommunityIcons name={icon} size={20} color={disabled ? Colors.inkFaint : Colors.ink} style={styles.icon} />}
          <Text style={[styles.ghostText, disabled && { color: Colors.inkFaint }, textStyle]}>
            {loading ? t('WAIT...') : title}
          </Text>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, fullWidth && { width: '100%' }, style]}>
      {/* Shadow View */}
      <View style={[
        styles.shadow, 
        { 
          top: offset, 
          left: offset, 
          backgroundColor: disabled ? 'transparent' : Colors.ink 
        }
      ]} />
      
      {/* Foreground Animated View */}
      <Pressable
        onPressIn={() => (isPressed.value = true)}
        onPressOut={() => (isPressed.value = false)}
        onPress={onPress}
        disabled={disabled || loading}
        style={styles.pressable}
        accessibilityRole="button"
        accessibilityLabel={loading ? t('Loading') : title}
        accessibilityState={{ disabled: disabled || loading }}
      >
        <Animated.View style={[
          styles.button,
          animatedStyle, 
          { 
            backgroundColor: getBgColor(),
            borderColor: getBorderColor()
          }
        ]}>
          {loading ? (
            <BrutalInkLoader />
          ) : (
            <>
              <Text style={[styles.text, disabled && { color: Colors.inkFaint }, textStyle]}>
                {title}
              </Text>
              {icon && <MaterialCommunityIcons name={icon} size={20} color={disabled ? Colors.inkFaint : Colors.ink} style={styles.iconRight} />}
            </>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    height: 56,
  },
  shadow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  pressable: {
    width: '100%',
    height: '100%',
  },
  button: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  text: {
    ...Typography.heading,
    fontSize: Typography.size.md,
    color: Colors.ink,
  },
  iconRight: {
    marginLeft: 8,
  },
  ghostContainer: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ghostInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ghostText: {
    ...Typography.label,
    fontSize: Typography.size.sm,
    color: Colors.ink,
  },
  icon: {
    marginRight: 8,
  }
});
