import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/auth.store';
import { useRouter } from 'expo-router';
import { useToast } from '../../components/ui/ToastProvider';
import { t } from '../../utils/i18n';

export default function BannedScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const { showToast } = useToast();

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/welcome');
  };

  const handleSupport = () => {
    showToast({ message: t('Support team will contact you shortly.'), type: 'info' });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.iconContainer}>
          <View style={styles.iconBg}>
            <MaterialCommunityIcons name="shield-alert-outline" size={64} color="#D32F2F" />
          </View>
        </View>

        <Text style={styles.title}>{t('Account Suspended')}</Text>
        <Text style={styles.subtitle}>
          {t('Your account has been suspended for violating our Terms of Service.')}
          {t('You can no longer access the platform.')}
        </Text>

        <View style={styles.detailsCard}>
          <Text style={styles.cardHeader}>{t('Suspension Details')}</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('Type')}</Text>
            <Text style={[styles.detailValue, { color: user?.banType === 'PERMANENT' ? '#D32F2F' : '#FF5C00' }]}>
              {user?.banType === 'PERMANENT' ? t('Permanent Ban') : t('Temporary Suspension')}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('Reason')}</Text>
            <Text style={styles.detailValue}>{user?.banReason || t('Administrative decision')}</Text>
          </View>

          {user?.banType === 'TEMPORARY' && user?.banExpiresAt && (
            <View style={[styles.detailRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
              <Text style={styles.detailLabel}>{t('Expires On')}</Text>
              <Text style={styles.detailValue}>
                {new Date(user.banExpiresAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(user.banExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionContainer}>
          <Pressable style={styles.supportBtn} onPress={handleSupport}>
            <MaterialCommunityIcons name="email-outline" size={20} color="#202124" />
            <Text style={styles.supportBtnText}>{t('Contact Support')}</Text>
          </Pressable>

          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>{t('Sign Out')}</Text>
          </Pressable>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  scrollContent: { 
    flexGrow: 1, 
    justifyContent: 'center', 
    paddingHorizontal: 24, 
    paddingVertical: 40 
  },
  
  iconContainer: { alignItems: 'center', marginBottom: 24 },
  iconBg: { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    backgroundColor: '#FFEBEE', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  
  title: { 
    fontFamily: 'Inter_700Bold', 
    fontSize: 28, 
    color: '#D32F2F', 
    textAlign: 'center', 
    marginBottom: 12 
  },
  subtitle: { 
    fontFamily: 'Inter_400Regular', 
    fontSize: 15, 
    color: '#5F6368', 
    textAlign: 'center', 
    lineHeight: 24, 
    marginBottom: 40 
  },
  
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginBottom: 40
  },
  cardHeader: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#202124',
    marginBottom: 20
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
    paddingBottom: 16,
    marginBottom: 16,
    gap: 16
  },
  detailLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#5F6368',
    width: 80
  },
  detailValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#202124',
    flex: 1,
    textAlign: 'right'
  },
  
  actionContainer: { gap: 16 },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1
  },
  supportBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#202124'
  },
  logoutBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D32F2F'
  },
  logoutBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#D32F2F'
  }
});
