import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useT } from '../../utils/i18n';

interface OutlineButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
  variant?: 'primary' | 'secondary' | 'danger';
}

export function OutlineButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  textStyle,
  variant = 'primary',
}: OutlineButtonProps) {
  const t = useT();

  const getBorderColor = () => {
    if (disabled) return Colors.border;
    if (variant === 'danger') return Colors.error;
    if (variant === 'secondary') return Colors.textSecondary;
    return Colors.text; // Black border for primary sketchy look
  };

  const getTextColor = () => {
    if (disabled) return Colors.textMuted;
    if (variant === 'danger') return Colors.error;
    if (variant === 'secondary') return Colors.textSecondary;
    return Colors.text;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { borderColor: getBorderColor() },
        pressed && !disabled && { backgroundColor: Colors.surfaceAlt },
        disabled && styles.buttonDisabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={loading ? t('Loading') : title}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text style={[styles.text, { color: getTextColor() }, textStyle]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderWidth: 2,
    borderRadius: 8, // slight rounding for standard functional look
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  buttonDisabled: {
    backgroundColor: Colors.surfaceAlt,
    opacity: 0.6,
  },
  text: {
    fontFamily: Typography.fontSemi,
    fontSize: Typography.size.md,
  },
});
