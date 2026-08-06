import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FeaturedBadge, isFeaturedActive } from '../../components/ui/FeaturedBadge';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonSubscriptionPlansBody } from '../../components/ui/SkeletonScreenLayouts';
import { apiClient } from '../../api/client';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';
import { SubscriptionPlanCard } from '../../components/subscription/SubscriptionPlanCard';
import { WORKER_PLAN_DETAILS, SUBSCRIPTION_COLORS, SUBSCRIPTION_STYLES } from '../../components/subscription/subscriptionConstants';

export default function WorkerSubscription() {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState('FREE');
  const [selected, setSelected] = useState('FREE');
  const [processing, setProcessing] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredUntil, setFeaturedUntil] = useState<string | null>(null);

  // Memoize plans with translations
  const plans = useMemo(() => {
    const baseFreePlan = {
      id: 'FREE',
      name: t('Free'),
      color: SUBSCRIPTION_COLORS.gray,
      commission: '15%',
      features: [],
    };
    const proPlan = {
      id: 'PRO',
      name: t('Pro'),
      price: 199,
      color: SUBSCRIPTION_COLORS.primary,
      features: [t('Priority listing'), t('Unlimited leads'), t('10% Flat Commission')],
    };
    const elitePlan = {
      id: 'ELITE',
      name: t('Elite'),
      price: 499,
      color: SUBSCRIPTION_COLORS.elite,
      features: [
        t('Featured profile badge'),
        t('Unlimited priority leads'),
        t('Only 5% Commission'),
        t('24/7 dedicated support'),
      ],
    };
    return [baseFreePlan, proPlan, elitePlan];
  }, [t]);

  useEffect(() => {
    (async () => {
      try {
        const [subRes, profileRes] = await Promise.all([
          apiClient.get('/workers/subscription/my'),
          apiClient.get('/workers/profile/me'),
        ]);
        setCurrent(subRes.data?.data?.plan || 'FREE');
        setSelected(subRes.data?.data?.plan || 'FREE');
        setIsFeatured(!!profileRes.data?.data?.isFeatured);
        setFeaturedUntil(profileRes.data?.data?.featuredUntil || null);
      } catch (e) {}
      finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (selected === current || selected === 'FREE') return;
    setProcessing(true);
    try {
      const orderRes = await apiClient.post('/workers/subscription/create-order', {
        plan: selected,
      });
      const order = orderRes.data?.data;
      if (!order?.orderId) throw new Error('No order');

      const { startCashfreePayment, isUserCancellation } = require('../../utils/cashfree');
      const paymentResult = await startCashfreePayment(order.paymentSessionId, order.orderId);

      if (paymentResult.status === 'SUCCESS') {
        await apiClient.post('/workers/subscription/verify', {
          orderId: order.orderId,
          plan: selected,
        });
        setCurrent(selected);
        try {
          const profileRes = await apiClient.get('/workers/profile/me');
          setIsFeatured(!!profileRes.data?.data?.isFeatured);
          setFeaturedUntil(profileRes.data?.data?.featuredUntil || null);
        } catch {}
        showToast({
          message: t('Plan activated! Lower commission applies now.'),
          type: 'success',
        });
      } else {
        // Backing out of checkout is expected (nothing charged); a real gateway
        // failure is not. Show the right tone instead of always "cancelled".
        const cancelled = isUserCancellation(paymentResult);
        showToast({
          message: cancelled
            ? t('Payment cancelled')
            : t('Payment failed. Please try again.'),
          type: cancelled ? 'info' : 'error',
        });
      }
    } catch (e: any) {
      if (e?.response?.data?.error) {
        showToast({ message: e.response.data.error, type: 'error' });
      } else if (
        e?.code === 'PAYMENT_CANCELLED' ||
        e?.message?.includes('cancelled')
      ) {
        showToast({ message: t('Payment cancelled'), type: 'info' });
      } else if (e?.message) {
        // Surface the SDK's real reason (e.g. "Cashfree SDK is not available in
        // this build") instead of masking it behind a generic failure toast.
        showToast({ message: e.message, type: 'error' });
      } else {
        showToast({
          message: t('Payment failed. Please try again.'),
          type: 'error',
        });
      }
    } finally {
      setProcessing(false);
    }
  }, [selected, current, t, showToast]);

  const handleBoost = useCallback(async () => {
    setProcessing(true);
    try {
      // Boost goes through the same Cashfree checkout as plan upgrades — never
      // applied directly. Create the order, run the SDK, verify server-side.
      const orderRes = await apiClient.post('/workers/subscription/create-boost-order');
      const order = orderRes.data?.data;
      if (!order?.orderId) throw new Error('No order');

      const { startCashfreePayment, isUserCancellation } = require('../../utils/cashfree');
      const paymentResult = await startCashfreePayment(order.paymentSessionId, order.orderId);

      if (paymentResult.status === 'SUCCESS') {
        await apiClient.post('/workers/subscription/verify-boost', { orderId: order.orderId });
        showToast({ message: t('Profile boosted! Featured for 7 days.'), type: 'success' });
        const profileRes = await apiClient.get('/workers/profile/me');
        setIsFeatured(!!profileRes.data?.data?.isFeatured);
        setFeaturedUntil(profileRes.data?.data?.featuredUntil || null);
      } else {
        // Backing out of checkout is expected (nothing charged); a real gateway
        // failure is not. Show the right tone instead of always "cancelled".
        const cancelled = isUserCancellation(paymentResult);
        showToast({
          message: cancelled ? t('Payment cancelled') : t('Boost failed. Please try again.'),
          type: cancelled ? 'info' : 'error',
        });
      }
    } catch (e: any) {
      // Don't mask the real reason behind a generic "Boost failed": a server
      // error (API message) and an SDK error (e.g. "Cashfree SDK is not
      // available in this build") both carry useful diagnostics. Only fall back
      // to the generic text when neither exists.
      if (e?.response?.data?.error) {
        showToast({ message: e.response.data.error, type: 'error' });
      } else if (e?.message) {
        showToast({ message: e.message, type: 'error' });
      } else {
        showToast({
          message: t('Boost failed. Please try again.'),
          type: 'error',
        });
      }
    } finally {
      setProcessing(false);
    }
  }, [t, showToast]);

  const handleCancel = useCallback(async () => {
    if (current === 'FREE') return;
    setProcessing(true);
    try {
      await apiClient.post('/workers/subscription/cancel');
      setCurrent('FREE');
      setSelected('FREE');
      showToast({ message: t('Subscription cancelled.'), type: 'success' });
    } catch (e: any) {
      showToast({ message: t('Failed to cancel'), type: 'error' });
    } finally {
      setProcessing(false);
    }
  }, [current, t, showToast]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: SUBSCRIPTION_COLORS.light }} edges={['top']}>
        <SkeletonSubscriptionPlansBody />
      </SafeAreaView>
    );
  }

  // Reuse one flag: the featured badge drives both the status banner and the
  // boost button's active ("Extend") styling.
  const boostActive = isFeaturedActive(isFeatured, featuredUntil);
  // The "Upgrade to X" CTA takes the selected plan's accent color (ELITE →
  // purple, PRO → orange) so the button mirrors the card the worker picked.
  const selectedPlan = plans.find((p) => p.id === selected);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SUBSCRIPTION_COLORS.light }} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={SUBSCRIPTION_COLORS.dark} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Subscription')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroRing}>
            <MaterialCommunityIcons name="crown" size={40} color={SUBSCRIPTION_COLORS.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('Choose a Plan')}</Text>
          <Text style={styles.heroSub}>{t('Save on commission with a subscription')}</Text>
        </View>

        {/* Active banner */}
        {current !== 'FREE' && (
          <View style={styles.activeBanner}>
            <MaterialCommunityIcons name="crown" size={18} color={SUBSCRIPTION_COLORS.primary} />
            <Text style={styles.activeBannerText}>
              {current} {t('plan active')} &middot; {current === 'ELITE' ? '5%' : '10%'}{' '}
              {t('commission')}
            </Text>
          </View>
        )}

        {/* Featured badge status */}
        {isFeaturedActive(isFeatured, featuredUntil) && (
          <View style={styles.featuredStatusBanner}>
            <MaterialCommunityIcons name="star-circle" size={18} color="#FFD700" />
            <Text style={styles.featuredStatusText}>
              {t('Featured profile badge active')}{' '}
              {featuredUntil
                ? `· ${t('Expires')} ${new Date(featuredUntil).toLocaleDateString()}`
                : ''}
            </Text>
          </View>
        )}

        {/* Plan Cards */}
        <View style={styles.plansContainer}>
          {plans.map((plan) => (
            <SubscriptionPlanCard
              key={plan.id}
              plan={plan}
              isActive={plan.id === current}
              isSelected={plan.id === selected}
              isPro={plan.id === 'PRO'}
              isElite={plan.id === 'ELITE'}
              onPress={() => setSelected(plan.id)}
              variant="worker"
            />
          ))}
        </View>

        {/* Action Button */}
        <View style={styles.actionArea}>
          {selected !== current && selected !== 'FREE' ? (
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: selectedPlan?.color || SUBSCRIPTION_COLORS.primary }]}
              onPress={handleSubscribe}
              disabled={processing}>
              {processing ? (
                <ActivityIndicator size="small" color={SUBSCRIPTION_COLORS.white} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {t('Upgrade to')} {selected}
                </Text>
              )}
            </Pressable>
          ) : current !== 'FREE' ? (
            <Pressable style={styles.cancelBtn} onPress={handleCancel} disabled={processing}>
              {processing ? (
                <ActivityIndicator size="small" color="#E53935" />
              ) : (
                <Text style={styles.cancelBtnText}>{t('Cancel Subscription')}</Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.currentPlanBtn}>
              <Text style={styles.currentPlanBtnText}>{t('Current Plan')}</Text>
            </View>
          )}

          <Text style={styles.termsText}>
            {t('Subscriptions auto-renew every month. Cancel anytime.')}
          </Text>
        </View>

        {/* Boost Profile */}
        <View style={styles.boostSection}>
          <View style={styles.boostCard}>
            <View style={styles.planRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{t('Boost Profile')}</Text>
                <Text style={styles.planDesc}>
                  {t('Get featured for 7 days — priority in search results')}
                </Text>
              </View>
              <View style={styles.priceCol}>
                <Text style={[styles.planPriceValue, { color: SUBSCRIPTION_COLORS.primary }]}>
                  ₹99
                </Text>
                <Text style={styles.planPriceUnit}>{t('/7 days')}</Text>
              </View>
            </View>
            <View style={styles.featureList}>
              <View style={styles.featureRow}>
                <MaterialCommunityIcons name="rocket-launch" size={16} color={SUBSCRIPTION_COLORS.primary} />
                <Text style={styles.featureText}>{t('Featured profile badge')}</Text>
              </View>
              <View style={styles.featureRow}>
                <MaterialCommunityIcons name="check" size={16} color={SUBSCRIPTION_COLORS.primary} />
                <Text style={styles.featureText}>
                  {t('Priority in search results')}
                </Text>
              </View>
            </View>
            <Pressable
              style={[
                styles.boostBtn,
                boostActive && styles.boostBtnActive,
              ]}
              onPress={handleBoost}
              disabled={processing}>
              {processing ? (
                <ActivityIndicator
                  size="small"
                  color={boostActive ? SUBSCRIPTION_COLORS.gray : SUBSCRIPTION_COLORS.white}
                />
              ) : (
                <Text style={[styles.boostBtnText, boostActive && styles.boostBtnTextActive]}>
                  {boostActive ? t('Extend Boost') : t('Boost Now')}
                </Text>
              )}
            </Pressable>
            <Text style={styles.boostNote}>
              {t('Secure payment via Cashfree checkout.')}
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: SUBSCRIPTION_COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: SUBSCRIPTION_COLORS.dark,
    marginLeft: 16,
  },

  scrollContent: { paddingHorizontal: 24 },
  hero: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  heroRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FFD7C2',
  },
  heroTitle: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 28,
    color: SUBSCRIPTION_COLORS.dark,
    marginBottom: 8,
  },
  heroSub: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#666' },

  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SUBSCRIPTION_COLORS.info,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: SUBSCRIPTION_COLORS.warning,
  },
  activeBannerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#E65100',
    marginLeft: 8,
  },

  featuredStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFECB3',
  },
  featuredStatusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#F57F17',
    marginLeft: 8,
  },

  plansContainer: { gap: 14 },

  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: SUBSCRIPTION_COLORS.dark,
  },
  planPrice: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#666' },
  planDesc: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: SUBSCRIPTION_COLORS.gray,
    marginTop: 4,
  },

  priceCol: { alignItems: 'flex-end' },
  planPriceValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 24,
    color: SUBSCRIPTION_COLORS.dark,
  },
  planPriceUnit: { fontFamily: 'Inter_500Medium', fontSize: 12, color: SUBSCRIPTION_COLORS.gray },

  currentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  currentBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#666' },

  featureList: { marginTop: 14, borderTopWidth: 1, borderTopColor: SUBSCRIPTION_COLORS.lightGray, paddingTop: 14, gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: SUBSCRIPTION_COLORS.darkGray },

  actionArea: { marginTop: 24 },
  primaryBtn: {
    backgroundColor: SUBSCRIPTION_COLORS.primary,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  primaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: SUBSCRIPTION_COLORS.white,
  },
  cancelBtn: {
    backgroundColor: SUBSCRIPTION_COLORS.white,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  cancelBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#E53935',
  },
  currentPlanBtn: {
    backgroundColor: '#EBEBEB',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentPlanBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#999' },

  termsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },

  boostSection: { marginTop: 24 },
  boostCard: {
    backgroundColor: SUBSCRIPTION_COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: SUBSCRIPTION_COLORS.border,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  boostBtn: {
    backgroundColor: SUBSCRIPTION_COLORS.primary,
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    elevation: 4,
  },
  // "Extend Boost" shows when the badge is already active — neutral gray body
  // (matches "Current Plan") with a primary border so it still reads as the
  // actionable button, not a dead state.
  boostBtnActive: {
    backgroundColor: '#EBEBEB',
    borderWidth: 2,
    borderColor: SUBSCRIPTION_COLORS.primary,
  },
  boostBtnTextActive: { color: SUBSCRIPTION_COLORS.gray },
  boostBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: SUBSCRIPTION_COLORS.white,
  },
  boostNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: SUBSCRIPTION_COLORS.gray,
    textAlign: 'center',
    marginTop: 12,
  },
});