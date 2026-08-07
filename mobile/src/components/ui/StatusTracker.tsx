import React, { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useT } from '../../utils/i18n';

export type BookingStatus = 'PENDING' | 'ACCEPTED' | 'ON_THE_WAY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const STATUS_STEPS = [
  { status: 'PENDING', label: 'Requested', icon: 'clock-outline' },
  { status: 'ACCEPTED', label: 'Accepted', icon: 'check-circle-outline' },
  { status: 'ON_THE_WAY', label: 'On The Way', icon: 'moped' },
  { status: 'IN_PROGRESS', label: 'In Progress', icon: 'tools' },
  { status: 'COMPLETED', label: 'Completed', icon: 'star-outline' },
];

interface StatusTrackerProps {
  currentStatus: BookingStatus;
}

export const StatusTracker: React.FC<StatusTrackerProps> = ({ currentStatus }) => {
  const t = useT();
  const currentIndex = STATUS_STEPS.findIndex(s => s.status === currentStatus);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  
  const progress = useSharedValue(0);

  useEffect(() => {
    // 0 to 4 steps -> 0% to 100%
    const targetProgress = safeIndex / (STATUS_STEPS.length - 1);
    progress.value = withTiming(targetProgress, {
      duration: 800,
      easing: Easing.inOut(Easing.ease),
    });
  }, [safeIndex, progress]);

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: `${progress.value * 100}%`,
    };
  });

  if (currentStatus === 'CANCELLED') {
    return (
      <View style={styles.cancelledContainer}>
        <MaterialCommunityIcons name="close-circle" size={32} color={Colors.error} />
        <Text style={styles.cancelledText}>{t('Booking Cancelled')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Background Track */}
      <View style={styles.trackBackground} />
      
      {/* Animated Fill Track */}
      <Animated.View style={[styles.trackFill, progressStyle]} />
      
      {/* Steps */}
      <View style={styles.stepsContainer}>
        {STATUS_STEPS.map((step, index) => {
          const isActive = index <= safeIndex;
          const isCurrent = index === safeIndex;
          
          return (
            <View key={step.status} style={styles.stepWrapper}>
              <View style={[styles.iconContainer, isActive && styles.iconContainerActive, isCurrent && styles.iconContainerCurrent]}>
                <MaterialCommunityIcons 
                  name={step.icon as any} 
                  size={20} 
                  color={isActive ? Colors.surface : Colors.textMuted} 
                />
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                {t(step.label)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 24,
    position: 'relative',
    paddingHorizontal: 16,
  },
  trackBackground: {
    position: 'absolute',
    top: 20,
    left: 40,
    right: 40,
    height: 4,
    backgroundColor: Colors.borderLight,
    borderRadius: 2,
    zIndex: 1,
  },
  trackFill: {
    position: 'absolute',
    top: 20,
    left: 40,
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
    zIndex: 2,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  stepWrapper: {
    alignItems: 'center',
    width: 60,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainerActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  iconContainerCurrent: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  stepLabel: {
    fontFamily: Typography.fontBody,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  stepLabelActive: {
    fontFamily: Typography.fontBodyMed,
    color: Colors.text,
  },
  cancelledContainer: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: Colors.errorLight,
    borderRadius: 16,
    marginVertical: 16,
  },
  cancelledText: {
    fontFamily: Typography.fontSemi,
    fontSize: Typography.size.md,
    color: Colors.error,
    marginTop: 8,
  }
});
