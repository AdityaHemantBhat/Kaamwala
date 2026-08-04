import React, { useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';
import { useToast } from './ToastProvider';
import { useT } from '../../utils/i18n';
import * as Location from 'expo-location';
import { BrutalInkLoader } from './BrutalInkLoader';

interface SOSButtonProps {
  bookingId?: string;
}

export function SOSButton({ bookingId }: SOSButtonProps) {
  const t = useT();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const triggerSOS = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // 1. Get location quickly (last known is fine for SOS to be fast)
      let loc = await Location.getLastKnownPositionAsync();
      if (!loc) {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }

      // 2. Hit backend SOS
      await apiClient.post('/emergency/sos', {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        bookingId: bookingId || undefined,
        type: 'WORKER_SOS'
      });

      showToast({ message: t('SOS Alert Sent! Help is on the way.'), type: 'success' });
    } catch (error) {
      showToast({ message: t('Failed to send SOS. Please dial 112.'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={triggerSOS}
        delayLongPress={1500}
        style={styles.sosButton}
        accessibilityRole="button"
        accessibilityLabel={t('Hold for SOS')}
        accessibilityHint={t('Press and hold to send an emergency alert')}
      >
        {loading ? (
          <View style={{ transform: [{ scale: 0.5 }] }}>
            <BrutalInkLoader />
          </View>
        ) : (
          <MaterialCommunityIcons name="alert-decagram" size={16} color="#FFF" />
        )}
        <Text style={styles.sosText}>{t('HOLD FOR SOS')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sosButton: {
    backgroundColor: '#D32F2F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#D32F2F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#B71C1C',
  },
  sosText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#FFF',
    letterSpacing: 0.5,
  }
});
