import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert,
  TextInput
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { apiClient } from '../../../api/client';
import { useT } from '../../../utils/i18n';

const ORANGE = '#FF5C00';

const CATEGORIES = [
  'PLUMBER', 'ELECTRICIAN', 'CARPENTER', 'MAID', 'DRIVER',
  'PAINTER', 'AC_TECHNICIAN', 'PEST_CONTROL', 'GARDENER',
  'COOK', 'TUTOR', 'SECURITY_GUARD',
];

const PRICE_UNITS = ['per visit', 'per hour', 'per day', 'fixed'];

export default function CreateJob() {
  const router = useRouter();
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('per visit');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [skills, setSkills] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title || title.length < 3) errs.title = t('Title must be at least 3 characters');
    if (!description || description.length < 10) errs.description = t('Description must be at least 10 characters');
    if (!category) errs.category = t('Select a category');
    if (!price || isNaN(Number(price)) || Number(price) <= 0) errs.price = t('Enter a valid price');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        category,
        price: Number(price),
        priceUnit,
      };
      if (city.trim()) payload.city = city.trim();
      if (pincode.trim()) payload.pincode = pincode.trim();
      if (estimatedHours) payload.estimatedHours = Number(estimatedHours);
      if (skills.trim()) payload.skills = skills.split(',').map(s => s.trim()).filter(Boolean);

      await apiClient.post('/jobs', payload);
      Alert.alert(t('Job Posted!'), t('Your job listing is now live.'), [
        { text: t('OK'), onPress: () => router.back() }
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || t('Failed to post job');
      Alert.alert(t('Error'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (t: string) => void,
    options?: {
      placeholder?: string,
      error?: string,
      multiline?: boolean,
      numberOfLines?: number,
      keyboardType?: 'default' | 'numeric',
      maxLength?: number,
    }
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputWrapper, options?.error && styles.inputError]}>
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
      {options?.error && <Text style={styles.errorText}>{options.error}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Post a Job')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <KeyboardAwareScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
        >
          {/* Hero Icon */}
          <View style={styles.heroSection}>
            <View style={styles.heroRing}>
              <MaterialCommunityIcons name="wrench" size={40} color="#CCC" />
            </View>
            <Text style={styles.heroSub}>{t('Fill in the details below')}</Text>
          </View>

          {/* Category Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{t('Service Category *')}</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => { setCategory(cat); setErrors(prev => ({ ...prev, category: '' })); }}
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
            {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}
          </View>

          {/* Title */}
          {renderInput(t('Job Title *'), title, (t) => { setTitle(t); setErrors(prev => ({ ...prev, title: '' })); }, {
            placeholder: t('e.g. Need plumbing repair in bathroom'),
            error: errors.title,
            maxLength: 100,
          })}

          {/* Description */}
          {renderInput(t('Description *'), description, (t) => { setDescription(t); setErrors(prev => ({ ...prev, description: '' })); }, {
            placeholder: t('Describe the job in detail...'),
            error: errors.description,
            multiline: true,
            numberOfLines: 4,
            maxLength: 2000,
          })}

          {/* Price Row */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 6 }}>
              {renderInput(t('Price (₹) *'), price, (t) => { setPrice(t); setErrors(prev => ({ ...prev, price: '' })); }, {
                placeholder: t('e.g. 500'),
                error: errors.price,
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
            placeholder: t('e.g. repair, installation, wiring'),
          })}

          <View style={{ height: 24 }} />

          {/* Submit Button */}
          <Pressable
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <Text style={styles.submitButtonText}>{t('Posting...')}</Text>
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle" size={22} color="#fff" />
                <Text style={styles.submitButtonText}>{t('Post Job')}</Text>
              </>
            )}
          </Pressable>

          <View style={{ height: 40 }} />
        </KeyboardAwareScrollView>
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
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heroRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 13,
    color: '#999',
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
  inputError: {
    borderColor: '#D32F2F',
  },
  input: {
    fontSize: 15,
    color: '#0D0D0D',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter',
  },
  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 4,
    marginLeft: 4,
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
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    elevation: 3,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});