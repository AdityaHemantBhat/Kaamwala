import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, FlatList, ActivityIndicator, Switch } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonWorkerProfile } from '../../components/ui/Skeleton';
import { apiClient } from '../../api/client';
import { deleteUploadedImage } from '../../api/media';
import * as ImagePicker from 'expo-image-picker';
import { State, City } from 'country-state-city';
import { socketService } from '../../api/socket';

export default function WorkerProfile() {
  const router = useRouter();
  const t = useT();
  const { user, updateUser } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [editModal, setEditModal] = useState<{ field: string; value: string } | null>(null);

  // City/State picker state
  const [pickingState, setPickingState] = useState(false);
  const [pickingCity, setPickingCity] = useState(false);
  const [selectedState, setSelectedState] = useState<{ name: string; isoCode: string } | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [saving, setSaving] = useState(false);

  // ── Services management state ──
  const [services, setServices] = useState<any[]>([]);
  const [serviceModal, setServiceModal] = useState<{ mode: 'add' | 'edit'; id?: string } | null>(null);
  const [svcName, setSvcName] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcUnit, setSvcUnit] = useState('visit');
  const [svcActive, setSvcActive] = useState(true);
  const [savingService, setSavingService] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const indianStates = useMemo(() => State.getStatesOfCountry('IN'), []);
  const currentIsoCode = selectedState?.isoCode || indianStates.find(s => s.name === profile?.state)?.isoCode;
  const cities = useMemo(() => currentIsoCode ? City.getCitiesOfState('IN', currentIsoCode) : [], [currentIsoCode]);

  useEffect(() => {
    loadProfile();
    loadServices();

    const handleRefresh = (data: any) => {
      if (data?.type === 'verification') {
        loadProfile();
      }
    };
    socketService.on('worker_refresh', handleRefresh);
    return () => { socketService.off('worker_refresh', handleRefresh); };
  }, []);

  const loadProfile = async () => {
    try {
      const res = await apiClient.get('/workers/stats');
      setProfile(res.data?.data);
    } catch (e) {  }
    finally { setLoading(false); }
  };

  const loadServices = async () => {
    try {
      const res = await apiClient.get('/workers/services');
      setServices(res.data?.data || []);
    } catch {}
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6,
      });
      if (!result.canceled && result.assets[0]) {
        setSaving(true);
        const prevPhoto = user?.photoUrl;
        const fd = new FormData();
        fd.append('file', { uri: result.assets[0].uri, type: 'image/jpeg', name: 'photo.jpg' } as any);
        fd.append('purpose', 'profile');
        const up = await apiClient.post('/upload', fd);
        const url = up.data?.data?.url || result.assets[0].uri;
        await apiClient.put('/auth/profile', { avatarUrl: url });
        updateUser({ photoUrl: url } as any);
        showToast({ message: t('Photo updated'), type: 'success' });

        // Replacing the avatar orphans the old image — free its Cloudinary storage.
        if (prevPhoto && prevPhoto !== url) deleteUploadedImage(prevPhoto);
        setSaving(false);
      }
    } catch (e: any) { showToast({ message: e?.message || e?.response?.data?.error || t('Upload failed'), type: 'error' }); setSaving(false); }
  };

  const openEdit = (field: string) => {
    if (field === 'state') {
      setPickingState(true);
      setSearchQuery('');
      return;
    }
    if (field === 'city') {
      if (!selectedState && !profile?.state) {
        showToast({ message: t('Please select a state first'), type: 'error' });
        return;
      }
      setPickingCity(true);
      setSearchQuery('');
      return;
    }
    // Pre-fill the current value so the worker edits, not retypes.
    const current =
      field === 'skills'
        ? (Array.isArray(profile?.skills) ? profile.skills.join(', ') : '')
        : profile?.[field] != null ? String(profile[field]) : '';
    setEditModal({ field, value: current });
  };

  const handleSave = async (field: string, value: string) => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      if (field === 'skills') {
        const skills = value.split(',').map((s) => s.trim()).filter(Boolean);
        await apiClient.put('/auth/profile', { skills });
      } else {
        await apiClient.put('/auth/profile', { [field]: value });
      }
      // Update local store so dashboard reflects changes immediately
      if (field === 'name') updateUser({ name: value } as any);
      showToast({ message: t('Updated'), type: 'success' });
      setEditModal(null);
      loadProfile();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed'), type: 'error' });
    } finally { setSaving(false); }
  };

  const handleSelectState = (state: any) => {
    setSelectedState(state);
    setPickingState(false);
    setPickingCity(true);
    setSearchQuery('');
  };

  const handleSelectCity = async (cityName: string) => {
    setSelectedCity(cityName);
    setPickingCity(false);
    setSaving(true);
    try {
      if (selectedState) await apiClient.put('/auth/profile', { state: selectedState.name });
      await apiClient.put('/auth/profile', { city: cityName });
      showToast({ message: t('Location updated'), type: 'success' });
      loadProfile();
    } catch { showToast({ message: t('Failed to update'), type: 'error' }); }
    finally { setSaving(false); }
  };

  // ── Services management handlers ──
  const openAddService = () => {
    setSvcName(''); setSvcDesc(''); setSvcPrice(''); setSvcUnit('visit'); setSvcActive(true);
    setServiceModal({ mode: 'add' });
  };

  const openEditService = (svc: any) => {
    setSvcName(svc.name);
    setSvcDesc(svc.description || '');
    setSvcPrice(String(svc.basePrice));
    setSvcUnit(svc.priceUnit || 'visit');
    setSvcActive(svc.isActive !== false);
    setServiceModal({ mode: 'edit', id: svc.id });
  };

  const saveService = async () => {
    if (!svcName.trim()) { showToast({ message: t('Service name is required'), type: 'error' }); return; }
    const price = parseFloat(svcPrice);
    if (!price || price < 1) { showToast({ message: t('Enter a valid price'), type: 'error' }); return; }
    setSavingService(true);
    try {
      const payload = { name: svcName.trim(), description: svcDesc.trim(), basePrice: price, priceUnit: svcUnit, isActive: svcActive };
      if (serviceModal?.mode === 'edit') {
        await apiClient.put(`/workers/services/${serviceModal.id}`, payload);
      } else {
        await apiClient.post('/workers/services', payload);
      }
      showToast({ message: t('Service saved'), type: 'success' });
      setServiceModal(null);
      loadServices();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to save service'), type: 'error' });
    } finally { setSavingService(false); }
  };

  const toggleService = async (svc: any, val: boolean) => {
    try {
      await apiClient.put(`/workers/services/${svc.id}`, { isActive: val });
      setServices(prev => prev.map(s => s.id === svc.id ? { ...s, isActive: val } : s));
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to update'), type: 'error' });
    }
  };

  const deleteService = async (id: string) => {
    setSavingService(true);
    try {
      await apiClient.delete(`/workers/services/${id}`);
      showToast({ message: t('Service removed'), type: 'success' });
      setDeleteConfirmId(null);
      loadServices();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to remove service'), type: 'error' });
    } finally { setSavingService(false); }
  };

  const filteredStates = indianStates.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredCities = cities.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const exactCityMatch = filteredCities.some(c => c.name.toLowerCase() === searchQuery.trim().toLowerCase());

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
        <SkeletonWorkerProfile />
      </SafeAreaView>
    );
  }

  const getTier = (jobs: number, rating: number) => {
    if (jobs >= 100 && rating >= 4.8) return { name: 'Platinum', color: '#607D8B', bg: '#ECEFF1' };
    if (jobs >= 50 && rating >= 4.5) return { name: 'Gold', color: '#F57F17', bg: '#FFF8E1' };
    if (jobs >= 20 && rating >= 4.0) return { name: 'Silver', color: '#757575', bg: '#F5F5F5' };
    return { name: 'Bronze', color: '#795548', bg: '#EFEBE9' };
  };
  const tier = getTier(profile?.completedJobs || 0, profile?.rating || 0);

  const HEALTH_STYLE: Record<string, { label: string; icon: string; color: string; bg: string; desc: string }> = {
    ACTIVE:     { label: 'Good Standing', icon: 'shield-check',          color: '#2E7D32', bg: '#E8F5E9', desc: 'Your account is in good standing.' },
    WARNED:     { label: 'Warned',        icon: 'alert-outline',         color: '#E65100', bg: '#FFF3E0', desc: 'Your cancellation rate is above the warning threshold. Keep it down to protect your eligibility.' },
    RESTRICTED: { label: 'Restricted',    icon: 'shield-alert-outline',  color: '#C62828', bg: '#FFEBEE', desc: 'Your cancellation rate is high. Urgent & guaranteed eligibility are paused until it improves.' },
    SUSPENDED:  { label: 'Suspended',     icon: 'shield-remove-outline', color: '#8B1A1A', bg: '#FDEBEB', desc: 'Your account has been suspended due to a high cancellation rate.' },
  };
  const hs = HEALTH_STYLE[profile?.healthStatus || ''] || (profile?.healthStatus ? HEALTH_STYLE.WARNED : null);

  const renderField = (label: string, value: string | undefined, key: string, right?: React.ReactNode) => (
    <Pressable key={key} style={styles.fieldRow} onPress={() => openEdit(key)}>
      <Text style={styles.fieldLabel}>{t(label)}</Text>
      <Text style={[styles.fieldValue, !value && { color: '#B0A898' }]}>{value || t('Not set')}</Text>
      {right || <MaterialCommunityIcons name="pencil" size={16} color="#B0A898" />}
    </Pressable>
  );

  const FIELD_LABELS: Record<string, string> = {
    name: 'Name', category: 'Category', state: 'State', city: 'City',
    experienceYears: 'Experience', hourlyRate: 'Rate',
    upiId: 'UPI ID', bankAccountNumber: 'Bank A/c', bankIfsc: 'IFSC',
    skills: 'Skills', pincode: 'Pincode',
  };

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
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 18, color: '#0D0D0D' }}>{t('Profile')}</Text>
        </View>
      </View>

      {/* State Picker Modal */}
      <Modal visible={pickingState} transparent animationType="slide" onRequestClose={() => setPickingState(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t('Select State')}</Text>
              <Pressable onPress={() => setPickingState(false)}><MaterialCommunityIcons name="close" size={24} color="#0D0D0D" /></Pressable>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="magnify" size={20} color="#6B6B6B" />
              <TextInput
                placeholder={t('Search state...')}
                placeholderTextColor="#B0A898"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, paddingVertical: 12, paddingLeft: 10, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}
              />
            </View>
            <FlatList
              data={filteredStates}
              keyExtractor={(item) => item.isoCode}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerItem} onPress={() => handleSelectState(item)}>
                  <Text style={styles.pickerItemText}>{item.name}</Text>
                  {selectedState?.isoCode === item.isoCode && <MaterialCommunityIcons name="check" size={20} color="#FF5C00" />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* City Picker Modal */}
      <Modal visible={pickingCity} transparent animationType="slide" onRequestClose={() => setPickingCity(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t('Select City')}</Text>
              <Pressable onPress={() => setPickingCity(false)}><MaterialCommunityIcons name="close" size={24} color="#0D0D0D" /></Pressable>
            </View>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="magnify" size={20} color="#6B6B6B" />
              <TextInput
                placeholder={t('Search city...')}
                placeholderTextColor="#B0A898"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, paddingVertical: 12, paddingLeft: 10, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}
              />
            </View>
            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item.name}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerItem} onPress={() => handleSelectCity(item.name)}>
                  <Text style={styles.pickerItemText}>{item.name}</Text>
                </Pressable>
              )}
              ListFooterComponent={
                searchQuery.trim() && !exactCityMatch ? (
                  <Pressable style={[styles.pickerItem, { backgroundColor: '#FFF0E8' }]}
                    onPress={() => handleSelectCity(searchQuery.trim())}>
                    <Text style={[styles.pickerItemText, { color: '#FF5C00' }]}>+ {t('Add')} "{searchQuery.trim()}"</Text>
                  </Pressable>
                ) : null
              }
            />
          </View>
        </View>
      </Modal>

      {/* Text Edit Modal */}
      <Modal visible={!!editModal} transparent animationType="slide" onRequestClose={() => setEditModal(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditModal(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Edit')} {t(FIELD_LABELS[editModal?.field || ''] || '')}</Text>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, marginBottom: 16 }}>
              <TextInput style={styles.modalInput} value={editModal?.value || ''}
                onChangeText={(t) => setEditModal(prev => prev ? { ...prev, value: t } : null)}
                placeholder={`${t('Enter')} ${t(FIELD_LABELS[editModal?.field || ''] || '')}`} placeholderTextColor="#B0A898"
                keyboardType={['hourlyRate', 'bankAccountNumber', 'experienceYears'].includes(editModal?.field || '') ? 'numeric' : 'default'} autoFocus />
            </View>

            {/* Category picker — shown when editing category */}
            {editModal?.field === 'category' && (
              <View style={{ marginBottom: 16, maxHeight: 300 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 8 }}>{t('Select category')}</Text>
                <ScrollView style={{ maxHeight: 260 }}>
                  {['PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER', 'PAINTER', 'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER', 'COOK', 'TUTOR', 'SECURITY_GUARD', 'NURSE', 'BABYSITTER'].map(cat => (
                    <Pressable key={cat} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E0D8CC', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      onPress={async () => {
                        setSaving(true);
                        try {
                          await apiClient.put('/auth/profile', { category: cat });
                          updateUser({ category: cat } as any);
                          showToast({ message: t('Category updated'), type: 'success' });
                          setEditModal(null);
                          loadProfile();
                        } catch (e: any) { showToast({ message: t('Failed'), type: 'error' }); }
                        finally { setSaving(false); }
                      }}>
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}>{t(cat.replace(/_/g, ' '))}</Text>
                      {profile?.category === cat && <MaterialCommunityIcons name="check" size={20} color="#FF5C00" />}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Price unit picker — shown when editing rate */}
            {editModal?.field === 'hourlyRate' && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 8 }}>{t('Per')}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['visit', 'hour', 'day', 'sqft'].map(unit => (
                    <Pressable key={unit} style={[
                      { flex: 1, padding: 10, borderRadius: 12, backgroundColor: '#F5F0E8', alignItems: 'center', elevation: 1 },
                      (profile?.priceUnit || 'visit') === unit && { backgroundColor: '#FF5C00' }
                    ]} onPress={async () => {
                      setSaving(true);
                      try {
                        await apiClient.put('/auth/profile', { priceUnit: unit });
                        loadProfile();
                        showToast({ message: `${t('Price per')} ${t(unit)}`, type: 'success' });
                      } catch {}
                      finally { setSaving(false); }
                    }}>
                      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: (profile?.priceUnit || 'visit') === unit ? '#FFFFFF' : '#0D0D0D' }}>
                        /{t(unit)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => handleSave(editModal!.field, editModal!.value)}
                disabled={saving || !editModal?.value}
                style={[styles.saveBtn, (!editModal?.value || saving) && { opacity: 0.5 }]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' }}>{t('Save')}</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => setEditModal(null)}
                style={[styles.saveBtn, { backgroundColor: '#E0D8CC' }]}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Service Add/Edit Modal */}
      <Modal visible={!!serviceModal} transparent animationType="slide" onRequestClose={() => setServiceModal(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setServiceModal(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{serviceModal?.mode === 'edit' ? t('Edit Service') : t('Add Service')}</Text>

            <Text style={styles.serviceFieldLabel}>{t('Service name')}</Text>
            <View style={styles.serviceInputWrap}>
              <TextInput style={styles.serviceInput} value={svcName} onChangeText={setSvcName} placeholder={t('e.g. Fix leaking tap')} placeholderTextColor="#B0A898" />
            </View>

            <Text style={styles.serviceFieldLabel}>{t('Description')}</Text>
            <View style={styles.serviceInputWrap}>
              <TextInput
                style={[styles.serviceInput, { minHeight: 60, textAlignVertical: 'top' }]}
                value={svcDesc}
                onChangeText={setSvcDesc}
                multiline
                placeholder={t('Describe what you offer')}
                placeholderTextColor="#B0A898"
                maxLength={300}
              />
            </View>

            <Text style={styles.serviceFieldLabel}>{t('Price')}</Text>
            <View style={styles.serviceInputWrap}>
              <TextInput style={styles.serviceInput} value={svcPrice} onChangeText={setSvcPrice} keyboardType="numeric" placeholder={t('e.g. 300')} placeholderTextColor="#B0A898" />
            </View>

            <Text style={styles.serviceFieldLabel}>{t('Per')}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
              {['visit', 'hour', 'day', 'sqft'].map(unit => {
                const active = svcUnit === unit;
                return (
                  <Pressable
                    key={unit}
                    style={[styles.svcUnitChip, active && styles.svcUnitChipActive]}
                    onPress={() => setSvcUnit(unit)}
                  >
                    <Text style={[styles.svcUnitText, active && styles.svcUnitTextActive]}>/{t(unit)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 13, color: '#0D0D0D' }}>{t('Active')}</Text>
              <Switch value={svcActive} onValueChange={setSvcActive} trackColor={{ false: '#E0E0E0', true: '#FF5C00' }} thumbColor="#FFFFFF" />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={saveService} disabled={savingService} style={[styles.saveBtn, savingService && { opacity: 0.5 }]}>
                {savingService ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' }}>{t('Save')}</Text>}
              </Pressable>
              <Pressable onPress={() => setServiceModal(null)} style={[styles.saveBtn, { backgroundColor: '#E0D8CC' }]}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={!!deleteConfirmId} transparent animationType="fade" onRequestClose={() => setDeleteConfirmId(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#8B1A1A" />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: '#0D0D0D', marginTop: 12, marginBottom: 6 }}>{t('Remove service?')}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', textAlign: 'center', marginBottom: 20 }}>
              {t('This service will no longer be shown to customers.')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <Pressable onPress={() => setDeleteConfirmId(null)} style={[styles.saveBtn, { backgroundColor: '#E0D8CC' }]}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable onPress={() => deleteConfirmId && deleteService(deleteConfirmId)} disabled={savingService} style={[styles.saveBtn, { backgroundColor: '#8B1A1A' }, savingService && { opacity: 0.5 }]}>
                {savingService ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' }}>{t('Remove')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Main Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40, gap: 20 }}>
        {/* Avatar */}
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
          <Pressable onPress={pickImage} style={{ position: 'relative' }}>
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 32, color: '#F5F0E8' }}>
                  {(user?.name || 'W')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center', elevation: 2 }}>
              <MaterialCommunityIcons name="camera" size={14} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D' }}>{user?.name || t('Worker')}</Text>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B' }}>{user?.phone || ''}</Text>
          {profile?.category && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{ backgroundColor: '#FF5C00', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#FFFFFF' }}>{t(profile.category.replace(/_/g, ' '))}</Text>
              </View>
              <View style={{ backgroundColor: tier.bg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: tier.color }}>{t(tier.name)}</Text>
              </View>
            </View>
          )}
          {(profile?.state || profile?.city) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialCommunityIcons name="map-marker" size={14} color="#6B6B6B" />
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B' }}>
                {[profile?.city, profile?.state].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { v: profile?.rating?.toFixed(1) || '—', l: 'Rating' },
            { v: profile?.completedJobs || 0, l: 'Jobs Done' },
            { v: `${profile?.acceptanceRate || 0}%`, l: 'Acceptance' },
            { v: `${profile?.responseTimeMinutes || 0}${t('m')}`, l: 'Response' },
          ].map((s) => (
            <View key={s.l} style={styles.statCard}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#0D0D0D' }}>{s.v}</Text>
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: '#6B6B6B', marginTop: 2 }}>{t(s.l)}</Text>
            </View>
          ))}
        </View>
        {/* Account Health */}
        {hs && (
          <View>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 8 }}>{t('Account Health')}</Text>
            <View style={[styles.cardSection, { padding: 14, gap: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: hs.bg, justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name={hs.icon as any} size={18} color={hs.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: hs.color }}>{t(hs.label)}</Text>
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{t(hs.desc)}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={styles.healthStat}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#0D0D0D' }}>{profile?.reliabilityScore ?? '—'}</Text>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: '#6B6B6B' }}>{t('Reliability')}</Text>
                </View>
                <View style={styles.healthStat}>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#0D0D0D' }}>
                    {profile?.cancellationRate != null ? `${Math.round(profile.cancellationRate * 100)}%` : '—'}
                  </Text>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: '#6B6B6B' }}>{t('Cancel rate')}</Text>
                </View>
                {profile?.isUrgentEligible === false && (
                  <View style={[styles.healthStat, { flex: 1 }]}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#C62828' }}>{t('Paused')}</Text>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: '#6B6B6B' }}>{t('Urgent eligibility')}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Fields */}
        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 8 }}>{t('About')}</Text>
          <View style={styles.cardSection}>
            {renderField('Name', user?.name, 'name')}
            {renderField('Category', profile?.category ? t(profile.category.replace(/_/g, ' ')) : undefined, 'category')}
            {renderField('State', profile?.state || selectedState?.name, 'state',
              <MaterialCommunityIcons name="chevron-down" size={16} color="#B0A898" />
            )}
            {renderField('City', profile?.city || selectedCity, 'city',
              <MaterialCommunityIcons name="chevron-down" size={16} color="#B0A898" />
            )}
            {renderField('Experience', profile?.experienceYears ? `${profile.experienceYears} ${t('yrs')}` : '', 'experienceYears')}
            {renderField('Rate', profile?.hourlyRate ? `₹${profile.hourlyRate}/${t(profile?.priceUnit || 'visit')}` : '', 'hourlyRate')}
            {renderField('Skills', Array.isArray(profile?.skills) && profile.skills.length ? profile.skills.join(', ') : '', 'skills')}
            {renderField('Pincode', profile?.pincode, 'pincode')}
          </View>
        </View>

        {/* Services */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B' }}>{t('Services')}</Text>
            <Pressable onPress={openAddService} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF5C00', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}>
              <MaterialCommunityIcons name="plus" size={14} color="#FFFFFF" />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#FFFFFF' }}>{t('Add Service')}</Text>
            </Pressable>
          </View>
          <View style={styles.cardSection}>
            {services.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#9E9E9E', textAlign: 'center' }}>
                  {t('No services yet — add what you offer so customers can book you.')}
                </Text>
              </View>
            ) : services.map((svc: any) => (
              <View key={svc.id} style={styles.serviceRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', flexShrink: 1 }}>{svc.name}</Text>
                    {svc.isActive === false && (
                      <View style={{ backgroundColor: '#E0D8CC', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 9, color: '#6B6B6B' }}>{t('Inactive')}</Text>
                      </View>
                    )}
                  </View>
                  {svc.description ? (
                    <Text numberOfLines={2} style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>{svc.description}</Text>
                  ) : null}
                  <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#FF5C00', marginTop: 4 }}>
                    ₹{svc.basePrice}/{t(svc.priceUnit || 'visit')}
                  </Text>
                </View>
                <Switch
                  value={svc.isActive !== false}
                  onValueChange={(val) => toggleService(svc, val)}
                  trackColor={{ false: '#E0E0E0', true: '#FF5C00' }}
                  thumbColor="#FFFFFF"
                />
                <Pressable onPress={() => openEditService(svc)} style={styles.serviceIconBtn} hitSlop={8}>
                  <MaterialCommunityIcons name="pencil-outline" size={18} color="#6B6B6B" />
                </Pressable>
                <Pressable onPress={() => setDeleteConfirmId(svc.id)} style={styles.serviceIconBtn} hitSlop={8}>
                  <MaterialCommunityIcons name="delete-outline" size={18} color="#8B1A1A" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        {/* Verification Status */}
        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 8 }}>{t('Verification')}</Text>
          <View style={[styles.cardSection, { padding: 14, gap: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {profile?.verificationStatus === 'VERIFIED' ? (
                <>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="check-decagram" size={20} color="#2E7D32" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#2E7D32' }}>{t('Verified')}</Text>
                    {profile?.verifiedAt && (
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>
                        {t('Since')} {new Date(profile.verifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                </>
              ) : profile?.verificationStatus === 'PENDING_REVIEW' ? (
                <>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF3E0', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color="#E65100" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#E65100' }}>{t('Verification Pending')}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{t('Under review by our team')}</Text>
                  </View>
                </>
              ) : profile?.verificationStatus === 'REJECTED' ? (
                <>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="close-circle" size={20} color="#D32F2F" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#D32F2F' }}>{t('Verification Rejected')}</Text>
                    {profile?.verificationNote && (
                      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{profile.verificationNote}</Text>
                    )}
                  </View>
                </>
              ) : profile?.verificationStatus === 'IN_PROGRESS' || profile?.verificationStatus === 'RESUBMISSION_REQUIRED' ? (
                <>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="file-document-edit-outline" size={20} color="#1565C0" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#1565C0' }}>{t('Draft Saved')}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{t('Resume your verification')}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F0E8', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="account-question" size={20} color="#6B6B6B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#6B6B6B' }}>{t('Not Verified')}</Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{t('Get verified to appear in searches')}</Text>
                  </View>
                </>
              )}
            </View>
            {(!profile?.verificationStatus || profile?.verificationStatus === 'UNVERIFIED' || profile?.verificationStatus === 'REJECTED' || profile?.verificationStatus === 'IN_PROGRESS' || profile?.verificationStatus === 'RESUBMISSION_REQUIRED') && (
              <Pressable
                style={{ backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 }}
                onPress={() => router.push('/(worker)/verification')}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' }}>{t('Verify Identity')}</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 8 }}>{t('Payment')}</Text>
          <View style={styles.cardSection}>
            {renderField('UPI ID', profile?.upiId, 'upiId')}
            {renderField('Bank A/c', profile?.bankAccountNumber ? `••••${profile.bankAccountNumber.slice(-4)}` : '', 'bankAccountNumber')}
            {renderField('IFSC', profile?.bankIfsc, 'bankIfsc')}
          </View>
        </View>


        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 80, height: 80, borderRadius: 40 },

  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, alignItems: 'center', elevation: 1,
  },

  healthStat: {
    flex: 1, backgroundColor: '#F5F0E8', borderRadius: 10, padding: 10, alignItems: 'center',
  },

  cardSection: {
    backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, overflow: 'hidden',
  },

  fieldRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' },
  fieldLabel: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#6B6B6B', width: 90 },
  fieldValue: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', flex: 1 },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' },
  pickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' },
  pickerItemText: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 16 },
  modalInput: { fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', paddingVertical: 12 },

  saveBtn: {
    flex: 1, backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', elevation: 2,
  },

  // ── Services ──
  serviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0',
  },
  serviceIconBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F0E8', justifyContent: 'center', alignItems: 'center',
  },

  serviceFieldLabel: {
    fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B', marginBottom: 6,
  },
  serviceInputWrap: {
    backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 1, paddingHorizontal: 14, marginBottom: 14,
  },
  serviceInput: {
    fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', paddingVertical: 12,
  },
  svcUnitChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F5F0E8', alignItems: 'center', elevation: 1,
  },
  svcUnitChipActive: { backgroundColor: '#FF5C00' },
  svcUnitText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#0D0D0D' },
  svcUnitTextActive: { color: '#FFFFFF' },

  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, alignItems: 'center', width: '100%', elevation: 10,
  },
});