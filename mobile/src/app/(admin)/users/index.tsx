import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { apiClient } from '../../../api/client';
import { useT } from '../../../utils/i18n';

export default function AdminUsers() {
  const t = useT();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try { 
      const r = await apiClient.get('/admin/users'); 
      setData(r.data?.data?.users || []); 
    } catch {} finally { 
      setLoading(false); 
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}><BrutalInkLoader /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* App Bar */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Users')}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{data.length}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#FF5C00" />}
      >
        {data.length === 0 && (
          <Text style={styles.emptyText}>{t('No users found.')}</Text>
        )}
        
        {data.map((u: any, index: number) => (
          <Pressable 
            key={u.id || index} 
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
            onPress={() => router.push(`/(admin)/users/${u.id}`)}
          >
            <View style={[styles.avatar, { backgroundColor: u.role === 'WORKER' ? '#FFF0E6' : '#E8F0FE' }]}>
              <Text style={[styles.avatarText, { color: u.role === 'WORKER' ? '#FF5C00' : '#1A73E8' }]}>
                {(u.name || '?')[0].toUpperCase()}
              </Text>
            </View>
            
            <View style={styles.infoContainer}>
              <Text style={styles.nameText}>{u.name || t('Unknown')}</Text>
              <Text style={styles.subText}>{u.phone} • {t(u.role)}</Text>
            </View>

            <View style={[styles.statusPill, { backgroundColor: u.isActive ? '#E6F4EA' : '#FCE8E6' }]}>
              <Text style={[styles.statusText, { color: u.isActive ? '#137333' : '#C5221F' }]}>
                {u.isActive ? t('ACTIVE') : t('BANNED')}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 16, 
    paddingBottom: 16, 
    backgroundColor: '#F5F0E8', borderBottomWidth: 0
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },
  badge: { backgroundColor: '#EAE2D6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 12 },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#5F6368' },
  
  scrollContent: { padding: 16, gap: 12 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#5F6368', textAlign: 'center', marginTop: 40 },
  
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  infoContainer: { flex: 1, marginLeft: 16 },
  nameText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#202124' },
  subText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368', marginTop: 4 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 }
});
