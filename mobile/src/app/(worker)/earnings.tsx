import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useToast } from '../../components/ui/ToastProvider';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';
import { getTransactionMeta, formatSignedINR, groupByDay, TransactionRow } from '../../utils/transactionMeta';
import { SkeletonWorkerEarnings } from '../../components/ui/Skeleton';

export default function WorkerEarnings() {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(true);
  const [report, setReport] = useState<{ label: string; earnings: number; jobs: number }[]>([]);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawMethod, setWithdrawMethod] = useState<'UPI'|'BANK'>('UPI');
  const [withdrawAmt, setWithdrawAmt] = useState('');
  const [withdrawUpi, setWithdrawUpi] = useState('');
  const [withdrawBankAcct, setWithdrawBankAcct] = useState('');
  const [withdrawIfsc, setWithdrawIfsc] = useState('');
  const [withdrawBankName, setWithdrawBankName] = useState('');
  const [withdrawAcctName, setWithdrawAcctName] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addingMoney, setAddingMoney] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = useCallback(async () => {
    // Ledger is independent of the earnings summary — never block the summary
    // on it, and never let a ledger failure blank the whole screen.
    const [earningsRes, txnsRes, reportRes] = await Promise.all([
      apiClient.get('/workers/earnings').catch(() => ({ data: { data: null } })),
      apiClient.get('/payments/transactions').catch(() => ({ data: { data: [] } })),
      apiClient.get('/workers/earnings/report').catch(() => ({ data: { data: { months: [] } } })),
    ]);
    setData(earningsRes.data?.data);
    setTransactions(txnsRes.data?.data || []);
    setReport(reportRes.data?.data?.months || []);
    setLoading(false);
    setTxnsLoading(false);
    setRefreshing(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleWithdraw = async () => {
    if (!withdrawAmt || Number(withdrawAmt) < 100) return showToast({ message: t('Minimum ₹100'), type: 'error' });
    
    if (withdrawMethod === 'UPI') {
      if (!withdrawUpi) return showToast({ message: t('Enter UPI ID'), type: 'error' });
    } else {
      if (!withdrawBankAcct || !withdrawIfsc || !withdrawBankName || !withdrawAcctName) {
        return showToast({ message: t('Complete all bank details'), type: 'error' });
      }
    }

    setWithdrawing(true);
    try {
      const payload = withdrawMethod === 'UPI' 
        ? { amount: Number(withdrawAmt), method: 'UPI', upiId: withdrawUpi }
        : { amount: Number(withdrawAmt), method: 'BANK', bankAccount: withdrawBankAcct, ifscCode: withdrawIfsc, bankName: withdrawBankName, accountHolderName: withdrawAcctName };
      
      await apiClient.post('/workers/earnings/withdraw', payload);
      showToast({ message: `₹${withdrawAmt} ${t('withdrawal requested successfully!')}`, type: 'success' });
      setShowWithdraw(false);
      setWithdrawAmt(''); setWithdrawUpi(''); setWithdrawBankAcct(''); setWithdrawIfsc(''); setWithdrawBankName(''); setWithdrawAcctName('');
      loadData();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed'), type: 'error' });
    } finally { setWithdrawing(false); }
  };

  const handleAddMoney = async () => {
    if (!addAmount || Number(addAmount) < 1) return showToast({ message: t('Enter valid amount'), type: 'error' });
    const amt = Number(addAmount);

    setAddingMoney(true);
    try {
      // 1. Create a real Cashfree order for the top-up.
      const orderRes = await apiClient.post('/payments/add-money', { amount: amt });
      const order = orderRes.data?.data;
      if (!order?.orderId) throw new Error('Failed to initialize payment');

      // 2. Launch the Cashfree checkout (native SDK, or mock alert in Expo Go).
      const { startCashfreePayment } = require('../../utils/cashfree');
      const paymentResult = await startCashfreePayment(order.paymentSessionId, order.orderId);

      if (paymentResult.status !== 'SUCCESS') throw new Error('Payment cancelled');

      // 3. Only now credit the wallet — backend verifies the order with Cashfree.
      await apiClient.post('/payments/verify-wallet-topup', {
        orderId: order.orderId,
        isMock: paymentResult.isMock,
        ...(paymentResult.isMock ? { amount: amt } : {}),
      });

      showToast({ message: `₹${amt} ${t('added successfully!')}`, type: 'success' });
      setShowAddMoney(false);
      setAddAmount('');
      loadData();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to add money'), type: 'error' });
    } finally { setAddingMoney(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
        <SkeletonWorkerEarnings />
      </SafeAreaView>
    );
  }

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
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#0D0D0D' }}>{t('Earnings')}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, gap: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5C00" colors={['#FF5C00']} />
        }
      >
        {/* Account Frozen Banner */}
        {data?.walletBalance < 0 && (
          <Animated.View entering={FadeInUp.duration(300)} style={styles.frozenBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#D32F2F" />
            <View style={{ flex: 1 }}>
              <Text style={styles.frozenTitle}>{t('Account Restricted')}</Text>
              <Text style={styles.frozenText}>{t('Your wallet is negative due to pending penalties. Add funds to unlock your account.')}</Text>
            </View>
          </Animated.View>
        )}

        {/* Wallet Card */}
        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>{t('Available Balance')}</Text>
          <Text style={styles.walletAmount}>₹{data?.walletBalance || 0}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Pressable
              onPress={() => setShowWithdraw(true)}
              style={styles.withdrawBtn}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={18} color="#FFFFFF" />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#FFFFFF' }}>{t('Payout')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAddMoney(true)}
              style={styles.addMoneyBtn}
            >
              <MaterialCommunityIcons name="plus" size={18} color="#0D0D0D" />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 13, color: '#0D0D0D' }}>{t('Add Money')}</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: '#F5F0E8', opacity: 0.6, marginTop: 12 }}>
            {t('Transferred in 2 mins via UPI')}
          </Text>
        </View>

        {/* Earnings Stats */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            { icon: 'currency-inr', value: `₹${data?.todayEarnings || 0}`, label: t('Today') },
            { icon: 'currency-inr', value: `₹${data?.weekEarnings || 0}`, label: t('This Week') },
            { icon: 'currency-inr', value: `₹${data?.monthEarnings || 0}`, label: t('This Month') },
            { icon: 'wallet', value: `₹${data?.totalEarned || 0}`, label: t('All Time') },
          ].map((s, i) => (
            <Animated.View key={s.label} entering={FadeInUp.delay(i * 60).duration(300)} style={styles.statBox}>
              <MaterialCommunityIcons name={s.icon as any} size={20} color="#FF5C00" />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Performance */}
        <View>
          <Text style={styles.sectionLabel}>{t('Performance')}</Text>
          <View style={styles.perfRow}>
            <View style={styles.perfItem}>
              <Text style={styles.perfValue}>{data?.completedJobs || 0}</Text>
              <Text style={styles.perfLabel}>{t('Jobs Done')}</Text>
            </View>
            <View style={styles.perfItem}>
              <Text style={styles.perfValue}>{data?.rating?.toFixed(1) || '0.0'}</Text>
              <Text style={styles.perfLabel}>{t('Rating')}</Text>
            </View>
            <View style={styles.perfItem}>
              <Text style={styles.perfValue}>{data?.acceptanceRate || 0}%</Text>
              <Text style={styles.perfLabel}>{t('Acceptance')}</Text>
            </View>
            <View style={styles.perfItem}>
              <Text style={styles.perfValue}>{data?.responseTimeMinutes || 0}{t('min')}</Text>
              <Text style={styles.perfLabel}>{t('Response')}</Text>
            </View>
          </View>
        </View>

        {/* Earnings Report — last 6 months */}
        {report.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>{t('Earnings Report')}</Text>
            <View style={styles.reportCard}>
              {(() => {
                const max = Math.max(...report.map((m) => m.earnings), 1);
                return report.map((m) => (
                  <View key={m.label} style={styles.reportRow}>
                    <Text style={styles.reportMonth}>{t(m.label)}</Text>
                    <View style={styles.reportBarTrack}>
                      <View style={[styles.reportBar, { width: `${Math.max((m.earnings / max) * 100, m.earnings > 0 ? 4 : 1)}%` }]} />
                    </View>
                    <Text style={styles.reportAmt}>₹{m.earnings}</Text>
                  </View>
                ));
              })()}
            </View>
          </View>
        )}

        {/* Recent Activity — full wallet ledger (compensation, payouts, top-ups, penalties) */}
        <View>
          <Text style={styles.sectionLabel}>{t('Recent Activity')}</Text>

          {txnsLoading ? (
            <View style={styles.txnLoading}>
              <ActivityIndicator size="small" color="#FF5C00" />
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.txnEmpty}>
              <MaterialCommunityIcons name="receipt-text-outline" size={40} color="#C8C0B0" />
              <Text style={styles.txnEmptyText}>{t('No transactions yet')}</Text>
            </View>
          ) : (
            groupByDay(transactions).map((section) => (
              <View key={section.title} style={styles.txnSection}>
                <Text style={styles.txnDayLabel}>{t(section.title)}</Text>
                {section.items.map((txn) => {
                  const meta = getTransactionMeta(txn.type);
                  const isCredit = txn.amount > 0;
                  return (
                    <View key={txn.id} style={styles.txnRow}>
                      <View style={[styles.txnIcon, { backgroundColor: meta.bg }]}>
                        <MaterialCommunityIcons name={meta.icon as any} size={20} color={meta.color} />
                      </View>
                      <View style={styles.txnBody}>
                        <Text style={styles.txnTitle} numberOfLines={1}>{t(meta.label)}</Text>
                        {!!txn.description && (
                          <Text style={styles.txnDesc} numberOfLines={1}>{t(txn.description)}</Text>
                        )}
                      </View>
                      <View style={styles.txnRight}>
                        <Text style={[styles.txnAmt, { color: isCredit ? '#137333' : '#0D0D0D' }]}>
                          {formatSignedINR(txn.amount)}
                        </Text>
                        {txn.status === 'pending' && (
                          <Text style={styles.txnPending}>{t('Pending')}</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>

        {/* Pending withdrawal info */}
        {data?.pendingWithdrawal > 0 && (
          <View style={styles.pendingBox}>
            <MaterialCommunityIcons name="clock-outline" size={18} color="#E65100" />
            <Text style={styles.pendingText}>₹{data.pendingWithdrawal} {t('pending approval')}</Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Withdraw Modal */}
      <Modal visible={showWithdraw} transparent animationType="slide" onRequestClose={() => setShowWithdraw(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowWithdraw(false)} />
          <Animated.View entering={FadeInUp.duration(300)} style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MaterialCommunityIcons name="lightning-bolt" size={24} color="#FF9800" />
              <Text style={styles.modalTitle}>{t('Instant Payout')}</Text>
            </View>
            <Text style={styles.modalSub}>{t('Available')}: ₹{data?.walletBalance || 0}</Text>

            <Text style={styles.inputLabel}>{t('Amount (₹)')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} placeholder={t('e.g. 500')} placeholderTextColor="#B0A898"
                value={withdrawAmt} onChangeText={setWithdrawAmt} keyboardType="numeric" />
            </View>

            <View style={{ flexDirection: 'row', backgroundColor: '#F0EBE0', borderRadius: 8, padding: 4, marginTop: 12 }}>
              <Pressable onPress={() => setWithdrawMethod('UPI')} style={{ flex: 1, paddingVertical: 10, borderRadius: 6, backgroundColor: withdrawMethod === 'UPI' ? '#FFFFFF' : 'transparent', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, elevation: withdrawMethod === 'UPI' ? 2 : 0 }}>
                <MaterialCommunityIcons name="qrcode" size={16} color={withdrawMethod === 'UPI' ? '#0D0D0D' : '#6B6B6B'} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: withdrawMethod === 'UPI' ? '#0D0D0D' : '#6B6B6B' }}>UPI</Text>
              </Pressable>
              <Pressable onPress={() => setWithdrawMethod('BANK')} style={{ flex: 1, paddingVertical: 10, borderRadius: 6, backgroundColor: withdrawMethod === 'BANK' ? '#FFFFFF' : 'transparent', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, elevation: withdrawMethod === 'BANK' ? 2 : 0 }}>
                <MaterialCommunityIcons name="bank" size={16} color={withdrawMethod === 'BANK' ? '#0D0D0D' : '#6B6B6B'} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: withdrawMethod === 'BANK' ? '#0D0D0D' : '#6B6B6B' }}>{t('Bank Transfer')}</Text>
              </Pressable>
            </View>

            {withdrawMethod === 'UPI' ? (
              <>
                <Text style={styles.inputLabel}>{t('UPI ID')}</Text>
                <View style={styles.inputWrapper}>
                  <TextInput style={styles.input} placeholder={t('example@okbank')} placeholderTextColor="#B0A898"
                    value={withdrawUpi} onChangeText={setWithdrawUpi} autoCapitalize="none" />
                </View>
              </>
            ) : (
              <View style={{ gap: 12, marginTop: 12 }}>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="bank-outline" size={18} color="#6B6B6B" style={{ marginRight: 8 }} />
                  <TextInput style={styles.input} placeholder={t('Bank Name')} placeholderTextColor="#B0A898"
                    value={withdrawBankName} onChangeText={setWithdrawBankName} />
                </View>
                <View style={styles.inputWrapper}>
                  <MaterialCommunityIcons name="account-outline" size={18} color="#6B6B6B" style={{ marginRight: 8 }} />
                  <TextInput style={styles.input} placeholder={t('Account Holder Name')} placeholderTextColor="#B0A898"
                    value={withdrawAcctName} onChangeText={setWithdrawAcctName} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <TextInput style={styles.input} placeholder={t('Account Number')} placeholderTextColor="#B0A898"
                      value={withdrawBankAcct} onChangeText={setWithdrawBankAcct} keyboardType="number-pad" />
                  </View>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <TextInput style={styles.input} placeholder={t('IFSC Code')} placeholderTextColor="#B0A898"
                      value={withdrawIfsc} onChangeText={setWithdrawIfsc} autoCapitalize="characters" />
                  </View>
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={handleWithdraw}
                disabled={withdrawing}
                style={[styles.saveBtn, withdrawing && { opacity: 0.5 }]}
              >
                {withdrawing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' }}>{t('Request Withdrawal')}</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setShowWithdraw(false)}
                style={[styles.saveBtn, { backgroundColor: '#E0D8CC' }]}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Add Money Modal */}
      <Modal visible={showAddMoney} transparent animationType="slide" onRequestClose={() => setShowAddMoney(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAddMoney(false)} />
          <Animated.View entering={FadeInUp.duration(300)} style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MaterialCommunityIcons name="wallet-plus" size={24} color="#4CAF50" />
              <Text style={styles.modalTitle}>{t('Add Money')}</Text>
            </View>
            <Text style={styles.modalSub}>{t('Top up your wallet securely')}</Text>

            <Text style={styles.inputLabel}>{t('Amount (₹)')}</Text>
            <View style={styles.inputWrapper}>
              <TextInput style={styles.input} placeholder={t('e.g. 500')} placeholderTextColor="#B0A898"
                value={addAmount} onChangeText={setAddAmount} keyboardType="numeric" />
            </View>

            <View style={styles.chipRow}>
              {[100, 500, 1000].map((amt) => (
                <Pressable
                  key={amt}
                  style={styles.chip}
                  onPress={() => setAddAmount(amt.toString())}
                >
                  <Text style={styles.chipText}>+₹{amt}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
              <Pressable
                onPress={handleAddMoney}
                disabled={addingMoney}
                style={[styles.saveBtn, addingMoney && { opacity: 0.5 }]}
              >
                {addingMoney ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' }}>{t('Proceed to Pay')}</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setShowAddMoney(false)}
                style={[styles.saveBtn, { backgroundColor: '#E0D8CC' }]}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  walletCard: {
    backgroundColor: '#0D0D0D', borderRadius: 16, padding: 20, alignItems: 'center', gap: 4,
  },
  walletLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#F5F0E8', opacity: 0.7 },
  walletAmount: { fontFamily: 'SpaceMono_700Bold', fontSize: 36, color: '#F5F0E8', letterSpacing: 1, marginVertical: 8 },
  withdrawBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF5C00', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 24, elevation: 4,
  },

  statBox: {
    width: '47%', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, alignItems: 'center', gap: 6, elevation: 1,
  },
  statValue: { fontFamily: 'SpaceMono_700Bold', fontSize: 18, color: '#0D0D0D' },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#6B6B6B' },

  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 10 },

  perfRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1 },
  perfItem: { flex: 1, alignItems: 'center', padding: 14, borderRightWidth: 1, borderRightColor: '#F0EBE0' },
  perfValue: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#0D0D0D' },
  perfLabel: { fontFamily: 'Inter_500Medium', fontSize: 9, color: '#6B6B6B', marginTop: 4, textAlign: 'center' },

  reportCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, elevation: 1, gap: 10 },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reportMonth: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#6B6B6B', width: 44 },
  reportBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F0EBE0', overflow: 'hidden' },
  reportBar: { height: 8, borderRadius: 4, backgroundColor: '#FF5C00' },
  reportAmt: { fontFamily: 'SpaceMono_700Bold', fontSize: 12, color: '#0D0D0D', width: 64, textAlign: 'right' },

  txnSection: { marginBottom: 14 },
  txnDayLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginLeft: 2 },
  txnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12,
    marginBottom: 6, elevation: 1,
  },
  txnIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txnBody: { flex: 1, marginRight: 8 },
  txnTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' },
  txnDesc: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  txnRight: { alignItems: 'flex-end' },
  txnAmt: { fontFamily: 'SpaceMono_700Bold', fontSize: 15 },
  txnPending: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#E65100', marginTop: 2 },
  txnLoading: { alignItems: 'center', paddingVertical: 24 },
  txnEmpty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  txnEmptyText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#8A8478' },

  pendingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: '#FFF3E0', borderRadius: 12 },
  pendingText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#E65100' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 4 },
  modalSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginBottom: 20 },
  inputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 6, marginTop: 4 },
  inputWrapper: { backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, marginBottom: 8 },
  input: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', paddingVertical: 12 },

  saveBtn: {
    flex: 1, backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', elevation: 2,
  },
  frozenBanner: {
    backgroundColor: '#FFEBEE', borderRadius: 12, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FFCDD2'
  },
  frozenTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#D32F2F', marginBottom: 2 },
  frozenText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#C62828', lineHeight: 18 },
  addMoneyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F5F0E8', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 24, elevation: 2, flex: 1
  },
  chipRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F0EBE0', borderWidth: 1, borderColor: '#E0D8CC' },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#4A2B1D' },
});