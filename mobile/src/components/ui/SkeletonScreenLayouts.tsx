import React, { memo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Skeleton } from './Skeleton';

const CARD = '#FFFFFF';
const BG = '#F5F0E8';
const BORDER = '#F0EBE0';

/** Back button + title row (worker profile, payments, etc.) */
export const SkeletonBackHeader = memo(function SkeletonBackHeader({
  titleWidth = 72,
  paddingHorizontal = 24,
}: {
  titleWidth?: number;
  paddingHorizontal?: number;
}) {
  return (
    <View style={[sl.backHeader, { paddingHorizontal }]}>
      <View style={sl.backBtn} />
      <Skeleton width={titleWidth} height={18} />
    </View>
  );
});

/** Customer bookings header: back + title + count chip */
export const SkeletonBookingsHeader = memo(function SkeletonBookingsHeader() {
  return (
    <View style={sl.bookingsHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={sl.backBtn} />
        <Skeleton width={110} height={20} />
      </View>
      <Skeleton width={32} height={28} borderRadius={14} />
    </View>
  );
});

export const SkeletonHorizontalFilterTabs = memo(function SkeletonHorizontalFilterTabs({
  count = 4,
}: {
  count?: number;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sl.filterList}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} width={i === 0 ? 88 : 76} height={34} borderRadius={20} />
      ))}
    </ScrollView>
  );
});

export const SkeletonCustomerBookingCard = memo(function SkeletonCustomerBookingCard() {
  return (
    <View style={sl.customerBookingCard}>
      <View style={sl.cardTopRow}>
        <Skeleton width={36} height={36} borderRadius={18} />
        <Skeleton width="48%" height={15} style={{ flex: 1, marginHorizontal: 10 }} />
        <Skeleton width={64} height={22} borderRadius={11} />
      </View>
      <Skeleton width="55%" height={12} style={{ marginBottom: 8 }} />
      <Skeleton width="72%" height={12} style={{ marginBottom: 12 }} />
      <View style={sl.divider} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ gap: 4 }}>
          <Skeleton width={40} height={10} />
          <Skeleton width={72} height={20} />
        </View>
        <Skeleton width={88} height={32} borderRadius={20} />
      </View>
    </View>
  );
});

export const SkeletonCustomerBookingsBody = memo(function SkeletonCustomerBookingsBody() {
  return (
    <View style={{ flex: 1 }}>
      <SkeletonHorizontalFilterTabs count={4} />
      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCustomerBookingCard key={i} />
        ))}
      </View>
    </View>
  );
});

/** Worker bookings body: same rich card skeleton as the customer bookings screen.
 *  (icon + title + status pill → text rows → divider → price + action pill).
 *  No filter-tab row here because the worker bookings screen has no filter tabs. */
export const SkeletonWorkerBookingsBody = memo(function SkeletonWorkerBookingsBody() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCustomerBookingCard key={i} />
        ))}
      </View>
    </View>
  );
});

export const SkeletonAddressCard = memo(function SkeletonAddressCard() {
  return (
    <View style={sl.addressCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Skeleton width={10} height={10} borderRadius={5} />
          <Skeleton width={56} height={13} />
          <Skeleton width={52} height={18} borderRadius={20} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton width={32} height={32} borderRadius={16} />
          <Skeleton width={32} height={32} borderRadius={16} />
        </View>
      </View>
      <Skeleton width="92%" height={14} style={{ marginTop: 12 }} />
      <Skeleton width="75%" height={12} style={{ marginTop: 6 }} />
      <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
    </View>
  );
});

export const SkeletonAddressesBody = memo(function SkeletonAddressesBody() {
  return (
    <View style={{ padding: 20, gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <SkeletonAddressCard key={i} />
      ))}
    </View>
  );
});

/** Customer notifications — title header + grouped rows */
export const SkeletonNotificationsBody = memo(function SkeletonNotificationsBody({
  withBack = false,
}: {
  withBack?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={[sl.notifHeader, withBack && { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        {withBack && <View style={sl.backBtn} />}
        <Skeleton width={130} height={20} />
        {!withBack && <Skeleton width={88} height={28} borderRadius={14} style={{ marginLeft: 'auto' }} />}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 16 }}>
        <Skeleton width={48} height={11} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={sl.notifRow}>
            <Skeleton width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="62%" height={14} />
              <Skeleton width="88%" height={12} />
              <Skeleton width="28%" height={10} />
            </View>
          </View>
        ))}
        <Skeleton width={64} height={11} style={{ marginTop: 4 }} />
        {[0, 1].map((i) => (
          <View key={`b-${i}`} style={sl.notifRow}>
            <Skeleton width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="70%" height={12} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

export const SkeletonWalletPaymentsBody = memo(function SkeletonWalletPaymentsBody() {
  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 20, paddingBottom: 40 }}>
      <Skeleton height={168} borderRadius={16} />
      <Skeleton width={100} height={10} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={sl.quickPayTile}>
            <Skeleton width={40} height={40} borderRadius={20} style={{ alignSelf: 'center' }} />
            <Skeleton width="80%" height={10} style={{ marginTop: 8, alignSelf: 'center' }} />
          </View>
        ))}
      </View>
      <Skeleton width={120} height={12} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={sl.txnRow}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, gap: 4 }}>
            <Skeleton width="50%" height={13} />
            <Skeleton width="35%" height={11} />
          </View>
          <Skeleton width={56} height={16} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonSubscriptionPlansBody = memo(function SkeletonSubscriptionPlansBody() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 16, gap: 8 }}>
        <Skeleton width={104} height={104} borderRadius={52} />
        <Skeleton width={160} height={22} />
        <Skeleton width={200} height={13} />
      </View>
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={sl.planCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Skeleton width={80} height={18} />
              <Skeleton width={72} height={22} borderRadius={11} />
            </View>
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} width={`${85 - j * 10}%`} height={12} style={{ marginBottom: 8 }} />
            ))}
          </View>
        ))}
        <Skeleton height={52} borderRadius={14} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
});

export const SkeletonReferralsBody = memo(function SkeletonReferralsBody() {
  return (
    <View style={{ paddingHorizontal: 24, gap: 20, paddingBottom: 40 }}>
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
        <Skeleton width={88} height={88} borderRadius={44} />
        <Skeleton width={200} height={22} />
        <Skeleton width={260} height={13} />
      </View>
      <Skeleton height={120} borderRadius={16} />
      <Skeleton width={140} height={12} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={sl.listRowCard}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, gap: 4 }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="40%" height={11} />
          </View>
          <Skeleton width={48} height={18} borderRadius={9} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonRebookListBody = memo(function SkeletonRebookListBody() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={sl.rebookCard}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Skeleton width={48} height={48} borderRadius={24} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="65%" height={15} />
              <Skeleton width="45%" height={12} />
              <Skeleton width="55%" height={12} />
            </View>
          </View>
          <Skeleton height={40} borderRadius={12} style={{ marginTop: 12 }} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonPostRequestListBody = memo(function SkeletonPostRequestListBody() {
  return (
    <View style={{ paddingHorizontal: 20, gap: 14, paddingTop: 8 }}>
      <Skeleton width={140} height={14} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={sl.requestCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Skeleton width={72} height={22} borderRadius={11} />
            <Skeleton width={48} height={12} />
          </View>
          <Skeleton width="80%" height={16} />
          <Skeleton width="95%" height={12} style={{ marginTop: 8 }} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Skeleton width={100} height={28} borderRadius={14} />
            <Skeleton width={80} height={28} borderRadius={14} />
          </View>
        </View>
      ))}
    </View>
  );
});

export const SkeletonGuaranteeBody = memo(function SkeletonGuaranteeBody() {
  return (
    <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 8, paddingBottom: 40 }}>
      <Skeleton height={100} borderRadius={16} />
      <Skeleton width={120} height={12} />
      {[0, 1].map((i) => (
        <View key={i} style={sl.guaranteeClaimCard}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="60%" height={12} style={{ marginTop: 8 }} />
          <Skeleton width={80} height={22} borderRadius={11} style={{ marginTop: 10 }} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonLiveTrackingBody = memo(function SkeletonLiveTrackingBody() {
  return (
    <View style={{ flex: 1 }}>
      <Skeleton height={320} borderRadius={0} />
      <View style={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={16} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={72} height={32} borderRadius={16} />
        </View>
        <Skeleton height={88} borderRadius={16} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Skeleton height={48} borderRadius={12} style={{ flex: 1 }} />
          <Skeleton height={48} borderRadius={12} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
});

export const SkeletonPortfolioBody = memo(function SkeletonPortfolioBody() {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Skeleton height={44} borderRadius={12} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} width="31%" height={110} borderRadius={12} style={{ flexGrow: 1, maxWidth: '31%' }} />
        ))}
      </View>
    </View>
  );
});

export const SkeletonBrowseRequestCard = memo(function SkeletonBrowseRequestCard() {
  return (
    <View style={sl.browseReqCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <Skeleton width={88} height={24} borderRadius={12} />
        <Skeleton width={52} height={12} />
      </View>
      <Skeleton width="85%" height={16} />
      <Skeleton width="100%" height={12} style={{ marginTop: 8 }} />
      <Skeleton width="70%" height={12} style={{ marginTop: 4 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Skeleton width={72} height={72} borderRadius={10} />
        <Skeleton width={72} height={72} borderRadius={10} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Skeleton width={120} height={28} borderRadius={14} />
        <Skeleton width={100} height={28} borderRadius={14} />
      </View>
      <Skeleton width="45%" height={12} style={{ marginTop: 12 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Skeleton height={40} borderRadius={12} style={{ flex: 1 }} />
        <Skeleton height={40} borderRadius={12} style={{ flex: 1 }} />
      </View>
    </View>
  );
});

export const SkeletonBrowseRequestsBody = memo(function SkeletonBrowseRequestsBody() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14, paddingBottom: 24 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width={i === 0 ? 48 : 92} height={34} borderRadius={20} />
        ))}
      </ScrollView>
      {[0, 1, 2].map((i) => (
        <SkeletonBrowseRequestCard key={i} />
      ))}
    </View>
  );
});

export const SkeletonWorkerBookingCard = memo(function SkeletonWorkerBookingCard() {
  return (
    <View style={sl.workerBookingCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <Skeleton width={72} height={22} borderRadius={11} />
        <Skeleton width={64} height={12} />
      </View>
      <Skeleton width="70%" height={16} style={{ marginBottom: 10 }} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} width={`${75 - i * 8}%`} height={12} style={{ marginBottom: 6 }} />
      ))}
      <Skeleton height={40} borderRadius={12} style={{ marginTop: 12 }} />
    </View>
  );
});

export const SkeletonJobsIndexBody = memo(function SkeletonJobsIndexBody() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}>
      <Skeleton width={160} height={14} style={{ marginBottom: 4 }} />
      {[0, 1, 2].map((i) => (
        <SkeletonWorkerBookingCard key={i} />
      ))}
      <Skeleton width={120} height={14} style={{ marginTop: 8, marginBottom: 4 }} />
      {[0, 1].map((i) => (
        <View key={`j-${i}`} style={sl.jobCard}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="90%" height={12} style={{ marginTop: 8 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <Skeleton width={80} height={14} />
            <Skeleton width={72} height={28} borderRadius={14} />
          </View>
        </View>
      ))}
    </View>
  );
});

export const SkeletonJobDetailBody = memo(function SkeletonJobDetailBody() {
  return (
    <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 8, paddingBottom: 40 }}>
      <Skeleton width={100} height={24} borderRadius={12} />
      <Skeleton width="90%" height={22} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="85%" height={14} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Skeleton width={100} height={28} borderRadius={14} />
        <Skeleton width={80} height={28} borderRadius={14} />
      </View>
      <Skeleton height={120} borderRadius={16} />
      <Skeleton height={52} borderRadius={14} />
    </View>
  );
});

export const SkeletonLeaderboardBody = memo(function SkeletonLeaderboardBody() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}>
      <Skeleton height={140} borderRadius={16} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={sl.leaderRow}>
          <Skeleton width={28} height={16} />
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={{ flex: 1, gap: 4 }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={11} />
          </View>
          <Skeleton width={48} height={16} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonAchievementsBody = memo(function SkeletonAchievementsBody() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 16, paddingTop: 8 }}>
      <Skeleton height={100} borderRadius={16} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={sl.achievementTile}>
            <Skeleton width={48} height={48} borderRadius={24} style={{ alignSelf: 'center' }} />
            <Skeleton width="80%" height={11} style={{ marginTop: 8, alignSelf: 'center' }} />
          </View>
        ))}
      </View>
    </View>
  );
});

export const SkeletonChatBody = memo(function SkeletonChatBody() {
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 8, justifyContent: 'flex-end' }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ alignItems: i % 2 === 0 ? 'flex-end' : 'flex-start', gap: 4 }}>
          <Skeleton width={i % 2 === 0 ? '45%' : '62%'} height={36} borderRadius={18} />
          {i % 3 === 0 && <Skeleton width={48} height={10} borderRadius={8} />}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <Skeleton height={44} borderRadius={22} style={{ flex: 1 }} />
        <Skeleton width={44} height={44} borderRadius={22} />
      </View>
    </View>
  );
});

export const SkeletonSupportListBody = memo(function SkeletonSupportListBody() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 10, paddingTop: 8 }}>
      <Skeleton height={48} borderRadius={12} style={{ marginBottom: 8 }} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={sl.supportTicketRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="40%" height={11} />
          </View>
          <Skeleton width={64} height={22} borderRadius={11} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonSupportTicketDetailBody = memo(function SkeletonSupportTicketDetailBody() {
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Skeleton width="75%" height={18} />
      <Skeleton width={88} height={22} borderRadius={11} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="90%" height={14} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[sl.chatBubble, i % 2 === 1 && { alignSelf: 'flex-end' }]}>
          <Skeleton width={220} height={14} />
          <Skeleton width={120} height={12} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
});

export const SkeletonVerificationIntroBody = memo(function SkeletonVerificationIntroBody() {
  return (
    <View style={{ paddingHorizontal: 24, gap: 16, paddingTop: 16, paddingBottom: 40 }}>
      <Skeleton width={180} height={24} />
      <Skeleton width="92%" height={14} />
      <Skeleton width="78%" height={14} />
      <Skeleton height={120} borderRadius={16} />
      <Skeleton height={52} borderRadius={12} />
    </View>
  );
});

export const SkeletonWorkerDetailBody = memo(function SkeletonWorkerDetailBody() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 16 }}>
        <View style={sl.backBtn} />
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Skeleton width={88} height={88} borderRadius={44} />
          <Skeleton width={160} height={20} style={{ marginTop: 12 }} />
          <Skeleton width={120} height={13} style={{ marginTop: 8 }} />
          <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={72} borderRadius={12} style={{ flex: 1 }} />
          ))}
        </View>
        <Skeleton width={90} height={13} style={{ marginBottom: 10 }} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={sl.serviceLine}>
            <View style={{ flex: 1, gap: 4 }}>
              <Skeleton width="50%" height={14} />
              <Skeleton width="30%" height={14} />
            </View>
          </View>
        ))}
        <Skeleton height={52} borderRadius={14} style={{ marginTop: 20 }} />
      </View>
    </View>
  );
});

const sl = StyleSheet.create({
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(13,13,13,0.04)',
  },
  bookingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  customerBookingCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 12,
  },
  addressCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  notifHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    elevation: 1,
  },
  quickPayTile: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 12,
    elevation: 1,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    elevation: 1,
  },
  planCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    elevation: 1,
  },
  listRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    elevation: 1,
  },
  rebookCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    elevation: 1,
  },
  requestCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    elevation: 1,
  },
  guaranteeClaimCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
    elevation: 1,
  },
  browseReqCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    elevation: 1,
  },
  workerBookingCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
    elevation: 1,
  },
  jobCard: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    elevation: 1,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 12,
    elevation: 1,
  },
  achievementTile: {
    width: '31%',
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    elevation: 1,
  },
  supportTicketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    elevation: 1,
  },
  chatBubble: {
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 14,
    maxWidth: '85%',
    elevation: 1,
  },
  serviceLine: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: CARD,
    paddingHorizontal: 14,
  },
});
