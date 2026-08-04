import React, { useRef } from 'react';
import { View, Animated, PanResponder, ViewStyle, StyleProp } from 'react-native';

interface SwipeableNotificationRowProps {
  id: string;
  /** Called once the row is swiped far enough right to trigger delete. */
  onRemove: (id: string) => void;
  /** The notification item content (the tappable row). */
  children: React.ReactNode;
  /** Optional spacing around the row (e.g. marginBottom between items). */
  style?: StyleProp<ViewStyle>;
}

const SWIPE_DELETE_THRESHOLD = 60; // px of right-swipe before it deletes
const DRAG_LIMIT = 40; // how far the row follows the finger while dragging

/**
 * Slide-to-delete wrapper for a notification row — no revealed button, the swipe
 * itself is the delete.
 *
 * Uses a plain RN PanResponder (no gesture-handler/reanimated dependency) so it
 * works reliably in every environment — including Expo Go and the New
 * Architecture. The responder only claims a RIGHTWARD horizontal swipe (so
 * vertical scrolling and leftward drags pass through to the list). Swiping right
 * past the threshold slides the row off and calls `onRemove`; anything less
 * springs back.
 */
export function SwipeableNotificationRow({ id, onRemove, children, style }: SwipeableNotificationRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const firedRef = useRef(false);

  const springBack = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture for a RIGHTWARD horizontal swipe; vertical drags
      // and leftward drags are left to the ScrollView.
      onMoveShouldSetPanResponder: (_evt, g) =>
        g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_evt, g) => {
        translateX.setValue(Math.max(0, Math.min(DRAG_LIMIT, g.dx)));
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dx > SWIPE_DELETE_THRESHOLD) {
          if (firedRef.current) return;
          firedRef.current = true;
          // Slide the row off to the right, then remove it.
          Animated.timing(translateX, {
            toValue: 200,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onRemove(id));
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: springBack,
    })
  ).current;

  return (
    <View style={style}>
      <Animated.View
        {...panResponder.panHandlers}
        style={{ width: '100%', transform: [{ translateX }] }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
