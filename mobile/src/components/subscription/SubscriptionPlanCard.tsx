/**
 * Reusable subscription plan card component
 * Eliminates duplication between customer and worker subscription screens
 * Handles plan rendering for both customer and worker contexts
 */

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SUBSCRIPTION_COLORS, SUBSCRIPTION_STYLES } from './subscriptionConstants';

interface Plan {
  id: string;
  name: string;
  price?: number;
  label?: string;
  color: string;
  features?: string[];
  popular?: boolean;
  commission?: string;
}

interface SubscriptionPlanCardProps {
  plan: Plan;
  isActive: boolean;
  isSelected: boolean;
  isPro?: boolean;
  isElite?: boolean;
  onPress: () => void;
  index?: number;
  variant?: 'customer' | 'worker'; // customer has simpler cards, worker has more features
}

export const SubscriptionPlanCard = React.memo(({
  plan,
  isActive,
  isSelected,
  isPro = false,
  isElite = false,
  onPress,
  index = 0,
  variant = 'customer',
}: SubscriptionPlanCardProps) => {
  // Memoize border color logic
  const borderColor = useMemo(() => {
    if (isActive) return SUBSCRIPTION_COLORS.primary;
    if (isPro) return SUBSCRIPTION_COLORS.primary;
    if (isElite) return SUBSCRIPTION_COLORS.elite;
    return SUBSCRIPTION_COLORS.border;
  }, [isActive, isPro, isElite]);

  // Memoize background color logic
  const backgroundColor = useMemo(() => {
    if (isActive || isSelected) return SUBSCRIPTION_COLORS.white;
    if (isPro || isElite) return SUBSCRIPTION_COLORS.white;
    return SUBSCRIPTION_COLORS.white;
  }, [isActive, isSelected, isPro, isElite]);

  // Memoize elevation/shadow
  const shadowStyle = useMemo(() => SUBSCRIPTION_STYLES.shadowMedium, []);

  // Customer variant: simpler card layout
  if (variant === 'customer') {
    return (
      <Animated.View entering={FadeIn.delay((index || 0) * 80).duration(400)}>
        <Pressable
          onPress={onPress}
          style={[
            styles.cardBase,
            shadowStyle,
            {
              borderWidth: isSelected && !isActive ? 2 : 0,
              borderColor: isSelected && !isActive ? borderColor : 'transparent',
              backgroundColor,
            },
          ]}>
          {/* Popular badge */}
          {plan.popular && !isActive && (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: SUBSCRIPTION_COLORS.primary,
                  shadowColor: SUBSCRIPTION_COLORS.primary,
                },
              ]}>
              <Text style={styles.badgeText}>POPULAR</Text>
            </View>
          )}

          {/* Active indicator */}
          {isActive && (
            <View style={styles.activeIndicator}>
              <View style={[styles.activeDot, { backgroundColor: SUBSCRIPTION_COLORS.success }]} />
              <Text style={[styles.activeText, { color: SUBSCRIPTION_COLORS.success }]}>Active</Text>
            </View>
          )}

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.planName, { color: isActive ? plan.color : SUBSCRIPTION_COLORS.dark }]}>
                {plan.name}
              </Text>
              <Text style={styles.firstFeature}>{plan.features?.[0]}</Text>
            </View>
            <Text style={[styles.planLabel, { color: plan.color }]}>{plan.label}</Text>
          </View>

          {/* Features list */}
          {plan.features && plan.features.length > 1 && (
            <View style={styles.featuresList}>
              {plan.features.slice(1).map((feature, i) => (
                <View key={i} style={styles.featureRow}>
                  <MaterialCommunityIcons name="check-circle" size={18} color={SUBSCRIPTION_COLORS.primary} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  // Worker variant: card with more styling options (popular, selected badges)
  const badgeColor = isElite ? SUBSCRIPTION_COLORS.elite : SUBSCRIPTION_COLORS.primary;
  const selectedBgColor = isElite ? '#FDFBFD' : '#FFFDF9';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.cardBase,
        shadowStyle,
        {
          borderColor: isSelected ? badgeColor : SUBSCRIPTION_COLORS.border,
          backgroundColor: isSelected ? selectedBgColor : backgroundColor,
        },
      ]}>
      {/* Selected/Current badge */}
      {isSelected && (
        <View style={[styles.workerBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>SELECTED</Text>
        </View>
      )}

      {/* Elite glow effect */}
      {isElite && <View style={styles.eliteGlow} />}

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planName, { color: isActive ? plan.color : SUBSCRIPTION_COLORS.dark }]}>
            {plan.name}
          </Text>
          <Text style={styles.planDesc}>
            {plan.commission ? `Pay ${plan.commission} instead of 15%` : plan.label}
          </Text>
        </View>
        {plan.price && (
          <View style={styles.priceCol}>
            <Text style={[styles.priceValue, { color: plan.color }]}>₹{plan.price}</Text>
            <Text style={styles.priceUnit}>/month</Text>
          </View>
        )}
      </View>

      {/* Active badge for worker cards */}
      {isActive && (
        <View style={[styles.currentBadge, { marginTop: 12 }]}>
          <Text style={styles.currentBadgeText}>CURRENT</Text>
        </View>
      )}

      {/* Features list */}
      {plan.features && plan.features.length > 0 && (
        <View style={styles.featuresList}>
          {plan.features.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <MaterialCommunityIcons
                name={isElite ? 'star-circle' : 'check'}
                size={16}
                color={plan.color}
              />
              <Text
                style={[
                  styles.featureText,
                  isElite && feature.includes('Only 5%') && { fontFamily: 'Inter_700Bold' },
                ]}>
                {feature}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
});

SubscriptionPlanCard.displayName = 'SubscriptionPlanCard';

const styles = StyleSheet.create({
  cardBase: {
    borderRadius: 16,
    backgroundColor: SUBSCRIPTION_COLORS.white,
    padding: 20,
    marginBottom: 14,
    borderWidth: 2,
    overflow: 'visible',
  },

  badge: {
    position: 'absolute',
    top: -8,
    right: 16,
    backgroundColor: SUBSCRIPTION_COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: SUBSCRIPTION_COLORS.white,
  },

  workerBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },

  activeIndicator: {
    position: 'absolute',
    top: 12,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  activeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },

  eliteGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(74, 20, 140, 0.05)',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },

  planName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },

  firstFeature: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: SUBSCRIPTION_COLORS.gray,
    marginTop: 2,
  },

  planDesc: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: SUBSCRIPTION_COLORS.gray,
    marginTop: 4,
  },

  planLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },

  priceCol: {
    alignItems: 'flex-end',
  },

  priceValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 24,
  },

  priceUnit: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: SUBSCRIPTION_COLORS.gray,
  },

  currentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },

  currentBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: SUBSCRIPTION_COLORS.gray,
  },

  featuresList: {
    marginTop: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: SUBSCRIPTION_COLORS.lightGray,
    paddingTop: 14,
  },

  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  featureText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: SUBSCRIPTION_COLORS.darkGray,
  },
});
