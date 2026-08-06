import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../../api/client';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '../../components/ui/ToastProvider';
import { SkeletonPortfolioBody } from '../../components/ui/SkeletonScreenLayouts';
import { useT } from '../../utils/i18n';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IMG_SIZE = SCREEN_WIDTH - 48;

export default function WorkerPortfolio() {
  const router = useRouter();
  const t = useT();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { loadPhotos(); }, []);

  async function loadPhotos() {
    try {
      const res = await apiClient.get('/workers/portfolio');
      setPhotos(res.data?.data || []);
    } catch (e) {  }
    finally { setLoading(false); }
  }

  const uploadPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;

      setUploading(true);
      const fd = new FormData();
      fd.append('file', { uri: result.assets[0].uri, type: 'image/jpeg', name: 'portfolio.jpg' } as any);
      fd.append('purpose', 'portfolio');
      const up = await apiClient.post('/upload', fd);
      const url = up.data?.data?.url || result.assets[0].uri;

      // Save as portfolio photo (both before/after same for now)
      await apiClient.post('/workers/portfolio', { beforeUrl: url, afterUrl: url, caption: 'My work' });
      showToast({ message: t('Photo added to portfolio'), type: 'success' });
      loadPhotos();
    } catch { showToast({ message: t('Upload failed'), type: 'error' }); }
    finally { setUploading(false); }
  };

  const removePhoto = (photo: any) => {
    Alert.alert(t('Remove photo'), t('Delete this photo from your portfolio?'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'), style: 'destructive',
        onPress: async () => {
          setDeletingId(photo.id);
          try {
            await apiClient.delete(`/workers/portfolio/${photo.id}`);
            showToast({ message: t('Photo removed'), type: 'success' });
            loadPhotos();
          } catch (e: any) {
            showToast({ message: e?.response?.data?.error || t('Failed to remove'), type: 'error' });
          } finally { setDeletingId(null); }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('Portfolio')}</Text>
      </View>

      {loading ? (
        <SkeletonPortfolioBody />
      ) : photos.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.heroRing}>
            <MaterialCommunityIcons name="image-plus" size={48} color="#0D0D0D" />
          </View>
          <Text style={styles.emptyTitle}>{t('No photos yet')}</Text>
          <Text style={styles.emptySub}>{t('Upload photos to showcase your work to customers')}</Text>
          <Pressable style={styles.uploadBtn} onPress={uploadPhoto} disabled={uploading} accessibilityRole="button" accessibilityLabel={t('Add photos')} accessibilityState={{ disabled: uploading }}>
            {uploading ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="camera" size={18} color="#FFFFFF" />}
            <Text style={styles.uploadBtnText}>{uploading ? t('Uploading...') : t('Upload Photos')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          {photos.map((photo, i) => (
            <View key={photo.id || i} style={{ backgroundColor: '#FFF', borderRadius: 12, elevation: 1, padding: 12, marginBottom: 16, position: 'relative' }}>
              {photo.beforeUrl && <Image source={{ uri: photo.beforeUrl }} style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 8 }} />}
              {photo.caption && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B' }}>{t(photo.caption)}</Text>}
              <Pressable style={styles.deleteBtn} onPress={() => removePhoto(photo)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('Remove photo')}>
                {deletingId === photo.id ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFF" />}
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.uploadBtnInline} onPress={uploadPhoto} disabled={uploading}>
            {uploading ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />}
            <Text style={styles.uploadBtnText}>{uploading ? t('Uploading...') : t('Add Photos')}</Text>
          </Pressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F0E8' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D', marginLeft: 4 },
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48 },
  loaderBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 8 },
  heroRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', elevation: 2, marginBottom: 16 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#6B6B6B' },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#A8A090', textAlign: 'center' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF5C00', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 24, marginTop: 16 },
  uploadBtnInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF5C00', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 24, alignSelf: 'center', marginTop: 8 },
  uploadBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#FFFFFF' },
  deleteBtn: { position: 'absolute', top: 20, right: 20, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(13,13,13,0.6)', alignItems: 'center', justifyContent: 'center' },
});
