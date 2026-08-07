/**
 * Unified FormInput component for all text input needs across the app.
 * 
 * Features:
 * - Proper keyboard types (numeric, email, phone, etc.)
 * - Correct autoComplete values
 * - autoCapitalize handling
 * - secureTextEntry for passwords
 * - Consistent styling across app
 * - Error state display
 * - Icon support
 * - Accessible and keyboard-aware
 */

import React from 'react';
import {
  TextInput as RNTextInput,
  View,
  Text,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type FormInputType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'password'
  | 'url'
  | 'search'
  | 'pincode'
  | 'decimal'
  | 'bankaccount'
  | 'upi';

interface FormInputProps extends Omit<TextInputProps, 'placeholderTextColor'> {
  label?: string;
  type?: FormInputType;
  error?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  containerStyle?: any;
  required?: boolean;
  testID?: string;
}

/**
 * Get keyboard type and autoComplete based on input type.
 * Returns defaults that work across iOS and Android.
 */
function getKeyboardConfig(type: FormInputType) {
  const configs: Record<FormInputType, {
    keyboardType: TextInputProps['keyboardType'];
    autoComplete: TextInputProps['autoComplete'];
    autoCapitalize: TextInputProps['autoCapitalize'];
    secureTextEntry?: boolean;
    textContentType?: TextInputProps['textContentType'];
  }> = {
    text: {
      keyboardType: 'default',
      autoComplete: 'off',
      autoCapitalize: 'sentences',
    },
    email: {
      keyboardType: 'email-address',
      autoComplete: 'email',
      autoCapitalize: 'none',
      textContentType: 'emailAddress',
    },
    phone: {
      keyboardType: 'phone-pad',
      autoComplete: 'tel',
      autoCapitalize: 'none',
      textContentType: 'telephoneNumber',
    },
    number: {
      keyboardType: 'number-pad',
      autoComplete: 'off',
      autoCapitalize: 'none',
    },
    decimal: {
      keyboardType: 'decimal-pad',
      autoComplete: 'off',
      autoCapitalize: 'none',
    },
    password: {
      keyboardType: 'default',
      autoComplete: 'password',
      autoCapitalize: 'none',
      secureTextEntry: true,
      textContentType: 'password',
    },
    url: {
      keyboardType: 'url',
      autoComplete: 'off',
      autoCapitalize: 'none',
      textContentType: 'URL',
    },
    search: {
      keyboardType: 'default',
      autoComplete: 'off',
      autoCapitalize: 'none',
    },
    pincode: {
      keyboardType: 'number-pad',
      autoComplete: 'off',
      autoCapitalize: 'none',
      textContentType: 'postalCode',
    },
    bankaccount: {
      keyboardType: 'number-pad',
      autoComplete: 'off',
      autoCapitalize: 'none',
    },
    upi: {
      keyboardType: 'email-address',
      autoComplete: 'off',
      autoCapitalize: 'none',
    },
  };

  return configs[type] || configs.text;
}

/**
 * FormInput: Unified text input component with proper keyboard handling,
 * validation, accessibility, and styling.
 */
export const FormInput = React.forwardRef<RNTextInput, FormInputProps>(
  ({
    label,
    type = 'text',
    error,
    icon,
    containerStyle,
    required,
    placeholder,
    editable = true,
    testID,
    ...props
  }, ref) => {
    const config = getKeyboardConfig(type);

    return (
      <View style={[styles.container, containerStyle]}>
        {label && (
          <Text style={styles.label}>
            {label}
            {required && <Text style={styles.required}>*</Text>}
          </Text>
        )}

        <View style={[
          styles.inputWrapper,
          !editable && styles.inputDisabled,
          error && styles.inputError,
        ]}>
          {icon && (
            <MaterialCommunityIcons
              name={icon}
              size={20}
              color="#6B6B6B"
              style={styles.icon}
            />
          )}

          <RNTextInput
            ref={ref}
            style={[styles.input, icon && styles.inputWithIcon]}
            placeholderTextColor="#B0A898"
            editable={editable}
            accessibilityLabel={label || placeholder}
            accessibilityRole="text"
            accessibilityState={{ disabled: !editable }}
            testID={testID}
            {...config}
            {...props}
            placeholder={placeholder}
          />
        </View>

        {error && (
          <Text
            style={styles.errorText}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        )}
      </View>
    );
  }
);

FormInput.displayName = 'FormInput';

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: '#6B6B6B',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  required: {
    color: '#8B1A1A',
    fontWeight: '700',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0D8CC',
    paddingHorizontal: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#0D0D0D',
    paddingVertical: 14,
    paddingHorizontal: 0,
  },
  inputWithIcon: {
    marginLeft: 8,
  },
  icon: {
    marginTop: 2,
  },
  inputDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.6,
  },
  inputError: {
    borderColor: '#8B1A1A',
    backgroundColor: '#FFF5F5',
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#8B1A1A',
    marginTop: 6,
  },
});
