import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface WordmarkProps {
 /** Font size of the wordmark. */
  size?: number;
  color?: string;
  accentColor?: string;
 /** Show the diamond accent (the mark's bond-point motif) after the word. */
  showAccent?: boolean;
}

/**
 * KaamWala wordmark — Poppins 800, tight tracking, with the mark's rounded
 * diamond as a floating accent. The diamond mirrors the Bond mark's knot.
 */
export function Wordmark({
  size = 34,
  color = '#0D0D0D',
  accentColor = '#FF5C00',
  showAccent = true,
}: WordmarkProps) {
  const accent = size * 0.26;
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { fontSize: size, color }]}>KaamWala</Text>
      {showAccent && (
        <View
          style={[
            styles.accent,
            {
              width: accent,
              height: accent,
              marginLeft: size * 0.18,
              marginTop: size * 0.14,
              borderRadius: accent * 0.22,
              backgroundColor: accentColor,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  text: {
    fontFamily: 'Poppins_800ExtraBold',
    letterSpacing: -0.6,
  },
  accent: {
    transform: [{ rotate: '45deg' }],
  },
});
