import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Animated, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useT } from '../../utils/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

interface UrgentJob {
  requestId: string;
  issueReason?: string;
  category?: string;
  description?: string;
  currentOffer?: number;
  basePriceSnapshot?: number;
  commissionPercent?: number;
  pricingUnit?: 'PER_HOUR' | 'FLAT';
  imageUrl?: string;
  customerName?: string;
}

interface UrgentJobModalProps {
  visible: boolean;
  job: UrgentJob | null;
  onAccept: (requestId: string) => void;
  onDismiss: () => void;
}

const CATEGORY_META: Record<string, { icon: string; color: string; bg: string }> = {
  PLUMBER:        { icon: 'pipe-wrench',        color: '#1A73E8', bg: '#E8F0FE' },
  ELECTRICIAN:    { icon: 'lightning-bolt',     color: '#FF5C00', bg: '#FFF0E8' },
  CARPENTER:      { icon: 'saw-blade',          color: '#673AB7', bg: '#F3E5F5' },
  MAID:           { icon: 'broom',              color: '#137333', bg: '#E6F4EA' },
  PAINTER:        { icon: 'format-color-fill',  color: '#B06000', bg: '#FEF7E0' },
  AC_TECHNICIAN:  { icon: 'air-conditioner',    color: '#00897B', bg: '#E0F2F1' },
  PEST_CONTROL:   { icon: 'bug-outline',        color: '#6D4C41', bg: '#EFEBE9' },
  GARDENER:       { icon: 'tree-outline',       color: '#2E7D32', bg: '#E8F5E9' },
  DRIVER:         { icon: 'car',                color: '#1565C0', bg: '#E3F2FD' },
  COOK:           { icon: 'chef-hat',           color: '#E65100', bg: '#FBE9E7' },
  TUTOR:          { icon: 'book-open-variant',  color: '#4A148C', bg: '#F3E5F5' },
  SECURITY_GUARD: { icon: 'shield-account',     color: '#37474F', bg: '#ECEFF1' },
  NURSE:          { icon: 'medical-bag',        color: '#C62828', bg: '#FFEBEE' },
  BABYSITTER:     { icon: 'baby-face-outline',  color: '#EC407A', bg: '#FCE4EC' },
};

export function UrgentJobModal({ visible, job, onAccept, onDismiss }: UrgentJobModalProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const overlayOp = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayOp, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOp, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 100, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!job) return null;

  const categoryKey = job.category?.toUpperCase()?.trim() || '';
  const meta = CATEGORY_META[categoryKey] || CATEGORY_META.PLUMBER;
  const offeredPrice = job.currentOffer || 500;
  const priceSuffix = job.pricingUnit === 'FLAT' ? t('Flat') : t('/ hr');
  // commission applies to the frozen base only; urgency premium + boosts go to the worker.
  const commissionPct = job.commissionPercent ?? 15;
  const base = job.basePriceSnapshot || 0;
  const commission = Math.round((base * commissionPct) / 100);
  const expectedEarnings = Math.max(0, offeredPrice - commission);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss} statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: overlayOp }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />

        <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }], paddingBottom: Math.max(24, insets.bottom + 16) }]}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Dynamic Icon */}
          <View style={[styles.iconCircle, { backgroundColor: meta.bg }]}>
            <MaterialCommunityIcons name={meta.icon as any} size={36} color={meta.color} />
          </View>

          <Text style={styles.title}>
            {t('Urgent')} {t(job.category?.replace(/_/g, ' ') || 'Job')}!
          </Text>

          <Text style={styles.subtitle}>
            {t('Customer reported:')} <Text style={{ fontFamily: 'Inter_700Bold', color: '#0D0D0D' }}>{t(job.issueReason || 'Needs help')}</Text> {t('right now.')}
          </Text>

          {/* Problem image  — loads async, never blocks Accept */}
          {job.imageUrl ? (
            <Image
              source={{ uri: job.imageUrl }}
              style={styles.problemImage}
              contentFit="cover"
              transition={150}
            />
          ) : null}

          {job.description ? (
            <Text style={styles.problemDesc} numberOfLines={2}>{job.description}</Text>
          ) : null}

          {/* Urgency premium + boosts go 100% to worker  */}
          <View style={{ backgroundColor: '#E8F5E9', borderRadius: 12, padding: 12, marginBottom: 16, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="lightning-bolt" size={20} color="#2E7D32" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#2E7D32', textAlign: 'center' }}>
              {t('Urgency premium goes 100% to you')}
            </Text>
          </View>

          {/* Pricing Box */}
          <View style={styles.pricingBox}>
            <View style={styles.surgeRow}>
              <MaterialCommunityIcons name="tag" size={16} color="#FF5C00" style={{ marginRight: 6 }} />
              <Text style={styles.surgeText}>{t('Current Offer')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.priceAmount}>₹{offeredPrice}</Text>
              <Text style={styles.priceSuffix}> {priceSuffix}</Text>
            </View>
            <Text style={styles.priceLabel}>{t('Customer is offering this amount')}</Text>
            <View style={{ width: '100%', height: 1, backgroundColor: '#EFEFEF', marginVertical: 14 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
              <Text style={styles.earningsLabel}>{t('Your expected earnings')}</Text>
              <Text style={styles.earningsValue}>₹{expectedEarnings.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={styles.dismissBtnText}>{t('Dismiss')}</Text>
            </Pressable>

            <Pressable 
              style={[styles.acceptBtn, { backgroundColor: meta.color, shadowColor: meta.color }]} 
              onPress={() => onAccept(job.requestId)}
            >
              <Text style={styles.acceptBtnText}>{t('Accept Job')}</Text>
            </Pressable>
          </View>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 24,
    color: '#0D0D0D',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  problemImage: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: '#EDE8DC',
  },
  problemDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#5F6368',
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  pricingBox: {
    width: '100%',
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    padding: 20,
    borderRadius: 20,
    marginBottom: 32,
    alignItems: 'center',
  },
  surgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  surgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#2E7D32',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceAmount: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 42,
    color: '#0D0D0D',
    letterSpacing: -1,
  },
  priceSuffix: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: '#666',
  },
  priceLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  earningsLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#5F6368',
  },
  earningsValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 16,
    color: '#1A5C2A',
  },
  actionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  dismissBtn: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  dismissBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#666',
  },
  acceptBtn: {
    flex: 1.5,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      }
    }),
  },
  acceptBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: '#FFF',
  },
});
