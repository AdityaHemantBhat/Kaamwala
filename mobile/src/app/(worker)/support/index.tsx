import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Modal, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiClient } from '../../../api/client';
import { useToast } from '../../../components/ui/ToastProvider';
import { SkeletonSupportListBody } from '../../../components/ui/SkeletonScreenLayouts';
import { useAuthStore } from '../../../store/auth.store';
import { useT } from '../../../utils/i18n';

const STATUS_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  open:       { icon: 'clock-outline',        color: '#FF5C00', bg: '#FFF0E8' },
  in_progress:{ icon: 'progress-wrench',       color: '#2196F3', bg: '#E3F2FD' },
  resolved:   { icon: 'check-circle-outline',  color: '#4CAF50', bg: '#E8F5E9' },
  closed:     { icon: 'close-circle-outline',  color: '#9E9E9E', bg: '#F5F0E8' },
};

export default function WorkerSupport() {
  const router = useRouter();
  const t = useT();
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');


  const load = useCallback(async () => {
    try {
      const r = await apiClient.get('/support');
      setTickets(r.data?.data || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTicket = async () => {
    // Backend zod minimums (subject ≥3, description ≥10) — mirror them client-side.
    // Shown inline in the modal, not as a toast: the Modal window renders above the
    // app view tree, so a toast is invisible while the modal is open.
    if (subject.trim().length < 3) {
      setFormError(t('Title must be at least 3 characters'));
      return;
    }
    if (description.trim().length < 10) {
      setFormError(t('Description must be at least 10 characters'));
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError(t('Enter a valid email'));
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await apiClient.post('/support', { subject, description, email: email.trim() || undefined });
      showToast({ message: t('Ticket created'), type: 'success' });
      setShowCreate(false); setSubject(''); setDescription(''); setEmail(''); setFormError('');
      load();
    } catch (e: any) {
      // Inline too — the Modal renders above the toast, so it wouldn't be visible.
      setFormError(e?.response?.data?.error || t('Failed to create ticket'));
    } finally { setSubmitting(false); }
  };

  const openCreate = () => { setShowCreate(true); setEmail(user?.email || ''); setFormError(''); };
  const closeCreate = () => { setShowCreate(false); setFormError(''); };



  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#0D0D0D" />
        </Pressable>
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0D0D0D', flex: 1, marginLeft: 12 }}>{t('Support')}</Text>
        <Pressable onPress={openCreate} style={{ backgroundColor: '#FF5C00', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
          <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: '#FFF' }}>{t('New Ticket')}</Text>
        </Pressable>
      </View>

      {loading ? (
        <SkeletonSupportListBody />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#0D0D0D" />}>
          {tickets.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' }}>
                <MaterialCommunityIcons name="headset" size={36} color="#C8C0B0" />
              </View>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 17, color: '#6B6B6B' }}>{t('No tickets yet')}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#9E9E9E', textAlign: 'center', paddingHorizontal: 40 }}>
                {t('Having an issue? Create a support ticket and our team will help you out.')}
              </Text>
            </View>
          ) : tickets.map((ticket: any) => {
            const s = STATUS_STYLE[ticket.status] || STATUS_STYLE.open;
            return (
              <Pressable key={ticket.id} style={{ backgroundColor: '#FFF', borderRadius: 12, elevation: 1, marginBottom: 10, padding: 16 }}
                onPress={() => router.push(`/(worker)/support/${ticket.id}` as any)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D', flex: 1 }} numberOfLines={1}>{ticket.subject}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: s.bg }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 9, color: s.color }}>{t(ticket.status)}</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', lineHeight: 17 }} numberOfLines={2}>{ticket.description}</Text>
                <Text style={{ fontFamily: 'SpaceMono_400Regular', fontSize: 9, color: '#B0A898', marginTop: 6 }}>
                  {new Date(ticket.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Create Ticket Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={closeCreate}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCreate} />
          {/* Pin the title, chips, and action buttons; only the fields scroll, so
              the sheet is never clipped by the keyboard. automaticOffset is off:
              its viewPositionInWindow measurement misbehaves inside an RN Modal
              and over-shifts the sheet, cutting off the top. */}
          <KeyboardAvoidingView behavior="padding" automaticOffset={false} style={{ maxHeight: '85%', flexShrink: 1 }}>
          {/* flexShrink (not flex:1) — the sheet must cap at the KAV's 85% max
              height on short screens and let the fields scroll, or its top
              (title/chips) gets clipped and the sheet sits too far down. */}
          <View style={{ flexShrink: 1, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 24, paddingHorizontal: 24, paddingBottom: 24 }}>
            <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#0D0D0D', marginBottom: 16 }}>{t('Create Ticket')}</Text>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 40 }} contentContainerStyle={{ gap: 8 }}>
              {(user?.role === 'WORKER' 
                ? [t('Why did I get banned?'), t('Payment missing / delayed'), t('App not working'), t('Problem with customer'), t('How to upgrade to Pro?')]
                : [t('App not working'), t('Money deducted, no booking'), t('Worker didn\'t show up'), t('Worker behaved badly'), t('Refund request')]
              ).map((s, i) => (
                <Pressable 
                  key={i} 
                  onPress={() => setSubject(s)} 
                  style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: subject === s ? '#FF5C00' : '#F5F5F5', borderRadius: 20, borderWidth: 1, borderColor: subject === s ? '#FF5C00' : '#EEE', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: subject === s ? '#FFF' : '#666' }}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Plain ScrollView — the outer KeyboardAvoidingView already lifts the
                whole sheet above the keyboard, so letting this scroll also pan to
                the focused field double-shifts it and the inputs jump up. */}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1, marginBottom: 16 }}>
            <TextInput style={{ borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0D0D0D', marginBottom: 12 }}
              placeholder={t('Contact email (optional)')} placeholderTextColor="#AAA" value={email} onChangeText={(v) => { setEmail(v); setFormError(''); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={200} />
            <TextInput style={{ borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Inter_500Medium', color: '#0D0D0D', marginBottom: 12 }}
              placeholder={t('Custom Subject')} placeholderTextColor="#AAA" value={subject} onChangeText={(v) => { setSubject(v); setFormError(''); }} maxLength={200} />
            <TextInput style={{ borderWidth: 1.5, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 14, fontFamily: 'Inter_400Regular', color: '#0D0D0D', minHeight: 100, textAlignVertical: 'top' }}
              placeholder={t('Describe your issue...')} placeholderTextColor="#AAA" multiline value={description} onChangeText={(v) => { setDescription(v); setFormError(''); }} maxLength={5000} />
            </ScrollView>
            {formError ? (
              <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#E53935', marginBottom: 10 }}>{formError}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={closeCreate} style={{ flex: 1, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DDD', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: '#666' }}>{t('Cancel')}</Text>
              </Pressable>
              <Pressable onPress={createTicket} disabled={!subject.trim() || !description.trim() || submitting} style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#FF5C00', alignItems: 'center', opacity: (!subject.trim() || !description.trim() || submitting) ? 0.5 : 1 }}>
                {submitting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFF' }}>{t('Submit')}</Text>}
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
