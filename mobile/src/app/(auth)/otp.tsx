import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TextInput, Pressable, StyleSheet, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../../components/ui/ToastProvider';
import { useT, getCurrentLang } from '../../utils/i18n';
import { getDeviceInfo } from '../../utils/deviceInfo';
import { getExpoPushToken } from '../../utils/notifications';
import { subscribeToOtp, getSmsRetrieverHash } from '../../utils/otpAutofill';
import * as Haptics from 'expo-haptics';
import { TransitionOverlay } from '../../components/ui/TransitionOverlay';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const router = useRouter();
  const { phone, role } = useLocalSearchParams<{ phone: string; role: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [timer, setTimer] = useState(30);
  const [showTransition, setShowTransition] = useState(false);
  const t = useT();
  const hiddenInput = useRef<TextInput>(null);
  const setAuth = useAuthStore((state) => state.setAuth);
  const { showToast } = useToast();
  const loadingRef = useRef(false);

  // SMS Retriever listener lifecycle (Android). The Retriever API delivers only
  // ONE message per start(), so every resend tears down and re-arms. handleChangeText
  // is captured through a ref so the listener closure never goes stale.
  const smsUnsubRef = useRef<(() => void) | null>(null);
  const handleChangeTextRef = useRef<(text: string) => void>(() => {});
  const verifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armSmsListener = useCallback(() => {
    smsUnsubRef.current?.();
    smsUnsubRef.current = subscribeToOtp((otp) => {
      if (loadingRef.current) return; // a verify is already in flight
      // Subtle haptic so the auto-fill feels deliberate, like the big apps.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      handleChangeTextRef.current(otp);
    });
  }, []);

  // Cache device/push-token meta across retries so a wrong OTP doesn't
  // re-prompt for notification permission or re-read device hardware.
  const loginMetaRef = useRef<{ fcmToken: string | null; deviceInfo: Record<string, unknown> | null } | null>(null);
  const getLoginMeta = async () => {
    if (loginMetaRef.current) return loginMetaRef.current;
    const [deviceInfo, fcmToken] = await Promise.all([getDeviceInfo(), getExpoPushToken()]);
    loginMetaRef.current = { deviceInfo, fcmToken };
    return loginMetaRef.current;
  };

  useEffect(() => {
    if (timer > 0) {
      const t = setTimeout(() => setTimer(t => t - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [timer]);

  useEffect(() => {
    setTimeout(() => hiddenInput.current?.focus(), 100);
  }, []);

  // Start the SMS Retriever listener on mount and clean it up on unmount so the
  // broadcast receiver never leaks after the user leaves the screen.
  useEffect(() => {
    armSmsListener();
    return () => {
      smsUnsubRef.current?.();
      if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
    };
  }, [armSmsListener]);

  const handleVerify = async (otpCode?: string) => {
    const finalCode = otpCode ?? code;
    if (finalCode.length !== OTP_LENGTH || loadingRef.current) return;
    loadingRef.current = true;
    try {
      setLoading(true);
      setErrorState(false);
      const meta = await getLoginMeta();
      // Persist the user's selected app language on the account so it survives
      // reinstalls and is available server-side (not just in AsyncStorage).
      const res = await authApi.verifyOtp({ phone, otp: finalCode, role, preferredLang: getCurrentLang(), ...meta });
      await setAuth(res.user, res.accessToken, res.refreshToken);
      setShowTransition(true);
      // Let the transition play before navigating
      await new Promise(r => setTimeout(r, 3000));
      if (res.user.role === 'ADMIN' || res.user.role === 'SUPER_ADMIN') router.replace('/(admin)/dashboard');
      else if (res.user.role === 'WORKER' || (res.isNewUser && role === 'WORKER')) router.replace('/(worker)/dashboard');
      else router.replace('/(customer)/home');
    } catch (err: any) {
      setErrorState(true);
      showToast({ message: err.response?.data?.error || t('Invalid code'), type: 'error' });
    } finally { setLoading(false); loadingRef.current = false; }
  };

  const handleChangeText = (text: string) => {
    setErrorState(false);
    const cleaned = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    // The SMS Retriever and Android's system autofill can both deliver the SAME
    // code — one immediately, one as a delayed chip. Re-filling an identical code
    // is a no-op so a second verify can't fire after the first already consumed
    // the OTP (which would surface a spurious "expired" toast under the success
    // transition).
    if (cleaned === code) return;
    setCode(cleaned);
    // Premium OTP UX: auto-submit the moment the code is complete — no extra tap.
    if (cleaned.length === OTP_LENGTH) {
      if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
      verifyTimeoutRef.current = setTimeout(() => handleVerify(cleaned), 250); // let the last digit paint first
    }
  };
  handleChangeTextRef.current = handleChangeText;

  const handleResend = async () => {
    try {
      // Pass the app hash again so the new SMS is framed for the SMS Retriever
      // API (without it the message won't reach the listener).
      const appHash = await getSmsRetrieverHash();
      await authApi.sendOtp(phone, { appHash });
      setTimer(30);
      setCode('');
      if (verifyTimeoutRef.current) { clearTimeout(verifyTimeoutRef.current); verifyTimeoutRef.current = null; }
      armSmsListener(); // the Retriever API only listens once per start()
      showToast({ message: t('Code resent'), type: 'success' });
    } catch { showToast({ message: t('Failed to resend'), type: 'error' }); }
  };

  const digits = code.split('');

  return (
    <View style={{ flex: 1 }}>
    {!showTransition && (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F0E8" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              <MaterialCommunityIcons name="shield-check" size={36} color="#FF5C00" />
            </View>
          </View>
        </View>

        {/* Content */}
        <View style={styles.contentSection}>
          <Text style={styles.headline}>{t('Enter verification code')}</Text>
          <Text style={styles.subheadline}>
            {t('We sent a 6-digit code to')}{'\n'}
            <Text style={styles.phoneHighlight}>{phone}</Text>
          </Text>

          {/* OTP boxes */}
          <Pressable
            onPress={() => hiddenInput.current?.focus()}
            style={styles.otpRow}
          >
            {Array.from({ length: OTP_LENGTH }).map((_, index) => {
              const digit = digits[index] || '';
              const isFilled = !!digit;
              const isCursor = index === code.length && code.length < OTP_LENGTH;
              return (
                <View
                  key={index}
                  style={[
                    styles.otpBox,
                    isFilled && styles.otpBoxFilled,
                    isCursor && styles.otpBoxCursor,
                    errorState && styles.otpBoxError,
                  ]}
                >
                  <Text style={styles.otpDigit}>{digit}</Text>
                  {isCursor && !digit && (
                    <View style={styles.otpCursor} />
                  )}
                </View>
              );
            })}
          </Pressable>

          {errorState && (
            <View style={styles.errorRow}>
              <MaterialCommunityIcons name="alert-circle" size={14} color="#D32F2F" />
              <Text style={styles.errorText}>{t('Incorrect code. Please try again.')}</Text>
            </View>
          )}

          {/* Hidden input for autofill */}
          <TextInput
            ref={hiddenInput}
            value={code}
            onChangeText={handleChangeText}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            autoFocus
            style={styles.hiddenInput}
          />
        </View>

        {/* Bottom */}
        <View style={styles.bottomSection}>
          <Pressable
            onPress={() => handleVerify()}
            disabled={code.length < OTP_LENGTH || loading}
            style={({ pressed }) => [
              styles.primaryBtn,
              code.length < OTP_LENGTH && styles.primaryBtnDisabled,
              pressed && styles.primaryBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('Verify code')}
            accessibilityState={{ disabled: code.length < OTP_LENGTH || loading }}
          >
            {loading ? (
              <Text style={styles.primaryBtnText}>{t('Verifying...')}</Text>
            ) : (
              <>
                <Text style={styles.primaryBtnText}>{t('Verify')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" style={{ opacity: 0.7 }} />
              </>
            )}
          </Pressable>

          <Pressable onPress={handleResend} disabled={timer > 0} style={styles.resendBtn}
            accessibilityRole="button"
            accessibilityLabel={t('Resend code')}
            accessibilityState={{ disabled: timer > 0 }}>
            <Text style={[styles.resendText, timer > 0 && styles.resendTextDisabled]}>
              {timer > 0 ? `${t('Resend code in')} ${timer}s` : t('Resend code')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    )}
      <TransitionOverlay visible={showTransition} type="success" message={t('Welcome to KaamWala!')} />
    </View>
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
    paddingTop: 24,
    paddingBottom: 24,
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
    gap: 6,
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
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
  phoneHighlight: {
    fontFamily: 'Inter_600SemiBold',
    color: '#0D0D0D',
  },

 /* ── OTP Boxes ── */
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 32,
    marginBottom: 16,
  },
  otpBox: {
    width: 46,
    height: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(13,13,13,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#0D0D0D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  otpBoxFilled: {
    borderColor: '#FF5C00',
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#FF5C00',
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  otpBoxCursor: {
    borderColor: '#0D0D0D',
    borderWidth: 2,
  },
  otpBoxError: {
    borderColor: '#D32F2F',
    backgroundColor: 'rgba(211,47,47,0.04)',
  },
  otpDigit: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 24,
    color: '#0D0D0D',
    textAlign: 'center',
  },
  otpCursor: {
    position: 'absolute',
    bottom: 14,
    width: 2,
    height: 22,
    backgroundColor: '#0D0D0D',
    opacity: 0.3,
  },

 /* ── Error ── */
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#D32F2F',
    textAlign: 'center',
  },

 /* ── Hidden Input ── */
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
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
  resendBtn: {
    alignItems: 'center',
    padding: 8,
  },
  resendText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#FF5C00',
  },
  resendTextDisabled: {
    color: '#C8C0B0',
  },
});