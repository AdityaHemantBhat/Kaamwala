import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl,
  ActivityIndicator, Linking
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { apiClient } from '../../../api/client';
import { useT } from '../../../utils/i18n';

const ORANGE = '#FF5C00';

export default function WorkerJobs() {
  const router = useRouter();
  const t = useT();
  const [jobs, setJobs] = useState<any[]>([]);
  const [acceptedRequests, setAcceptedRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const params: any = {};
      if (filter) params.status = filter;
      const [jobsRes, acceptedRes] = await Promise.all([
        apiClient.get('/jobs', { params }),
        apiClient.get('/requests/worker/accepted').catch(() => ({ data: { data: [] } })),
      ]);
      setJobs(jobsRes.data?.data?.jobs || []);
      setAcceptedRequests(acceptedRes.data?.data || []);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const onRefresh = () => {
    setRefreshing(true);
    loadJobs();
  };

  const getJobCounts = () => {
    const active = jobs.filter(j => j.status === 'ACTIVE').length;
    const inactive = jobs.filter(j => j.status === 'INACTIVE').length;
    const completed = jobs.filter(j => j.status === 'COMPLETED').length;
    return { active, inactive, completed };
  };

  const counts = getJobCounts();

  const filteredJobs = filter
    ? jobs.filter(j => j.status === filter)
    : jobs;

  const renderJobCard = (job: any) => (
    <View key={job.id} style={styles.jobCard}>
      {/* Header: status badge + date */}
      <View style={styles.jobCardHeader}>
        <View style={[
          styles.statusBadge,
          { backgroundColor: job.status === 'ACTIVE' ? '#E8F5E9' : job.status === 'INACTIVE' ? '#FFF3E0' : '#E3F2FD' }
        ]}>
          <Text style={[
            styles.statusBadgeText,
            { color: job.status === 'ACTIVE' ? '#2E7D32' : job.status === 'INACTIVE' ? '#E65100' : '#1565C0' }
          ]}>
            {t(job.status)}
          </Text>
        </View>
        <Text style={styles.jobDate}>
          {new Date(job.createdAt).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
          })}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.jobTitle}>{t(job.title)}</Text>

      {/* Category pill */}
      <View style={styles.categoryPill}>
        <MaterialCommunityIcons name="wrench" size={14} color="#666" />
        <Text style={styles.categoryPillText}>{t(job.category.replace(/_/g, ' '))}</Text>
      </View>

      {/* Price + City + Hours */}
      <View style={styles.jobMetaRow}>
        <View style={styles.metaItem}>
          <MaterialCommunityIcons name="currency-inr" size={16} color="#666" />
          <Text style={styles.metaText}>₹{job.price} / {t(job.priceUnit)}</Text>
        </View>
        {job.city && (
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="map-marker" size={16} color="#666" />
            <Text style={styles.metaText}>{job.city}</Text>
          </View>
        )}
        {job.estimatedHours && (
          <View style={styles.metaItem}>
            <MaterialCommunityIcons name="clock-outline" size={16} color="#666" />
            <Text style={styles.metaText}>{job.estimatedHours}h</Text>
          </View>
        )}
      </View>

      {/* Skills */}
      {job.skills && job.skills.length > 0 && (
        <View style={styles.skillsRow}>
          {job.skills.slice(0, 3).map((s: string, i: number) => (
            <View key={i} style={styles.skillChip}>
              <Text style={styles.skillChipText}>{s}</Text>
            </View>
          ))}
          {job.skills.length > 3 && (
            <Text style={styles.moreSkills}>+{job.skills.length - 3}</Text>
          )}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.jobActions}>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push(`/(worker)/jobs/${job.id}`)}
        >
          <MaterialCommunityIcons name="pencil" size={18} color="#fff" />
          <Text style={styles.editButtonText}>{t('Edit')}</Text>
        </Pressable>
        <Pressable
          style={styles.viewButton}
          onPress={() => router.push(`/(worker)/jobs/${job.id}`)}
        >
          <Text style={styles.viewButtonText}>{t('View')}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#0D0D0D" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('My Jobs')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D0D0D" />
        }
      >
        {/* Filter pills */}
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterPill, !filter && styles.filterPillActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterPillText, !filter && styles.filterPillTextActive]}>
              {t('All')} ({jobs.length})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filter === 'ACTIVE' && styles.filterPillActive]}
            onPress={() => setFilter('ACTIVE')}
          >
            <Text style={[styles.filterPillText, filter === 'ACTIVE' && styles.filterPillTextActive]}>
              {t('Active')} ({counts.active})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filter === 'INACTIVE' && styles.filterPillActive]}
            onPress={() => setFilter('INACTIVE')}
          >
            <Text style={[styles.filterPillText, filter === 'INACTIVE' && styles.filterPillTextActive]}>
              {t('Inactive')} ({counts.inactive})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filterPill, filter === 'COMPLETED' && styles.filterPillActive]}
            onPress={() => setFilter('COMPLETED')}
          >
            <Text style={[styles.filterPillText, filter === 'COMPLETED' && styles.filterPillTextActive]}>
              {t('Done')} ({counts.completed})
            </Text>
          </Pressable>
        </View>

        {/* Post New Job Button */}
        <Pressable
          style={styles.postButton}
          onPress={() => router.push('/(worker)/jobs/create')}
        >
          <MaterialCommunityIcons name="plus-circle" size={22} color="#fff" />
          <Text style={styles.postButtonText}>{t('Post New Job')}</Text>
        </Pressable>

        {/* Accepted Requests Section */}
        {!loading && acceptedRequests.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.sectionTitle}>{t('Accepted Requests')}</Text>
            {acceptedRequests.map((req: any) => (
              <View key={req.id} style={styles.jobCard}>
                <View style={styles.jobCardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: '#E8F0FF' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#1A3A5C' }]}>{t('ACCEPTED')}</Text>
                  </View>
                  <Text style={styles.jobDate}>
                    {new Date(req.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text style={styles.jobTitle}>{req.title}</Text>
                <View style={styles.categoryPill}>
                  <MaterialCommunityIcons name="account" size={14} color="#666" />
                  <Text style={styles.categoryPillText}>{req.customerName || t('Customer')}</Text>
                </View>
                <View style={styles.jobMetaRow}>
                  {req.budget && (
                    <View style={styles.metaItem}>
                      <MaterialCommunityIcons name="currency-inr" size={16} color="#666" />
                      <Text style={styles.metaText}>₹{req.budget} / {t(req.budgetType)}</Text>
                    </View>
                  )}
                  {req.city && (
                    <View style={styles.metaItem}>
                      <MaterialCommunityIcons name="map-marker" size={16} color="#666" />
                      <Text style={styles.metaText}>{req.city}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.jobActions}>
                  <Pressable
                    style={[styles.editButton, { backgroundColor: '#1A3A5C' }]}
                    onPress={() => {
                      if (req.customerPhone) {
                        Linking.openURL(`tel:${req.customerPhone}`);
                      }
                    }}
                  >
                    <MaterialCommunityIcons name="phone" size={18} color="#fff" />
                    <Text style={styles.editButtonText}>{t('Call Customer')}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Section: My Posted Jobs */}
        {!loading && jobs.length > 0 && (
          <Text style={styles.sectionTitle}>{t('My Posted Jobs')}</Text>
        )}

        {/* Loading */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={ORANGE} />
          </View>
        ) : filteredJobs.length === 0 && acceptedRequests.length === 0 ? (
 /* Empty state */
          <View style={styles.emptyBox}>
            <View style={styles.heroRing}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={56} color="#CCC" />
            </View>
            <Text style={styles.emptyTitle}>{t('No jobs yet')}</Text>
            <Text style={styles.emptySub}>{t('Tap "Post New Job" to create your first listing')}</Text>
          </View>
        ) : (
          filteredJobs.map(renderJobCard)
        )}
      </ScrollView>
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
    fontFamily: 'Inter_700Bold',
    color: '#0D0D0D',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    elevation: 1,
  },
  filterPillActive: {
    backgroundColor: ORANGE,
    elevation: 2,
  },
  filterPillText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#666',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 14,
    elevation: 3,
    gap: 8,
    marginBottom: 20,
  },
  postButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#0D0D0D',
    marginBottom: 14,
  },
 /* Job Card */
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    elevation: 2,
    padding: 16,
    marginBottom: 14,
  },
  jobCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  jobDate: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'SpaceMono',
  },
  jobTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#0D0D0D',
    marginBottom: 8,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F5F0E8',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
    marginBottom: 12,
  },
  categoryPillText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#666',
  },
  jobMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'Inter_400Regular',
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
    marginTop: 4,
  },
  skillChip: {
    backgroundColor: '#F5F0E8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillChipText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  moreSkills: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    alignSelf: 'center',
  },
  jobActions: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0EDE5',
    paddingTop: 14,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    gap: 6,
    flex: 1,
  },
  editButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: ORANGE,
    flex: 1,
  },
  viewButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: ORANGE,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  heroRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(13,13,13,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#666',
  },
  emptySub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});