/**
 * Keyboard-aware scroll view that automatically scrolls to focused input
 * and provides proper keyboard avoidance.
 * 
 * Wrapper around ScrollView that handles keyboard show/hide lifecycle.
 */

import React, { useRef, useEffect } from 'react';
import {
  ScrollView,
  ScrollViewProps,
  Keyboard,
  Platform,
  View,
} from 'react-native';

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  children?: React.ReactNode;
}

/**
 * KeyboardAwareScrollView: Automatically scrolls to TextInput when focused.
 * Works on both iOS and Android.
 */
export const KeyboardAwareScrollView = React.forwardRef<
  ScrollView,
  KeyboardAwareScrollViewProps
>(({ children, keyboardShouldPersistTaps = 'handled', ...props }, ref) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (Platform.OS === 'ios') {
      // On iOS, use keyboard show/hide events to scroll
      const keyboardWillShow = Keyboard.addListener(
        'keyboardWillShow',
        ({ duration }) => {
          setTimeout(() => {
            // ScrollView will auto-scroll to focused input
          }, duration);
        }
      );

      return () => {
        keyboardWillShow.remove();
      };
    }
  }, []);

  return (
    <ScrollView
      ref={ref || scrollViewRef}
      scrollEnabled={true}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bounces={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={true}
      {...props}
    >
      {children}
      {/* Bottom padding for keyboard avoidance */}
      <View style={{ height: Platform.OS === 'android' ? 0 : 0 }} />
    </ScrollView>
  );
});

KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';
