import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonSubscriptionPlansBody } from '../../components/ui/SkeletonScreenLayouts';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { t, useT } from '../../utils/i18n';
import { apiClient } from '../../api/client';
import { SubscriptionPlanCard } from '../../components/subscription/SubscriptionPlanCard';
import { CUSTOMER_PLANS, SUBSCRIPTION_COLORS, SUBSCRIPTION_STYLES } from '../../components/subscription/subscriptionConstants';

export default function SubscriptionScreen() {
  const t = useT();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [current, setCurrent] = useState('BASIC');
  const [selected, setSelected] = useState('BASIC');
  const [processing, setProcessing] = useState(false);

  // Memoize plans with translated labels
  const plans = useMemo(() => 
    CUSTOMER_PLANS.map(plan => ({
      ...plan,
      name: t(plan.name),
      label: plan.id === 'BASIC' ? t('Free') : plan.label,
      features: plan.features.map(f => t(f)),
    })),
    [t]
  );

  const fetchSubscription = useCallback(async (isRefresh = false) => {
    try {
      const r = await apiClient.get('/subscriptions/my');
      const p = r.data?.data?.plan || 'BASIC';
      setCurrent(p);
      setSelected(p);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const subscribe = async () => {
    if (selected === current || selected === 'BASIC') return;
    setProcessing(true);
    try {
      // 1. Create a real Cashfree order for the subscription.
      const orderRes = await apiClient.post('/subscriptions/create-order', {
        plan: selected,
      });
      const order = orderRes.data?.data;
      if (!order?.orderId || !order?.paymentSessionId) {
        throw new Error(t('Failed to initialize payment'));
      }

      // 2. Launch the real Cashfree checkout (requires native SDK / development build).
      const { startCashfreePayment } = require('../../utils/cashfree');
      const paymentResult = await startCashfreePayment(order.paymentSessionId, order.orderId);

      if (paymentResult.status !== 'SUCCESS') {
        throw new Error(t('Payment cancelled'));
      }

      // 3. Verify the payment with backend — backend confirms order status with Cashfree.
      const verifyRes = await apiClient.post('/subscriptions/verify', {
        orderId: order.orderId,
        plan: selected,
      });

      if (verifyRes.data?.success) {
        setCurrent(selected);
        showToast({ message: `${t('Subscribed to')} ${selected}!`, type: 'success' });
      } else {
        showToast({ message: t('Subscription failed. Please try again.'), type: 'error' });
      }
    } catch (e: any) {
      if (e?.message?.includes('cancelled')) {
        showToast({ message: t('Payment cancelled'), type: 'info' });
      } else if (e?.response?.data?.error) {
        showToast({ message: e.response.data.error, type: 'error' });
      } else {
        showToast({ message: e?.message || t('Failed to subscribe. Please try again.'), type: 'error' });
      }
    } finally {
      setProcessing(false);
    }
  };

  const cancel = async () => {
    setProcessing(true);
    try {
      await apiClient.post('/subscriptions/cancel');
      setCurrent('BASIC');
      setSelected('BASIC');
      showToast({ message: t('Cancelled'), type: 'info' });
    } catch {
      showToast({ message: t('Failed'), type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: SUBSCRIPTION_COLORS.light }} edges={['top']}>
        <SkeletonSubscriptionPlansBody />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SUBSCRIPTION_COLORS.light }} edges={['top']}>
      {/* Header */}
      <View style={headerStyles.container}>
        <Pressable onPress={() => {
          try {
            require('expo-router').router.back();
          } catch {}
        }} style={headerStyles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SUBSCRIPTION_COLORS.dark} />
        </Pressable>
        <Text style={headerStyles.title}>{t('KaamWala Plus')}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchSubscription(true);
            }}
            tintColor={SUBSCRIPTION_COLORS.dark}
            colors={[SUBSCRIPTION_COLORS.primary]}
            progressBackgroundColor={SUBSCRIPTION_COLORS.light}
          />
        }>
        {/* Hero */}
        <View style={heroStyles.container}>
          <View style={heroStyles.ring}>
            <View style={heroStyles.innerRing}>
              <MaterialCommunityIcons name="crown" size={32} color={SUBSCRIPTION_COLORS.primary} />
            </View>
          </View>
          <Text style={heroStyles.title}>{t('Choose a plan')}</Text>
          <Text style={heroStyles.subtitle}>{t('Save on every booking')}</Text>
          {current !== 'BASIC' && (
            <View style={heroStyles.badge}>
              <Text style={heroStyles.badgeText}>{t('Currently on')} {current}</Text>
            </View>
          )}
        </View>

        {/* Plan Cards */}
        <View style={cardsStyles.container}>
          {plans.map((plan, i) => (
            <SubscriptionPlanCard
              key={plan.id}
              plan={plan}
              isActive={plan.id === current}
              isSelected={plan.id === selected}
              onPress={() => setSelected(plan.id)}
              index={i}
              variant="customer"
            />
          ))}
        </View>

        {/* Action buttons */}
        <View style={actionStyles.container}>
          {selected !== current && selected !== 'BASIC' && (
            <Pressable
              onPress={subscribe}
              disabled={processing}
              style={[actionStyles.primaryBtn, { opacity: processing ? 0.8 : 1 }]}>
              {processing ? (
                <ActivityIndicator size="small" color={SUBSCRIPTION_COLORS.white} />
              ) : (
                <Text style={actionStyles.primaryBtnText}>
                  {t('Subscribe')} — {selected === 'PLUS' ? t('₹199/mo') : t('₹499/mo')}
                </Text>
              )}
            </Pressable>
          )}
          {current !== 'BASIC' && (
            <Pressable onPress={cancel} disabled={processing} style={actionStyles.cancelBtn}>
              {processing ? (
                <ActivityIndicator size="small" color={SUBSCRIPTION_COLORS.gray} />
              ) : (
                <Text style={actionStyles.cancelBtnText}>
                  {t('Cancel')} {t('subscription')}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Bottom trust */}
        <View style={trustStyles.container}>
          {[
            { icon: 'shield-check-outline', label: t('Cancel anytime') },
            { icon: 'lock-outline', label: t('Secure') },
            { icon: 'thumb-up-outline', label: t('No questions') },
          ].map((item) => (
            <View key={item.label} style={trustStyles.item}>
              <MaterialCommunityIcons name={item.icon as any} size={22} color="#9E9E9E" />
              <Text style={trustStyles.label}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Extracted styles - memoized to prevent recreation on re-renders
const headerStyles = {
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: SUBSCRIPTION_COLORS.dark,
    marginLeft: 12,
  },
};

const heroStyles = {
  container: {
    alignItems: 'center' as const,
    paddingTop: 8,
    paddingBottom: 16,
  },
  ring: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  innerRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: SUBSCRIPTION_COLORS.white,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: SUBSCRIPTION_COLORS.dark,
    marginTop: 12,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: SUBSCRIPTION_COLORS.gray,
    textAlign: 'center' as const,
    marginTop: 4,
  },
  badge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: SUBSCRIPTION_COLORS.success,
  },
};

const cardsStyles = {
  container: {
    paddingHorizontal: 20,
    gap: 14,
  },
};

const actionStyles = {
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: SUBSCRIPTION_COLORS.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    elevation: 3,
    shadowColor: SUBSCRIPTION_COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  primaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: SUBSCRIPTION_COLORS.white,
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  cancelBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: SUBSCRIPTION_COLORS.gray,
  },
};

const trustStyles = {
  container: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 24,
    paddingVertical: 24,
  },
  item: {
    alignItems: 'center' as const,
    gap: 6,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#9E9E9E',
  },
};