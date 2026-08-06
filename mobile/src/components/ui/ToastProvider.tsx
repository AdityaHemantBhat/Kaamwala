import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type ToastType = 'success' | 'error' | 'info';

interface ToastOptions {
  /** Primary line of the toast (bold). */
  title?: string;
  /** Supporting body text shown under the title. */
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

const ENTER_DURATION_MS = 220;
const EXIT_DURATION_MS = 250;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending hide timer on unmount.
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const hideToast = useCallback(() => {
    translateY.value = withTiming(120, { duration: EXIT_DURATION_MS });
    opacity.value = withTiming(0, { duration: EXIT_DURATION_MS }, (finished) => {
      // Only clear the toast if the exit animation actually completed. Without
      // the `finished` guard, a cancelled exit (a new toast shown mid-dismiss)
      // would fire this callback and immediately hide the NEW toast.
      if (finished) runOnJS(setToast)(null);
    });
  }, [opacity, translateY]);

  const showToast = useCallback(({ message, type = 'info', duration = 3000 }: ToastOptions) => {
    // Clear any pending timer so a new toast isn't dismissed early by the old one.
    if (hideTimer.current) clearTimeout(hideTimer.current);
    // Slide up + fade in (previously a hard snap).
    translateY.value = withTiming(0, { duration: ENTER_DURATION_MS });
    opacity.value = withTiming(1, { duration: ENTER_DURATION_MS });
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
            <View style={[styles.iconWrap, { backgroundColor: TOAST_CONFIG[toast.type ?? 'info'].bg }]}>
              <MaterialCommunityIcons
                name={TOAST_CONFIG[toast.type ?? 'info'].icon as any}
                size={22}
                color={TOAST_CONFIG[toast.type ?? 'info'].accent}
              />
            </View>
            {toast.title ? (
              <View style={styles.textWrap}>
                <Text style={styles.title}>{toast.title}</Text>
                <Text style={styles.body}>{toast.message}</Text>
              </View>
            ) : (
              <Text style={styles.text}>{toast.message}</Text>
            )}
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
  textWrap: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#0D0D0D',
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#4A4A4A',
    lineHeight: 18,
    marginTop: 2,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#0D0D0D',
    lineHeight: 20,
  },
});
