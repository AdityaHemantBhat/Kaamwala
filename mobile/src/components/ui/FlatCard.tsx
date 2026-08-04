import React from 'react';
import { View, StyleSheet, ViewProps, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';

interface FlatCardProps extends ViewProps {
  style?: ViewStyle | ViewStyle[];
  noPadding?: boolean;
}

export function FlatCard({ children, style, noPadding = false, ...props }: FlatCardProps) {
  return (
    <View 
      style={[
        styles.card, 
        !noPadding && styles.padding,
        style
      ]} 
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  padding: {
    padding: 16,
  }
});
