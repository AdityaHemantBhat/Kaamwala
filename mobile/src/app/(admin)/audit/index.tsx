import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../../components/ui/BrutalInkLoader';
import { apiClient } from '../../../api/client';
import { useT } from '../../../utils/i18n';

export default function AdminAuditSearch() {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        if (!query.trim()) {
          const res = await apiClient.get('/admin/users?limit=20');
          setResults(res.data?.data?.users || []);
        } else {
          const res = await apiClient.get(`/admin/users/search?q=${encodeURIComponent(query.trim())}`);
          setResults(res.data?.data || []);
        }
      } catch (e) {
      } finally {
        setLoading(false);
      }
    };
    
    const timeoutId = setTimeout(fetchUsers, query.trim() ? 300 : 0);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Audit Search')}</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="magnify" size={24} color="#8A8A8A" />
          <TextInput
            style={styles.input}
            placeholder={t('Search name, phone, or ID...')}
            placeholderTextColor="#8A8A8A"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={20} color="#8A8A8A" />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}><BrutalInkLoader /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
          {results.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-search-outline" size={48} color="#D2D2D2" />
              <Text style={styles.emptyText}>{t('No users found.')}</Text>
            </View>
          )}

          {results.map((u) => (
            <Pressable 
              key={u.id} 
              style={styles.card}
              onPress={() => router.push(`/(admin)/audit/${u.id}`)}
            >
              <View style={styles.cardLeft}>
                <View style={[styles.avatar, u.role === 'WORKER' ? { backgroundColor: '#FF5C00' } : { backgroundColor: '#673AB7' }]}>
                  <Text style={styles.avatarText}>{u.name?.[0]?.toUpperCase() || t('U')}</Text>
                </View>
                <View>
                  <Text style={styles.userName}>{u.name || t('Unknown')}</Text>
                  <Text style={styles.userPhone}>{u.phone}</Text>
                </View>
              </View>
              
              <View style={styles.cardRight}>
                <View style={[styles.rolePill, u.role === 'WORKER' ? { backgroundColor: '#FFF3E0' } : { backgroundColor: '#F3E5F5' }]}>
                  <Text style={[styles.roleText, u.role === 'WORKER' ? { color: '#E65100' } : { color: '#673AB7' }]}>
                    {t(u.role)}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#5F6368" />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E8' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },

  searchContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  inputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, elevation: 1 },
  input: { flex: 1, height: 48, fontFamily: 'Inter_500Medium', fontSize: 15, color: '#202124', marginLeft: 8 },
  searchBtn: { backgroundColor: '#0D0D0D', borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', elevation: 1 },
  searchBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFFFFF' },

  listContent: { paddingHorizontal: 16, gap: 12 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 16 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#8A8A8A' },

  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, elevation: 2 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFFFFF' },
  userName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  userPhone: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#5F6368', marginTop: 2 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  roleText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 }
});
