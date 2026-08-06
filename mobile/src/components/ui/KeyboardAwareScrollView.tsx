/**
 * Keyboard-aware scroll view that automatically scrolls to the focused input
 * and keeps it visible above the keyboard on both Android (edge-to-edge) and
 * iOS.
 *
 * This is a thin re-export of `react-native-keyboard-controller`'s
 * KeyboardAwareScrollView, which measures the focused TextInput and scrolls it
 * into the visible area whenever the keyboard shows. All ScrollView props are
 * supported (e.g. `contentContainerStyle`, `refreshControl`,
 * `keyboardShouldPersistTaps`).
 */

export { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
