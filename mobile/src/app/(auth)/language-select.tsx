import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { setLanguage, useT } from '../../utils/i18n';
import { useAuthStore } from '../../store/auth.store';
import { INDIAN_LANGUAGES } from '../../utils/languages';

export default function LanguageSelectScreen() {
  const t = useT();
  const router = useRouter();
  const setHasSelectedLanguage = useAuthStore(s => s.setHasSelectedLanguage);
  
  const [selectedCode, setSelectedCode] = useState('en');

  const contentOp = useSharedValue(0);
  const contentY = useSharedValue(20);

  const handleSplashFinish = () => {
    contentOp.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    contentY.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
  };

  React.useEffect(() => {
    handleSplashFinish();
    // One-shot entry animation; handleSplashFinish is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOp.value,
    transform: [{ translateY: contentY.value }],
    flex: 1,
  }));

  const handleContinue = async () => {
    await setLanguage(selectedCode);
    setHasSelectedLanguage(true);
    router.replace({ pathname: '/(auth)/welcome', params: { skipSplash: 'true' } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F0E8" />
      
      <Animated.View style={contentStyle}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('Choose Language')}</Text>
          <Text style={styles.subtitle}>{t('Select your preferred language for the app')}</Text>
        </View>

        <ScrollView style={styles.optionsContainer} contentContainerStyle={{ gap: 16 }} showsVerticalScrollIndicator={false}>
          {INDIAN_LANGUAGES.map((lang) => {
            const isSelected = selectedCode === lang.code;
            return (
              <Pressable
                key={lang.code}
                style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                onPress={() => setSelectedCode(lang.code)}
              >
                <View style={styles.optionContent}>
                  <Text style={[styles.optionNativeName, isSelected && styles.optionTextSelected]}>
                    {lang.native}
                  </Text>
                  <Text style={[styles.optionName, isSelected && styles.optionTextSelected]}>
                    {lang.name}
                  </Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.9 }]}
            onPress={handleContinue}
          >
            <Text style={styles.continueBtnText}>{t('Continue')}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    paddingHorizontal: 24,
  },
  header: {
    marginTop: 40,
    marginBottom: 32,
  },
  title: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 28,
    color: '#0D0D0D',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#5F6368',
  },
  optionsContainer: {
    flex: 1,
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  optionCardSelected: {
    borderColor: '#FF5C00',
    backgroundColor: '#FFF5F0',
  },
  optionContent: {
    flex: 1,
  },
  optionNativeName: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 18,
    color: '#202124',
    marginBottom: 4,
  },
  optionName: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#5F6368',
  },
  optionTextSelected: {
    color: '#FF5C00',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DADCE0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    backgroundColor: '#FF5C00',
    borderColor: '#FF5C00',
  },
  footer: {
    marginTop: 'auto',
    marginBottom: 24,
  },
  continueBtn: {
    backgroundColor: '#0D0D0D',
    paddingVertical: 18,
    borderRadius: 100,
    alignItems: 'center',
  },
  continueBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
