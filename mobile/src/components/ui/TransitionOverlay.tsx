import React, { useEffect } from 'react';
import { StyleSheet, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useT } from '../../utils/i18n';
import { BrandMark } from './BrandMark';
import { Colors } from '../../constants/colors';

type TransitionType = 'success' | 'loading' | 'logout';

interface TransitionOverlayProps {
  visible: boolean;
  type: TransitionType;
  message?: string;
  onComplete?: () => void;
}

export function TransitionOverlay({
  visible,
  type,
  message,
  onComplete,
}: TransitionOverlayProps) {
  const fadeOp = useSharedValue(0);
  const textOp = useSharedValue(0);
  const ringPulse = useSharedValue(1);
  const t = useT();

  const displayMessage =
    message ||
    (type === 'success'
      ? t('Welcome!')
      : type === 'logout'
      ? t('See you soon!')
      : t('Please wait...'));

  const [typedMessage, setTypedMessage] = React.useState('');

  useEffect(() => {
    if (visible && type === 'success') {
      setTypedMessage('');
      let currentLength = 0;
      const interval = setInterval(() => {
        if (currentLength <= displayMessage.length) {
          setTypedMessage(displayMessage.slice(0, currentLength));
          currentLength++;
        } else {
          clearInterval(interval);
        }
      }, 80);
      return () => clearInterval(interval);
    } else {
      setTypedMessage(displayMessage);
    }
  }, [visible, type, displayMessage]);

  useEffect(() => {
    if (visible) {
      fadeOp.value = withTiming(1, { duration: 300 });
      textOp.value = withDelay(300, withTiming(1, { duration: 400 }));

      // Soft breathing ring while loading (never a hard spinner).
      if (type === 'loading') {
        ringPulse.value = withRepeat(
          withSequence(
            withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.sin) }),
            withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          true,
        );
      }

      const delay = type === 'logout' ? 1200 : type === 'success' ? 3000 : 2000;
      if (onComplete) {
        const timer = setTimeout(() => runOnJS(onComplete)(), delay);
        return () => clearTimeout(timer);
      }
    } else {
      fadeOp.value = withTiming(0, { duration: 200 });
    }
    // Shared values are stable refs; onComplete is a plain callback prop and the
    // completion timer is one-shot per show, so don't re-schedule on identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, type, fadeOp, textOp, ringPulse]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: fadeOp.value }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOp.value }));
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringPulse.value }] }));



  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => {}}>
      <Animated.View style={[styles.overlay, containerStyle]}>
        {type === 'loading' && (
          <Animated.View
            style={[
              styles.iconRing,
              type === 'loading' && pulseStyle,
            ]}
          >
            <BrandMark size={type === 'loading' ? 50 : 56} />
          </Animated.View>
        )}

        <Animated.Text style={[styles.message, textStyle]}>
          {typedMessage}
        </Animated.Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.cream,
    borderWidth: 1.5,
    borderColor: Colors.inkHair,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  message: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 20,
    color: Colors.ink,
    textAlign: 'center',
    letterSpacing: 1,
  },
});
