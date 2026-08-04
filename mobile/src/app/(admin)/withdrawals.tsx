import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BrutalInkLoader } from '../../components/ui/BrutalInkLoader';
import { apiClient } from '../../api/client';
import { socketService } from '../../api/socket';
import { t } from '../../utils/i18n';

export default function AdminWithdrawals() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { 
      const r = await apiClient.get('/admin/withdrawals'); 
      setData(r.data?.data || []); 
    } catch {} finally { 
      setLoading(false); 
      setRefreshing(false);
    }
  };

  useEffect(() => { 
    load(); 
    
    socketService.connect();
    const handleRefresh = () => { load(); };
    socketService.on('admin_refresh', handleRefresh);
    
    return () => {
      socketService.off('admin_refresh', handleRefresh);
    };
  }, []);

  const handleProcess = async (id: string, status: string) => {
    try {
      await apiClient.put(`/admin/withdrawals/${id}`, { status });
      load();
    } catch (e: any) {
      Alert.alert(t('Error processing withdrawal'), e?.response?.data?.error || e.message);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centerContainer}><BrutalInkLoader /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Withdrawals')}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{data.length}</Text>
        </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#FF5C00" />}
      >
        {data.length === 0 && (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="bank-outline" size={48} color="#D2D2D2" />
            <Text style={styles.emptyText}>{t('No withdrawal requests')}</Text>
          </View>
        )}
        
        {data.map((w: any) => (
          <View key={w.id} style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="bank-transfer-out" size={24} color="#F4B400" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.amountText}>₹{w.amount}</Text>
                <Text style={styles.dateText}>{new Date(w.createdAt || Date.now()).toLocaleDateString()}</Text>
              </View>
              
              <View style={[styles.statusPill, { backgroundColor: w.status === 'pending' ? '#FEF7E0' : '#E6F4EA' }]}>
                <Text style={[styles.statusText, { color: w.status === 'pending' ? '#B06000' : '#137333' }]}>
                  {w.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.detailsBox}>
              {w.workerProfile?.user?.name && (
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="account-hard-hat" size={16} color="#5F6368" />
                  <Text style={styles.detailText}>{w.workerProfile.user.name}</Text>
                </View>
              )}
              {w.upiId && (
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="cellphone-nfc" size={16} color="#5F6368" />
                  <Text style={styles.detailText}>{w.upiId}</Text>
                </View>
              )}
              {w.bankAccount && (
                <View style={styles.detailRow}>
                  <MaterialCommunityIcons name="bank-outline" size={16} color="#5F6368" />
                  <Text style={styles.detailText}>{w.bankAccount}</Text>
                </View>
              )}
            </View>

            {w.status === 'pending' && (
              <View style={styles.actionRow}>
                <Pressable onPress={() => handleProcess(w.id, 'rejected')} style={styles.rejectBtn}>
                  <Text style={styles.rejectBtnText}>{t('Reject')}</Text>
                </Pressable>
                <Pressable onPress={() => {
                  Alert.alert(
                    t('Approve payout'),
                    t(`${w.amount} will be paid automatically via Cashfree to the worker's ${w.upiId ? `UPI ID: ${w.upiId}` : `Bank Account: ${w.bankAccount}`}. Confirm?`),
                    [
                      { text: t('Cancel'), style: 'cancel' },
                      { text: t('Approve & Pay'), style: 'default', onPress: () => handleProcess(w.id, 'approved') }
                    ]
                  );
                }} style={styles.approveBtn}>
                  <Text style={styles.approveBtnText}>{t('Approve')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
        <View style={{ height: 40 }} />
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
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 16 },
  emptyText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#8A8A8A' },

  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 16, 
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF8E1', justifyContent: 'center', alignItems: 'center' },
  amountText: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124' },
  dateText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#5F6368', marginTop: 2 },
  
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },

  detailsBox: { backgroundColor: '#F5F0E8', padding: 12, borderRadius: 12, marginTop: 16, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#202124' },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  rejectBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF0ED', alignItems: 'center' },
  rejectBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#C5221F' },
  approveBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1A73E8', alignItems: 'center' },
  approveBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' },
});
