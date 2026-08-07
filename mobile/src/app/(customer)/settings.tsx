import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { TransitionOverlay } from '../../components/ui/TransitionOverlay';
import { INDIAN_LANGUAGES } from '../../utils/languages';
import { setLanguage, getCurrentLang, useT } from '../../utils/i18n';
import { apiClient } from '../../api/client';

export default function CustomerSettings() {
  const t = useT();
  const router = useRouter();
  const { logout } = useAuthStore();
  const [showLang, setShowLang] = useState(false);
  const [selectedLang, setSelectedLang] = useState(getCurrentLang() || 'en');

  const renderLanguageItem = useCallback(({ item }: { item: any }) => (
    <Pressable style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }}
      onPress={() => {
        setSelectedLang(item.code);
        setLanguage(item.code);
        setShowLang(false);
        // Persist the account language so it survives reinstalls.
        apiClient.put('/auth/profile', { preferredLang: item.code }).catch(() => {});
      }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}>{item.name}</Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E', marginTop: 1 }}>{item.native}</Text>
      </View>
      {selectedLang === item.code && <MaterialCommunityIcons name="check-circle" size={22} color="#FF5C00" />}
    </Pressable>
  ), [selectedLang]);
  const [showLogoutTransition, setShowLogoutTransition] = useState(false);
  const currentLang = INDIAN_LANGUAGES.find(l => l.code === selectedLang);

  return (
    <View style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#0D0D0D" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginLeft: 12 }}>{t('Settings')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, gap: 20 }}>
        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#9E9E9E', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{t('Account')}</Text>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, elevation: 1, overflow: 'hidden' }}>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }} onPress={() => router.push('/(customer)/addresses')}>
              <MaterialCommunityIcons name="map-marker-outline" size={22} color="#0D0D0D" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Saved Addresses')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#C8C0B0" />
            </Pressable>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }} onPress={() => router.push('/(customer)/payments')}>
              <MaterialCommunityIcons name="credit-card-outline" size={22} color="#0D0D0D" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Payment Methods')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#C8C0B0" />
            </Pressable>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }} onPress={() => router.push('/(customer)/notifications')}>
              <MaterialCommunityIcons name="bell-outline" size={22} color="#0D0D0D" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Notifications')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#C8C0B0" />
            </Pressable>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }} onPress={() => setShowLang(true)}>
              <MaterialCommunityIcons name="translate" size={22} color="#0D0D0D" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Language')}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E', marginRight: 8 }}>{currentLang?.native || t('English')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#C8C0B0" />
            </Pressable>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }} onPress={() => router.push('/(customer)/referrals')}>
              <MaterialCommunityIcons name="gift-outline" size={22} color="#0D0D0D" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Refer & Earn')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#C8C0B0" />
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#9E9E9E', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{t('Support')}</Text>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, elevation: 1, overflow: 'hidden' }}>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }} onPress={() => router.push('/(worker)/support' as any)}>
              <MaterialCommunityIcons name="headset" size={22} color="#FF5C00" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Support Tickets')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#C8C0B0" />
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#9E9E9E', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{t('About')}</Text>
          <View style={{ backgroundColor: '#FFF', borderRadius: 12, elevation: 1, overflow: 'hidden' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D' }}>{t('Version')}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E', marginTop: 2 }}>1.0.0</Text>
            </View>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }} onPress={() => router.push('/(worker)/terms' as any)}>
              <MaterialCommunityIcons name="information-outline" size={22} color="#0D0D0D" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Terms & Privacy')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#C8C0B0" />
            </Pressable>
          </View>
        </View>

        <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, marginTop: 8 }}
          onPress={async () => {
            setShowLogoutTransition(true);
            await new Promise(r => setTimeout(r, 1200));
            logout();
            router.replace('/(auth)/welcome');
          }}>
          <MaterialCommunityIcons name="logout" size={20} color="#D32F2F" />
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 15, color: '#D32F2F' }}>{t('Sign Out')}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showLang} transparent animationType="slide" onRequestClose={() => setShowLang(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowLang(false)} />
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '80%' }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', marginBottom: 16 }}>{t('Choose Language')}</Text>
            <FlatList
              data={INDIAN_LANGUAGES}
              keyExtractor={item => item.code}
              renderItem={renderLanguageItem}
            />
          </View>
        </View>
      </Modal>
      </SafeAreaView>
      <TransitionOverlay visible={showLogoutTransition} type="logout" message={t('See you soon!')} />
    </View>
  );
}
