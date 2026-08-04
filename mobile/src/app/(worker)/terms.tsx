import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';

export default function TermsScreen() {
  const router = useRouter();
  const t = useT();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#0D0D0D" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginLeft: 12 }}>{t('Terms & Privacy')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, elevation: 1 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', marginBottom: 4 }}>{t('Terms of Service')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E', marginBottom: 20 }}>{t('Last updated: July 2026')}</Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('1. Acceptance of Terms')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('By using KaamWala, you agree to these terms. If you do not agree, do not use the platform. We may update these terms at any time.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('2. Services')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('KaamWala connects customers with local service providers. We facilitate bookings, payments, and communication. We are not an employer of any worker. All services are provided directly by the worker.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('3. User Accounts')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('You are responsible for maintaining the confidentiality of your account. You must provide accurate information. Sharing contact information in chat to bypass the platform is strictly prohibited and may result in penalties, account suspension, or permanent ban.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('4. Payments & Fees')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('All payments are processed through the platform. Platform fees are deducted automatically. Workers agree to pay penalties for policy violations as determined by the platform\'s enforcement system.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('5. Prohibited Conduct')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('Users may not share personal contact information in chat, harass others, provide false information, or use the platform for any unlawful purpose. Violations result in escalating penalties including fines, account freezing, and permanent bans.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('6. Limitation of Liability')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('KaamWala is not liable for any damages arising from use of the platform. We facilitate connections but are not responsible for the quality of work performed by workers.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', marginTop: 20, marginBottom: 4 }}>{t('Privacy Policy')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E', marginBottom: 20 }}>{t('Last updated: July 2026')}</Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('1. Information We Collect')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('We collect your name, phone number, profile photos, location data, and usage information. For workers, we additionally collect service categories, ratings, and payment information.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('2. How We Use Your Data')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('Your data is used to provide and improve our services, process transactions, send notifications, and enforce platform policies. We do not sell your personal information to third parties.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('3. Data Security')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('We use industry-standard encryption and security measures to protect your data. Tokens are stored securely on your device. However, no method of transmission is 100% secure.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', marginBottom: 6 }}>{t('4. Contact Us')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#4A4A4A', lineHeight: 20, marginBottom: 16 }}>
            {t('For questions about these terms or privacy policy, please contact us through the Support section in the app or email support@kaamwala.in.')}
          </Text>

          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E', textAlign: 'center', marginTop: 10 }}>
            KaamWala v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
