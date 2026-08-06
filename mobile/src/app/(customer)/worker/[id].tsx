import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FeaturedBadge, isFeaturedActive } from '../../../components/ui/FeaturedBadge';
import { SkeletonWorkerDetail } from '../../../components/ui/Skeleton';
import { useRouter, useLocalParams } from 'expo-router';
import { useBookingStore } from '../../../store/booking.store';
import { useT } from '../../../utils/i18n';
import { useWorkerProfile } from '../../../hooks/useWorkerProfile';

export default function WorkerDetailScreen() {
  const t = useT();
  const { id } = useLocalParams<{ id: string }>();
  const router = useRouter();
  const { data: worker, isLoading, error } = useWorkerProfile(id);
  const [selectedService, setSelectedService] = useState<any>(null);

  // Set default service when worker data loads
  useEffect(() => {
    if (worker?.services?.length) {
      setSelectedService(worker.services[0]);
    }
  }, [worker]);

  // First load: show skeleton
  if (isLoading && !worker) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
        <SkeletonWorkerDetail />
      </SafeAreaView>
    );
  }

  if (error || !worker) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
        <View style={{ padding: 24 }}>
          <Pressable onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#999' }}>
            {t('Worker not found')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const name = worker.user?.name || t('Worker');
  const category = worker.category
    ? worker.category.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
    : t('Service Provider');
  const avatarUrl = worker.user?.avatarUrl;
  const photos = worker.photos || [];
  const featured = isFeaturedActive(worker.isFeatured, worker.featuredUntil);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F0E8' }} edges={['top']}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)', justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#0D0D0D" />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {/* Profile */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: 88, height: 88, borderRadius: 44, marginBottom: 12 }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 32, color: '#F5F0E8' }}>{name[0].toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 20, color: '#0D0D0D' }}>{name}</Text>
            {featured && <FeaturedBadge featuredUntil={worker.featuredUntil} isFeatured={worker.isFeatured} />}
          </View>
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#6B6B6B', marginTop: 2 }}>{t(category)}</Text>
          {worker.city && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#9E9E9E', marginTop: 2 }}>{worker.city}</Text>}
        </View>

        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          {[
            { v: worker.rating?.toFixed(1) || '---', l: t('Rating') },
            { v: worker.completedJobs || 0, l: t('Jobs Done') },
            { v: `₹${worker.hourlyRate || 0}`, l: t('/hr') },
          ].map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 14, alignItems: 'center', elevation: 1 }}>
              <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 16, color: '#0D0D0D' }}>{s.v}</Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#9E9E9E', marginTop: 2 }}>{s.l}</Text>
            </View>
          ))}
        </View>

        {/* Portfolio Photos */}
        {photos.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#0D0D0D', marginBottom: 10 }}>{t('Portfolio')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
              {photos.map((p: any) => (
                <View key={p.id} style={{ marginRight: 10 }}>
                  {p.beforeUrl && <Image source={{ uri: p.beforeUrl }} style={{ width: 160, height: 120, borderRadius: 12, backgroundColor: '#EDE8DC' }} cachePolicy="memory-disk" />}
                  {p.caption && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: '#6B6B6B', marginTop: 4, width: 160 }}>{p.caption}</Text>}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Services */}
        {worker.services?.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#0D0D0D', marginBottom: 10 }}>{t('Select Service')}</Text>
            {worker.services.map((s: any) => {
              const active = selectedService?.id === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setSelectedService(s)}
                  style={({ pressed }) => [{
                    backgroundColor: active ? '#FFF0E8' : '#FFF',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 8,
                    elevation: 1,
                    borderWidth: 1.5,
                    borderColor: active ? '#FF5C00' : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }, pressed && { opacity: 0.8 }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#0D0D0D' }}>{s.name}</Text>
                    {s.description && <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B6B6B', marginTop: 2 }} numberOfLines={2}>{s.description}</Text>}
                    <Text style={{ fontFamily: 'SpaceMono_700Bold', fontSize: 14, color: '#FF5C00', marginTop: 4 }}>₹{s.basePrice}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name={active ? 'check-circle' : 'circle-outline'}
                    size={22}
                    color={active ? '#FF5C00' : '#C8C0B0'}
                    style={{ marginLeft: 10 }}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Book Now */}
        <Pressable
          style={{ backgroundColor: '#FF5C00', borderRadius: 16, paddingVertical: 16, alignItems: 'center', elevation: 3, opacity: worker.services?.length ? 1 : 0.7 }}
          onPress={() => {
            useBookingStore.getState().setPendingBooking(id, worker, selectedService);
            router.push('/(customer)/bookings');
          }}
        >
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: '#FFF' }}>
            {t('Book')} {name.split(' ')[0]}{selectedService ? ` · ${selectedService.name}` : ''}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}