import React, { useEffect, memo } from 'react';
import { View, StyleSheet, ViewStyle, TextStyle, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const SHIMMER_BASE = '#E8E2D6';
const SHIMMER_HIGHLIGHT = '#F5F0E8';
const CARD_BG = '#FFFFFF';

/**
 * Lightweight shimmer placeholder used across loading screens so the app feels
 * instant instead of showing a bare spinner. Reanimated cleans up the repeat
 * automatically when the component unmounts.
 * 
 * Memoized to prevent unnecessary re-renders in parent components
 */
export const Skeleton = React.memo(function SkeletonComponent({
  width = '100%',
  height,
  borderRadius = 8,
  style,
  animationDuration = 850,
}: {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  animationDuration?: number;
}) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.9, { duration: animationDuration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity, animationDuration]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: SHIMMER_BASE }, animatedStyle, style]}
    />
  );
});

/** A typical list-item placeholder (card with optional avatar + lines). */
export function SkeletonCard({
  rows = 3,
  avatar = true,
}: {
  rows?: number;
  avatar?: boolean;
}) {
  return (
    <View style={styles.stack}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.card}>
          {avatar && <Skeleton width={44} height={44} borderRadius={22} />}
          <View style={styles.lines}>
            <Skeleton width="62%" height={14} />
            <Skeleton width="88%" height={12} />
          </View>
          <Skeleton width={48} height={16} borderRadius={8} />
        </View>
      ))}
    </View>
  );
}

/** Profile header skeleton: large avatar + name + subtitle + tier badge */
export function SkeletonProfileHeader({
  avatarSize = 80,
  showTier = true,
}: {
  avatarSize?: number;
  showTier?: boolean;
}) {
  return (
    <View style={styles.profileHeader}>
      <Skeleton width={avatarSize} height={avatarSize} borderRadius={avatarSize / 2} />
      <Skeleton width="45%" height={18} style={{ marginTop: 12, alignSelf: 'center' }} />
      <Skeleton width="30%" height={13} style={{ alignSelf: 'center' }} />
      {showTier && (
        <Skeleton width={70} height={20} borderRadius={10} style={{ marginTop: 8, alignSelf: 'center' }} />
      )}
    </View>
  );
}

/** Membership / tier card skeleton */
export function SkeletonMembershipCard() {
  return (
    <View style={styles.membershipCard}>
      <View style={styles.membershipRow}>
        <View style={styles.membershipLeft}>
          <Skeleton width="50%" height={12} />
          <Skeleton width="60%" height={22} style={{ marginTop: 4 }}/>
        </View>
        <Skeleton width={24} height={24} borderRadius={12} />
      </View>
    </View>
  );
}

/** Stats row skeleton (3-4 stat cards) */
export function SkeletonStatsRow({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.statsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.statCard}>
          <Skeleton width="40%" height={16} style={{ alignSelf: 'center' }} />
          <Skeleton width="50%" height={10} style={{ marginTop: 3, alignSelf: 'center' }} />
        </View>
      ))}
    </View>
  );
}

/** Tier progress skeleton */
export function SkeletonTierProgress() {
  return (
    <View style={styles.tierProgressCard}>
      <View style={styles.tierProgressHeader}>
        <Skeleton width="30%" height={12} />
        <Skeleton width="40%" height={12} />
      </View>
      <View style={styles.tierProgressBar}>
        <Skeleton width="100%" height={6} borderRadius={3} />
      </View>
    </View>
  );
}

/** Account health skeleton */
export function SkeletonAccountHealth() {
  return (
    <View style={styles.cardSection}>
      <View style={styles.healthRow}>
        <Skeleton width={32} height={32} borderRadius={16} />
        <View style={{ flex: 1, gap: 2 }}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="70%" height={11} />
        </View>
      </View>
      <View style={[styles.healthStats, { marginTop: 10 }]}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.healthStat}>
            <Skeleton width="30%" height={14} style={{ alignSelf: 'center' }} />
            <Skeleton width="50%" height={10} style={{ marginTop: 1, alignSelf: 'center' }} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Field row skeleton (label + value) */
export function SkeletonFieldRow({ hasRightElement = true }: { hasRightElement?: boolean }) {
  return (
    <View style={styles.fieldRow}>
      <Skeleton width={80} height={13} />
      <View style={{ flex: 1 }} />
      <Skeleton width={hasRightElement ? 16 : 0} height={16} borderRadius={8} />
    </View>
  );
}

/** Section card skeleton with multiple field rows */
export function SkeletonSectionCard({ fieldCount = 4 }: { fieldCount?: number }) {
  return (
    <View style={styles.cardSection}>
      {Array.from({ length: fieldCount }).map((_, i) => (
        <View key={i} style={i === fieldCount - 1 ? { ...styles.fieldRow, borderBottomWidth: 0 } : styles.fieldRow}>
          <Skeleton width={80} height={13} />
          <View style={{ flex: 1 }} />
          <Skeleton width={16} height={16} borderRadius={8} />
        </View>
      ))}
    </View>
  );
}

/** Services list skeleton */
export function SkeletonServicesList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.cardSection}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.serviceRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Skeleton width="45%" height={14} />
              <Skeleton width={50} height={16} borderRadius={8} />
            </View>
            <Skeleton width="80%" height={12} />
            <Skeleton width="35%" height={14} style={{ marginTop: 4 }} />
          </View>
          <Skeleton width={32} height={32} borderRadius={16} />
          <Skeleton width={32} height={32} borderRadius={16} />
          <Skeleton width={32} height={32} borderRadius={16} />
        </View>
      ))}
    </View>
  );
}

/** Verification status skeleton */
export function SkeletonVerification() {
  return (
    <View style={styles.cardSection}>
      <View style={styles.verificationRow}>
        <Skeleton width={32} height={32} borderRadius={16} />
        <View style={{ flex: 1, gap: 2 }}>
          <Skeleton width="35%" height={14} />
          <Skeleton width="60%" height={11} />
        </View>
      </View>
      <Skeleton width="100%" height={40} borderRadius={12} style={{ marginTop: 4 }} />
    </View>
  );
}

/** Empty state skeleton (for empty services, etc.) */
export function SkeletonEmptyState() {
  return (
    <View style={{ padding: 20, alignItems: 'center', gap: 8 }}>
      <Skeleton width={200} height={13} />
      <Skeleton width={180} height={13} />
    </View>
  );
}

/** Full profile skeleton - mirrors customer home coding pattern */
export function SkeletonCustomerProfile() {
  return (
    <View style={styles.fullProfile}>
      {/* Header - same structure as customer home */}
      <View style={styles.profileHeaderContainer}>
        <View style={styles.headerBack} />
        <Skeleton width="35%" height={20} />
        <View style={styles.headerSpacer} />
      </View>

      {/* Profile content - uses same sectionOuter style as home */}
      <View style={styles.profileContent}>
        {/* Avatar + Name + Tier */}
        <View style={styles.profileHeader}>
          <Skeleton width={80} height={80} borderRadius={40} />
          <Skeleton width="45%" height={18} style={{ marginTop: 12, alignSelf: 'center' }} />
          <Skeleton width="30%" height={13} style={{ alignSelf: 'center' }} />
          <View style={{ alignSelf: 'center', marginTop: 8 }}>
            <Skeleton width={70} height={22} borderRadius={16} />
          </View>
        </View>

        {/* Membership Card */}
        <View style={styles.membershipCard}>
          <View style={styles.membershipRow}>
            <View style={styles.membershipLeft}>
              <Skeleton width="50%" height={12} />
              <Skeleton width="60%" height={22} style={{ marginTop: 4 }} />
            </View>
            <Skeleton width={24} height={24} borderRadius={12} />
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.statCard}>
              <Skeleton width="30%" height={16} style={{ alignSelf: 'center' }} />
              <Skeleton width="50%" height={10} style={{ marginTop: 3, alignSelf: 'center' }} />
            </View>
          ))}
        </View>

        {/* Tier Progress */}
        <View style={styles.tierProgressCard}>
          <View style={styles.tierProgressHeader}>
            <Skeleton width="30%" height={12} />
            <Skeleton width="40%" height={12} />
          </View>
          <View style={styles.tierProgressBar}>
            <Skeleton width="100%" height={6} borderRadius={3} />
          </View>
        </View>
      </View>
    </View>
  );
}

/** Worker profile — exact structural mirror of worker/profile.tsx scroll content */
export function SkeletonWorkerProfile() {
  // Helper for section labels with consistent styling
  const sectionLabel = (widthVal: number) => (
    <Skeleton width={widthVal} height={12} />
  );

  // Helper for editable field rows (label + value + edit icon)
  const fieldRows = (count: number) =>
    Array.from({ length: count }).map((_, i) => {
      const isLast = i === count - 1;
      return (
        <View
          key={i}
          style={[
            styles.workerProfileFieldRow,
            isLast && { borderBottomWidth: 0 },
          ]}
        >
          <Skeleton width={70} height={13} />
          <View style={{ flex: 1 }} />
          {/* Value placeholder */}
          <Skeleton width={100} height={14} />
          {/* Edit pencil icon placeholder */}
          <Skeleton width={16} height={16} borderRadius={8} style={{ marginLeft: 8 }} />
        </View>
      );
    });

  // Helper for service row (name + chips + actions)
  const serviceRows = (count: number) =>
    Array.from({ length: count }).map((_, i) => (
      <View
        key={i}
        style={[
          styles.workerProfileServiceRow,
          i === count - 1 && { borderBottomWidth: 0 },
        ]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          {/* Service name + active chip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Skeleton width="45%" height={14} />
            <Skeleton width={44} height={16} borderRadius={8} />
          </View>
          {/* Description lines */}
          <Skeleton width="85%" height={12} />
          {/* Price */}
          <Skeleton width={64} height={14} style={{ marginTop: 4 }} />
        </View>
        {/* Toggle switch */}
        <Skeleton width={44} height={26} borderRadius={13} />
        {/* Edit button */}
        <Skeleton width={32} height={32} borderRadius={16} />
        {/* Delete button */}
        <Skeleton width={32} height={32} borderRadius={16} />
      </View>
    ));

  // Helper for verification status row
  const verificationRow = () => (
    <View style={styles.workerProfileVerificationRow}>
      <Skeleton width={32} height={32} borderRadius={16} />
      <View style={{ flex: 1, gap: 4 }}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="60%" height={11} />
      </View>
      <Skeleton width={18} height={18} borderRadius={9} />
    </View>
  );

  return (
    <View style={skeletonStyles.skeletonWorkerProfile}>
      {/* Header */}
      <View style={skeletonStyles.skeletonWorkerProfileHeader}>
        <View style={skeletonStyles.skeletonHeaderBack} />
        <Skeleton width={60} height={18} />
      </View>

      <View style={skeletonStyles.skeletonWorkerProfileContent}>
        {/* Avatar section with camera badge */}
        <View style={skeletonStyles.skeletonAvatarSection}>
          <View style={skeletonStyles.skeletonAvatarWrapper}>
            <Skeleton width={80} height={80} borderRadius={40} />
            <Skeleton
              width={28}
              height={28}
              borderRadius={14}
              style={skeletonStyles.skeletonCameraBadge}
            />
          </View>
          {/* Name */}
          <Skeleton width={140} height={20} style={skeletonStyles.skeletonName} />
          {/* Phone */}
          <Skeleton width={110} height={13} />
          {/* Category + Tier badges */}
          <View style={skeletonStyles.skeletonBadgesRow}>
            <Skeleton width={88} height={24} borderRadius={16} />
            <Skeleton width={72} height={24} borderRadius={16} />
          </View>
          {/* Location */}
          <View style={skeletonStyles.skeletonLocationRow}>
            <Skeleton width={14} height={14} borderRadius={7} />
            <Skeleton width={100} height={13} />
          </View>
        </View>

        {/* Stats row - 4 cards */}
        <View style={skeletonStyles.skeletonStatsRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={skeletonStyles.skeletonStatCard}>
              <Skeleton width={36} height={16} style={skeletonStyles.skeletonStatValue} />
              <Skeleton width={44} height={10} style={skeletonStyles.skeletonStatLabel} />
            </View>
          ))}
        </View>

        {/* Account Health section */}
        <View style={skeletonStyles.skeletonSection}>
          {sectionLabel(100)}
          <View style={skeletonStyles.skeletonAccountHealthCard}>
            <View style={skeletonStyles.skeletonHealthHeader}>
              <Skeleton width={32} height={32} borderRadius={16} />
              <View style={{ flex: 1, gap: 4 }}>
                <Skeleton width="40%" height={14} />
                <Skeleton width="80%" height={11} />
              </View>
            </View>
            {/* Health stats - 3 columns */}
            <View style={skeletonStyles.skeletonHealthStatsRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={skeletonStyles.skeletonHealthStat}>
                  <Skeleton width={28} height={14} />
                  <Skeleton width={48} height={10} />
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* About / Personal Details section */}
        <View style={skeletonStyles.skeletonSection}>
          {sectionLabel(48)}
          <View style={skeletonStyles.skeletonFieldCard}>
            {fieldRows(6)}
          </View>
        </View>

        {/* Services section */}
        <View style={skeletonStyles.skeletonSection}>
          <View style={skeletonStyles.skeletonServicesHeader}>
            {sectionLabel(64)}
            <Skeleton width={96} height={28} borderRadius={16} />
          </View>
          <View style={skeletonStyles.skeletonServicesCard}>
            {serviceRows(3)}
          </View>
        </View>

        {/* Verification section */}
        <View style={skeletonStyles.skeletonSection}>
          {sectionLabel(88)}
          <View style={skeletonStyles.skeletonVerificationCard}>
            {verificationRow()}
            <Skeleton width="100%" height={44} borderRadius={12} />
          </View>
        </View>

        {/* Payment Details section */}
        <View style={skeletonStyles.skeletonSection}>
          {sectionLabel(80)}
          <View style={skeletonStyles.skeletonFieldCard}>
            {fieldRows(3)}
          </View>
        </View>

        <View style={{ height: 24 }} />
      </View>
    </View>
  );
}

/** Dashboard stats cards skeleton */
export function SkeletonDashboardStats({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.dashboardStats}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.dashboardStatCard}>
          <Skeleton width="30%" height={12} />
          <Skeleton width="50%" height={24} style={{ marginTop: 4, alignSelf: 'center' }} />
        </View>
      ))}
    </View>
  );
}

/** Booking card skeleton */
export function SkeletonBookingCard() {
  return (
    <View style={styles.bookingCard}>
      <View style={styles.bookingHeader}>
        <Skeleton width="40%" height={14} />
        <Skeleton width={60} height={18} borderRadius={9} />
      </View>
      <View style={styles.bookingDetails}>
        <Skeleton width="60%" height={12} />
        <Skeleton width="80%" height={12} style={{ marginTop: 4 }} />
      </View>
      <View style={styles.bookingFooter}>
        <Skeleton width={80} height={28} borderRadius={14} />
        <Skeleton width={80} height={28} borderRadius={14} />
      </View>
    </View>
  );
}

/** Booking list skeleton */
export function SkeletonBookingList({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.bookingList}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBookingCard key={i} />
      ))}
    </View>
  );
}

/** Worker card skeleton (for customer search results) */
export function SkeletonWorkerCard() {
  return (
    <View style={styles.workerCard}>
      <Skeleton width={56} height={56} borderRadius={28} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="40%" height={12} />
        <Skeleton width="50%" height={12} />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Skeleton width={50} height={18} borderRadius={9} />
          <Skeleton width={50} height={18} borderRadius={9} />
        </View>
      </View>
      <Skeleton width={80} height={32} borderRadius={16} />
    </View>
  );
}

/** Worker list skeleton */
export function SkeletonWorkerList({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.workerList}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonWorkerCard key={i} />
      ))}
    </View>
  );
}

/** Job card skeleton (worker job posting) */
export function SkeletonJobCard() {
  return (
    <View style={styles.jobCard}>
      <View style={styles.jobHeader}>
        <Skeleton width="50%" height={16} />
        <Skeleton width={70} height={18} borderRadius={9} />
      </View>
      <View style={styles.jobBody}>
        <Skeleton width="100%" height={12} />
        <Skeleton width="80%" height={12} style={{ marginTop: 4 }} />
      </View>
      <View style={styles.jobFooter}>
        <Skeleton width="40%" height={14} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton width={70} height={28} borderRadius={14} />
          <Skeleton width={70} height={28} borderRadius={14} />
        </View>
      </View>
    </View>
  );
}

/** Job list skeleton */
export function SkeletonJobList({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.jobList}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonJobCard key={i} />
      ))}
    </View>
  );
}

/** Chat message skeleton */
export function SkeletonChatMessage({ isOwn = false }: { isOwn?: boolean }) {
  return (
    <View style={[styles.chatMessage, isOwn && styles.chatMessageOwn]}>
      <Skeleton width={isOwn ? '40%' : '60%'} height={14} borderRadius={16} />
      <Skeleton width={isOwn ? '30%' : '50%'} height={12} borderRadius={16} style={{ marginTop: 4 }} />
    </View>
  );
}

/** Chat list skeleton */
export function SkeletonChatList({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.chatList}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonChatMessage key={i} isOwn={i % 2 === 0} />
      ))}
    </View>
  );
}

/** Notification item skeleton */
export function SkeletonNotification() {
  return (
    <View style={styles.notificationItem}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 4 }}>
        <Skeleton width="50%" height={14} />
        <Skeleton width="70%" height={12} />
        <Skeleton width="30%" height={10} />
      </View>
    </View>
  );
}

/** Notification list skeleton */
export function SkeletonNotificationList({ count = 10 }: { count?: number }) {
  return (
    <View style={styles.notificationList}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonNotification key={i} />
      ))}
    </View>
  );
}

/** Generic list item skeleton */
export function SkeletonListItem({
  leftSize = 48,
  lines = 2,
  rightElement = false,
}: {
  leftSize?: number;
  lines?: number;
  rightElement?: boolean;
}) {
  return (
    <View style={styles.listItem}>
      <Skeleton width={leftSize} height={leftSize} borderRadius={leftSize / 2} />
      <View style={styles.listItemLines}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} width={i === 0 ? '60%' : '40%'} height={14} />
        ))}
      </View>
      {rightElement && <Skeleton width={48} height={24} borderRadius={12} />}
    </View>
  );
}

/** Search results skeleton */
export function SkeletonSearchResults({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.searchResults}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} leftSize={56} lines={3} rightElement={true} />
      ))}
    </View>
  );
}

/** Payment method skeleton */
export function SkeletonPaymentMethod() {
  return (
    <View style={styles.paymentMethod}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1, gap: 4 }}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="60%" height={12} />
      </View>
      <Skeleton width={24} height={24} borderRadius={12} />
    </View>
  );
}

/** Settings section skeleton */
export function SkeletonSettingsSection({ itemCount = 5 }: { itemCount?: number }) {
  return (
    <View style={styles.settingsSection}>
      {Array.from({ length: itemCount }).map((_, i) => (
        <SkeletonListItem key={i} leftSize={40} lines={1} rightElement={true} />
      ))}
    </View>
  );
}

/** Worker Dashboard skeleton - mirrors the real dashboard blocks 1:1 */
export function SkeletonWorkerDashboard() {
  return (
    <View style={styles.workerDashboard}>
      {/* Header profile row: avatar + greeting/name/rating + action icons */}
      <View style={styles.profileRow}>
        <View style={styles.profileLeft}>
          <Skeleton width={56} height={56} borderRadius={28} />
          <View style={[styles.profileInfo, { gap: 8 }]}>
            <Skeleton width="38%" height={12} />
            <Skeleton width="62%" height={18} />
            <Skeleton width="28%" height={12} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <Skeleton width={40} height={40} borderRadius={20} />
        </View>
      </View>

      {/* Online toggle card */}
      <View style={styles.toggleCard}>
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="45%" height={15} />
          <Skeleton width="72%" height={12} />
        </View>
        <Skeleton width={52} height={30} borderRadius={16} />
      </View>

      {/* Gamification row: weekly goal + streak */}
      <View style={styles.gamificationRow}>
        <View style={styles.gamificationCard}>
          <Skeleton width="55%" height={13} style={{ marginBottom: 14 }} />
          <Skeleton width="78%" height={20} />
          <Skeleton height={6} style={{ marginTop: 18 }} />
        </View>
        <View style={styles.streakCard}>
          <Skeleton width={32} height={32} borderRadius={16} />
          <Skeleton width={40} height={22} />
          <Skeleton width={68} height={11} />
        </View>
      </View>

      {/* Tier progress card */}
      <View style={styles.tierCard}>
        <Skeleton width="42%" height={13} style={{ marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ flex: 1, gap: 6 }}>
              <Skeleton width="60%" height={11} />
              <Skeleton height={4} />
            </View>
          ))}
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.dashStatsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.dashStatCard}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <Skeleton width={56} height={18} style={{ marginTop: 8 }} />
            <Skeleton width={44} height={11} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>

      {/* Quick actions grid */}
      <Skeleton width={110} height={13} />
      <View style={styles.actionsGrid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.actionTile}>
            <Skeleton width={52} height={52} borderRadius={14} />
            <Skeleton width={72} height={11} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Recent activity */}
      <Skeleton width={130} height={13} />
      <View style={styles.activityCard}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.activityRow, i < 2 && styles.activityRowBorder]}>
            <View style={{ flex: 1, gap: 6, marginRight: 12 }}>
              <Skeleton width="72%" height={14} />
              <Skeleton width="32%" height={13} />
            </View>
            <Skeleton width={58} height={24} borderRadius={8} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Customer Home skeleton - mirrors the real home layout */
export function SkeletonCustomerHome() {
  return (
    <View style={styles.customerHome}>
      {/* Header: greeting + name, bell + settings */}
      <View style={styles.sectionOuter}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 8 }}>
            <Skeleton width={150} height={13} />
            <Skeleton width={96} height={24} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton width={40} height={40} borderRadius={20} />
            <Skeleton width={40} height={40} borderRadius={20} />
          </View>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.sectionOuter}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, height: 52, justifyContent: 'center', paddingHorizontal: 16 }}>
          <Skeleton width="55%" height={16} />
        </View>
      </View>

      {/* Quick actions */}
      <View style={[styles.sectionOuter, { flexDirection: 'row', gap: 10 }]}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={72} borderRadius={12} style={{ flex: 1 }} />)}
      </View>

      {/* Wallet */}
      <View style={styles.sectionOuter}>
        <Skeleton height={92} borderRadius={16} />
      </View>

      {/* Stats */}
      <View style={[styles.sectionOuter, { flexDirection: 'row', gap: 8 }]}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={66} borderRadius={12} style={{ flex: 1 }} />)}
      </View>

      {/* Trust + warranty */}
      <View style={styles.sectionOuter}>
        <Skeleton height={94} borderRadius={12} />
      </View>

      {/* Categories */}
      <View style={styles.sectionOuter}>
        <Skeleton width={150} height={15} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} width={94} height={38} borderRadius={20} />)}
        </View>
      </View>

      {/* Suggested for you (horizontal cards) */}
      <View style={styles.sectionOuter}>
        <Skeleton width={150} height={15} style={{ marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} width={180} height={124} borderRadius={16} />)}
        </View>
      </View>
    </View>
  );
}

/** Worker Earnings skeleton */
export function SkeletonWorkerEarnings() {
  return (
    <View style={styles.workerEarnings}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.headerBack} />
          <Skeleton width={70} height={18} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, gap: 20, paddingTop: 4 }}>
        {/* Wallet card */}
        <Skeleton height={130} borderRadius={16} />
        {/* Earnings stats — 4 boxes in a 2×2 grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width="47%" height={84} borderRadius={12} />)}
        </View>
        {/* Performance — label + 4 metrics in a white card */}
        <View>
          <Skeleton width={110} height={13} style={{ marginBottom: 10 }} />
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, flexDirection: 'row', paddingVertical: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <Skeleton width={44} height={16} />
                <Skeleton width={40} height={11} />
              </View>
            ))}
          </View>
        </View>
        {/* Recent activity ledger */}
        <Skeleton height={150} borderRadius={12} />
      </View>
    </View>
  );
}

/** Browse requests list body only (header stays visible on screen) */
export function SkeletonWorkerBrowseRequests() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14, paddingBottom: 24 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width={i === 0 ? 48 : 92} height={34} borderRadius={20} />
        ))}
      </ScrollView>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ backgroundColor: CARD_BG, borderRadius: 16, padding: 16, elevation: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Skeleton width={88} height={24} borderRadius={12} />
            <Skeleton width={52} height={12} />
          </View>
          <Skeleton width="85%" height={16} />
          <Skeleton width="100%" height={12} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Skeleton width={72} height={72} borderRadius={10} />
            <Skeleton width={72} height={72} borderRadius={10} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Skeleton height={40} borderRadius={12} style={{ flex: 1 }} />
            <Skeleton height={40} borderRadius={12} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Worker Detail skeleton */
export function SkeletonWorkerDetail() {
  return (
    <View style={styles.workerDetail}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
        <View style={styles.headerBack} />
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Skeleton width={88} height={88} borderRadius={44} />
          <Skeleton width={160} height={20} style={{ marginTop: 12 }} />
          <Skeleton width={120} height={13} style={{ marginTop: 8 }} />
          <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={72} borderRadius={12} style={{ flex: 1 }} />)}
        </View>
        <Skeleton width={90} height={13} style={{ marginBottom: 10 }} />
        <View style={styles.cardSection}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={i === 2 ? { ...styles.fieldRow, borderBottomWidth: 0 } : styles.fieldRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width={64} height={14} />
              </View>
            </View>
          ))}
        </View>
        <Skeleton height={52} borderRadius={14} style={{ marginTop: 20 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Base
  stack: { gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    elevation: 1,
  },
  lines: { flex: 1, gap: 8 },

  // Profile Header
  profileHeader: { alignItems: 'center', gap: 12, paddingTop: 24 },
  profileHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(13,13,13,0.04)' },
  headerSpacer: { width: 40, flex: 1 },

  // Membership Card
  membershipCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#0D0D0D',
    elevation: 3,
  },
  membershipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  membershipLeft: { gap: 4 },

  // Stats Row
  statsRow: { paddingHorizontal: 20, flexDirection: 'row', gap: 8, marginBottom: 16 },
  statsRowContainer: { paddingHorizontal: 24 },
  statCard: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    elevation: 1,
    alignItems: 'center',
  },

  // Tier Progress
  tierProgressCard: { marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 12, backgroundColor: CARD_BG, elevation: 1 },
  tierProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tierProgressBar: { height: 6, borderRadius: 3, backgroundColor: '#E8E0D6', overflow: 'hidden' },

  // Account Health
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  healthStats: { flexDirection: 'row', gap: 10 },
  healthStat: { flex: 1, backgroundColor: '#F5F0E8', borderRadius: 10, padding: 10, alignItems: 'center' },

  // Card Section
  cardSection: { backgroundColor: CARD_BG, borderRadius: 12, elevation: 1, overflow: 'hidden' },

  // Field Row
  fieldRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' },

  // Services
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' },

  // Verification
  verificationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Dashboard Stats
  dashboardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
  dashboardStatCard: { flex: 1, minWidth: '45%', backgroundColor: CARD_BG, borderRadius: 12, padding: 16, elevation: 1 },

  // Booking Card
  bookingCard: { backgroundColor: CARD_BG, borderRadius: 12, padding: 14, marginHorizontal: 16, marginVertical: 6, elevation: 1 },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bookingDetails: { gap: 4 },
  bookingFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },

  // Worker Card
  workerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD_BG, borderRadius: 12, padding: 14, marginHorizontal: 16, marginVertical: 6, elevation: 1 },
  workerList: { gap: 0 },

  // Job Card
  jobCard: { backgroundColor: CARD_BG, borderRadius: 12, padding: 14, marginHorizontal: 16, marginVertical: 6, elevation: 1 },
  jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  jobBody: { gap: 4 },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },

  // Chat
  chatMessage: { paddingHorizontal: 16, paddingVertical: 4, alignItems: 'flex-start' },
  chatMessageOwn: { alignItems: 'flex-end' },
  chatList: { gap: 4 },

  // Notification
  notificationItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: CARD_BG, borderRadius: 12, marginHorizontal: 16, marginVertical: 4, elevation: 1 },
  notificationList: { gap: 0 },

  // List Item
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: CARD_BG, borderRadius: 12, marginHorizontal: 16, marginVertical: 4, elevation: 1 },
  listItemLines: { flex: 1, gap: 8 },

  // Search Results
  searchResults: { paddingHorizontal: 16, gap: 0 },

  // Payment
  paymentMethod: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: CARD_BG, borderRadius: 12, marginHorizontal: 16, marginVertical: 4, elevation: 1 },

  // Settings
  settingsSection: { paddingHorizontal: 16, gap: 0 },

  // Full Profile
  fullProfile: { flex: 1, backgroundColor: '#F5F0E8' },

  // Customer Profile - mirrors customer home
  customerProfile: { flex: 1, backgroundColor: '#F5F0E8' },

  // Worker Profile - mirrors worker dashboard
  workerProfile: { flex: 1, backgroundColor: '#F5F0E8', paddingHorizontal: 16, paddingTop: 8, gap: 16 },

  // Worker Profile Specific
  workerProfileHeader: { alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 16 },
  workerStatsRow: { paddingHorizontal: 24, flexDirection: 'row', gap: 10, marginBottom: 20 },
  workerStatCard: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: CARD_BG, alignItems: 'center', elevation: 1 },
  workerSection: { paddingHorizontal: 24, marginBottom: 20 },

  workerProfileStatsRow: { flexDirection: 'row', gap: 10 },
  workerProfileStatCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },

  // Worker Dashboard
  workerDashboard: { flex: 1, backgroundColor: '#F5F0E8', paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileInfo: { flexDirection: 'column', gap: 6 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 1 },
  gamificationRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  gamificationCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16 },
  streakCard: { width: 110, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 },
  tierCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 20 },
  dashStatsRow: { flexDirection: 'row', gap: 10 },
  dashStatCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, alignItems: 'center', elevation: 1 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginTop: 8, marginBottom: 16 },
  actionTile: { width: '31%', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, alignItems: 'center', elevation: 1 },
  activityCard: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  activityRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' },
  activityRowBorder: { borderBottomWidth: 1 },

  // Customer Home
  customerHome: { flex: 1, backgroundColor: '#F5F0E8' },
  sectionOuter: { paddingHorizontal: 16, paddingVertical: 12 },

  // Worker Earnings
  workerEarnings: { flex: 1, backgroundColor: '#F5F0E8' },

  // Worker Browse Requests
  workerBrowseRequests: { flex: 1, backgroundColor: '#F5F0E8' },

  // Worker Detail
  workerDetail: { flex: 1, backgroundColor: '#F5F0E8' },

  // Worker Profile Field Row
  workerProfileFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0', backgroundColor: CARD_BG },

  // Worker Profile Service Row
  workerProfileServiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F0EBE0', backgroundColor: CARD_BG },

  // Worker Profile Verification Row
  workerProfileVerificationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: CARD_BG, borderRadius: 12 },

  // Profile Content
  profileContent: { flex: 1, paddingVertical: 16, gap: 16 },

  // Booking List
  bookingList: { paddingHorizontal: 16, gap: 12, paddingTop: 8 },

  // Job List
  jobList: { paddingHorizontal: 16, gap: 12, paddingTop: 8 },
});

/**
 * Type exports for consumers who want to use the skeleton components with proper typing
 */
export type SkeletonProps = {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  animationDuration?: number;
};

export type SkeletonCardProps = {
  rows?: number;
  avatar?: boolean;
};

export type SkeletonProfileHeaderProps = {
  avatarSize?: number;
  showTier?: boolean;
};

export type SkeletonStatsRowProps = {
  count?: number;
};

export type SkeletonServicesListProps = {
  count?: number;
};

export type SkeletonSectionCardProps = {
  fieldCount?: number;
};

export type SkeletonCustomerProfileProps = {};

export type SkeletonWorkerProfileProps = {};

export type SkeletonDashboardStatsProps = {
  count?: number;
};

export type SkeletonBookingCardProps = {};

export type SkeletonBookingListProps = {
  count?: number;
};

export type SkeletonWorkerCardProps = {};

export type SkeletonWorkerListProps = {
  count?: number;
};

export type SkeletonJobCardProps = {};

export type SkeletonJobListProps = {
  count?: number;
};

export type SkeletonChatMessageProps = {
  isOwn?: boolean;
};

export type SkeletonChatListProps = {
  count?: number;
};

export type SkeletonNotificationProps = {};

export type SkeletonNotificationListProps = {
  count?: number;
};

export type SkeletonListItemProps = {
  leftSize?: number;
  lines?: number;
  rightElement?: boolean;
};

export type SkeletonSearchResultsProps = {
  count?: number;
};

export type SkeletonPaymentMethodProps = {};

export type SkeletonSettingsSectionProps = {
  itemCount?: number;
};

export type SkeletonWorkerDashboardProps = {};
export type SkeletonCustomerHomeProps = {};
export type SkeletonWorkerEarningsProps = {};
export type SkeletonWorkerBrowseRequestsProps = {};
export type SkeletonWorkerDetailProps = {};

// Worker Profile specific styles - mirrors actual worker/profile.tsx layout
const SKELETON_CARD_BG = '#FFFFFF';
const SKELETON_BORDER = '#F0EBE0';
const SKELETON_BG = '#F5F0E8';

const skeletonStyles = StyleSheet.create({
  skeletonWorkerProfile: {
    flex: 1,
    backgroundColor: SKELETON_BG,
  },
  skeletonWorkerProfileHeader: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  skeletonHeaderBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
  },
  skeletonWorkerProfileContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 20,
  },
  skeletonAvatarSection: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  skeletonAvatarWrapper: {
    position: 'relative',
  },
  skeletonCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  skeletonName: {
    marginTop: 12,
  },
  skeletonBadgesRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  skeletonLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  skeletonStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonStatCard: {
    flex: 1,
    backgroundColor: SKELETON_CARD_BG,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  skeletonStatValue: {
    alignSelf: 'center',
  },
  skeletonStatLabel: {
    alignSelf: 'center',
    marginTop: 4,
  },
  skeletonSection: {
    gap: 8,
  },
  skeletonAccountHealthCard: {
    backgroundColor: SKELETON_CARD_BG,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    elevation: 1,
  },
  skeletonHealthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  skeletonHealthStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonHealthStat: {
    flex: 1,
    backgroundColor: '#F5F0E8',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  skeletonFieldCard: {
    backgroundColor: SKELETON_CARD_BG,
    borderRadius: 12,
    elevation: 1,
    overflow: 'hidden',
  },
  skeletonWorkerProfileFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: SKELETON_BORDER,
  },
  skeletonServicesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skeletonServicesCard: {
    backgroundColor: SKELETON_CARD_BG,
    borderRadius: 12,
    elevation: 1,
    overflow: 'hidden',
  },
  skeletonWorkerProfileServiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: SKELETON_BORDER,
  },
  skeletonVerificationCard: {
    backgroundColor: SKELETON_CARD_BG,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    elevation: 1,
  },
  skeletonWorkerProfileVerificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});