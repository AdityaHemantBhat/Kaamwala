import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';

export default function TrainingHub() {
  const router = useRouter();
  const t = useT();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' }}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#0D0D0D" />
          </Pressable>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#0D0D0D' }}>{t('Training Hub')}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center', paddingTop: 40 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFE0B2', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
          <MaterialCommunityIcons name="school-outline" size={64} color="#FF9800" />
        </View>
        
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#0D0D0D', marginBottom: 12, textAlign: 'center' }}>
          {t('Coming Soon')}
        </Text>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#6B6B6B', textAlign: 'center', lineHeight: 22 }}>
          {t('We are building a massive library of video tutorials to help you upskill, earn more, and achieve the Platinum tier!')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
