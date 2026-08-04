import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface FeaturedBadgeProps {
  /** Server-provided ISO timestamp when the featured period expires. */
  featuredUntil?: string | null;
  /** Current `isFeatured` flag from the worker profile. */
  isFeatured?: boolean;
  /** Optional compact variant for tight spaces (search cards). */
  compact?: boolean;
}

/**
 * Returns true if the worker is currently featured (server flag + unexpired).
 * The check mirrors the backend's `isFeaturedActive` logic so UI never
 * disagrees with search ranking.
 */
export function isFeaturedActive(isFeatured?: boolean, featuredUntil?: string | null): boolean {
  if (!isFeatured) return false;
  if (!featuredUntil) return true; // legacy rows without expiry = always featured
  return new Date(featuredUntil) > new Date();
}

export function FeaturedBadge({ featuredUntil, isFeatured, compact = false }: FeaturedBadgeProps) {
  const active = isFeaturedActive(isFeatured, featuredUntil);
  if (!active) return null;

  if (compact) {
    return (
      <View style={styles.compactBadge} accessibilityLabel="Featured">
        <MaterialCommunityIcons name="star-circle" size={12} color="#FFD700" />
        <Text style={styles.compactBadgeText}>Featured</Text>
      </View>
    );
  }

  return (
    <View style={styles.badge} accessibilityLabel="Featured profile">
      <MaterialCommunityIcons name="star-circle" size={14} color="#FFD700" />
      <Text style={styles.badgeText}>Featured</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFECB3',
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#F57F17',
    marginLeft: 4,
  },
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFECB3',
  },
  compactBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    color: '#F57F17',
    marginLeft: 3,
  },
});