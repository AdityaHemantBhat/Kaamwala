import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, TouchableWithoutFeedback, Keyboard, StyleSheet, StatusBar } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useT } from '../../utils/i18n';
import { authApi } from '../../api/auth.api';
import { getSmsRetrieverHash } from '../../utils/otpAutofill';
import { useToast } from '../../components/ui/ToastProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function PhoneScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role: string }>();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const t = useT();

  // Keep the field numeric-only (paste could include non-digits) and capped at 10.
  const handlePhoneChange = (text: string) => setPhone(text.replace(/\D/g, '').slice(0, 10));

  const handleSendOtp = async () => {
    if (phone.length !== 10) {
      showToast({ message: t('Please enter a valid 10-digit number'), type: 'error' });
      return;
    }
    try {
      setLoading(true);
      // Android: the backend embeds this hash in the SMS so the SMS Retriever
      // API can deliver it straight to the app (no SMS read permission needed).
      // On iOS / Expo Go this resolves to null and the SMS stays human-readable.
      const appHash = await getSmsRetrieverHash();
      await authApi.sendOtp(`+91${phone}`, { appHash });
      router.push({ pathname: '/(auth)/otp', params: { phone: `+91${phone}`, role } });
    } catch (err: any) {
      showToast({ message: err.response?.data?.error || t('Something went wrong'), type: 'error' });
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F0E8" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('Back')}>
                <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
              </Pressable>
            </View>

            {/* Hero icon */}
            <View style={styles.heroSection}>
              <View style={styles.heroRing}>
                <View style={styles.heroIconBg}>
                  <MaterialCommunityIcons name="cellphone-nfc" size={36} color="#FF5C00" />
                </View>
              </View>
            </View>

            {/* Content */}
            <View style={styles.contentSection}>
              <Text style={styles.headline}>{t("What's your number?")}</Text>
              <Text style={styles.subheadline}>{t("We'll send a code to verify")}</Text>

              {/* Phone input */}
              <View style={styles.inputGroup}>
                <View style={styles.countryCode}>
                  <MaterialCommunityIcons name="flag" size={14} color="#FF5C00" />
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  style={[
                    styles.phoneInput,
                    phone.length > 0 && styles.phoneInputActive,
                  ]}
                  placeholder={t('Phone number')}
                  placeholderTextColor="#C8C0B0"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  onSubmitEditing={handleSendOtp}
                  autoFocus
                  accessibilityLabel={t('Phone number')}
                />
              </View>
            </View>

            {/* Bottom */}
            <View style={styles.bottomSection}>
              <Pressable
                onPress={handleSendOtp}
                disabled={phone.length !== 10 || loading}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  phone.length !== 10 && styles.primaryBtnDisabled,
                  pressed && styles.primaryBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('Get OTP')}
                accessibilityState={{ disabled: phone.length !== 10 || loading }}
              >
                {loading ? (
                  <Text style={styles.primaryBtnText}>{t('Sending...')}</Text>
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>{t('Get OTP')}</Text>
                    <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" style={{ opacity: 0.7 }} />
                  </>
                )}
              </Pressable>
              <Pressable onPress={() => router.push('/(auth)/terms')} accessibilityRole="link" accessibilityLabel={t('View terms and privacy policy')}>
                <Text style={styles.legalText}>
                  {t('By continuing, you agree to our')} <Text style={styles.legalHighlight}>{t('Terms')}</Text> {t('and')} <Text style={styles.legalHighlight}>{t('Privacy Policy')}</Text>
                </Text>
              </Pressable>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    paddingHorizontal: 28,
  },

 /* ── Header ── */
  header: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
  },

 /* ── Hero ── */
  heroSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
  },
  heroRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#0D0D0D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },

 /* ── Content ── */
  contentSection: {
    alignItems: 'center',
    gap: 8,
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: '#0D0D0D',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subheadline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 20,
  },

 /* ── Phone Input ── */
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 32,
    width: '100%',
    maxWidth: 320,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#0D0D0D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  countryCodeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#0D0D0D',
  },
  phoneInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 20,
    color: '#0D0D0D',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(13,13,13,0.08)',
    elevation: 1,
    shadowColor: '#0D0D0D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  phoneInputActive: {
    borderColor: '#FF5C00',
    borderWidth: 2,
  },

 /* ── Bottom ── */
  bottomSection: {
    paddingVertical: 32,
    gap: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5C00',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
    elevation: 3,
    shadowColor: '#FF5C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  primaryBtnDisabled: {
    backgroundColor: 'rgba(13,13,13,0.12)',
    elevation: 0,
    shadowOpacity: 0,
  },
  primaryBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  legalText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 20,
  },
  legalHighlight: {
    color: '#FF5C00',
    fontFamily: 'Inter_600SemiBold',
  },
});