import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Modal, Linking, Platform, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Colors } from '../../constants/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useT } from '../../utils/i18n';
import { PaymentIcon } from '../../components/ui/PaymentIcons';
import { useToast } from '../../components/ui/ToastProvider';
import { apiClient } from '../../api/client';
import { router } from 'expo-router';
import { getTransactionMeta, formatSignedINR } from '../../utils/transactionMeta';
import { SkeletonWalletPaymentsBody } from '../../components/ui/SkeletonScreenLayouts';
import { env } from '../../config/env';
import { formatMoneyWithSymbol, parseMoneyInput } from '../../utils/money';
import { startCashfreePayment, isUserCancellation } from '../../utils/cashfree';
import { useRealtimeWalletRefresh } from '../../hooks/useRealtimeWalletRefresh';

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

/** UPI quick-pay apps shown on the payments screen.
 * Only the app package name and display metadata live here — the merchant
 * UPI address and payee name are resolved at runtime from env config so they
 * can be changed per deployment without a code change. */
const QUICK_PAY_APPS: {
  name: string;
  iconKey: 'googlePay' | 'phonePe' | 'paytm' | 'bhim';
  bg: string;
  pkg: string;
}[] = [
  { name: 'Google Pay', iconKey: 'googlePay', bg: '#E8F0FE', pkg: 'com.google.android.apps.nbu.paisa.user' },
  { name: 'PhonePe',    iconKey: 'phonePe',   bg: '#F0EBF8', pkg: 'com.phonepe.app' },
  { name: 'Paytm',      iconKey: 'paytm',     bg: '#E8F8FE', pkg: 'net.one97.paytm' },
  { name: 'BHIM',       iconKey: 'bhim',      bg: '#E8F5E9', pkg: 'in.org.npci.upiapp' },
];

export default function PaymentsScreen() {
  const t = useT();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState<'UPI'|'BANK'>('UPI');
  const [withdrawUpi, setWithdrawUpi] = useState('');
  const [withdrawBankAcct, setWithdrawBankAcct] = useState('');
  const [withdrawIfsc, setWithdrawIfsc] = useState('');
  const [withdrawBankName, setWithdrawBankName] = useState('');
  const [withdrawAcctName, setWithdrawAcctName] = useState('');

  useEffect(() => { loadData(); }, []);

  // Realtime wallet + ledger: a top-up / wallet payment / refund notification
  // (socket or foreground push) refetches the balance and transactions so the
  // screen stays in sync without a pull-to-refresh.
  useRealtimeWalletRefresh(loadData);

  async function loadData() {
    try {
      const [homeRes, txnRes] = await Promise.all([
        apiClient.get('/home').catch(() => ({ data: { data: null } })),
        apiClient.get('/payments/transactions').catch(() => ({ data: { data: [] } })),
      ]);
      const profile = homeRes.data?.data;
      setWalletBalance(profile?.walletBalance || profile?.customerProfile?.walletBalance || 0);
      setTransactions(txnRes.data?.data || []);
    } catch {}
    finally { setLoading(false); }
  }

  const handleAddMoney = async () => {
    const amt = parseMoneyInput(addAmount);
    if (!Number.isFinite(amt) || amt < 1) { showToast({ message: t('Enter a valid amount'), type: 'error' }); return; }
    setProcessing(true);
    try {
      // 1. Create a real Cashfree order for the top-up.
      const orderRes = await apiClient.post('/payments/add-money', { amount: amt });
      const order = orderRes.data?.data;
      if (!order?.orderId) throw new Error(t('Failed to initialize payment'));

      // 2. Launch the Cashfree checkout (native SDK, or mock alert in Expo Go).
      const paymentResult = await startCashfreePayment(order.paymentSessionId, order.orderId);

      // Backing out of checkout is expected (nothing charged); a real gateway
      // failure is not. Don't report a cancellation as "Payment failed".
      if (paymentResult.status !== 'SUCCESS') {
        showToast({
          message: isUserCancellation(paymentResult)
            ? t('Payment cancelled')
            : t('Payment failed'),
          type: isUserCancellation(paymentResult) ? 'info' : 'error',
        });
        return;
      }

      // 3. Only now credit the wallet — backend verifies the order with Cashfree.
      await apiClient.post('/payments/verify-wallet-topup', {
        orderId: order.orderId,
      });

      showToast({ message: t('Added') + ' ₹' + amt + ' ' + t('to wallet'), type: 'success' });
      setShowAddModal(false); setAddAmount('');
      loadData();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Payment failed'), type: 'error' });
    } finally { setProcessing(false); }
  };

  const handleWithdraw = async () => {
    const amt = parseMoneyInput(withdrawAmount);
    if (!Number.isFinite(amt) || amt < 1) { showToast({ message: t('Enter a valid amount'), type: 'error' }); return; }
    if (withdrawMethod === 'UPI') {
      if (!withdrawUpi.includes('@')) { showToast({ message: t('Enter a valid UPI ID'), type: 'error' }); return; }
    } else {
      if (!withdrawBankAcct || !withdrawIfsc || !withdrawBankName || !withdrawAcctName) {
        showToast({ message: t('Complete all bank details'), type: 'error' }); return;
      }
    }
    
    if (amt > walletBalance) { showToast({ message: t('Insufficient balance'), type: 'error' }); return; }
    setProcessing(true);
    try {
      const payload = withdrawMethod === 'UPI' 
        ? { amount: amt, method: 'UPI', upiId: withdrawUpi }
        : { amount: amt, method: 'BANK', bankAccount: withdrawBankAcct, ifscCode: withdrawIfsc, bankName: withdrawBankName, accountHolderName: withdrawAcctName };
      await apiClient.post('/payments/withdraw', payload);
      showToast({ message: t('Withdrawal requested successfully'), type: 'success' });
      setShowWithdrawModal(false); 
      setWithdrawAmount(''); setWithdrawUpi(''); setWithdrawBankAcct(''); setWithdrawIfsc(''); setWithdrawBankName(''); setWithdrawAcctName('');
      loadData();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed'), type: 'error' });
    } finally { setProcessing(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={({ pressed }) => [styles.backButton, pressed && { backgroundColor: 'rgba(13,13,13,0.08)' }]} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Payments')}</Text>
        </View>
        <SkeletonWalletPaymentsBody />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={({ pressed }) => [styles.backButton, pressed && { backgroundColor: 'rgba(13,13,13,0.08)' }]} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Payments')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, gap: 20, paddingBottom: 40 }}>
        {/* Wallet */}
        <Animated.View entering={FadeInDown.delay(50).duration(300)}>
          <View style={styles.walletCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>{t('Wallet Balance')}</Text>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' }}>
                <MaterialCommunityIcons name="wallet-outline" size={18} color="#F5F0E8" />
              </View>
            </View>
            <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 36, color: '#F5F0E8', letterSpacing: 1, marginBottom: 16 }}>{formatMoneyWithSymbol(walletBalance)}</Text>
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setShowAddModal(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 12 }}>
                <MaterialCommunityIcons name="plus" size={18} color="#FFF" />
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: '#FFF' }}>{t('Add Money')}</Text>
              </Pressable>
              <Pressable onPress={() => setShowWithdrawModal(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 12 }}>
                <MaterialCommunityIcons name="arrow-top-right" size={18} color="#F5F0E8" />
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 12, color: '#F5F0E8' }}>{t('Withdraw')}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* Quick Pay */}
        <Animated.View entering={FadeInDown.delay(150).duration(300)}>
          <Text style={styles.sectionLabel}>{t('QUICK PAY VIA')}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {QUICK_PAY_APPS.map((app) => (
              <Pressable key={app.name} style={{ flex: 1, alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, elevation: 1, padding: 12, gap: 8 }}
                onPress={async () => {
                  const upiParams = `pa=${encodeURIComponent(env.MERCHANT_UPI_ID)}&pn=${encodeURIComponent(env.MERCHANT_NAME)}&cu=INR`;
                  const upiUrl = `upi://pay?${upiParams}`;
                  try {
                    if (Platform.OS === 'android') {
                      const intentUrl = `intent://pay?${upiParams}#Intent;scheme=upi;package=${app.pkg};end`;
                      const supported = await Linking.canOpenURL(intentUrl);
                      if (supported) { await Linking.openURL(intentUrl); return; }
                    }
                    await Linking.openURL(upiUrl);
                  } catch { showToast({ message: t('Open') + ' ' + app.name, type: 'info' }); }
                }}>
                <View style={[styles.upiIcon, { backgroundColor: app.bg }]}>
                  <PaymentIcon name={app.iconKey as any} size={26} />
                </View>
                <Text style={styles.upiName}>{app.name}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Transactions */}
        {transactions.length > 0 && (
          <Animated.View entering={FadeInDown.delay(250).duration(300)}>
            <Text style={styles.sectionLabel}>{t('RECENT TRANSACTIONS')}</Text>
            {transactions.slice(0, 8).map((txn: any, i: number) => {
              const meta = getTransactionMeta(txn.type);
              const isCredit = (txn.amount || 0) >= 0;
              return (
                <View key={txn.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < Math.min(transactions.length, 8) - 1 ? 1 : 0, borderBottomColor: 'rgba(13,13,13,0.06)' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: meta.bg, justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#0D0D0D' }}>{meta.label}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#9E9E9E', marginTop: 1 }} numberOfLines={1}>
                      {txn.description || new Date(txn.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 13, color: isCredit ? Colors.success : Colors.error }}>
                    {formatSignedINR(txn.amount || 0)}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add Money Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAddModal(false)} />
          {/* KeyboardAvoidingView lifts the sheet above the keyboard so the amount
              field and Add button stay visible while typing (edge-to-edge safe). */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ maxHeight: '85%' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 16 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 4 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', textAlign: 'center' }}>{t('Add Money')}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', textAlign: 'center' }}>{t('Enter amount to add')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {QUICK_AMOUNTS.map(a => (
                <Pressable key={a} onPress={() => setAddAmount(String(a))}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: Number(addAmount) === a ? '#FF5C00' : '#F5F0E8', alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 12, color: Number(addAmount) === a ? '#FFF' : '#0D0D0D' }}>₹{a}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 14, paddingHorizontal: 16, height: 52 }}>
              <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 18, color: '#0D0D0D', marginRight: 8 }}>₹</Text>
              <TextInput style={{ flex: 1, fontFamily: 'SpaceMono_700Bold', fontSize: 20, color: '#0D0D0D', height: '100%' }}
                placeholder={t('Enter amount')} placeholderTextColor="#C8C0B0" keyboardType="number-pad" value={addAmount} onChangeText={setAddAmount} />
            </View>
            <Pressable onPress={handleAddMoney} disabled={!addAmount || processing}
              style={{ backgroundColor: '#FF5C00', borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: (!addAmount || processing) ? 0.5 : 1 }}>
              {processing ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFF' }}>{t('Add')} {formatMoneyWithSymbol(parseMoneyInput(addAmount))}</Text>}
            </Pressable>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} transparent animationType="slide" onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowWithdrawModal(false)} />
          {/* Withdraw stacks up to 6 inputs (BANK branch), so lift the sheet above
              the keyboard AND let its content scroll to keep every field + the
              Withdraw button reachable. */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ maxHeight: '85%' }}>
          <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '100%' }} showsVerticalScrollIndicator={false}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 16 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 4 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', textAlign: 'center' }}>{t('Withdraw Funds')}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', textAlign: 'center' }}>{t('Available Balance')}: {formatMoneyWithSymbol(walletBalance)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 14, paddingHorizontal: 16, height: 52 }}>
              <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 18, color: '#0D0D0D', marginRight: 8 }}>₹</Text>
              <TextInput style={{ flex: 1, fontFamily: 'SpaceMono_700Bold', fontSize: 20, color: '#0D0D0D', height: '100%' }}
                placeholder={t('Amount')} placeholderTextColor="#C8C0B0" keyboardType="number-pad" value={withdrawAmount} onChangeText={setWithdrawAmount} />
            </View>

            <View style={{ flexDirection: 'row', backgroundColor: '#F5F0E8', borderRadius: 12, padding: 4 }}>
              <Pressable onPress={() => setWithdrawMethod('UPI')} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: withdrawMethod === 'UPI' ? '#FFFFFF' : 'transparent', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, elevation: withdrawMethod === 'UPI' ? 2 : 0 }}>
                <MaterialCommunityIcons name="qrcode" size={16} color={withdrawMethod === 'UPI' ? '#0D0D0D' : '#6B6B6B'} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: withdrawMethod === 'UPI' ? '#0D0D0D' : '#6B6B6B' }}>UPI</Text>
              </Pressable>
              <Pressable onPress={() => setWithdrawMethod('BANK')} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: withdrawMethod === 'BANK' ? '#FFFFFF' : 'transparent', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, elevation: withdrawMethod === 'BANK' ? 2 : 0 }}>
                <MaterialCommunityIcons name="bank" size={16} color={withdrawMethod === 'BANK' ? '#0D0D0D' : '#6B6B6B'} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: withdrawMethod === 'BANK' ? '#0D0D0D' : '#6B6B6B' }}>{t('Bank Transfer')}</Text>
              </Pressable>
            </View>

            {withdrawMethod === 'UPI' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 14, paddingHorizontal: 16, height: 52 }}>
                <PaymentIcon name="upi" size={40} />
                <TextInput style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', height: '100%' }}
                  placeholder={t('Enter UPI ID')} placeholderTextColor="#C8C0B0" value={withdrawUpi} onChangeText={setWithdrawUpi} autoCapitalize="none" />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 14, paddingHorizontal: 16, height: 52 }}>
                  <MaterialCommunityIcons name="bank-outline" size={20} color="#6B6B6B" style={{ marginRight: 8 }} />
                  <TextInput style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', height: '100%' }}
                    placeholder={t('Bank Name')} placeholderTextColor="#C8C0B0" value={withdrawBankName} onChangeText={setWithdrawBankName} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 14, paddingHorizontal: 16, height: 52 }}>
                  <MaterialCommunityIcons name="account-outline" size={20} color="#6B6B6B" style={{ marginRight: 8 }} />
                  <TextInput style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', height: '100%' }}
                    placeholder={t('Account Holder Name')} placeholderTextColor="#C8C0B0" value={withdrawAcctName} onChangeText={setWithdrawAcctName} />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 14, paddingHorizontal: 16, height: 52 }}>
                    <TextInput style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', height: '100%' }}
                      placeholder={t('Account Number')} placeholderTextColor="#C8C0B0" keyboardType="number-pad" value={withdrawBankAcct} onChangeText={setWithdrawBankAcct} />
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0E8', borderRadius: 14, paddingHorizontal: 16, height: 52 }}>
                    <TextInput style={{ flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', height: '100%' }}
                      placeholder={t('IFSC Code')} placeholderTextColor="#C8C0B0" value={withdrawIfsc} onChangeText={setWithdrawIfsc} autoCapitalize="characters" />
                  </View>
                </View>
              </View>
            )}

            <Pressable onPress={handleWithdraw} disabled={!withdrawAmount || processing || (parseMoneyInput(withdrawAmount) || 0) > walletBalance}
              style={{ backgroundColor: '#0D0D0D', borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: (!withdrawAmount || processing || (parseMoneyInput(withdrawAmount) || 0) > walletBalance) ? 0.4 : 1 }}>
              {processing ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFF' }}>{t('Withdraw')}</Text>}
            </Pressable>
          </View>
          </KeyboardAwareScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  loaderBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#0D0D0D' },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#9E9E9E', letterSpacing: 1.2, marginBottom: 10 },
  walletCard: { borderRadius: 20, backgroundColor: '#0D0D0D', padding: 20, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
  upiItem: { flex: 1, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, padding: 14, gap: 8 },
  upiIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  upiName: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: '#2A2A2A', textAlign: 'center' },
});
