import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps, StyleProp, ViewStyle, Text } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';

interface BrutalInputProps extends TextInputProps {
  containerStyle?: StyleProp<ViewStyle>;
  label?: string;
  error?: string;
  leftElement?: React.ReactNode;
}

export function BrutalInput({ 
  containerStyle, 
  label, 
  error, 
  leftElement,
  style,
  ...props 
}: BrutalInputProps) {
  
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      
      <View style={styles.inputContainer}>
        {/* Shadow View */}
        <View style={[styles.shadow, { backgroundColor: error ? Colors.error : Colors.ink }]} />
        
        {/* Foreground View */}
        <View style={[styles.inputBox, error && styles.inputBoxError]}>
          {leftElement && <View style={styles.leftElement}>{leftElement}</View>}
          <TextInput
            style={[styles.input, style]}
            placeholderTextColor={Colors.inkFaint}
            {...props}
          />
        </View>
      </View>
      
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    ...Typography.label,
    color: Colors.inkFaint,
    marginBottom: 8,
  },
  inputContainer: {
    position: 'relative',
    width: '100%',
  },
  shadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: '100%',
    height: '100%',
  },
  inputBox: {
    width: '100%',
    minHeight: 56,
    borderWidth: 2,
    borderColor: Colors.ink,
    backgroundColor: Colors.cream,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  inputBoxError: {
    borderColor: Colors.error,
  },
  leftElement: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    ...Typography.bodyMed,
    fontSize: Typography.size.md,
    color: Colors.ink,
    height: '100%',
  },
  errorText: {
    ...Typography.body,
    fontSize: Typography.size.sm,
    color: Colors.error,
    marginTop: 8,
  }
});
