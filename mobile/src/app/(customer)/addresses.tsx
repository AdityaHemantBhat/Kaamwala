import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { State, City } from 'country-state-city';
import * as Location from 'expo-location';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { SkeletonAddressesBody } from '../../components/ui/SkeletonScreenLayouts';

const LABELS = ['Home', 'Work', 'Other'] as const;
const LABEL_COLORS: Record<string, string> = { Home: '#2D3436', Work: '#6C5CE7', Other: '#00B894' };

export default function AddressesScreen() {
  const t = useT();
  const { showToast } = useToast();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [isModalVisible, setModalVisible] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newLine1, setNewLine1] = useState('');
  const [newLine2, setNewLine2] = useState('');
  const [newLandmark, setNewLandmark] = useState('');
  const [selectedState, setSelectedState] = useState<{ name: string; isoCode: string } | null>(null);
  const [selectedCity, setSelectedCity] = useState<{ name: string } | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isSelectingState, setIsSelectingState] = useState(false);
  const [isSelectingCity, setIsSelectingCity] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const indianStates = useMemo(() => State.getStatesOfCountry('IN'), []);
  const availableCities = useMemo(
    () => (selectedState ? City.getCitiesOfState('IN', selectedState.isoCode) : []),
    [selectedState]
  );
  const filteredStates = useMemo(
    () => indianStates.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [indianStates, searchQuery]
  );
  const filteredCities = useMemo(
    () => availableCities.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [availableCities, searchQuery]
  );

  useEffect(() => { loadAddresses(); }, []);

  const loadAddresses = async () => {
    try {
      const res = await apiClient.get('/addresses');
      setAddresses(res.data?.data || []);
    } catch (e) {  }
    finally { setLoading(false); setRefreshing(false); }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast({ message: t('Location permission required'), type: 'error' });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      const geo = await Location.reverseGeocodeAsync(loc.coords);

      if (geo[0]) {
        const g = geo[0];
        setNewLine1([g.street, g.name, g.district].filter(Boolean).join(', ') || t('Unknown location'));

        // Find state from the list
        if (g.region) {
          const found = indianStates.find(s => s.name.toLowerCase() === g.region!.toLowerCase());
          if (found) setSelectedState(found);
        }

        // Set city
        if (g.city || g.subregion) {
          setSelectedCity({ name: g.city || g.subregion || '' });
        }

        setLatitude(loc.coords.latitude);
        setLongitude(loc.coords.longitude);

        showToast({ message: t('Location detected'), type: 'success' });
      }
    } catch (e: any) {
      showToast({ message: e?.message || t('Failed to get location'), type: 'error' });
    } finally { setLocating(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/addresses/${id}`);
      setAddresses(prev => prev.filter(a => a.id !== id));
      showToast({ message: t('Address deleted'), type: 'success' });
    } catch { showToast({ message: t('Failed to delete'), type: 'error' }); }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await apiClient.patch(`/addresses/${id}/default`);
      setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
      showToast({ message: t('Default address updated'), type: 'success' });
    } catch { showToast({ message: t('Failed to set default'), type: 'error' }); }
  };

  const handleAddAddress = async () => {
    if (!newLine1 || !selectedState || !selectedCity) return;
    // A saved address is only useful if the worker can navigate to it — that
    // requires real coordinates, never (0,0).
    if (latitude === null || longitude === null) {
      showToast({ message: t('Please use "Use Current Location" to set your location'), type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post('/addresses', {
        label: newLabel, line1: newLine1, line2: newLine2 || undefined,
        landmark: newLandmark || undefined,
        city: selectedCity.name, state: selectedState.name, pincode: '',
        latitude,
        longitude,
        isDefault: addresses.length === 0,
      });
      setAddresses(prev => [...prev, res.data?.data]);
      showToast({ message: t('Address added'), type: 'success' });
      resetModal();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed'), type: 'error' });
    } finally { setSaving(false); }
  };

  const resetModal = () => {
    setModalVisible(false);
    setNewLine1(''); setNewLine2(''); setNewLandmark(''); setSelectedState(null); setSelectedCity(null);
    setLatitude(null); setLongitude(null);
  };

  const openStateSelector = () => { setSearchQuery(''); setIsSelectingState(true); };
  const openCitySelector = () => { if (selectedState) { setSearchQuery(''); setIsSelectingCity(true); } };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
        <SkeletonAddressesBody />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => { try { require('expo-router').router.back(); } catch {} }}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#0D0D0D" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginLeft: 12 }}>{t('Saved Addresses')}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
        {addresses.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: 'rgba(255,92,0,0.06)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 }}>
                <MaterialCommunityIcons name="map-marker-plus-outline" size={32} color="#FF5C00" />
              </View>
            </View>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#4A4A4A', marginTop: 8 }}>{t('No address found')}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#9E9E9E', textAlign: 'center', paddingHorizontal: 40 }}>
              {t('Add your home or work address for faster bookings')}
            </Text>
          </View>
        ) : (
          addresses.map((addr, index) => {
            const labelColor = LABEL_COLORS[addr.label] || '#0D0D0D';
            return (
              <Animated.View key={addr.id} entering={FadeInUp.delay(index * 80).duration(300)}>
                <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, padding: 16, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: labelColor }} />
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#0D0D0D' }}>{addr.label || t('Address')}</Text>
                      {addr.isDefault && (
                        <View style={{ backgroundColor: '#FFF0E8', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
                          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: '#FF5C00' }}>{t('DEFAULT')}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {!addr.isDefault && (
                        <Pressable onPress={() => handleSetDefault(addr.id)} style={{ padding: 6 }}>
                          <MaterialCommunityIcons name="check-circle-outline" size={20} color="#9E9E9E" />
                        </Pressable>
                      )}
                      <Pressable onPress={() => handleDelete(addr.id)} style={{ padding: 6 }}>
                        <MaterialCommunityIcons name="delete-outline" size={20} color="#9E9E9E" />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 15, color: '#0D0D0D', marginTop: 10, lineHeight: 22 }}>{addr.line1}</Text>
                  {addr.line2 && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginTop: 2 }}>{addr.line2}</Text>}
                  {addr.landmark && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginTop: 2 }}>{addr.landmark}</Text>}
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#9E9E9E', marginTop: 4 }}>
                    {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0EDE6' }}>
                    <MaterialCommunityIcons name="map-marker" size={14} color="#9E9E9E" />
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E' }}>{addr.city}</Text>
                    <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#D0D0D0' }} />
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#9E9E9E" />
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E' }}>
                      {new Date(addr.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          })
        )}

        <Pressable onPress={() => setModalVisible(true)}
          style={{ backgroundColor: '#FF5C00', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, elevation: 3, shadowColor: '#FF5C00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, marginTop: 4 }}>
          <MaterialCommunityIcons name="plus-circle" size={20} color="#FFFFFF" />
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' }}>
            {addresses.length === 0 ? t('Add Your First Address') : t('Add New Address')}
          </Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={isModalVisible} transparent animationType="slide" onRequestClose={resetModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={resetModal} />
          <Animated.View entering={FadeInUp.duration(300)} style={{ maxHeight: '80%' }}>
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '100%', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12 }}>
              <View style={{ width: 40, height: 4, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 20, borderRadius: 2 }} />

              {isSelectingState || isSelectingCity ? (
                <>
                  <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', marginBottom: 16 }}>
                    {t('Select')} {isSelectingState ? t('State') : t('City')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 }}>
                    <MaterialCommunityIcons name="magnify" size={20} color="#9E9E9E" />
                    <TextInput style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D' }}
                      placeholder={t('Search...')} placeholderTextColor="#9E9E9E" value={searchQuery} onChangeText={setSearchQuery} />
                    {searchQuery.length > 0 && (
                      <Pressable onPress={() => setSearchQuery('')}><MaterialCommunityIcons name="close" size={18} color="#9E9E9E" /></Pressable>
                    )}
                  </View>
                  <ScrollView style={{ maxHeight: 350, marginBottom: 12 }}>
                    {(isSelectingState ? filteredStates : filteredCities).map((item: any, i: number) => (
                      <Pressable key={item.name + i}
                        style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F0EDE6', backgroundColor: pressed ? '#F5F5F5' : 'transparent', borderRadius: 8 })}
                        onPress={() => { if (isSelectingState) { setSelectedState(item); setSelectedCity(null); setIsSelectingState(false); } else { setSelectedCity(item); setIsSelectingCity(false); } }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <MaterialCommunityIcons name={isSelectingState ? 'map-outline' : 'domain'} size={18} color="#9E9E9E" />
                          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}>{item.name}</Text>
                        </View>
                        {((isSelectingState && selectedState?.isoCode === item.isoCode) || (!isSelectingState && selectedCity?.name === item.name)) && (
                          <MaterialCommunityIcons name="check-circle" size={20} color="#FF5C00" />
                        )}
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Pressable onPress={() => { setIsSelectingState(false); setIsSelectingCity(false); }} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('Back')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' }}>{t('Add Address')}</Text>
                    <Pressable onPress={useCurrentLocation} disabled={locating}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF0E8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 }}>
                      {locating ? (
                        <ActivityIndicator size="small" color="#FF5C00" />
                      ) : (
                        <MaterialCommunityIcons name="crosshairs-gps" size={16} color="#FF5C00" />
                      )}
                      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FF5C00' }}>{locating ? t('Detecting...') : t('Use Current')}</Text>
                    </Pressable>
                  </View>

                  <ScrollView style={{ maxHeight: 400 }}>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                      {LABELS.map(l => {
                        const isSelected = newLabel === l;
                        return (
                          <Pressable key={l} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: isSelected ? LABEL_COLORS[l] : '#E0E0E0', backgroundColor: isSelected ? (LABEL_COLORS[l] + '15') : '#F5F5F5' }}
                            onPress={() => setNewLabel(l)}>
                            <MaterialCommunityIcons name={l === 'Home' ? 'home-outline' : l === 'Work' ? 'briefcase-outline' : 'map-marker-radius-outline'} size={16} color={isSelected ? LABEL_COLORS[l] : '#9E9E9E'} />
                            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: isSelected ? LABEL_COLORS[l] : '#6B6B6B' }}>{t(l)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>{t('Street Address')} *</Text>
                    <View style={{ backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 }}>
                      <TextInput style={{ paddingVertical: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D' }}
                        placeholder={t('Street address')} placeholderTextColor="#9E9E9E" value={newLine1} onChangeText={setNewLine1} />
                    </View>

                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>{t('Apartment / Building')}</Text>
                    <View style={{ backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 }}>
                      <TextInput style={{ paddingVertical: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D' }}
                        placeholder={t('Apartment / Building')} placeholderTextColor="#9E9E9E" value={newLine2} onChangeText={setNewLine2} />
                    </View>

                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>{t('Landmark')}</Text>
                    <View style={{ backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 }}>
                      <TextInput style={{ paddingVertical: 14, fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D' }}
                        placeholder={t('Landmark')} placeholderTextColor="#9E9E9E" value={newLandmark} onChangeText={setNewLandmark} />
                    </View>

                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>{t('State')} *</Text>
                    <Pressable onPress={openStateSelector} style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14 }}>
                        <MaterialCommunityIcons name="map-outline" size={20} color="#9E9E9E" />
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: selectedState ? '#0D0D0D' : '#9E9E9E', marginLeft: 10, flex: 1 }}>{selectedState?.name || t('Select State')}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={20} color="#9E9E9E" />
                      </View>
                    </Pressable>

                    <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>{t('City')} *</Text>
                    <Pressable onPress={openCitySelector} disabled={!selectedState} style={{ marginBottom: 20 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, opacity: selectedState ? 1 : 0.5 }}>
                        <MaterialCommunityIcons name="domain" size={20} color="#9E9E9E" />
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: selectedCity ? '#0D0D0D' : '#9E9E9E', marginLeft: 10, flex: 1 }}>{selectedCity?.name || (selectedState ? t('Select City') : t('Select State First'))}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={20} color="#9E9E9E" />
                      </View>
                    </Pressable>

                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable onPress={handleAddAddress} disabled={saving || !newLine1 || !selectedState || !selectedCity}
                        style={{ flex: 1, backgroundColor: (saving || !newLine1 || !selectedState || !selectedCity) ? '#FFB088' : '#FF5C00', paddingVertical: 16, borderRadius: 16, alignItems: 'center', elevation: 2 }}>
                        {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFFFFF' }}>{t('Save')}</Text>}
                      </Pressable>
                      <Pressable onPress={resetModal} style={{ flex: 1, backgroundColor: '#F5F5F5', paddingVertical: 16, borderRadius: 16, alignItems: 'center' }}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#6B6B6B' }}>{t('Cancel')}</Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                </>
              )}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
