import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, TextInput
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../api/client';
import { socketService } from '../../../api/socket';
import { useT } from '../../../utils/i18n';

const ORANGE = '#FF5C00';

const CATEGORIES = [
  'PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER',
  'PAINTER', 'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER',
  'COOK', 'TUTOR', 'SECURITY_GUARD',
];

const PRICE_UNITS = ['per visit', 'per hour', 'per day', 'fixed'];

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'COMPLETED'];

export default function EditJob() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('per visit');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [skills, setSkills] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadJob() {
      try {
        const res = await apiClient.get(`/jobs/${id}`);
        const job = res.data?.data;
        if (job) {
          setTitle(job.title || '');
          setDescription(job.description || '');
          setCategory(job.category || '');
          setPrice(String(job.price || ''));
          setPriceUnit(job.priceUnit || 'per visit');
          setCity(job.city || '');
          setPincode(job.pincode || '');
          setEstimatedHours(job.estimatedHours ? String(job.estimatedHours) : '');
          setSkills((job.skills || []).join(', '));
          setStatus(job.status || 'ACTIVE');
        }
      } catch (e) {
        Alert.alert(t('Error'), t('Failed to load job details'));
        router.back();
      } finally {
        setLoading(false);
      }
    }
    loadJob();
  }, [id]);

  const handleSave = async () => {
    if (!title || title.length < 3) {
      return Alert.alert(t('Validation'), t('Title must be at least 3 characters'));
    }
    if (!description || description.length < 10) {
      return Alert.alert(t('Validation'), t('Description must be at least 10 characters'));
    }
    if (!category) {
      return Alert.alert(t('Validation'), t('Select a category'));
    }
    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      return Alert.alert(t('Validation'), t('Enter a valid price'));
    }

    setSaving(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        category,
        price: Number(price),
        priceUnit,
        status,
      };
      if (city.trim()) payload.city = city.trim();
      if (pincode.trim()) payload.pincode = pincode.trim();
      if (estimatedHours) payload.estimatedHours = Number(estimatedHours);
      if (skills.trim()) payload.skills = skills.split(',').map(s => s.trim()).filter(Boolean);

      await apiClient.put(`/jobs/${id}`, payload);
      Alert.alert(t('Saved!'), t('Job listing updated.'), [
        { text: t('OK'), onPress: () => router.back() }
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || t('Failed to update');
      Alert.alert(t('Error'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('Delete Job'),
      t('Are you sure? This cannot be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiClient.delete(`/jobs/${id}`);
              router.back();
            } catch (e: any) {
              Alert.alert(t('Error'), t('Failed to delete'));
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (t: string) => void,
    options?: {
      placeholder?: string,
      multiline?: boolean,
      numberOfLines?: number,
      keyboardType?: 'default' | 'numeric',
      maxLength?: number,
    }
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            options?.multiline && { minHeight: 100, textAlignVertical: 'top', paddingTop: 14 }
          ]}
          placeholder={options?.placeholder || ''}
          placeholderTextColor="#BBB"
          value={value}
          onChangeText={onChangeText}
          multiline={options?.multiline}
          numberOfLines={options?.numberOfLines || 1}
          keyboardType={options?.keyboardType || 'default'}
          maxLength={options?.maxLength}
        />
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Edit Job')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Edit Job')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          {/* Status Indicator */}
          <View style={styles.statusBar}>
            <View style={[
              styles.statusDot,
              { backgroundColor: status === 'ACTIVE' ? '#2E7D32' : status === 'INACTIVE' ? '#E65100' : '#1565C0' }
            ]} />
            <Text style={styles.statusLabel}>{t('Status')}: {t(status)}</Text>
          </View>

          {/* Status Toggle */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('Change Status')}</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map(s => (
                <Pressable
                  key={s}
                  style={[styles.statusPill, status === s && styles.statusPillActive]}
                  onPress={() => setStatus(s)}
                >
                  <Text style={[styles.statusPillText, status === s && styles.statusPillTextActive]}>
                    {t(s)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Category Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('Service Category')}</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[
                    styles.categoryChipText,
                    category === cat && styles.categoryChipTextActive,
                  ]}>
                    {t(cat.replace(/_/g, ' '))}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Title */}
          {renderInput(t('Job Title'), title, setTitle, {
            placeholder: t('e.g. Need plumbing repair'),
            maxLength: 100,
          })}

          {/* Description */}
          {renderInput(t('Description'), description, setDescription, {
            placeholder: t('Describe the job...'),
            multiline: true,
            numberOfLines: 4,
            maxLength: 2000,
          })}

          {/* Price Row */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 6 }}>
              {renderInput(t('Price (₹)'), price, setPrice, {
                placeholder: t('e.g. 500'),
                keyboardType: 'numeric',
              })}
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={styles.inputLabel}>{t('Price Unit')}</Text>
              <View style={styles.unitRow}>
                {PRICE_UNITS.map(unit => (
                  <Pressable
                    key={unit}
                    style={[styles.unitPill, priceUnit === unit && styles.unitPillActive]}
                    onPress={() => setPriceUnit(unit)}
                  >
                    <Text style={[styles.unitPillText, priceUnit === unit && styles.unitPillTextActive]}>
                      {t(unit)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Location */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 6 }}>
              {renderInput(t('City'), city, setCity, { placeholder: t('e.g. Mumbai') })}
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              {renderInput(t('Pincode'), pincode, setPincode, { placeholder: t('e.g. 400001'), keyboardType: 'numeric', maxLength: 6 })}
            </View>
          </View>

          {/* Estimated Hours */}
          {renderInput(t('Estimated Hours (optional)'), estimatedHours, setEstimatedHours, {
            placeholder: t('e.g. 4'),
            keyboardType: 'numeric',
          })}

          {/* Skills */}
          {renderInput(t('Skills (comma separated)'), skills, setSkills, {
            placeholder: t('e.g. repair, installation'),
          })}

          <View style={{ height: 24 }} />

          {/* Save Button */}
          <Pressable
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving || deleting}
          >
            <MaterialCommunityIcons name="content-save" size={22} color="#fff" />
            <Text style={styles.saveButtonText}>{saving ? t('Saving...') : t('Save Changes')}</Text>
          </Pressable>

          <View style={{ height: 14 }} />

          {/* Delete Button */}
          <Pressable
            style={[styles.deleteButton, (deleting || saving) && styles.buttonDisabled]}
            onPress={handleDelete}
            disabled={deleting || saving}
          >
            <MaterialCommunityIcons name="delete-outline" size={22} color="#D32F2F" />
            <Text style={styles.deleteButtonText}>{deleting ? t('Deleting...') : t('Delete Job Posting')}</Text>
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Poppins',
    letterSpacing: 0.5,
    color: '#0D0D0D',
    textTransform: 'uppercase',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    borderWidth: 1.5,
    borderColor: '#E8E4DC',
  },
  input: {
    fontSize: 15,
    color: '#0D0D0D',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8E4DC',
    elevation: 1,
  },
  statusPillActive: {
    backgroundColor: '#0D0D0D',
    borderColor: '#0D0D0D',
    elevation: 2,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  statusPillTextActive: {
    color: '#FFFFFF',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    elevation: 1,
    borderWidth: 1.5,
    borderColor: '#E8E4DC',
  },
  categoryChipActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
    elevation: 2,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  unitPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8E4DC',
    elevation: 1,
  },
  unitPillActive: {
    backgroundColor: '#0D0D0D',
    borderColor: '#0D0D0D',
  },
  unitPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
  },
  unitPillTextActive: {
    color: '#FFFFFF',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    elevation: 3,
    gap: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: '#D32F2F',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D32F2F',
    letterSpacing: 0.5,
  },
});