import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useT } from '../../utils/i18n';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonCustomerProfile } from '../../components/ui/Skeleton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '../../api/client';
import { deleteUploadedImage } from '../../api/media';

const TIER_COLORS: Record<string, string> = { BRONZE: '#8B6B3D', SILVER: '#8A8A8A', GOLD: '#D4A017', PLATINUM: '#E5E4E2' };

export default function CustomerProfile() {
  const t = useT();
  const { user, updateUser } = useAuthStore();
  const router = useRouter();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editPhoto, setEditPhoto] = useState(user?.photoUrl || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const h = await apiClient.get('/home').catch(() => ({ data: { data: null } }));
      setProfile(h.data?.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  const tier = profile?.loyaltyTier || 'BRONZE';
  const pts = profile?.loyaltyPoints || 0;
  const tierMap: Record<string, number> = { BRONZE: 100, SILVER: 300, GOLD: 600 };
  const nextTier = tier === 'PLATINUM' ? 'MAX' : tierMap[tier] || 100;
  const progress = Math.min((pts / (typeof nextTier === 'number' ? nextTier : 600)) * 100, 100);

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!r.canceled && r.assets[0]) setEditPhoto(r.assets[0].uri);
  };

  const saveProfile = async () => {
    setSaving(true);
    const prevPhoto = user?.photoUrl;
    try {
      let finalPhotoUrl = editPhoto;

      // If it's a local file URI (from ImagePicker), upload it first
      if (editPhoto && editPhoto.startsWith('file://')) {
        const fd = new FormData();
        fd.append('file', { uri: editPhoto, type: 'image/jpeg', name: 'photo.jpg' } as any);
        fd.append('purpose', 'profile');
        const up = await apiClient.post('/upload', fd);
        finalPhotoUrl = up.data?.data?.url || editPhoto;
      }

      await apiClient.put('/auth/profile', { name: editName, photoUrl: finalPhotoUrl });
      updateUser({ name: editName, photoUrl: finalPhotoUrl } as any);
      setShowEdit(false);
      showToast({ message: t('Saved!'), type: 'success' });

      // Replacing the avatar orphans the old image — free its Cloudinary storage.
      if (prevPhoto && finalPhotoUrl && prevPhoto !== finalPhotoUrl) {
        deleteUploadedImage(prevPhoto);
      }
    } catch (e: any) {
      showToast({ message: e?.response?.data?.error || t('Failed'), type: 'error' });
    }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
        <SkeletonCustomerProfile />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 }}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/home')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#0D0D0D" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'flex-start', marginLeft: 12 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D' }}>{t('Profile')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#0D0D0D" />}>

        {/* Profile Header — tap to edit */}
        <Pressable onPress={() => { setEditPhoto(user?.photoUrl || ''); setEditName(user?.name || ''); setShowEdit(true); }}
          style={{ padding: 20, alignItems: 'center', gap: 12, paddingTop: 24 }}>
          <View style={{ position: 'relative' }}>
            {user?.photoUrl ? (
              <Image source={{ uri: user.photoUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
            ) : (
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 28, color: '#F5F0E8', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {(user?.name || 'C')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center', elevation: 3 }}>
              <MaterialCommunityIcons name="camera" size={14} color="#F5F0E8" />
            </View>
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: '#0D0D0D' }}>{user?.name || t('Customer')}</Text>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B' }}>{user?.phone || ''}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: `${TIER_COLORS[tier] || '#6B6B6B'}20` }}>
              <MaterialCommunityIcons name="shield-star" size={14} color={TIER_COLORS[tier] || '#6B6B6B'} />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: TIER_COLORS[tier] || '#6B6B6B', letterSpacing: 0.5 }}>{t(tier.charAt(0) + tier.slice(1).toLowerCase())}</Text>
            </View>
          </View>
        </Pressable>

        {/* Membership Card */}
        <View style={{ marginHorizontal: 20, marginBottom: 16, padding: 16, borderRadius: 16, backgroundColor: '#0D0D0D', elevation: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#F5F0E8', opacity: 0.6 }}>{t('Member Since')}</Text>
              <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 22, color: '#F5F0E8', letterSpacing: 1, marginTop: 4 }}>
                {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : t('N/A')}
              </Text>
            </View>
            <MaterialCommunityIcons name="account-check" size={24} color="#F5F0E8" style={{ opacity: 0.6 }} />
          </View>
        </View>

        {/* Stats Row */}
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[
            { v: profile?.completedBookings || 0, l: t('Bookings') },
            { v: `₹${profile?.totalSaved || 0}`, l: t('Saved') },
            { v: pts, l: t('Points') },
          ].map(s => (
            <View key={s.l} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FFFFFF', elevation: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#0D0D0D' }}>{s.v}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#6B6B6B', marginTop: 3 }}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Tier Progress */}
        {tier && (
          <View style={{ marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 12, backgroundColor: '#FFFFFF', elevation: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B' }}>{pts} {t('pts')}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B' }}>
                {typeof nextTier === "number" ? `${nextTier - pts} ${t("to")} ${t((Object.keys(TIER_COLORS)[Object.keys(TIER_COLORS).indexOf(tier) + 1] || "MAX").charAt(0).toUpperCase() + (Object.keys(TIER_COLORS)[Object.keys(TIER_COLORS).indexOf(tier) + 1] || "MAX").slice(1).toLowerCase())}` : t("MAX")}
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: '#E8E0D6', overflow: 'hidden' }}>
              <View style={{ width: `${progress}%`, height: '100%', borderRadius: 3, backgroundColor: TIER_COLORS[tier] || '#6B6B6B' }} />
            </View>
          </View>
        )}

        {/* Payments removed from profile per request */}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowEdit(false)} />
          {/* KeyboardAvoidingView lifts the sheet so the name field + Save stay
              visible while typing (edge-to-edge safe). */}
          <KeyboardAvoidingView behavior="padding" automaticOffset style={{ maxHeight: '85%' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', marginBottom: 24 }}>{t('Edit Profile')}</Text>

            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <Pressable onPress={pickImage} style={{ position: 'relative' }}>
                {editPhoto ? (
                  <Image source={{ uri: editPhoto }} style={{ width: 96, height: 96, borderRadius: 48 }} />
                ) : (
                  <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 36, color: '#F5F0E8', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {(user?.name || 'C')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: '#FF5C00', justifyContent: 'center', alignItems: 'center', elevation: 3 }}>
                  <MaterialCommunityIcons name="camera" size={16} color="#F5F0E8" />
                </View>
              </Pressable>
            </View>

            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B', marginBottom: 6, marginLeft: 2 }}>{t('Name')}</Text>
            <TextInput style={{ borderRadius: 12, backgroundColor: '#F5F0E8', padding: 14, fontFamily: 'Inter_400Regular', fontSize: 15, color: '#0D0D0D', marginBottom: 16 }}
              value={editName} onChangeText={setEditName} placeholder={t('Your name')} placeholderTextColor="#BDBDBD" />

            <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: '#6B6B6B', marginBottom: 6, marginLeft: 2 }}>{t('Phone')}</Text>
            <View style={{ borderRadius: 12, backgroundColor: '#EEEEEE', padding: 14, marginBottom: 16 }}>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: '#9E9E9E' }}>{user?.phone || ''}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable style={{ flex: 1, borderRadius: 24, backgroundColor: '#0D0D0D', paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: saving ? 0.7 : 1 }}
                onPress={saveProfile} disabled={saving}>
                {saving && <ActivityIndicator size="small" color="#F5F0E8" />}
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 14, color: '#F5F0E8' }}>{saving ? t('Saving...') : t('Save')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1, borderRadius: 24, borderWidth: 1, borderColor: '#BDBDBD', paddingVertical: 14, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setShowEdit(false)}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 14, color: '#0D0D0D' }}>{t('Cancel')}</Text>
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
