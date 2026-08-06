import React, { forwardRef, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { default as GorhomBottomSheet, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Colors } from '../../constants/colors';

interface BottomSheetProps {
  children: React.ReactNode;
  snapPoints?: string[];
  onClose?: () => void;
}

export const BottomSheet = forwardRef<GorhomBottomSheet, BottomSheetProps>(
  ({ children, snapPoints = ['50%'], onClose }, ref) => {
    const defaultSnapPoints = useMemo(() => snapPoints, [snapPoints]);

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    );

    return (
      <GorhomBottomSheet
        ref={ref}
        index={-1}
        snapPoints={defaultSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={onClose}
        // Keep the sheet content visible above the soft keyboard when an input
        // inside it is focused, and restore the sheet position on blur.
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.indicator}
      >
        <BottomSheetView style={styles.contentContainer}>
          {children}
        </BottomSheetView>
      </GorhomBottomSheet>
    );
  }
);

BottomSheet.displayName = 'BottomSheet';

const styles = StyleSheet.create({
  background: {
    backgroundColor: Colors.cream,
    borderRadius: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: Colors.ink,
  },
  indicator: {
    backgroundColor: Colors.ink,
    width: 60,
    height: 4,
    borderRadius: 0,
  },
  contentContainer: {
    flex: 1,
    padding: 24,
  }
});
