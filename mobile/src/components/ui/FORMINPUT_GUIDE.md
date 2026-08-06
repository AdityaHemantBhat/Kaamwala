# FormInput Component Guide

## Overview

`FormInput` is the unified text input component for all text input needs across the KaamWalla app. It handles:
- Proper keyboard types (numeric, email, phone, password, etc.)
- Correct autoComplete values for accessibility
- autoCapitalize handling based on input type
- secureTextEntry for passwords
- Consistent styling and error states
- Icon support
- Full accessibility support

## Input Types

The `FormInput` component supports the following types:

| Type | keyboardType | autoComplete | Use Case |
|------|--------------|--------------|----------|
| `text` | default | off | General text input (names, addresses) |
| `email` | email-address | email | Email addresses |
| `phone` | phone-pad | tel | Phone numbers |
| `number` | number-pad | off | Whole numbers only |
| `decimal` | decimal-pad | off | Decimal numbers (prices, ratings) |
| `password` | default | password | Passwords (secureTextEntry=true) |
| `url` | url | off | URLs and web addresses |
| `search` | default | off | Search queries |
| `pincode` | number-pad | off | Postal codes |
| `bankaccount` | number-pad | off | Bank account numbers |
| `upi` | email-address | off | UPI IDs (e.g., user@upi) |

## Usage Examples

### Basic Text Input
```tsx
import { FormInput } from '../../components/ui/FormInput';

<FormInput
  label="Full Name"
  type="text"
  placeholder="Enter your full name"
  value={name}
  onChangeText={setName}
/>
```

### Email Input
```tsx
<FormInput
  label="Email Address"
  type="email"
  placeholder="email@example.com"
  value={email}
  onChangeText={setEmail}
  required
/>
```

### Phone Number
```tsx
<FormInput
  label="Phone Number"
  type="phone"
  placeholder="+91 9999999999"
  value={phone}
  onChangeText={setPhone}
  icon="phone"
  maxLength={13}
/>
```

### Password
```tsx
<FormInput
  label="Password"
  type="password"
  placeholder="Enter password"
  value={password}
  onChangeText={setPassword}
  icon="lock"
/>
```

### Decimal Number (Price)
```tsx
<FormInput
  label="Price"
  type="decimal"
  placeholder="e.g. 299.99"
  value={price}
  onChangeText={setPrice}
  icon="currency-inr"
/>
```

### With Error Display
```tsx
<FormInput
  label="Service Name"
  type="text"
  placeholder="e.g. Fix leaking tap"
  value={serviceName}
  onChangeText={setServiceName}
  error={validationError}
  required
/>
```

### With Icon
```tsx
<FormInput
  label="UPI ID"
  type="upi"
  placeholder="example@okaxis"
  value={upiId}
  onChangeText={setUpiId}
  icon="wallet"
/>
```

## Props

```typescript
interface FormInputProps extends Omit<TextInputProps, 'placeholderTextColor'> {
  label?: string;                    // Label text above input
  type?: FormInputType;              // Input type (defaults to 'text')
  error?: string;                    // Error message to display
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;  // Left icon
  containerStyle?: any;              // Style for outer container
  required?: boolean;                // Show * for required fields
  testID?: string;                   // For testing
}
```

## Migration from TextInput

### Before (Basic TextInput)
```tsx
<View style={{ backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14 }}>
  <TextInput
    style={{ paddingVertical: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D' }}
    placeholder="Street address"
    placeholderTextColor="#9E9E9E"
    value={address}
    onChangeText={setAddress}
  />
</View>
```

### After (FormInput)
```tsx
<FormInput
  label="Street Address"
  type="text"
  placeholder="Street address"
  value={address}
  onChangeText={setAddress}
  icon="home-outline"
/>
```

## Keyboard Types Reference

### iOS Keyboard Types
- `default` - Standard keyboard
- `number-pad` - Numeric keypad (0-9)
- `decimal-pad` - Decimal numeric keypad (0-9, .)
- `email-address` - Email keyboard
- `phone-pad` - Phone number keyboard
- `url` - URL keyboard

### Android Keyboard Types
- `default` - Standard keyboard
- `number-pad` - Numeric keypad
- `decimal-pad` - Decimal keypad
- `numeric` - Numeric input
- `email` - Email keyboard
- `phone` - Phone keyboard
- `url` - URL keyboard

## AutoComplete Values (Accessibility)

The FormInput component automatically sets appropriate autoComplete values:
- `email` → autoComplete="email"
- `phone` → autoComplete="tel"
- `password` → autoComplete="password"
- `url` → autoComplete="off" (for security)
- `text` → autoComplete="off" (default)

This enables password managers and autofill on Android and iOS.

## Icon Support

Use any MaterialCommunityIcon name:
```tsx
icon="home-outline"       // Addresses
icon="lock"               // Password
icon="email"              // Email
icon="phone"              // Phone
icon="currency-inr"       // Price
icon="wallet"             // UPI/Wallet
icon="account"            // User name
```

## Best Practices

1. **Always set a label** - Helps users understand what the input is for
2. **Use the correct type** - Ensures proper keyboard and validation
3. **Mark required fields** - Use `required={true}` prop
4. **Provide error messages** - Pass error messages for validation
5. **Use icons** - Improves visual clarity and UX
6. **Set maxLength** - Prevent users from entering too much text
7. **Use placeholders wisely** - Don't use as labels, only as hints

## Known Limitations

- Multiline is not currently supported (use a separate component for that)
- Custom fonts beyond Inter are not automatically applied
- Placeholder color is fixed to maintain consistency

## Accessibility

FormInput includes:
- Proper `accessibilityLabel` (derived from label or placeholder)
- `accessibilityRole="text"` for screen readers
- `accessibilityState` to show disabled state
- Error messages with `accessibilityRole="alert"`
- `accessibilityLiveRegion="polite"` for error notifications

## Testing

Use the `testID` prop for testing:
```tsx
<FormInput
  label="Email"
  type="email"
  testID="emailInput"
/>

// In tests:
const input = getByTestId('emailInput');
fireEvent.changeText(input, 'test@example.com');
```
