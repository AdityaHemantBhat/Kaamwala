import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TermsScreen() {
  const router = useRouter();
  const t = useT();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Terms & Conditions')}</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>{t('Last updated: July 2026')}</Text>

        <Text style={styles.sectionTitle}>{t('1. Acceptance of Terms')}</Text>
        <Text style={styles.body}>
          {t('By accessing or using KaamWala ("the Platform"), you agree to be bound by these Terms & Conditions. If you do not agree, do not use the Platform.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('2. Platform Overview')}</Text>
        <Text style={styles.body}>
          {t('KaamWala is a marketplace connecting customers with local service providers.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('3. No Cash Payments')}</Text>
        <Text style={styles.body}>
          {t('All payments must be processed exclusively through the Platform. Cash payments are strictly prohibited.')}
        </Text>
        <View style={styles.highlight}>
          <MaterialCommunityIcons name="shield-check" size={18} color="#FF5C00" />
          <Text style={styles.highlightText}>
            {t('All transactions are secured with 256-bit encryption and processed through our PCI-DSS compliant payment gateway.')}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>{t('4. Worker Payment Terms')}</Text>
        <Text style={styles.body}>
          {t('Workers receive their earnings through the Platform. Payouts are processed within 24-48 hours after service completion.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('5. Customer Payment Terms')}</Text>
        <Text style={styles.body}>
          {t('Customers agree to pay the total amount displayed at booking. Payment is collected upon service completion.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('6. Service Quality & Guarantee')}</Text>
        <Text style={styles.body}>
          {t('KaamWala guarantees services by verified workers. Disputes can be filed within 48 hours of completion.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('7. Worker Verification')}</Text>
        <Text style={styles.body}>
          {t('All workers undergo identity verification and background screening. Workers are independently contracted.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('8. Cancellation Policy')}</Text>
        <Text style={styles.body}>
          {t('Customers may cancel free of charge up to 2 hours before the scheduled service. Late cancellations may incur a fee.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('9. Dispute Resolution')}</Text>
        <Text style={styles.body}>
          {t('The Platform will mediate disputes. If unresolved within 7 days, the matter goes to binding arbitration.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('10. Privacy & Data Protection')}</Text>
        <Text style={styles.body}>
          {t('KaamWala collects and processes personal data in accordance with privacy laws. We do not sell your personal information.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('11. Limitation of Liability')}</Text>
        <Text style={styles.body}>
          {t("KaamWala's liability is limited to the amount paid for the specific booking.")}
        </Text>

        <Text style={styles.sectionTitle}>{t('12. Account Suspension')}</Text>
        <Text style={styles.body}>
          {t('KaamWala may suspend or terminate accounts that violate these terms or engage in fraudulent activity.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('13. Changes to Terms')}</Text>
        <Text style={styles.body}>
          {t('KaamWala may update these terms. Users will be notified of material changes.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('14. Governing Law')}</Text>
        <Text style={styles.body}>
          {t('These terms shall be governed by the laws of India. Jurisdiction: courts in Bengaluru, Karnataka.')}
        </Text>

        <Text style={styles.sectionTitle}>{t('15. Contact')}</Text>
        <Text style={styles.body}>
          {t('For questions, please contact us at support@kaamwala.app or through the in-app support system.')}
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(13,13,13,0.06)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#0D0D0D' },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 16 },
  lastUpdated: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#999', marginBottom: 20 },
  sectionTitle: {
    fontSize: 15, fontFamily: 'Inter_700Bold', color: '#0D0D0D',
    marginTop: 20, marginBottom: 8,
  },
  body: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: '#666',
    lineHeight: 20,
  },
  highlight: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 14, backgroundColor: '#FFF0E8', borderRadius: 12, marginTop: 10,
  },
  highlightText: {
    fontSize: 12, fontFamily: 'Inter_400Regular', color: '#666',
    lineHeight: 18, flex: 1,
  },
});
