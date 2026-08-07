import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator , ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { State } from 'country-state-city';
import { apiClient } from '../../api/client';
import { useT } from '../../utils/i18n';
import { useToast } from '../ui/ToastProvider';

const LABELS = ['Home', 'Work', 'Other'] as const;
const LABEL_COLORS: Record<string, string> = { Home: '#2D3436', Work: '#6C5CE7', Other: '#00B894' };

interface Props {
  addresses: any[];
  selectedAddressId: string | null;
  onSelect: (id: string) => void;
  /** A brand-new address was created on the backend — reflect it immediately. */
  onAdd: (address: any) => void;
  onClose: () => void;
}

/**
 * Inline service-location picker used inside the "Send Booking Request" modal.
 * The customer can switch to any saved address or add a brand-new one without
 * leaving the modal. New addresses are persisted to the backend immediately and
 * bubble back up so the selected address stays in sync in real time.
 */
export default function BookingAddressPicker({ addresses, selectedAddressId, onSelect, onAdd, onClose }: Props) {
  const t = useT();
  const { showToast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState<string>('Home');
  const [line1, setLine1] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ line1: string; city: string; state: string; pincode: string; latitude: number; longitude: number } | null>(null);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast({ message: t('Location permission required'), type: 'error' });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geo = await Location.reverseGeocodeAsync(loc.coords);
      const g = geo[0] || {};
      const region = g.region || '';
      const stateName = region
        ? (State.getStatesOfCountry('IN').find((s) => s.name.toLowerCase() === region.toLowerCase())?.name ?? region)
        : region;
      setPending({
        line1: [g.street, g.name, g.district].filter(Boolean).join(', ') || t('Unknown location'),
        city: g.city || g.subregion || '',
        state: stateName,
        pincode: g.postalCode || '',
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (!line1) setLine1([g.street, g.name, g.district].filter(Boolean).join(', '));
      showToast({ message: t('Location detected'), type: 'success' });
    } catch {
      showToast({ message: t('Failed to get location'), type: 'error' });
    } finally { setLocating(false); }
  };

  const saveAddress = async () => {
    const resolved = pending;
    if (!resolved || !line1.trim() || !resolved.city || !resolved.state) {
      showToast({ message: t('Please use "Use Current Location" and add a street address'), type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post('/addresses', {
        label,
        line1: line1.trim(),
        city: resolved.city,
        state: resolved.state,
        pincode: resolved.pincode.trim(),
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        isDefault: addresses.length === 0,
      });
      const created = res.data?.data;
      if (created) {
        onAdd(created);
        showToast({ message: t('Address added'), type: 'success' });
        setShowForm(false);
        setLine1('');
        setPending(null);
        setLabel('Home');
      }
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to add address'), type: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('Service Location')}</Text>
        <Pressable onPress={onClose} hitSlop={8} style={styles.doneBtn}>
          <Text style={styles.doneText}>{t('Done')}</Text>
        </Pressable>
      </View>

      {showForm ? (
        <View>
          {/* Label chips */}
          <View style={styles.labelRow}>
            {LABELS.map((l) => {
              const active = label === l;
              return (
                <Pressable
                  key={l}
                  onPress={() => setLabel(l)}
                  style={[styles.labelChip, active && { borderColor: LABEL_COLORS[l], backgroundColor: LABEL_COLORS[l] + '15' }]}
                >
                  <Text style={[styles.labelChipText, active && { color: LABEL_COLORS[l] }]}>{t(l)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={useCurrentLocation}
            disabled={locating}
            style={[styles.currentBtn, locating && { opacity: 0.6 }]}
          >
            {locating ? (
              <ActivityIndicator size="small" color="#FF5C00" />
            ) : (
              <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#FF5C00" />
            )}
            <Text style={styles.currentBtnText}>{locating ? t('Detecting...') : t('Use Current Location')}</Text>
          </Pressable>

          <Text style={styles.fieldLabel}>{t('Street Address')} *</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder={t('Street address')}
              placeholderTextColor="#9E9E9E"
              value={line1}
              onChangeText={setLine1}
            />
          </View>

          {pending && (
            <View style={styles.previewBox}>
              <MaterialCommunityIcons name="map-marker-check-outline" size={16} color="#1A5C2A" />
              <Text style={styles.previewText} numberOfLines={2}>
                {pending.city}, {pending.state}{pending.pincode ? ` · ${pending.pincode}` : ''}
              </Text>
            </View>
          )}

          <View style={styles.formActions}>
            <Pressable onPress={saveAddress} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>{t('Save Address')}</Text>}
            </Pressable>
            <Pressable onPress={() => { setShowForm(false); setLine1(''); setPending(null); }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>{t('Cancel')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {addresses.map((addr: any) => {
              const active = selectedAddressId === addr.id;
              const addrLine = [addr.line1, addr.landmark, addr.city].filter(Boolean).join(', ');
              return (
                <Pressable
                  key={addr.id}
                  onPress={() => onSelect(addr.id)}
                  style={[styles.addrRow, active && styles.addrRowActive]}
                >
                  <MaterialCommunityIcons
                    name={active ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={active ? '#FF5C00' : '#C8C0B0'}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.addrLabel, active && { color: '#FF5C00' }]}>{addr.label || t('Address')}</Text>
                      {addr.isDefault && (
                        <View style={styles.defaultPill}>
                          <Text style={styles.defaultPillText}>{t('DEFAULT')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.addrLine} numberOfLines={2}>{addrLine}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable onPress={() => setShowForm(true)} style={styles.addNewBtn}>
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#FF5C00" />
            <Text style={styles.addNewText}>{t('Add New Address')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(13,13,13,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' },
  doneBtn: { padding: 4 },
  doneText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FF5C00' },
  list: { maxHeight: 260 },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 6,
  },
  addrRowActive: { backgroundColor: '#FFF0E8', borderColor: '#FFD7C2' },
  addrLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#0D0D0D' },
  addrLine: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  defaultPill: { backgroundColor: '#FFF0E8', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  defaultPillText: { fontFamily: 'Inter_700Bold', fontSize: 8, color: '#FF5C00', letterSpacing: 0.5 },
  addNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#FF5C00',
  },
  addNewText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FF5C00' },
  labelRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  labelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
  },
  labelChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#6B6B6B' },
  currentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFF0E8',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  currentBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FF5C00' },
  fieldLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, color: '#6B6B6B', marginBottom: 6 },
  inputWrap: { backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
  input: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D0D0D', paddingVertical: 12 },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  previewText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#1A5C2A', flex: 1 },
  formActions: { flexDirection: 'row', gap: 10 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#FF5C00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFFFFF' },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#6B6B6B' },
});
