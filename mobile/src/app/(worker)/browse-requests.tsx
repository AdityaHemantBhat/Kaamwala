import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SkeletonWorkerBrowseRequests } from '../../components/ui/Skeleton';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../../components/ui/ToastProvider';
import { apiClient } from '../../api/client';
import { socketService } from '../../api/socket';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';
import { Modal, TextInput } from 'react-native';

const CATEGORIES = [
  'PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER', 'PAINTER',
  'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER', 'COOK', 'TUTOR',
  'SECURITY_GUARD', 'NURSE', 'BABYSITTER',
];

export default function BrowseRequests() {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [commissionPercent, setCommissionPercent] = useState(15);

  // Quote modal state
  const [quoteRequest, setQuoteRequest] = useState<any>(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteUnit, setQuoteUnit] = useState<'FLAT' | 'PER_HOUR'>('FLAT');
  const [quoteMessage, setQuoteMessage] = useState('');
  const [quoteSending, setQuoteSending] = useState(false);

  useEffect(() => {
    loadRequests();
    // Load worker's commission rate to show expected earnings
    (async () => {
      try {
        const res = await apiClient.get('/workers/subscription/my');
        setCommissionPercent(Number(res.data?.data?.commission) || 15);
      } catch {}
    })();
  }, [filterCat]);

  // Realtime delivery of new open requests
  useEffect(() => {
    const cb = () => loadRequests();
    socketService.on('request_matched', cb);
    return () => socketService.off('request_matched', cb);
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCat) params.category = filterCat;
      const res = await apiClient.get('/requests/browse', { params });
      setRequests(res.data?.data || []);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const handleInterest = async (id: string) => {
    try {
      await apiClient.post(`/requests/${id}/interest`);
      showToast({ message: t('Interest sent! Customer notified.'), type: 'success' });
    } catch (e) {
      showToast({ message: t('Failed to send interest'), type: 'error' });
    }
  };

  const handleQuote = async () => {
    if (!quoteRequest || !quoteAmount) return;
    setQuoteSending(true);
    try {
      await apiClient.post(`/requests/${quoteRequest.id}/quote`, {
        amount: Number(quoteAmount),
        pricingUnit: quoteUnit,
        message: quoteMessage.trim() || undefined,
      });
      showToast({ message: t('Quote sent! Customer will review.'), type: 'success' });
      setQuoteRequest(null);
      setQuoteAmount('');
      setQuoteMessage('');
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to send quote'), type: 'error' });
    } finally { setQuoteSending(false); }
  };

  const expectedEarnings = (amount: number) => {
    const commission = Math.round((amount * commissionPercent) / 100);
    return amount - commission;
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Browse Requests')}</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Category filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, !filterCat && styles.filterChipActive]}
            onPress={() => setFilterCat(null)}>
            <Text style={[styles.filterChipText, !filterCat && styles.filterChipTextActive]}>{t('All')}</Text>
          </Pressable>
          {CATEGORIES.map(c => (
            <Pressable
              key={c}
              style={[styles.filterChip, filterCat === c && styles.filterChipActive]}
              onPress={() => setFilterCat(c)}>
              <Text style={[styles.filterChipText, filterCat === c && styles.filterChipTextActive]}>
                {t(c.replace(/_/g, ' '))}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <SkeletonWorkerBrowseRequests />
        ) : requests.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="clipboard-text-off" size={64} color="#A8A090" />
            <Text style={styles.emptyTitle}>{t('No open requests')}</Text>
            <Text style={styles.emptySub}>{t('Check back later for new customer requests')}</Text>
          </View>
        ) : (
          requests.map((req, i) => (
            <View key={req.id} style={styles.reqCard}>
              <View style={styles.reqHeader}>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>{t(req.category)}</Text>
                </View>
                <Text style={styles.reqDate}>
                  {new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </Text>
              </View>

              <Text style={styles.reqTitle}>{req.title}</Text>
              <Text style={styles.reqDesc} numberOfLines={2}>{req.description}</Text>

              {/* Problem images  */}
              {Array.isArray(req.images) && req.images.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {req.images.slice(0, 4).map((img: string, i: number) => (
                    <Image
                      key={i}
                      source={{ uri: img }}
                      style={{ width: 72, height: 72, borderRadius: 10, marginRight: 8, backgroundColor: '#EDE8DC' }}
                      contentFit="cover"
                    />
                  ))}
                </ScrollView>
              )}

              <View style={styles.reqMeta}>
                {req.budget && (
                  <View style={styles.metaChip}>
                    <MaterialCommunityIcons name="currency-inr" size={14} color="#0D0D0D" />
                    <Text style={styles.metaChipText}>
                      {t('Offer')}: ₹{req.budget}{req.pricingUnit === 'PER_HOUR' ? '/hr' : ''} ({req.budgetType === 'fixed' ? t('Fixed') : t('Negotiable')})
                    </Text>
                  </View>
                )}
                {req.city && (
                  <View style={styles.metaChip}>
                    <MaterialCommunityIcons name="map-marker" size={14} color="#0D0D0D" />
                    <Text style={styles.metaChipText}>{req.city}</Text>
                  </View>
                )}
              </View>

              <View style={styles.reqCustomer}>
                <MaterialCommunityIcons name="account" size={16} color="#A8A090" />
                <Text style={styles.reqCustomerText}>
                  {req.customer?.user?.name || t('Customer')}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  style={styles.quoteBtn}
                  onPress={() => { setQuoteRequest(req); setQuoteAmount(req.budget ? String(req.budget) : ''); }}>
                  <MaterialCommunityIcons name="currency-inr" size={16} color="#FF5C00" />
                  <Text style={styles.quoteBtnText}>{t('Quote')}</Text>
                </Pressable>
                <Pressable
                  style={styles.interestBtn}
                  onPress={() => handleInterest(req.id)}>
                  <MaterialCommunityIcons name="handshake" size={16} color="#FFFFFF" />
                  <Text style={styles.interestBtnText}>{t('Show Interest')}</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Quote Modal ── */}
      <Modal visible={!!quoteRequest} transparent animationType="fade" onRequestClose={() => setQuoteRequest(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' }}>
              {t('Send a quote')}
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>
              {quoteRequest?.title}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: '#F5F0E8', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#E0E0E0' }}>
              <MaterialCommunityIcons name="currency-inr" size={20} color="#A8A090" />
              <TextInput
                style={{ flex: 1, fontFamily: 'SpaceMono_700Bold', fontSize: 18, color: '#0D0D0D', paddingVertical: 14, marginLeft: 8 }}
                placeholder="0"
                placeholderTextColor="#C8C0B0"
                value={quoteAmount}
                onChangeText={setQuoteAmount}
                keyboardType="numeric"
              />
            </View>

            {/* Unit toggle */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {(['FLAT', 'PER_HOUR'] as const).map((unit) => (
                <Pressable
                  key={unit}
                  onPress={() => setQuoteUnit(unit)}
                  style={{
                    flex: 1, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5,
                    borderColor: quoteUnit === unit ? '#FF5C00' : '#E0E0E0',
                    backgroundColor: quoteUnit === unit ? '#FFF0E8' : '#FFFFFF', alignItems: 'center',
                  }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: quoteUnit === unit ? '#FF5C00' : '#6B6B6B' }}>
                    {unit === 'FLAT' ? t('Per Job') : t('Per Hour')}
                  </Text>
                </Pressable>
              ))}
            </View>

            {quoteAmount && !isNaN(Number(quoteAmount)) && (
              <View style={{ marginTop: 10, backgroundColor: '#E8F0E9', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#1A5C2A' }}>{`${t('Your earnings')} (after ${commissionPercent}%)`}</Text>
                <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 13, color: '#1A5C2A' }}>
                  ₹{expectedEarnings(Number(quoteAmount)).toLocaleString('en-IN')}
                </Text>
              </View>
            )}

            <View style={{ marginTop: 12, backgroundColor: '#F5F0E8', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1.5, borderColor: '#E0E0E0' }}>
              <TextInput
                style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', paddingVertical: 12, minHeight: 44 }}
                placeholder={t('Message to customer (optional)')}
                placeholderTextColor="#A8A090"
                value={quoteMessage}
                onChangeText={setQuoteMessage}
                multiline
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={() => setQuoteRequest(null)}
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 16, borderWidth: 1.5, borderColor: '#E0E0E0' }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleQuote}
                disabled={quoteSending || !quoteAmount}
                style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 16, backgroundColor: '#FF5C00', opacity: quoteSending || !quoteAmount ? 0.6 : 1 }}>
                {quoteSending ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFF' }}>{t('Send Quote')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 20,
    color: '#0D0D0D',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8 },
  filterRow: { marginBottom: 16, flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#EDE8DC',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#FF5C00',
  },
  filterChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#6B6B6B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  loaderBox: { paddingVertical: 80 },
  emptyBox: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 18,
    color: '#6B6B6B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#A8A090',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  reqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    padding: 16,
    marginBottom: 14,
  },
  reqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryPill: {
    backgroundColor: '#FFF0E8',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: '#FF5C00',
    letterSpacing: 0.5,
  },
  reqDate: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: '#A8A090',
  },
  reqTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#0D0D0D',
    marginBottom: 6,
  },
  reqDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#6B6B6B',
    lineHeight: 18,
    marginBottom: 12,
  },
  reqMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F0E8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaChipText: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: '#0D0D0D',
  },
  reqCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  reqCustomerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#A8A090',
  },
  interestBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF5C00',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  interestBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  quoteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: '#FF5C00',
  },
  quoteBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#FF5C00',
  },
});
