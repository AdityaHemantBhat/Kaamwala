import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

interface BrutalBadgeProps {
  text: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: 'primary' | 'ink' | 'success' | 'warning' | 'error';
}

export function BrutalBadge({ 
  text, 
  style, 
  textStyle,
  variant = 'primary'
}: BrutalBadgeProps) {
  
  const getColors = () => {
    switch (variant) {
      case 'primary': return { bg: Colors.cream, text: Colors.orange, border: Colors.ink };
      case 'ink': return { bg: Colors.ink, text: Colors.cream, border: Colors.ink };
      case 'success': return { bg: Colors.successBg, text: Colors.success, border: Colors.success };
      case 'warning': return { bg: Colors.warningBg, text: Colors.warning, border: Colors.warning };
      case 'error': return { bg: Colors.errorBg, text: Colors.error, border: Colors.error };
      default: return { bg: Colors.cream, text: Colors.orange, border: Colors.ink };
    }
  };

  const colors = getColors();

  return (
    <View style={[
      styles.badge, 
      { backgroundColor: colors.bg, borderColor: colors.border },
      style
    ]}>
      <Text style={[styles.text, { color: colors.text }, textStyle]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 2,
    alignSelf: 'flex-start',
  },
  text: {
    ...Typography.label,
  }
});
