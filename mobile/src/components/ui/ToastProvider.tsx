import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

const TOAST_CONFIG: Record<ToastType, { icon: string; accent: string; bg: string }> = {
  success: { icon: 'check-circle', accent: '#1A5C2A', bg: 'rgba(26,92,42,0.08)' },
  error: { icon: 'alert-circle', accent: '#D32F2F', bg: 'rgba(211,47,47,0.08)' },
  info: { icon: 'information', accent: '#FF5C00', bg: 'rgba(255,92,0,0.08)' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    translateY.value = withTiming(120, { duration: 250 });
    opacity.value = withTiming(0, { duration: 250 }, () => {
      runOnJS(setToast)(null);
    });
  }, []);

  const showToast = useCallback(({ message, type = 'info', duration = 3000 }: ToastOptions) => {
    // Clear any pending timer so a new toast isn't dismissed early by the old one.
    if (hideTimer.current) clearTimeout(hideTimer.current);
    translateY.value = 0;
    opacity.value = 1;
    setToast({ message, type, duration });

    hideTimer.current = setTimeout(() => {
      hideToast();
    }, duration);
  }, [hideToast, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View style={[styles.container, animatedStyle]}>
          <View style={styles.content}>
            <View style={[styles.iconWrap, { backgroundColor: TOAST_CONFIG[toast.type!].bg }]}>
              <MaterialCommunityIcons
                name={TOAST_CONFIG[toast.type!].icon as any}
                size={22}
                color={TOAST_CONFIG[toast.type!].accent}
              />
            </View>
            <Text style={styles.text}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#0D0D0D',
    lineHeight: 20,
  },
});