import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useT } from '../../../utils/i18n';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../../api/client';
import { useToast } from '../../../components/ui/ToastProvider';
import { DocumentScanner } from '../../../components/ui/DocumentScanner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SkeletonVerificationIntroBody } from '../../../components/ui/SkeletonScreenLayouts';

type Step = 'INTRO' | 'CONSENT' | 'SELECT_ID' | 'FRONT' | 'BACK' | 'SELFIE' | 'REVIEW';

export default function WorkerVerificationWizard() {
  const t = useT();
  const router = useRouter();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('INTRO');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // State
  const [consentGranted, setConsentGranted] = useState(false);
  const [proofType, setProofType] = useState<string | null>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [scannerSide, setScannerSide] = useState<'FRONT' | 'BACK' | 'SELFIE' | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      // Also check if there's an IN_PROGRESS or RESUBMISSION_REQUIRED draft
      const [cfgRes, currRes] = await Promise.all([
        apiClient.get('/workers/verification/config'),
        apiClient.get('/workers/verification/current')
      ]);
      setConfig(cfgRes.data?.data);
      
      const curr = currRes.data?.data;
      if (curr && curr.status === 'IN_PROGRESS') {
        setSubmission(curr);
        setProofType(curr.proofType);
        setConsentGranted(true); // Already consented if draft exists
        // Pre-fill previously uploaded sides if they exist
        curr.docs?.forEach((d: any) => {
          if (d.side === 'FRONT') setFrontUri('uploaded'); // Placeholder since we can't show private URLs easily here
          if (d.side === 'BACK') setBackUri('uploaded');
          if (d.side === 'SELFIE') setSelfieUri('uploaded');
        });
        setStep('SELECT_ID'); // Can skip intro if they have a draft
      } else if (curr && (curr.status === 'PENDING_REVIEW' || curr.status === 'APPROVED')) {
        Alert.alert(t('Verification status'), t('You already have a verification submission that is pending review or approved.'), [
          { text: t('OK'), onPress: () => router.back() }
        ]);
      }
    } catch (e: any) {
      showToast({ message: e?.message || t('Failed to load configuration'), type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (selectedProofType: string) => {
    setActionLoading(true);
    try {
      const res = await apiClient.post('/workers/verification/start', { proofType: selectedProofType });
      setSubmission(res.data?.data);
      setProofType(selectedProofType);
      setStep('FRONT');
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed to start verification'), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const captureImage = async (side: 'FRONT' | 'BACK' | 'SELFIE') => {
    setScannerSide(side);
  };

  const handleScannerCapture = (uri: string) => {
    if (scannerSide === 'FRONT') setFrontUri(uri);
    if (scannerSide === 'BACK') setBackUri(uri);
    if (scannerSide === 'SELFIE') setSelfieUri(uri);
    setScannerSide(null);
  };

  const handleScannerCancel = () => {
    setScannerSide(null);
  };

  const uploadDocument = async (side: 'FRONT' | 'BACK' | 'SELFIE', uri: string) => {
    setActionLoading(true);
    try {
      if (uri === 'uploaded') return; // Already uploaded from previous draft

      const fd = new FormData();
      fd.append('submissionId', submission.id);
      fd.append('side', side);
      fd.append('file', { uri, type: 'image/jpeg', name: `${side}.jpg` } as any);

      await apiClient.post('/workers/verification/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (e: any) {
      throw new Error(e?.response?.data?.error || t('Upload failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleNextFromCapture = async (currentSide: 'FRONT' | 'BACK' | 'SELFIE') => {
    try {
      if (currentSide === 'FRONT') {
        if (!frontUri) return showToast({ message: t('Please capture the front of your document'), type: 'error' });
        await uploadDocument('FRONT', frontUri);
        const sides = config.proofTypes[proofType!].sides;
        if (sides.includes('BACK')) setStep('BACK');
        else setStep('SELFIE');
      } else if (currentSide === 'BACK') {
        if (!backUri) return showToast({ message: t('Please capture the back of your document'), type: 'error' });
        await uploadDocument('BACK', backUri);
        setStep('SELFIE');
      } else if (currentSide === 'SELFIE') {
        if (!selfieUri) return showToast({ message: t('Please capture a selfie'), type: 'error' });
        await uploadDocument('SELFIE', selfieUri);
        setStep('REVIEW');
      }
    } catch (e: any) {
      showToast({ message: e.message, type: 'error' });
    }
  };

  const handleSubmit = async () => {
    setActionLoading(true);
    try {
      await apiClient.post('/workers/verification/submit', {
        submissionId: submission.id,
        consentGranted,
        consentVersion: config.consentVersion,
        consentPolicyVersion: config.policyVersion,
      });
      showToast({ message: t('Verification submitted successfully!'), type: 'success' });
      router.back();
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Submission failed'), type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F5F0E8', paddingBottom: Math.max(insets.bottom, 24) }}>
        <Stack.Screen options={{ title: t('Verification'), headerShadowVisible: false }} />
        <SkeletonVerificationIntroBody />
      </View>
    );
  }

  if (scannerSide) {
    return (
      <DocumentScanner
        side={scannerSide}
        onCapture={handleScannerCapture}
        onCancel={handleScannerCancel}
      />
    );
  }

  const renderIntro = () => (
    <View style={{ flex: 1, padding: 24, paddingTop: 40 }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF0E8', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
        <MaterialCommunityIcons name="shield-check" size={40} color="#FF5C00" />
      </View>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#0D0D0D', marginBottom: 12 }}>
        {t('Verify your identity')}
      </Text>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 16, color: '#6B6B6B', marginBottom: 32, lineHeight: 24 }}>
        {t('Verification helps customers know that the worker accepting their booking has submitted identity information for review.')}
      </Text>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#0D0D0D', marginBottom: 16 }}>
        {t("You'll need:")}
      </Text>
      <View style={{ gap: 16, marginBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <MaterialCommunityIcons name="card-account-details-outline" size={24} color="#FF5C00" />
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}>{t('Government-issued ID')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <MaterialCommunityIcons name="camera-outline" size={24} color="#FF5C00" />
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}>{t('Clear photo/scan of the document')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <MaterialCommunityIcons name="face-recognition" size={24} color="#FF5C00" />
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D' }}>{t('Selfie')}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        style={{ backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
        onPress={() => setStep('CONSENT')}
      >
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFF' }}>{t('Continue')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderConsent = () => (
    <View style={{ flex: 1, padding: 24, paddingTop: 40 }}>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#0D0D0D', marginBottom: 12 }}>
        {t('Privacy & Consent')}
      </Text>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#6B6B6B', marginBottom: 24, lineHeight: 22 }}>
        {t('We need to collect your identity document and selfie for verification purposes. This information will be securely stored and reviewed by authorized administrators.')}
      </Text>
      <View style={{ backgroundColor: '#F5F5F5', padding: 16, borderRadius: 12, marginBottom: 24 }}>
        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#444', lineHeight: 20 }}>
          {t('By proceeding, you consent that the document and selfie will be submitted for identity verification. We handle your information according to KaamWala\'s Privacy Policy.')}
        </Text>
      </View>
      <TouchableOpacity 
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 40 }}
        onPress={() => setConsentGranted(!consentGranted)}
      >
        <MaterialCommunityIcons name={consentGranted ? 'checkbox-marked' : 'checkbox-blank-outline'} size={28} color={consentGranted ? '#FF5C00' : '#CCC'} />
        <Text style={{ flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, color: '#0D0D0D' }}>
          {t('I understand and consent to submitting my identity document and selfie for verification.')}
        </Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        style={{ backgroundColor: consentGranted ? '#FF5C00' : '#E0E0E0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
        disabled={!consentGranted}
        onPress={() => setStep('SELECT_ID')}
      >
        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: consentGranted ? '#FFF' : '#888' }}>{t('Agree and Continue')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSelectId = () => (
    <View style={{ flex: 1, padding: 24, paddingTop: 40 }}>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#0D0D0D', marginBottom: 12 }}>
        {t('Select ID Type')}
      </Text>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#6B6B6B', marginBottom: 24 }}>
        {t('Choose the government-issued document you want to submit.')}
      </Text>
      <View style={{ gap: 12 }}>
        {Object.entries(config.proofTypes).map(([key, val]: [string, any]) => (
          <TouchableOpacity
            key={key}
            style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#EEE', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF' }}
            onPress={() => handleStart(key)}
            disabled={actionLoading}
          >
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 16, color: '#0D0D0D' }}>{t(val.label)}</Text>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#CCC" />
          </TouchableOpacity>
        ))}
      </View>
      {actionLoading && <ActivityIndicator size="large" color="#FF5C00" style={{ marginTop: 24 }} />}
    </View>
  );

  const renderCapture = (side: 'FRONT' | 'BACK' | 'SELFIE', title: string, uri: string | null) => (
    <View style={{ flex: 1, padding: 24, paddingTop: 40 }}>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#0D0D0D', marginBottom: 12 }}>{title}</Text>
      <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#6B6B6B', marginBottom: 24 }}>
        {side === 'SELFIE' ? t('Make sure your face is clearly visible with good lighting.') : t('Place the document within the frame. Ensure good lighting and readability.')}
      </Text>

      <View style={{ width: '100%', height: side === 'SELFIE' ? 300 : 220, backgroundColor: '#F5F5F5', borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
        {uri ? (
          uri === 'uploaded' ? (
            <View style={{ alignItems: 'center' }}>
              <MaterialCommunityIcons name="check-circle" size={48} color="#2E7D32" />
              <Text style={{ fontFamily: 'Inter_500Medium', color: '#2E7D32', marginTop: 8 }}>{t('Already Uploaded')}</Text>
            </View>
          ) : (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          )
        ) : (
          <MaterialCommunityIcons name="camera-plus" size={48} color="#CCC" />
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity
          style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FF5C00', alignItems: 'center' }}
          onPress={() => captureImage(side)}
        >
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 15, color: '#FF5C00' }}>{uri ? t('Retake') : t('Open Camera')}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }} />
      <TouchableOpacity
        style={{ backgroundColor: uri ? '#FF5C00' : '#E0E0E0', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
        disabled={!uri || actionLoading}
        onPress={() => handleNextFromCapture(side)}
      >
        {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: uri ? '#FFF' : '#888' }}>{t('Use Photo & Continue')}</Text>}
      </TouchableOpacity>
    </View>
  );

  const renderReview = () => (
    <View style={{ flex: 1, padding: 24, paddingTop: 40 }}>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#0D0D0D', marginBottom: 24 }}>
        {t('Review verification')}
      </Text>
      
      <View style={{ backgroundColor: '#F9F9F9', borderRadius: 12, padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('ID Type')}</Text>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{t(config.proofTypes[proofType!].label)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('Document Front')}</Text>
          <MaterialCommunityIcons name="check-circle" size={20} color="#2E7D32" />
        </View>
        {config.proofTypes[proofType!].sides.includes('BACK') && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('Document Back')}</Text>
            <MaterialCommunityIcons name="check-circle" size={20} color="#2E7D32" />
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('Selfie')}</Text>
          <MaterialCommunityIcons name="check-circle" size={20} color="#2E7D32" />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#6B6B6B' }}>{t('Consent Provided')}</Text>
          <MaterialCommunityIcons name="check-circle" size={20} color="#2E7D32" />
        </View>
      </View>

      <View style={{ flex: 1 }} />
      <TouchableOpacity
        style={{ backgroundColor: '#FF5C00', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
        disabled={actionLoading}
        onPress={handleSubmit}
      >
        {actionLoading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFF' }}>{t('Submit for Verification')}</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#FFF', paddingBottom: Math.max(insets.bottom, 24) }}>
      <Stack.Screen options={{ title: t('Verification'), headerShadowVisible: false }} />
      {step === 'INTRO' && renderIntro()}
      {step === 'CONSENT' && renderConsent()}
      {step === 'SELECT_ID' && renderSelectId()}
      {step === 'FRONT' && renderCapture('FRONT', t('Front of document'), frontUri)}
      {step === 'BACK' && renderCapture('BACK', t('Back of document'), backUri)}
      {step === 'SELFIE' && renderCapture('SELFIE', t('Take a selfie'), selfieUri)}
      {step === 'REVIEW' && renderReview()}
    </View>
  );
}
