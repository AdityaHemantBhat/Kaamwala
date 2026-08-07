import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions, Platform, TextInput, Modal } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '../../api/client';
import { socketService } from '../../api/socket';
import { useToast } from '../../components/ui/ToastProvider';
import { useT } from '../../utils/i18n';

const { width } = Dimensions.get('window');

const CATEGORIES = [
  { id: 'PLUMBER',         icon: 'pipe-wrench',          name: 'Plumber',         color: '#1A73E8', bg: '#E8F0FE', reasons: ['Pipe burst/leaking', 'Clogged drain', 'Tap installation/repair', 'Other'] },
  { id: 'ELECTRICIAN',     icon: 'lightning-bolt',       name: 'Electrician',     color: '#FF5C00', bg: '#FFF0E8', reasons: ['Power outage in room', 'Short circuit', 'AC not turning on', 'Other'] },
  { id: 'CARPENTER',       icon: 'saw-blade',            name: 'Carpenter',       color: '#673AB7', bg: '#F3E5F5', reasons: ['Door lock broken', 'Furniture repair', 'Other'] },
  { id: 'MAID',            icon: 'broom',                name: 'Maid',            color: '#137333', bg: '#E6F4EA', reasons: ['Urgent cleaning needed', 'After party cleanup', 'Other'] },
  { id: 'DRIVER',          icon: 'car',                  name: 'Driver',          color: '#1565C0', bg: '#E3F2FD', reasons: ['Urgent travel', 'Driver didn\'t show up', 'Other'] },
  { id: 'PAINTER',         icon: 'format-color-fill',    name: 'Painter',         color: '#B06000', bg: '#FEF7E0', reasons: ['Touch up needed', 'Other'] },
  { id: 'AC_TECHNICIAN',   icon: 'air-conditioner',      name: 'AC Technician',   color: '#00897B', bg: '#E0F2F1', reasons: ['AC not cooling', 'Water leaking from AC', 'Other'] },
  { id: 'PEST_CONTROL',    icon: 'bug-outline',          name: 'Pest Control',    color: '#6D4C41', bg: '#EFEBE9', reasons: ['Beehive removal', 'Urgent pest issue', 'Other'] },
  { id: 'GARDENER',        icon: 'tree-outline',         name: 'Gardener',        color: '#2E7D32', bg: '#E8F5E9', reasons: ['Other'] },
  { id: 'COOK',            icon: 'chef-hat',             name: 'Cook',            color: '#E65100', bg: '#FBE9E7', reasons: ['Urgent cook needed', 'Other'] },
  { id: 'TUTOR',           icon: 'book-open-variant',    name: 'Tutor',           color: '#4A148C', bg: '#F3E5F5', reasons: ['Other'] },
  { id: 'SECURITY_GUARD',  icon: 'shield-account',       name: 'Security Guard',  color: '#37474F', bg: '#ECEFF1', reasons: ['Other'] },
  { id: 'NURSE',           icon: 'medical-bag',          name: 'Nurse',           color: '#C62828', bg: '#FFEBEE', reasons: ['Urgent care needed', 'Other'] },
  { id: 'BABYSITTER',      icon: 'baby-face-outline',    name: 'Babysitter',      color: '#EC407A', bg: '#FCE4EC', reasons: ['Emergency care needed', 'Other'] },
];

export default function UrgentBookingScreen() {
  const t = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [issueReason, setIssueReason] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [issues, setIssues] = useState<any[]>([]); // What's Happening? options from backend
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [pricingModel] = useState<'PER_HOUR' | 'FLAT'>('FLAT');
  const [urgentImage, setUrgentImage] = useState<any>(null); // { uri, remoteUrl? }
  const [uploadingImg, setUploadingImg] = useState(false);

  // Preview & Searching states
  const [previewData, setPreviewData] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  
  // Timer & Increase Offer logic
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [showIncreaseModal, setShowIncreaseModal] = useState(false);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Client-side preview cache keyed by category+issueId so "Calculate Offer"
  // responds instantly — the customer never waits on a network round-trip.
  const previewCacheRef = useRef<{ key: string; data: any } | null>(null);

  useEffect(() => {
    socketService.connect();
    const handleAccepted = (data: any) => {
      setIsSearching(false);
      setPreviewData(null);
      setActiveRequestId(null);
      setSelectedCategory('');
      setIssueReason('');
      setDescription('');
      setSelectedIssueId(null);
      setUrgentImage(null);
      showToast({ message: t('Worker found!'), type: 'success' });
      router.replace(`/(customer)/live-tracking?bookingId=${data.bookingId}`);
    };
    
    const handleOfferIncreased = (data: any) => {
      if (data.requestId === activeRequestId) {
        setPreviewData((prev: any) => ({ ...prev, initialOffer: data.newOffer }));
        setTimeLeft(300); // reset timer
      }
    };

    socketService.on('urgent_accepted', handleAccepted);
    socketService.on('urgent_offer_increased', handleOfferIncreased);
    
    return () => { 
      socketService.off('urgent_accepted', handleAccepted); 
      socketService.off('urgent_offer_increased', handleOfferIncreased); 
    };
  }, [activeRequestId, router, showToast, t]);

  // Countdown timer — only depends on isSearching/timeLeft
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isSearching && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowIncreaseModal(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isSearching, timeLeft]);

  // Continuous pulse animation — only depends on isSearching
  useEffect(() => {
    if (isSearching) {
      const loop = Animated.loop(
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 1200, useNativeDriver: true })
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSearching, pulseAnim]);

  const issuesCacheRef = useRef<Record<string, any[]>>({});

  // Fetch "What's Happening?" issues when category changes (from backend taxonomy)
  useEffect(() => {
    if (!selectedCategory) { setIssues([]); setSelectedIssueId(null); setIssueReason(''); return; }
    if (issuesCacheRef.current[selectedCategory]) {
      setIssues(issuesCacheRef.current[selectedCategory]);
      return;
    }
    (async () => {
      try {
        const res = await apiClient.get(`/issues/${selectedCategory}`);
        const data = res.data?.data || [];
        issuesCacheRef.current[selectedCategory] = data;
        setIssues(data);
        setSelectedIssueId(null);
        setIssueReason('');
      } catch { setIssues([]); }
    })();
  }, [selectedCategory]);

  // Prefetch the offer preview as soon as a category + reason are chosen, so the
  // customer's "Calculate Offer" tap resolves from cache instead of the network.
  useEffect(() => {
    if (!selectedCategory || !selectedIssueId) return;
    const key = `${selectedCategory}:${selectedIssueId || ''}`;
    if (previewCacheRef.current?.key === key) return;
    (async () => {
      try {
        const res = await apiClient.post('/urgent/preview', {
          category: selectedCategory,
          pricingUnit: pricingModel,
          issueId: selectedIssueId,
        });
        previewCacheRef.current = { key, data: res.data.data };
      } catch { /* tap-time fetch will retry */ }
    })();
  }, [selectedCategory, selectedIssueId, pricingModel]);

  const handlePreview = async () => {
    if (!selectedCategory || !issueReason) {
      showToast({ message: t('Please select a category and reason'), type: 'error' });
      return;
    }
    const key = `${selectedCategory}:${selectedIssueId || ''}`;
    const cached = previewCacheRef.current;
    if (cached?.key === key && cached.data) {
      setPreviewData(cached.data);
      return;
    }
    try {
      const res = await apiClient.post('/urgent/preview', {
        category: selectedCategory,
        pricingUnit: pricingModel,
        issueId: selectedIssueId,
      });
      previewCacheRef.current = { key, data: res.data.data };
      setPreviewData(res.data.data);
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to generate preview'), type: 'error' });
    }
  };

  const pickUrgentImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.6,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setUrgentImage({ uri });
    setUploadingImg(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, name: `urgent_${Date.now()}.jpg`, type: 'image/jpeg' } as any);
      formData.append('purpose', 'urgent');
      const upRes = await apiClient.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (upRes.data?.data?.url) {
        setUrgentImage({ uri, remoteUrl: upRes.data.data.url });
      }
    } catch { /* ignored */ }
    setUploadingImg(false);
  };

  const handleStartSearch = async () => {
    if (!previewData) return;
    try {
      setIsSearching(true);
      setTimeLeft(300);

      const res = await apiClient.post('/urgent/request', {
        category: selectedCategory,
        issueReason,
        issueId: selectedIssueId,
        description,
        imageUrl: urgentImage?.remoteUrl,
        basePriceSnapshot: previewData.basePrice,
        initialOffer: previewData.initialOffer,
        pricingUnit: pricingModel,
      });
      setActiveRequestId(res.data.data.requestId);
    } catch (e: any) {
      setIsSearching(false);
      showToast({ message: e?.response?.data?.error || t('Failed to request'), type: 'error' });
    }
  };

  const handleCancelSearch = async () => {
    setIsSearching(false);
    if (activeRequestId) {
      try {
        await apiClient.post('/urgent/cancel', { requestId: activeRequestId });
      } catch {}
      setActiveRequestId(null);
      setPreviewData(null);
    }
  };

  const handleIncreaseOffer = async (amount: number) => {
    try {
      await apiClient.post('/urgent/increase-offer', { requestId: activeRequestId, increaseAmount: amount });
      setShowIncreaseModal(false);
      showToast({ message: t('Offer increased successfully!'), type: 'success' });
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to increase offer'), type: 'error' });
    }
  };

  const selCat = CATEGORIES.find(c => c.id === selectedCategory);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (isSearching) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.searchingContainer}>
          {/* Radar animation */}
          <View style={styles.radarArea}>
            {/* Expanding rings */}
            <Animated.View style={[styles.radarRingOuter, { transform: [{ scale: pulseAnim }], opacity: pulseAnim.interpolate({ inputRange: [1, 1.3], outputRange: [0.35, 0] }) }]} />
            <Animated.View style={[styles.radarRingMid, { transform: [{ scale: pulseAnim }], opacity: pulseAnim.interpolate({ inputRange: [1, 1.3], outputRange: [0.25, 0] }) }]} />
            {/* Static inner ring */}
            <View style={styles.radarRingStatic} />
            {/* Center icon */}
            <View style={styles.radarCenter}>
              {selCat && (
                <View style={[styles.radarIconCircle, { backgroundColor: selCat.bg }]}>
                  <MaterialCommunityIcons name={selCat.icon as any} size={30} color={selCat.color} />
                </View>
              )}
            </View>
          </View>

          {/* Status header */}
          <View style={styles.statusHeader}>
            <Text style={styles.searchingTitle}>{t('Finding nearby workers')}</Text>
            <View style={styles.statusRow}>
              <View style={styles.liveDot} />
              <Text style={styles.statusLive}>{t('Searching in your area')}</Text>
            </View>
          </View>

          {/* Offer card */}
          {previewData && (
            <View style={styles.offerCard}>
              <View style={styles.offerCardLeft}>
                <Text style={styles.offerLabel}>{t('Your Offer')}</Text>
                <Text style={styles.offerValue}>₹{previewData.initialOffer}</Text>
              </View>
              <View style={styles.offerCardRight}>
                <Text style={styles.timerValue}>{formatTime(timeLeft)}</Text>
                <Text style={styles.timerLabel}>{t('remaining')}</Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <Pressable style={styles.increaseBtn} onPress={() => setShowIncreaseModal(true)}>
            <MaterialCommunityIcons name="trending-up" size={18} color="#FFF" />
            <Text style={styles.increaseBtnText}>{t('Increase Offer')}</Text>
          </Pressable>

          <Pressable style={styles.cancelSearchBtn} onPress={handleCancelSearch}>
            <Text style={styles.cancelSearchText}>{t('Cancel Request')}</Text>
          </Pressable>
        </View>

        <Modal visible={showIncreaseModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('Still looking for a worker?')}</Text>
              <Text style={styles.modalSub}>{t('Increase your offer to attract workers faster. 100% of the increase goes to the worker.')}</Text>
              
              <View style={styles.increaseOptions}>
                {[20, 40, 50, 100].map(amt => (
                  <Pressable key={amt} style={styles.increaseOptionBtn} onPress={() => handleIncreaseOffer(amt)}>
                    <Text style={styles.increaseOptionText}>+₹{amt}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.keepSearchingBtn} onPress={() => { setShowIncreaseModal(false); setTimeLeft(300); }}>
                <Text style={styles.keepSearchingText}>{t('Keep Searching at Current Offer')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (previewData) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setPreviewData(null)}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t('Confirm Offer')}</Text>
          </View>
        </View>
        
        <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
          <View style={styles.previewCard}>
            <MaterialCommunityIcons name="lightning-bolt" size={32} color="#FF5C00" />
            <Text style={styles.previewTitle}>{t('Market Minimum')}: ₹{previewData.basePrice}</Text>
            <Text style={styles.previewOffer}>₹{previewData.initialOffer}</Text>
            <Text style={styles.previewDesc}>
              {t('This is your starting offer, including the 1.3x urgency premium to attract workers quickly.')}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable style={styles.startBtn} onPress={handleStartSearch}>
            <MaterialCommunityIcons name="radar" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.startBtnText}>{t('Start Searching')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#202124" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t('Urgent Booking')}</Text>
            <Text style={styles.headerSub}>{t('Get help instantly')}</Text>
          </View>
        </View>

        <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled" bottomOffset={16}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Select service')}</Text>
          </View>
          <View style={styles.grid}>
            {CATEGORIES.map((cat) => {
              const sel = selectedCategory === cat.id;
              return (
                <Pressable key={cat.id} style={[styles.card, sel && styles.cardSelected, sel && { borderColor: cat.color }]} onPress={() => { setSelectedCategory(cat.id); setIssueReason(''); }}>
                  <View style={[styles.cardIcon, { backgroundColor: sel ? cat.color : cat.bg }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={22} color={sel ? '#FFF' : cat.color} />
                  </View>
                  {sel && <View style={styles.cardCheck}><MaterialCommunityIcons name="check-circle" size={18} color={cat.color} /></View>}
                  <Text style={[styles.cardName, sel && { color: cat.color }]} numberOfLines={1}>{t(cat.name)}</Text>
                </Pressable>
              );
            })}
          </View>

          {selCat && (
            <View style={styles.pricingSection}>
              <Text style={styles.pricingTitle}>{t('What Happened?')}</Text>
              {issues.length === 0 ? (
                <View style={styles.reasonsGrid}>
                  {[t('Loading...')].map((r, i) => (
                    <Pressable key={i} style={styles.reasonChip}><Text style={styles.reasonText}>{r}</Text></Pressable>
                  ))}
                </View>
              ) : (
                <View style={styles.reasonsGrid}>
                  {issues.map((iss) => {
                    const sel = issueReason === iss.label;
                    return (
                      <Pressable
                        key={iss.canonicalId || iss.label}
                        style={[styles.reasonChip, sel && { backgroundColor: '#FF5C00', borderColor: '#FF5C00' }]}
                        onPress={() => { setIssueReason(iss.label); setSelectedIssueId(iss.id); }}
                      >
                        <Text style={[styles.reasonText, sel && { color: '#FFF' }]}>{iss.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Text style={[styles.pricingTitle, { marginTop: 24 }]}>{t('Description (Optional)')}</Text>
              <TextInput
                style={styles.descInput}
                placeholder={t('Add details...')}
                value={description}
                onChangeText={setDescription}
                multiline
              />

              {/* Problem image (optional) */}
              <Text style={[styles.pricingTitle, { marginTop: 24 }]}>{t('Photo (Optional)')}</Text>
              <View style={styles.urgentPhotoRow}>
                {urgentImage && (
                  <View style={styles.urgentPhotoWrap}>
                    <Image source={{ uri: urgentImage.uri }} style={styles.urgentPhotoThumb} contentFit="cover" />
                    <Pressable style={styles.urgentPhotoRemove} onPress={() => setUrgentImage(null)} hitSlop={6}>
                      <MaterialCommunityIcons name="close" size={14} color="#FFF" />
                    </Pressable>
                  </View>
                )}
                {!urgentImage && (
                  <Pressable style={styles.urgentPhotoAdd} onPress={pickUrgentImage} disabled={uploadingImg}>
                    <MaterialCommunityIcons name="camera-plus-outline" size={20} color="#8A8A8A" />
                    <Text style={styles.urgentPhotoAddText}>{uploadingImg ? t('Uploading...') : t('Add')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
          <View style={{ height: 40 }} />
        </KeyboardAwareScrollView>

        <KeyboardStickyView style={styles.footer} offset={{ closed: 0, opened: 0 }}>
          <Pressable style={[styles.startBtn, (!selectedCategory || !issueReason) && styles.startBtnDisabled]} onPress={handlePreview} disabled={!selectedCategory || !issueReason}>
            <Text style={styles.startBtnText}>{t('Calculate Offer')}</Text>
          </Pressable>
        </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 14,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, elevation: 1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#202124' },
  headerSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#8A8A8A', marginTop: 1 },
  
  scrollContent: { paddingBottom: 40 },
  sectionHeader: { marginHorizontal: 24, marginBottom: 12 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124' },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8 },
  card: {
    width: (width - 48 - 8) / 2,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    elevation: 2,
  },
  cardSelected: { backgroundColor: '#F9FAFB' },
  cardIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  cardCheck: { position: 'absolute', top: 12, right: 12 },
  cardName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#202124' },
  
  pricingSection: { marginTop: 24, marginHorizontal: 24 },
  pricingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#202124', marginBottom: 12 },
  reasonsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reasonChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFF' },
  reasonText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#4B5563' },
  descInput: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, minHeight: 100, textAlignVertical: 'top', fontFamily: 'Inter_400Regular', borderWidth: 1, borderColor: '#E5E7EB' },
  urgentPhotoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  urgentPhotoWrap: { position: 'relative' },
  urgentPhotoThumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: '#EDE8DC' },
  urgentPhotoRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center',
  },
  urgentPhotoAdd: {
    width: 76, height: 76, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C8C0B0',
    backgroundColor: '#FFF8F0',
    justifyContent: 'center', alignItems: 'center', gap: 2,
  },
  urgentPhotoAddText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#8A8A8A' },
  
  footer: { backgroundColor: '#FFF', paddingHorizontal: 24, paddingVertical: 16, paddingBottom: Platform.OS === 'ios' ? 24 : 16, elevation: 8 },
  startBtn: { backgroundColor: '#202124', borderRadius: 16, flexDirection: 'row', height: 56, justifyContent: 'center', alignItems: 'center' },
  startBtnDisabled: { backgroundColor: '#D1D5DB' },
  startBtnText: { color: '#FFF', fontFamily: 'Inter_600SemiBold', fontSize: 16 },

  searchingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  radarArea: { width: 220, height: 220, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  radarRingOuter: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#FF5C00' },
  radarRingMid: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#FF5C00' },
  radarRingStatic: { position: 'absolute', width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderColor: 'rgba(255,92,0,0.25)' },
  radarCenter: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, zIndex: 2 },
  radarIconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },

  statusHeader: { alignItems: 'center', marginBottom: 24 },
  searchingTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#202124', textAlign: 'center', marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34A853' },
  statusLive: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#5F6368' },

  offerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 20,
    padding: 20, marginBottom: 20,
    width: '100%', maxWidth: 320,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    borderWidth: 1, borderColor: '#F0EDE6',
  },
  offerCardLeft: { flex: 1 },
  offerLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#8A8A8A', marginBottom: 4 },
  offerValue: { fontFamily: 'Inter_700Bold', fontSize: 28, color: '#202124' },
  offerCardRight: { alignItems: 'flex-end' },
  timerValue: { fontFamily: 'Inter_700Bold', fontSize: 24, color: '#FF5C00' },
  timerLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#8A8A8A', marginTop: 2 },

  increaseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF5C00', paddingHorizontal: 36, paddingVertical: 14,
    borderRadius: 16, marginBottom: 20,
    elevation: 3, shadowColor: '#FF5C00', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  increaseBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FFF' },
  cancelSearchBtn: { padding: 12 },
  cancelSearchText: { fontFamily: 'Inter_500Medium', fontSize: 15, color: '#E53935' },

  previewCard: { backgroundColor: '#FFF', padding: 24, borderRadius: 24, alignItems: 'center', elevation: 4 },
  previewTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#8A8A8A', marginTop: 12 },
  previewOffer: { fontFamily: 'Inter_700Bold', fontSize: 48, color: '#FF5C00', marginVertical: 8 },
  previewDesc: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#5F6368', textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center' },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#202124', marginBottom: 8 },
  modalSub: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#5F6368', textAlign: 'center', marginBottom: 24 },
  increaseOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 24 },
  increaseOptionBtn: { backgroundColor: '#FFF0E8', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FF5C00' },
  increaseOptionText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FF5C00' },
  keepSearchingBtn: { padding: 16 },
  keepSearchingText: { fontFamily: 'Inter_500Medium', color: '#5F6368' }
});
