import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useT } from '../../utils/i18n';
import { useToast } from './ToastProvider';
import { apiClient } from '../../api/client';

interface RebookSheetProps {
  visible: boolean;
 /** A booking-like object to pre-fill from — either an enriched `rebookWorkers`
 * item (home carousel) or a full booking from `GET /bookings`. */
  source: any;
  onClose: () => void;
  onSuccess?: () => void;
}

type DayKey = 'today' | 'tomorrow' | 'dayAfter' | 'thisWeek';
type SlotKey = 'morning' | 'afternoon' | 'evening';

const DAY_OPTIONS: { key: DayKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'dayAfter', label: 'Day after' },
  { key: 'thisWeek', label: 'This week' },
];

const SLOT_OPTIONS: { key: SlotKey; label: string; hour: number }[] = [
  { key: 'morning', label: 'Morning', hour: 10 },
  { key: 'afternoon', label: 'Afternoon', hour: 14 },
  { key: 'evening', label: 'Evening', hour: 18 },
];

/** Date (midnight) for a day option. `thisWeek` = the upcoming Saturday. */
function dayDate(key: DayKey): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'today') return d;
  if (key === 'tomorrow') return new Date(d.getTime() + 86400000);
  if (key === 'dayAfter') return new Date(d.getTime() + 2 * 86400000);
  const sat = new Date(d);
  const diff = (6 - d.getDay() + 7) % 7;
  sat.setDate(d.getDate() + diff);
  return sat;
}

const formatCategory = (value?: string): string => {
  if (!value) return '';
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

export function RebookSheet({ visible, source, onClose, onSuccess }: RebookSheetProps) {
  const t = useT();
  const { showToast } = useToast();

  const [worker, setWorker] = useState<any>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayKey>('tomorrow');
  const [selectedSlot, setSelectedSlot] = useState<SlotKey>('afternoon');
  const [loadingWorker, setLoadingWorker] = useState(false);
  const [creating, setCreating] = useState(false);

  // Load fresh worker details + saved addresses whenever the sheet opens.
  useEffect(() => {
    if (!visible || !source) return;
    let cancelled = false;
    setLoadingWorker(true);
    setSelectedDay('tomorrow');
    setSelectedSlot('afternoon');

    (async () => {
      try {
        const workerId = source.workerId || source.worker?.id;
        const [wRes, aRes] = await Promise.all([
          workerId ? apiClient.get(`/workers/${workerId}`) : Promise.resolve({ data: { data: null } }),
          apiClient.get('/addresses'),
        ]);
        if (cancelled) return;

        const w = wRes.data?.data || null;
        const addrs = Array.isArray(aRes.data?.data) ? aRes.data.data : Array.isArray(aRes.data) ? aRes.data : [];

        setWorker(w);
        setAddresses(addrs);

        // Pre-select the service that matches the past booking, else the first.
        const services = w?.services || [];
        const match = services.find(
          (s: any) => s.name?.toLowerCase() === source.serviceName?.toLowerCase()
        );
        setSelectedService(match || services[0] || null);

        // Pre-select the past booking's address when still saved, else default/first.
        let chosen =
          addrs.find((a: any) => a.id === source.address?.id) ||
          addrs.find((a: any) => a.isDefault) ||
          addrs[0] ||
          null;
        setSelectedAddressId(chosen?.id || null);
      } catch {
        // A failed lookup shouldn't leave the sheet stuck open with nothing to
        // book — surface it and close so the user can retry.
        if (!cancelled) {
          showToast({ message: t('Could not load booking details'), type: 'error' });
          onClose();
        }
      } finally {
        if (!cancelled) setLoadingWorker(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, source?.id]);

  // Reset transient state when the sheet closes.
  useEffect(() => {
    if (!visible) {
      setWorker(null);
      setAddresses([]);
      setSelectedService(null);
      setSelectedAddressId(null);
      setCreating(false);
    }
  }, [visible]);

  // Nothing to show until a source booking is supplied.
  if (!source) return null;

  const name = worker?.user?.name || source.worker?.name || t('Worker');
  const avatarUrl = worker?.user?.avatarUrl || source.worker?.avatarUrl;
  const category = formatCategory(worker?.category) || formatCategory(source.serviceCategory) || '';
  const price = selectedService?.basePrice ?? source.baseAmount ?? 0;
  const pricingUnit = selectedService?.priceUnit || source.pricingUnit || 'FLAT';

  const scheduleDisabled = (day: DayKey, slot: SlotKey): boolean => {
    const d = dayDate(day);
    const hour = SLOT_OPTIONS.find((s) => s.key === slot)!.hour;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0) < new Date();
  };

  const buildScheduledAt = (): string => {
    const d = dayDate(selectedDay);
    const hour = SLOT_OPTIONS.find((s) => s.key === selectedSlot)!.hour;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0).toISOString();
  };

  const handleConfirm = async () => {
    if (!source) return;
    if (!selectedAddressId) {
      showToast({ message: t('Please select an address'), type: 'error' });
      return;
    }
    if (scheduleDisabled(selectedDay, selectedSlot)) {
      showToast({ message: t('Please pick a future time'), type: 'error' });
      return;
    }
    setCreating(true);
    try {
      const payload = {
        workerId: worker?.userId || source.workerId || source.worker?.id,
        serviceCategory: worker?.category || source.serviceCategory || 'PLUMBER',
        serviceName: selectedService?.name || source.serviceName || 'General Service',
        description: 'Rebooked from previous booking',
        scheduledAt: buildScheduledAt(),
        baseAmount: selectedService?.basePrice ?? source.baseAmount ?? 300,
        pricingUnit,
        type: 'STANDARD', // force STANDARD — URGENT carries zero platform commission
        addressId: selectedAddressId,
        estimatedDuration: source.estimatedDuration || 60,
      };
      await apiClient.post('/bookings', payload);
      showToast({ message: t('Booking request sent successfully!'), type: 'success' });
      onClose();
      onSuccess?.();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to create booking'), type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {/* ── Worker header ── */}
            <View style={styles.workerRow}>
              <View style={styles.avatarCircle}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{(name || 'W')[0].toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.workerName}>{t('Book')} {name}</Text>
                <Text style={styles.workerCategory}>{category || t('Service provider')}</Text>
              </View>
              {loadingWorker && <ActivityIndicator size="small" color="#FF5C00" />}
            </View>

            {/* ── Service selection ── */}
            {worker?.services?.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{t('Select Service')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {worker.services.map((srv: any) => {
                    const active = selectedService?.id === srv.id;
                    return (
                      <Pressable
                        key={srv.id}
                        style={[styles.serviceChip, active && styles.serviceChipActive]}
                        onPress={() => setSelectedService(srv)}
                      >
                        <Text style={[styles.serviceChipName, active && styles.serviceChipNameActive]} numberOfLines={1}>{srv.name}</Text>
                        <Text style={[styles.serviceChipPrice, active && styles.serviceChipPriceActive]}>
                          ₹{srv.basePrice}{srv.priceUnit === 'PER_HOUR' ? '/hr' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* ── Address selection ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('Select address')}</Text>
              {addresses.length === 0 ? (
                <View style={styles.emptyRow}>
                  <MaterialCommunityIcons name="map-marker-off-outline" size={16} color="#9E9E9E" />
                  <Text style={styles.emptyRowText}>{t('No saved addresses')}</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {addresses.map((a: any) => {
                    const active = selectedAddressId === a.id;
                    return (
                      <Pressable
                        key={a.id}
                        style={[styles.addressChip, active && styles.addressChipActive]}
                        onPress={() => setSelectedAddressId(a.id)}
                      >
                        <MaterialCommunityIcons name="map-marker" size={14} color={active ? '#FF5C00' : '#9E9E9E'} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.addressLabel, active && styles.addressLabelActive]} numberOfLines={1}>
                            {a.label} · {a.line1}
                          </Text>
                          <Text style={styles.addressCity} numberOfLines={1}>{a.city}</Text>
                        </View>
                        {active && <MaterialCommunityIcons name="check-circle" size={16} color="#FF5C00" />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {/* ── Schedule chips ── */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t('When')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {DAY_OPTIONS.map((day) => {
                  const active = selectedDay === day.key;
                  const disabled = scheduleDisabled(day.key, selectedSlot);
                  return (
                    <Pressable
                      key={day.key}
                      style={[styles.dayChip, active && styles.dayChipActive, disabled && styles.chipDisabled]}
                      onPress={() => setSelectedDay(day.key)}
                      disabled={disabled}
                    >
                      <Text style={[styles.dayChipText, active && styles.dayChipTextActive, disabled && styles.chipTextDisabled]}>
                        {t(day.label)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {SLOT_OPTIONS.map((slot) => {
                  const active = selectedSlot === slot.key;
                  const disabled = scheduleDisabled(selectedDay, slot.key);
                  return (
                    <Pressable
                      key={slot.key}
                      style={[styles.slotChip, active && styles.slotChipActive, disabled && styles.chipDisabled]}
                      onPress={() => setSelectedSlot(slot.key)}
                      disabled={disabled}
                    >
                      <MaterialCommunityIcons
                        name={slot.key === 'morning' ? 'weather-sunset-up' : slot.key === 'afternoon' ? 'weather-sunny' : 'weather-night'}
                        size={14}
                        color={active ? '#FF5C00' : disabled ? '#C8C0B0' : '#6B6B6B'}
                      />
                      <Text style={[styles.slotChipText, active && styles.slotChipTextActive, disabled && styles.chipTextDisabled]}>
                        {t(slot.label)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* ── Price summary ── */}
            <View style={styles.priceRow}>
              <View>
                <Text style={styles.priceLabel}>{t('Estimated')}</Text>
                <Text style={styles.priceAmount}>
                  ₹{price.toLocaleString('en-IN')}{pricingUnit === 'PER_HOUR' ? '/hr' : ''}
                </Text>
              </View>
              <Text style={styles.priceNote}>{t('Worker confirms the final price')}</Text>
            </View>

            {/* ── Actions ── */}
            <Pressable
              style={[styles.confirmBtn, creating && styles.btnDisabled]}
              onPress={handleConfirm}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.confirmText}>{t('Send Booking Request')}</Text>
              )}
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={creating}>
              <Text style={styles.cancelText}>{t('Cancel')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    maxHeight: '82%',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  // flexShrink (not flex:1) so the sheet stays capped at maxHeight and the
  // body scrolls internally instead of pushing the sheet off-screen.
  body: {
    flexShrink: 1,
    flexGrow: 0,
  },

  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#F5F0E8' },
  workerName: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D' },
  workerCategory: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginTop: 2 },

  section: { marginBottom: 20 },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#0D0D0D',
    marginBottom: 10,
  },

  serviceChip: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FFF',
    minWidth: 130,
  },
  serviceChipActive: {
    borderColor: '#FF5C00',
    backgroundColor: '#FFF0E8',
  },
  serviceChipName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#0D0D0D',
  },
  serviceChipNameActive: { color: '#FF5C00' },
  serviceChipPrice: {
    fontFamily: 'SpaceMono_700Bold',
    fontSize: 13,
    color: '#0D0D0D',
    marginTop: 4,
  },
  serviceChipPriceActive: { color: '#FF5C00' },

  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FFF',
    minWidth: 200,
    maxWidth: 280,
  },
  addressChipActive: { borderColor: '#FF5C00', backgroundColor: '#FFF0E8' },
  addressLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#0D0D0D' },
  addressLabelActive: { color: '#FF5C00' },
  addressCity: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyRowText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#9E9E9E' },

  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F0E8',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayChipActive: { backgroundColor: '#FF5C00', borderColor: '#FF5C00' },
  dayChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B' },
  dayChipTextActive: { color: '#FFF' },

  slotChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#FFF',
  },
  slotChipActive: { borderColor: '#FF5C00', backgroundColor: '#FFF0E8' },
  slotChipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B' },
  slotChipTextActive: { color: '#FF5C00' },

  chipDisabled: { opacity: 0.45 },
  chipTextDisabled: { color: '#C8C0B0' },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9F9F9',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 14,
    marginBottom: 16,
  },
  priceLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E', marginBottom: 2 },
  priceAmount: { fontFamily: 'SpaceMono_700Bold', fontSize: 20, color: '#0D0D0D' },
  priceNote: { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#9E9E9E', maxWidth: 120, textAlign: 'right' },

  confirmBtn: {
    backgroundColor: '#FF5C00',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#FF5C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.6 },
  confirmText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFF' },

  cancelBtn: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' },
});
