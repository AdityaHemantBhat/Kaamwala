import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonPostRequestListBody } from '../../components/ui/SkeletonScreenLayouts';
import { apiClient } from '../../api/client';
import { t, useT } from '../../utils/i18n';

// ─── Inline Design Tokens ───────────────────────────────────────────────

const C = {
  cream: '#F5F0E8',
  creamDark: '#EDE8DC',
  ink: '#0D0D0D',
  inkFaint: '#6B6B6B',
  inkHair: '#C8C0B0',
  orange: '#FF5C00',
  orangeLight: '#FFF0E8',
  success: '#1A5C2A',
  warning: '#7A4F00',
  error: '#8B1A1A',
};

const FONT = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
};

// ─── Types ───────────────────────────────────────────────────────────

interface CategoryDef {
  key: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

type BudgetType = 'fixed' | 'negotiable' | 'hourly';

// ─── Category Definitions ─────────────────────────────────────────────────

const CATEGORIES: CategoryDef[] = [
  { key: 'PLUMBER', label: 'Plumber', icon: 'pipe-wrench' },
  { key: 'ELECTRICIAN', label: 'Electrician', icon: 'lightning-bolt-outline' },
  { key: 'CARPENTER', label: 'Carpenter', icon: 'saw-blade' },
  { key: 'MAID', label: 'Maid', icon: 'broom' },
  { key: 'DRIVER', label: 'Driver', icon: 'steering' },
  { key: 'PAINTER', label: 'Painter', icon: 'format-paint' },
  { key: 'AC_TECHNICIAN', label: 'AC Technician', icon: 'air-conditioner' },
  { key: 'PEST_CONTROL', label: 'Pest Control', icon: 'bug-outline' },
  { key: 'GARDENER', label: 'Gardener', icon: 'flower-outline' },
  { key: 'COOK', label: 'Cook', icon: 'pot-steam-outline' },
  { key: 'TUTOR', label: 'Tutor', icon: 'school-outline' },
  { key: 'SECURITY_GUARD', label: 'Security Guard', icon: 'shield-outline' },
  { key: 'NURSE', label: 'Nurse', icon: 'medical-bag' },
  { key: 'BABYSITTER', label: 'Babysitter', icon: 'baby-face-outline' },
];

const BUDGET_TYPES: { key: BudgetType; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'fixed', label: 'Fixed', icon: 'currency-inr' },
  { key: 'negotiable', label: 'Negotiable', icon: 'swap-horizontal-bold' },
  { key: 'hourly', label: 'Hourly', icon: 'clock-outline' },
];

// ─── Helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function getStatusVariant(status: string): 'success' | 'warning' | 'error' | 'primary' | 'ink' {
  const map: Record<string, 'success' | 'warning' | 'error' | 'primary' | 'ink'> = {
    OPEN: 'success',
    IN_PROGRESS: 'warning',
    COMPLETED: 'ink',
    CANCELLED: 'error',
  };
  return map[status] || 'primary';
}

function getStatusIcon(status: string): keyof typeof MaterialCommunityIcons.glyphMap {
  const map: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
    OPEN: 'check-circle-outline',
    IN_PROGRESS: 'progress-wrench',
    COMPLETED: 'check-decagram-outline',
    CANCELLED: 'close-circle-outline',
  };
  return map[status] || 'help-circle-outline';
}

function getCategoryIcon(key: string): keyof typeof MaterialCommunityIcons.glyphMap {
  return CATEGORIES.find((c) => c.key === key)?.icon || 'wrench';
}

function formatBudget(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}

// ─── Status badge helper ──────────────────────────────────────────────

function getStatusBadgeStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case 'OPEN':
      return { bg: '#E8F0E9', text: C.success };
    case 'ASSIGNED':
      return { bg: '#E8F0FF', text: '#1A3A5C' };
    case 'BOOKED':
      return { bg: '#E8F5E9', text: '#2E7D32' };
    case 'IN_PROGRESS':
      return { bg: '#FDF3E0', text: C.warning };
    case 'COMPLETED':
      return { bg: '#E8F0E9', text: C.ink };
    case 'CANCELLED':
      return { bg: '#FAEAEA', text: C.error };
    default:
      return { bg: '#E8F0E9', text: C.ink };
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'ASSIGNED':
      return t('ASSIGNED');
    case 'BOOKED':
      return t('BOOKED');
    case 'IN_PROGRESS':
      return t('IN PROGRESS');
    case 'COMPLETED':
      return t('COMPLETED');
    case 'CANCELLED':
      return t('CANCELLED');
    default:
      return t('OPEN');
  }
}

// Upload filenames must be unique per photo, but component render must stay
// pure — capture the timestamp once at module load and bump a monotonic
// counter instead of calling Date.now() in the upload handler.
let _uploadSeq = 0;
const UPLOAD_EPOCH = Date.now();

// ─── Segmented control (module scope so it isn't recreated on each render) ───

function SegmentedControl({ showForm, onToggle }: { showForm: boolean; onToggle: (v: boolean) => void }) {
  const t = useT();
  return (
    <View style={styles.segmentOuter}>
      <View style={styles.segmentBg}>
        <Pressable
          style={[styles.segmentBtn, showForm && styles.segmentBtnActive]}
          onPress={() => onToggle(true)}
        >
          <MaterialCommunityIcons
            name="plus-circle-outline"
            size={18}
            color={showForm ? '#FFFFFF' : C.ink}
          />
          <Text style={[styles.segmentLabel, showForm && styles.segmentLabelActive]}>
            {t('Create')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, !showForm && styles.segmentBtnActive]}
          onPress={() => onToggle(false)}
        >
          <MaterialCommunityIcons
            name="format-list-bulleted"
            size={18}
            color={!showForm ? '#FFFFFF' : C.ink}
          />
          <Text style={[styles.segmentLabel, !showForm && styles.segmentLabelActive]}>
            {t('My Requests')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export default function PostRequest() {
  const t = useT();
  const router = useRouter();
  const { showToast } = useToast();

  // Data state
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [issues, setIssues] = useState<any[]>([]);
  const [issueId, setIssueId] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [budgetType, setBudgetType] = useState<BudgetType>('negotiable');
  const [city, setCity] = useState('');
  const [images, setImages] = useState<any[]>([]); // { uri, remoteUrl? }
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedReqForInterest, setSelectedReqForInterest] = useState<any>(null);
  const [interests, setInterests] = useState<any[]>([]);
  const [loadingInterests, setLoadingInterests] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [creatingBooking, setCreatingBooking] = useState(false);

  // Phase C: service location + structured scope + price recommendation
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [scopeConfig, setScopeConfig] = useState<any>(null);
  const [scopeValues, setScopeValues] = useState<Record<string, any>>({});
  const [recommendation, setRecommendation] = useState<any>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [quoteCounter, setQuoteCounter] = useState<{ interestId: string; workerName: string } | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterSending, setCounterSending] = useState(false);

  // Fetch "What's Happening?" issues when category changes
  useEffect(() => {
    if (!category) { setIssues([]); setIssueId(null); return; }
    (async () => {
      try {
        const res = await apiClient.get(`/issues/${category}`);
        setIssues(res.data?.data || []);
        setIssueId(null);
      } catch { setIssues([]); }
    })();
  }, [category]);

  // Load saved addresses — service location is authoritative for pricing
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/addresses');
        const list = res.data?.data || [];
        setAddresses(list);
        const def = list.find((a: any) => a.isDefault) || list[0];
        if (def) setSelectedAddressId(def.id);
      } catch {}
    })();
  }, []);

  // Structured scope config for the selected issue.
  // The backend wraps the field-map as `{ label, scopeConfig }`; the field map
  // itself lives under `scopeConfig` (null when the issue has no structured
  // scope). Tolerate a payload that already IS the field map (legacy shape).
  useEffect(() => {
    if (!issueId) { setScopeConfig(null); setScopeValues({}); return; }
    (async () => {
      try {
        const res = await apiClient.get(`/issues/scope/${issueId}`);
        const payload = res.data?.data;
        let fieldMap: any = null;
        if (payload && typeof payload === 'object') {
          if (payload.scopeConfig && typeof payload.scopeConfig === 'object') {
            fieldMap = payload.scopeConfig;          // `{ label, scopeConfig }` wrapper
          } else if (typeof payload.label === 'undefined' && typeof payload.scopeConfig === 'undefined') {
            fieldMap = payload;                       // legacy: payload is the field map
          }
        }
        setScopeConfig(fieldMap);
        setScopeValues({});
      } catch { setScopeConfig(null); }
    })();
  }, [issueId]);

  // Price recommendation — debounced, recompute on key inputs
  useEffect(() => {
    let cancelled = false;
    if (!category) { setRecommendation(null); return; }
    const t = setTimeout(async () => {
      setRecommendationLoading(true);
      try {
        const body: any = { category, pricingUnit: budgetType === 'hourly' ? 'PER_HOUR' : 'FLAT' };
        if (issueId) body.issueId = issueId;
        if (Object.keys(scopeValues).length) body.scope = scopeValues;
        if (selectedAddressId) body.addressId = selectedAddressId;
        const res = await apiClient.post('/requests/recommendation', body);
        if (!cancelled) setRecommendation(res.data?.data || null);
      } catch { if (!cancelled) setRecommendation(null); }
      finally { if (!cancelled) setRecommendationLoading(false); }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [category, issueId, budgetType, selectedAddressId, scopeValues]);

  // ── Data Loading ──

  const loadRequests = useCallback(async () => {
    try {
      const res = await apiClient.get('/requests');
      setRequests(res.data?.data || []);
    } catch {
      // Silently handled — pull-to-refresh available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  }, [loadRequests]);

  // ── Interest Viewer ──

  const fetchInterests = async (requestId: string) => {
    setLoadingInterests(true);
    try {
      const res = await apiClient.get(`/requests/${requestId}/interests`);
      setInterests(res.data?.data || []);
    } catch {}
    finally { setLoadingInterests(false); }
  };

  const handleAccept = async (interestId: string) => {
    if (!selectedReqForInterest) return;
    setAcceptingId(interestId);
    try {
      await apiClient.post(`/requests/${selectedReqForInterest.id}/accept`, { interestId });
      showToast({ message: t('Worker accepted! They will be notified.'), type: 'success' });
      setShowInterestModal(false);
      setSelectedReqForInterest(null);
      loadRequests();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to accept'), type: 'error' });
    } finally { setAcceptingId(null); }
  };

  const handleCreateBooking = async (req: any) => {
    setCreatingBooking(true);
    try {
      await apiClient.post(`/requests/${req.id}/create-booking`);
      showToast({ message: t('Booking created! Check My Bookings.'), type: 'success' });
      loadRequests();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to create booking'), type: 'error' });
    } finally { setCreatingBooking(false); }
  };

  const validate = (): boolean => {
    if (!title.trim() || title.trim().length < 5) {
      showToast({ message: t('Title needs at least 5 characters'), type: 'error' });
      return false;
    }
    if (!description.trim() || description.trim().length < 10) {
      showToast({ message: t('Please describe your job in detail'), type: 'error' });
      return false;
    }
    if (!category) {
      showToast({ message: t('Please select a service category'), type: 'error' });
      return false;
    }
    if (budget && isNaN(Number(budget))) {
      showToast({ message: t('Budget must be a valid number'), type: 'error' });
      return false;
    }
    return true;
  };

  const useRecommended = () => {
    if (!recommendation?.reference) return;
    setBudget(String(recommendation.reference));
  };

  const renderScopeField = (key: string, cfg: any) => {
    // Defensive: a malformed scope entry (null / string / array) must never
    // crash the form — it is simply skipped.
    if (!cfg || typeof cfg !== 'object') return null;
    const value = scopeValues[key] ?? '';
    return (
      <View key={key} style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{cfg.label || key}</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={cfg.placeholder || t('Enter value')}
            placeholderTextColor={C.inkHair}
            value={String(value)}
            onChangeText={(txt) => setScopeValues(prev => ({ ...prev, [key]: txt }))}
            keyboardType={cfg.min != null || cfg.type === 'number' ? 'numeric' : 'default'}
          />
        </View>
      </View>
    );
  };

  const handleCounter = async () => {
    if (!quoteCounter || !counterAmount) return;
    setCounterSending(true);
    try {
      await apiClient.post(`/requests/${selectedReqForInterest?.id}/counter`, {
        interestId: quoteCounter.interestId,
        amount: Number(counterAmount),
      });
      showToast({ message: t('Counter offer sent to worker!'), type: 'success' });
      setQuoteCounter(null);
      setCounterAmount('');
      fetchInterests(selectedReqForInterest?.id);
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to send counter'), type: 'error' });
    } finally { setCounterSending(false); }
  };

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 6 - images.length,
      quality: 0.6,
    });
    if (!result.canceled) {
      setImages(prev => [...prev, ...result.assets.map(a => ({ uri: a.uri }))].slice(0, 6));
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Upload images securely (optional — continue even if upload fails)
      const imageUrls: string[] = [];
      if (images.length > 0) {
        setUploadingImages(true);
        for (const img of images) {
          try {
            const formData = new FormData();
            formData.append('file', { uri: img.uri, name: `job_${UPLOAD_EPOCH}_${_uploadSeq++}.jpg`, type: 'image/jpeg' } as any);
            formData.append('purpose', 'request');
            const upRes = await apiClient.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            const url = upRes.data?.data?.url;
            if (url) imageUrls.push(url);
          } catch { /* continue without this photo */ }
        }
        setUploadingImages(false);
      }

      const budgetNum = budget ? Number(budget) : undefined;
      // if the customer took the platform's recommended price, flag it
      const usingRecommended = !!recommendation && budgetNum != null &&
        Math.abs(budgetNum - recommendation.reference) <= Math.max(1, recommendation.reference * 0.02);

      await apiClient.post('/requests', {
        title: title.trim(),
        description: description.trim(),
        category,
        issueId,
        images: imageUrls,
        budget: budgetNum,
        budgetType,
        pricingUnit: budgetType === 'hourly' ? 'PER_HOUR' : 'FLAT',
        scope: Object.keys(scopeValues).length ? scopeValues : undefined,
        addressId: selectedAddressId || undefined,
        recommendationExposed: usingRecommended,
        // Record what the platform recommended so market observations from this
        // request can be flagged as recommendation-influenced (prevents data
        // poisoning of the pricing model).
        recommendedPrice: recommendation?.reference,
        city: city.trim() || undefined,
      });
      showToast({ message: t('Request posted! Workers in your area will see it.'), type: 'success' });
      resetForm();
      await loadRequests();
    } catch (e: any) {
      const msg = e?.response?.data?.error || t('Something went wrong. Please try again.');
      showToast({ message: msg, type: 'error' });
    } finally {
      setSubmitting(false);
      setUploadingImages(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await apiClient.delete(`/requests/${id}`);
      showToast({ message: t('Request has been removed'), type: 'info' });
      await loadRequests();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to delete request'), type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setIssues([]);
    setIssueId(null);
    setBudget('');
    setBudgetType('negotiable');
    setCity('');
    setImages([]);
    setScopeConfig(null);
    setScopeValues({});
    setRecommendation(null);
    setShowForm(false);
  };

  // ── Render: Category Chip ──

  const renderCategoryChip = (cat: CategoryDef) => {
    const active = category === cat.key;
    return (
      <Pressable
        key={cat.key}
        style={[styles.catChip, active && styles.catChipActive]}
        onPress={() => setCategory(cat.key)}
      >
        <MaterialCommunityIcons
          name={cat.icon}
          size={16}
          color={active ? C.orange : C.inkFaint}
        />
        <Text
          style={[styles.catChipLabel, active && styles.catChipLabelActive]}
          numberOfLines={1}
        >
          {t(cat.label)}
        </Text>
      </Pressable>
    );
  };

  // ── Render: Budget Type Toggle ──

  const renderBudgetType = (bt: typeof BUDGET_TYPES[number]) => {
    const active = budgetType === bt.key;
    return (
      <Pressable
        key={bt.key}
        style={[styles.budgetTypeBtn, active && styles.budgetTypeBtnActive]}
        onPress={() => setBudgetType(bt.key)}
      >
        <MaterialCommunityIcons
          name={bt.icon}
          size={14}
          color={active ? '#FFFFFF' : C.inkFaint}
        />
        <Text style={[styles.budgetTypeLabel, active && styles.budgetTypeLabelActive]}>
          {t(bt.label)}
        </Text>
      </Pressable>
    );
  };

  // ── Render: Request Card ──

  const renderRequestCard = (req: any, index: number) => {
    const isDeleting = deletingId === req.id;
    const statusIcon = getStatusIcon(req.status);
    const statusVariant = getStatusVariant(req.status);
    const catIcon = getCategoryIcon(req.category);
    const badgeStyle = getStatusBadgeStyle(req.status);

    const iconColor =
      statusVariant === 'success'
        ? C.success
        : statusVariant === 'warning'
        ? C.warning
        : statusVariant === 'error'
        ? C.error
        : C.ink;

    return (
      <Animated.View
        key={req.id}
        entering={FadeInDown.delay(index * 60).duration(300)}
      >
        <View style={styles.reqCard}>
          {/* Row 1: Status badge + Delete */}
          <View style={styles.reqCardRow1}>
            <View style={styles.reqStatus}>
              <MaterialCommunityIcons name={statusIcon} size={14} color={iconColor} />
              <View style={[styles.reqBadgePill, { backgroundColor: badgeStyle.bg }]}>
                <Text style={[styles.reqBadgePillText, { color: badgeStyle.text }]}>
                  {getStatusLabel(req.status)}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => handleDelete(req.id)}
              disabled={isDeleting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.reqDeleteBtn}
            >
              {isDeleting ? (
                <View style={{ width: 20, height: 20, justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color={C.error} />
                </View>
              ) : (
                <MaterialCommunityIcons name="close-circle-outline" size={22} color={C.inkHair} />
              )}
            </Pressable>
          </View>

          {/* Row 2: Title */}
          <Text style={styles.reqTitle} numberOfLines={2}>
            {req.title}
          </Text>

          {/* Row 3: Category + Budget */}
          <View style={styles.reqCardRow3}>
            <View style={styles.reqCategoryPill}>
              <MaterialCommunityIcons name={catIcon} size={12} color={C.inkFaint} />
              <Text style={styles.reqCategoryText}>
                {t(req.category.replace(/_/g, ' '))}
              </Text>
            </View>
            {req.budget != null && (
              <View style={styles.reqBudgetPill}>
                <MaterialCommunityIcons name="currency-inr" size={12} color={C.inkFaint} />
                <Text style={styles.reqBudgetAmount}>{formatBudget(req.budget)}</Text>
                <Text style={styles.reqBudgetType}>
                  /{t(req.budgetType || 'fixed')}
                </Text>
              </View>
            )}
          </View>

          {/* Row 4: Date */}
          {req.createdAt && (
            <View style={styles.reqDateRow}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={12} color={C.inkHair} />
              <Text style={styles.reqDateText}>{formatDate(req.createdAt)}</Text>
            </View>
          )}

          {/* ── Assigned Worker Info ── */}
          {req.status === 'ASSIGNED' && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(13,13,13,0.06)', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F0FF', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="account-hard-hat" size={20} color="#1A3A5C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B' }}>{t('Assigned Worker')}</Text>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{req.workerName || t('Worker')}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => handleCreateBooking(req)}
                disabled={creatingBooking}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  paddingVertical: 12, backgroundColor: '#1A3A5C', borderRadius: 12, gap: 8,
                }, pressed && { opacity: 0.8 }]}
              >
                {creatingBooking ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="calendar-check" size={18} color="#FFF" />
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFF' }}>{t('Create Booking')}</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* ── Interested Workers ── */}
          {req.status === 'OPEN' && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(13,13,13,0.06)', gap: 8 }}>
              <Pressable
                onPress={() => {
                  setSelectedReqForInterest(req);
                  fetchInterests(req.id);
                  setShowInterestModal(true);
                }}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  paddingVertical: 10, backgroundColor: '#FFF', borderRadius: 12,
                  borderWidth: 1.5, borderColor: '#FF5C00', gap: 6,
                }, pressed && { opacity: 0.7 }]}
              >
                <MaterialCommunityIcons name="account-hard-hat" size={18} color="#FF5C00" />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FF5C00' }}>
                  {t('View Interested Workers')}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#FF5C00" />
              </Pressable>
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  // ── Render: Form ──

  const renderForm = () => (
    <Animated.View entering={FadeInDown.delay(150).duration(300)}>
      {/* Header */}
      <View style={styles.formBanner}>
        <MaterialCommunityIcons name="clipboard-text-outline" size={24} color={C.orange} />
        <Text style={styles.formBannerTitle}>{t('What do you need done?')}</Text>
        <Text style={styles.formBannerSub}>{t('Workers in your area will see your request')}</Text>
      </View>

      {/* Category */}
      <View style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{t('Category')}</Text>
        <View style={styles.catGrid}>{CATEGORIES.map(renderCategoryChip)}</View>
      </View>

      {/* What's Happening? */}
      {category && issues.length > 0 && (
        <View style={styles.formBlock}>
          <Text style={styles.fieldLabel}>{t('What\'s happening?')}</Text>
          <View style={styles.issueGrid}>
            {issues.map((iss) => {
              const active = issueId === iss.id;
              return (
                <Pressable
                  key={iss.canonicalId || iss.label}
                  style={[styles.issueChip, active && styles.issueChipActive]}
                  onPress={() => setIssueId(iss.id)}
                >
                  <Text style={[styles.issueChipLabel, active && styles.issueChipLabelActive]} numberOfLines={1}>
                    {iss.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Structured scope  — only useful fields, progressive disclosure */}
      {scopeConfig && Object.keys(scopeConfig).length > 0 && (
        <View style={styles.formBlock}>
          <Text style={styles.fieldLabel}>{scopeConfig.title ? t(scopeConfig.title) : t('Job details')}</Text>
          {Object.entries(scopeConfig).filter(([k]) => k !== 'title').map(([key, cfg]: [string, any]) => renderScopeField(key, cfg))}
        </View>
      )}

      {/* Title */}
      <View style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{t('Job title')}</Text>
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons name="text-short" size={20} color={C.inkFaint} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={t('e.g. Need plumbing repair in kitchen')}
            placeholderTextColor={C.inkHair}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
        </View>
      </View>

      {/* Description */}
      <View style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{t('Description')}</Text>
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons name="text-box-outline" size={20} color={C.inkFaint} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            placeholder={t('Describe what you need — what, when, where...')}
            placeholderTextColor={C.inkHair}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
          />
        </View>
        <Text style={styles.charCounter}>{description.length}/2000</Text>
      </View>

      {/* Photos (optional — ) */}
      <View style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{t('Photos (Optional)')}</Text>
        <View style={styles.photoRow}>
          {images.map((img, idx) => (
            <View key={idx} style={styles.photoWrap}>
              <Image source={{ uri: img.uri }} style={styles.photoThumb} contentFit="cover" />
              <Pressable style={styles.photoRemove} onPress={() => removeImage(idx)} hitSlop={6}>
                <MaterialCommunityIcons name="close" size={14} color="#FFF" />
              </Pressable>
            </View>
          ))}
          {images.length < 6 && (
            <Pressable style={styles.photoAdd} onPress={pickImages}>
              <MaterialCommunityIcons name="camera-plus-outline" size={22} color={C.inkFaint} />
              <Text style={styles.photoAddText}>{uploadingImages ? t('Uploading...') : t('Add')}</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.photoHint}>{t('Show the problem area — optional, workers can see before accepting')}</Text>
      </View>

      {/* Budget */}
      <View style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{t('Budget')}</Text>
        <View style={styles.budgetRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={styles.inputContainer}>
              <MaterialCommunityIcons name="currency-inr" size={20} color={C.inkFaint} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('Amount')}
                placeholderTextColor={C.inkHair}
                value={budget}
                onChangeText={setBudget}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.budgetTypes}>
            {BUDGET_TYPES.map(bt => {
              const active = budgetType === bt.key;
              return (
                <Pressable
                  key={bt.key}
                  style={[styles.budgetChip, active && styles.budgetChipActive]}
                  onPress={() => setBudgetType(bt.key)}
                >
                  <Text style={[styles.budgetChipText, active && { color: '#FFFFFF' }]}>
                    {t(bt.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Typical local price range  */}
      {recommendation && recommendation.reference > 0 && (
        <View style={styles.recoBox}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recoLabel}>{t('TYPICAL LOCAL PRICE')}</Text>
            <Text style={styles.recoRange}>
              ₹{recommendation.rangeLow.toLocaleString('en-IN')} – ₹{recommendation.rangeHigh.toLocaleString('en-IN')}
             </Text>
          </View>
          <Pressable style={styles.recoUseBtn} onPress={useRecommended}>
            <Text style={styles.recoUseBtnText}>{t('Use')} ₹{recommendation.reference}</Text>
          </Pressable>
        </View>
      )}

      {/* Service location — authoritative for pricing  */}
      <View style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{t('Service location')}</Text>
        {addresses.length === 0 ? (
          <Pressable onPress={() => router.push('/(customer)/addresses')} style={styles.addrAddBtn}>
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={C.orange} />
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.orange }}>{t('Add an address first')}</Text>
          </Pressable>
        ) : (
          <View style={{ gap: 8 }}>
            {addresses.map((addr: any) => {
              const active = selectedAddressId === addr.id;
              return (
                <Pressable
                  key={addr.id}
                  onPress={() => setSelectedAddressId(addr.id)}
                  style={[styles.addrCard, active && styles.addrCardActive]}
                >
                  <MaterialCommunityIcons
                    name={active ? 'radiobox-marked' : 'radiobox-blank'}
                    size={18}
                    color={active ? C.orange : C.inkHair}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: C.ink }} numberOfLines={1}>
                      {addr.label} — {addr.line1}
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: C.inkFaint }} numberOfLines={1}>
                      {addr.city}, {addr.state} {addr.pincode}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* City fallback metadata  */}
      <View style={styles.formBlock}>
        <Text style={styles.fieldLabel}>{t('City (optional)')}</Text>
        <View style={styles.inputContainer}>
          <MaterialCommunityIcons name="map-marker-outline" size={20} color={C.inkFaint} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={t('e.g. Delhi')}
            placeholderTextColor={C.inkHair}
            value={city}
            onChangeText={setCity}
          />
        </View>
      </View>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Pressable
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
          )}
          <Text style={styles.submitBtnText}>
            {submitting ? t('POSTING...') : t('Post Request')}
          </Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={resetForm} disabled={submitting}>
          <Text style={styles.cancelBtnText}>{t('Cancel')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  // ── Render: Request List Section ──

  const renderRequestsSection = () => (
    <Animated.View entering={FadeInDown.delay(200).duration(300)}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <MaterialCommunityIcons name="format-list-bulleted" size={20} color={C.ink} />
          <Text style={styles.sectionTitle}>{t('YOUR REQUESTS')}</Text>
        </View>
        {!loading && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{requests.length}</Text>
          </View>
        )}
      </View>

      {/* Loading */}
      {loading ? (
        <SkeletonPostRequestListBody />
      ) : requests.length === 0 ? (
 /* Empty state */
        <View style={styles.emptyBox}>
          <View style={styles.emptyHeroRing}>
            <View style={styles.emptyHeroRingInner}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={28} color={C.inkHair} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>{t('No requests yet')}</Text>
          <Text style={styles.emptyHint}>
            {t('Tap "Create" above to post your first request. Nearby workers will respond.')}
          </Text>
        </View>
      ) : (
 /* List */
        <View style={styles.reqList}>
          {requests.map((req, i) => renderRequestCard(req, i))}
        </View>
      )}
    </Animated.View>
  );

  // ── Main Render ──

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Post a Request')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bottomOffset={24}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.ink}
              colors={[C.ink]}
              progressBackgroundColor={C.cream}
            />
          }
        >
          {/* ── Hero ── */}
          <Animated.View entering={FadeInDown.duration(300)} style={styles.hero}>
            <View style={styles.heroRing}>
              <View style={styles.heroRingInner}>
                <MaterialCommunityIcons
                  name="file-document-edit-outline"
                  size={32}
                  color={C.orange}
                />
              </View>
            </View>
            <Text style={styles.heroTitle}>
              {t('Post a')}{'\n'}{t('Request')}
            </Text>
            <Text style={styles.heroDesc}>
              {t('Tell us what service you need and skilled workers in your area will reach out to you directly.')}
            </Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>14</Text>
                <Text style={styles.heroStatLabel}>{t('Categories')}</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>100+</Text>
                <Text style={styles.heroStatLabel}>{t('Workers')}</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{t('Free')}</Text>
                <Text style={styles.heroStatLabel}>{t('To Post')}</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Segmented Toggle ── */}
          <Animated.View entering={FadeInDown.delay(80).duration(300)}>
            <SegmentedControl showForm={showForm} onToggle={setShowForm} />
          </Animated.View>

          {/* ── Form ── */}
          {showForm && renderForm()}

          {/* ── Existing Requests ── */}
          {!showForm && renderRequestsSection()}

          {/* Bottom padding */}
          <View style={{ height: 60 }} />
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>

      {/* ── Interest Modal ── */}
      <Modal visible={showInterestModal} transparent animationType="slide" onRequestClose={() => setShowInterestModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowInterestModal(false)} />
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '70%' }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#C8C0B0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 16 }}>
              {t('Interested Workers')}
            </Text>
            {loadingInterests ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#FF5C00" />
              </View>
            ) : interests.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <MaterialCommunityIcons name="account-search-outline" size={48} color="#C8C0B0" />
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#6B6B6B', marginTop: 12 }}>
                  {t('No workers have shown interest yet')}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {interests.map((interest: any) => (
                  <View key={interest.id} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(13,13,13,0.06)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F0E8', justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="account-hard-hat" size={22} color="#FF5C00" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>
                          {interest.workerName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <MaterialCommunityIcons name="star" size={12} color="#FF5C00" />
                          <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 11, color: '#FF5C00' }}>
                            {interest.workerRating?.toFixed(1) || t('N/A')}
                          </Text>
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginLeft: 4 }}>
                            {t(interest.workerCategory?.replace(/_/g, ' ') || '')}
                          </Text>
                        </View>
                        {interest.quoteAmount != null && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <MaterialCommunityIcons name="currency-inr" size={12} color="#1A5C2A" />
                            <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 13, color: '#1A5C2A' }}>
                              {Number(interest.quoteAmount).toLocaleString('en-IN')}
                            </Text>
                            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#6B6B6B' }}>
                              /{interest.quoteUnit === 'PER_HOUR' ? t('hr') : t('job')}
                            </Text>
                            {interest.quoteMessage ? (
                              <Text numberOfLines={1} style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#6B6B6B', flexShrink: 1 }}>
                                — {interest.quoteMessage}
                              </Text>
                            ) : null}
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Pressable
                        onPress={() => setQuoteCounter({ interestId: interest.id, workerName: interest.workerName })}
                        style={({ pressed }) => [{
                          flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: '#FF5C00',
                          alignItems: 'center',
                        }, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FF5C00' }}>{t('Counter')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleAccept(interest.id)}
                        disabled={acceptingId === interest.id}
                        style={({ pressed }) => [{
                          flex: 1, paddingVertical: 9, backgroundColor: '#1A5C2A', borderRadius: 12, alignItems: 'center',
                        }, pressed && { opacity: 0.8 }]}
                      >
                        {acceptingId === interest.id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FFFFFF' }}>{t('Accept')}</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable
              onPress={() => setShowInterestModal(false)}
              style={({ pressed }) => [{
                marginTop: 16, paddingVertical: 14, alignItems: 'center', borderRadius: 16,
                borderWidth: 1.5, borderColor: 'rgba(13,13,13,0.08)',
              }, pressed && { opacity: 0.7 }]}
            >
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('Close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Counter Offer Modal ── */}
      <Modal visible={!!quoteCounter} transparent animationType="fade" onRequestClose={() => setQuoteCounter(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          {/* KeyboardAvoidingView lifts the card above the keyboard so the amount
              field + Send stay visible while typing (edge-to-edge safe). */}
          <KeyboardAvoidingView behavior="padding" automaticOffset>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' }}>
              {t('Counter offer to')} {quoteCounter?.workerName}
            </Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginTop: 4 }}>
              {t('Suggest a price you\'re comfortable with')}
            </Text>
            <View style={[styles.inputContainer, { marginTop: 16 }]}>
              <MaterialCommunityIcons name="currency-inr" size={20} color={C.inkFaint} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('Amount')}
                placeholderTextColor={C.inkHair}
                value={counterAmount}
                onChangeText={setCounterAmount}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={() => setQuoteCounter(null)}
                style={[styles.cancelBtn, { flex: 1 }]}
              >
                <Text style={styles.cancelBtnText}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleCounter}
                disabled={counterSending || !counterAmount}
                style={[styles.submitBtn, { flex: 1, opacity: counterSending || !counterAmount ? 0.6 : 1 }]}
              >
                {counterSending ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.submitBtnText}>{t('Send')}</Text>}
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Layout ──
  safe: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F0E8',
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(13,13,13,0.04)',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: '#0D0D0D',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // ── Hero ──
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  heroRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroRingInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontFamily: 'Poppins_800ExtraBold',
    fontSize: FONT['3xl'],
    color: '#0D0D0D',
    textAlign: 'center',
    lineHeight: 42,
  },
  heroDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.base,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    width: '100%',
  },
  heroStat: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  heroStatValue: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: FONT.lg,
    color: '#0D0D0D',
  },
  heroStatLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 9,
    color: '#6B6B6B',
    marginTop: 2,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Segmented Toggle ──
  segmentOuter: {
    marginBottom: 20,
  },
  segmentBg: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
    borderRadius: 20,
  },
  segmentBtnActive: {
    backgroundColor: '#FF5C00',
  },
  segmentLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: FONT.sm,
    color: '#0D0D0D',
  },
  segmentLabelActive: {
    color: '#FFFFFF',
  },

  // ── Form ──
  formBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    gap: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  formBannerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: FONT.lg,
    color: '#0D0D0D',
  },
  formBannerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.sm,
    color: '#6B6B6B',
  },

  formBlock: { marginBottom: 16 },
  fieldLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 11,
    color: '#6B6B6B',
    marginBottom: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // ── Input Fields ──
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    padding: 14,
    gap: 10,
  },
  inputIcon: {
    marginTop: 2,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.base,
    color: '#0D0D0D',
    padding: 0,
  },

  // ── Category Grid ──
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  catChipActive: {
    borderColor: '#FF5C00',
    backgroundColor: '#FFF8F0',
  },
  catChipLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.xs,
    color: '#6B6B6B',
  },
  catChipLabelActive: {
    color: '#FF5C00',
    fontFamily: 'Inter_500Medium',
  },

  issueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  issueChip: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
  },
  issueChipActive: {
    borderColor: '#FF5C00',
    backgroundColor: '#FFF8F0',
  },
  issueChipLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.xs,
    color: '#6B6B6B',
  },
  issueChipLabelActive: {
    color: '#FF5C00',
    fontFamily: 'Inter_500Medium',
  },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap: { position: 'relative' },
  photoThumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#EDE8DC' },
  photoRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center',
  },
  photoAdd: {
    width: 72, height: 72, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.inkHair,
    backgroundColor: '#FFF8F0',
    justifyContent: 'center', alignItems: 'center', gap: 2,
  },
  photoAddText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.inkFaint },
  photoHint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.inkFaint, marginTop: 6 },

  charCounter: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: 10,
    color: '#6B6B6B',
    textAlign: 'right',
    marginTop: 4,
  },

  // ── Budget ──
  budgetRow: { flexDirection: 'row', alignItems: 'flex-start' },
  budgetTypes: { flexDirection: 'row', gap: 6, paddingTop: 0, height: 48, alignItems: 'center' },
  budgetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
  },
  budgetChipActive: {
    backgroundColor: '#FF5C00',
    borderColor: '#FF5C00',
  },
  budgetChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: FONT.xs,
    color: '#6B6B6B',
  },

  budgetTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  budgetTypeBtnActive: {
    borderColor: '#FF5C00',
    backgroundColor: '#FF5C00',
  },
  budgetTypeLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: '#6B6B6B',
  },
  budgetTypeLabelActive: {
    color: '#FFFFFF',
  },

  // ── Recommendation / Address ──
  recoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF0E8',
    borderWidth: 1.5,
    borderColor: '#FFD7C2',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  recoLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#FF5C00',
  },
  recoRange: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: FONT.md,
    color: '#0D0D0D',
    marginTop: 2,
  },
  recoHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: '#6B6B6B',
    marginTop: 2,
  },
  recoUseBtn: {
    backgroundColor: '#FF5C00',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  recoUseBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  addrAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FF5C00',
    padding: 14,
    justifyContent: 'center',
  },
  addrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    padding: 12,
  },
  addrCardActive: {
    borderColor: '#FF5C00',
    backgroundColor: '#FFF8F0',
  },

  // ── Submit / Cancel Buttons ──
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    backgroundColor: '#FF5C00',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  submitBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: FONT.sm,
    color: '#FFFFFF',
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  cancelBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: FONT.sm,
    color: '#6B6B6B',
  },

  // ── Section: Your Requests ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: FONT.lg,
    color: '#0D0D0D',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF0E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeText: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: FONT.sm,
    color: '#FF5C00',
  },

  // ── Loading ──
  loadingBox: {
    paddingVertical: 40,
    gap: 12,
    alignItems: 'center',
  },
  loadingHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.sm,
    color: '#6B6B6B',
  },

  // ── Empty State ──
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyHeroRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,92,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyHeroRingInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: FONT.md,
    color: '#0D0D0D',
  },
  emptyHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.sm,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Request List ──
  reqList: {
    gap: 12,
  },

  // ── Request Card ──
  reqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    padding: 16,
  },
  reqCardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reqStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reqBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reqBadgePillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  reqDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reqTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: FONT.md,
    color: '#0D0D0D',
    lineHeight: 22,
    marginBottom: 10,
  },
  reqCardRow3: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  reqCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F9F9F9',
  },
  reqCategoryText: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.xs,
    color: '#6B6B6B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  reqBudgetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  reqBudgetAmount: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: FONT.sm,
    color: '#0D0D0D',
  },
  reqBudgetType: {
    fontFamily: 'SpaceMono_400Regular',
    fontSize: FONT.xs,
    color: '#6B6B6B',
  },
  reqDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reqDateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: FONT.xs,
    color: '#C8C0B0',
  },
});