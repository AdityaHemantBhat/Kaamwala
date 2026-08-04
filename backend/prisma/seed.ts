import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding KaamWala...');

  // ─── Clean ─────────────────────────────────────────────
  await prisma.activityFeedItem.deleteMany();
  await prisma.bookingSafetyCheck.deleteMany();
  await prisma.negotiationOffer.deleteMany();
  await prisma.negotiation.deleteMany();
  await prisma.guaranteeClaim.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.jobPhoto.deleteMany();
  await prisma.workerAchievement.deleteMany();
  await prisma.workerLocation.deleteMany();
  await prisma.workerSchedule.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.review.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.maintenancePlan.deleteMany();
  await prisma.savedWorker.deleteMany();
  await prisma.priceAlert.deleteMany();
  await prisma.demandSignal.deleteMany();
  await prisma.marketRate.deleteMany();
  await prisma.referralEvent.deleteMany();
  await prisma.userSubscription.deleteMany();
  await prisma.workerSubscription.deleteMany();
  await prisma.requestOffer.deleteMany();
  await prisma.requestInterest.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.withdrawalRequest.deleteMany();
  await prisma.workerService.deleteMany();
  await prisma.workerJob.deleteMany();
  await prisma.workerProfile.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.address.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.otpAuditLog.deleteMany();
  await prisma.appBanner.deleteMany();
  await prisma.appConfig.deleteMany();
  await prisma.user.deleteMany();

  // ─── Config ────────────────────────────────────────────
  await prisma.appConfig.createMany({
    data: [
      { key: 'platformFeePercent', value: '15', description: 'Platform fee percentage' },
      { key: 'minWithdrawal', value: '100', description: 'Min withdrawal amount' },
      { key: 'urgentSurge', value: '1.5', description: 'Urgent booking surge multiplier' },
      { key: 'maintenanceMode', value: 'false', description: 'App maintenance mode' },
      { key: 'supportEmail', value: 'support@kaamwala.in', description: 'Support email' },
      { key: 'referrerBonus', value: '75', description: 'Referrer bonus amount' },
      { key: 'referredBonus', value: '50', description: 'Referred user bonus' },
    ],
  });

  // ─── Admin ─────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      phone: '+919999999999', name: 'Vikram Malhotra', role: 'ADMIN',
      referralCode: 'KW-ADMIN1', isActive: true,
    },
  });

  // ─── Customers (8) ────────────────────────────────────
  const customerData = [
    { phone: '+919876502001', name: 'Neha Agarwal', city: 'Delhi', area: 'Lajpat Nagar', tier: 'GOLD', bookings: 12, spent: 8500, wallet: 50, points: 340 },
    { phone: '+919876502002', name: 'Rohit Mehta', city: 'Mumbai', area: 'Bandra', tier: 'SILVER', bookings: 8, spent: 5200, wallet: 25, points: 180 },
    { phone: '+919876502003', name: 'Sanjay Krishnamurthy', city: 'Bengaluru', area: 'Indiranagar', tier: 'BRONZE', bookings: 3, spent: 1200, wallet: 0, points: 30 },
    { phone: '+919876502004', name: 'Pooja Joshi', city: 'Delhi', area: 'Vasant Kunj', tier: 'SILVER', bookings: 7, spent: 4100, wallet: 0, points: 150 },
    { phone: '+919876502005', name: 'Amit Yadav', city: 'Pune', area: 'Aundh', tier: 'BRONZE', bookings: 2, spent: 900, wallet: 0, points: 20 },
    { phone: '+919876502006', name: 'Meera Pillai', city: 'Chennai', area: 'Velachery', tier: 'BRONZE', bookings: 1, spent: 500, wallet: 0, points: 10 },
    { phone: '+919876502007', name: 'Akash Bansal', city: 'Delhi', area: 'Greater Kailash', tier: 'GOLD', bookings: 15, spent: 12000, wallet: 150, points: 420 },
    { phone: '+919876502008', name: 'Divya Nair', city: 'Mumbai', area: 'Juhu', tier: 'SILVER', bookings: 6, spent: 3800, wallet: 0, points: 130 },
  ];

  const customers: any[] = [];

  // Consistent per-city base coordinates — customers and workers in the same city
  // must be within radius of each other (radius matching + hyperlocal pricing).
  const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    Delhi: { lat: 28.61, lng: 77.21 },
    Mumbai: { lat: 19.07, lng: 72.87 },
    Bengaluru: { lat: 12.97, lng: 77.59 },
    Chennai: { lat: 13.08, lng: 80.27 },
    Pune: { lat: 18.52, lng: 73.85 },
    Hyderabad: { lat: 17.38, lng: 78.49 },
  };
  const cityCoords = (city: string) => CITY_COORDS[city] || CITY_COORDS.Delhi;

  for (const c of customerData) {
    const user = await prisma.user.create({
      data: {
        phone: c.phone, name: c.name, role: 'CUSTOMER', referralCode: `KW-${c.name.split(' ')[0].toUpperCase()}1`,
        customerProfile: {
          create: {
            totalBookings: c.bookings, totalSpent: c.spent, walletBalance: c.wallet,
            loyaltyPoints: c.points, loyaltyTier: c.tier as any, totalSaved: Math.floor(c.spent * 0.15),
          },
        },
      },
      include: { customerProfile: true },
    });

    // Service location must match the customer's city — coordinates
    // drive radius matching + hyperlocal pricing.
    const cc = cityCoords(c.city);
    await prisma.address.create({
      data: {
        userId: user.id, label: 'Home', line1: `${Math.floor(Math.random() * 999) + 1}, ${c.area}`,
        city: c.city, state: c.city === 'Mumbai' ? 'Maharashtra' : c.city === 'Bengaluru' ? 'Karnataka' : c.city === 'Chennai' ? 'Tamil Nadu' : c.city === 'Pune' ? 'Maharashtra' : 'Delhi',
        pincode: '11000' + Math.floor(Math.random() * 9), latitude: cc.lat + Math.random() * 0.02, longitude: cc.lng + Math.random() * 0.02,
        isDefault: true,
      },
    });
    customers.push(user);
  }

  // ─── Workers (12) ──────────────────────────────────────
  const workerData = [
    { phone: '+919876501001', name: 'Ramesh Kumar Yadav', cat: 'PLUMBER', city: 'Delhi', area: 'Lajpat Nagar', rate: 350, rating: 4.8, jobs: 124, featured: true, verified: true, guarantee: false, urgent: false, yrs: 8 },
    { phone: '+919876501002', name: 'Mohammed Salim Khan', cat: 'ELECTRICIAN', city: 'Mumbai', area: 'Andheri', rate: 400, rating: 4.9, jobs: 89, featured: false, verified: true, guarantee: true, urgent: false, yrs: 12 },
    { phone: '+919876501003', name: 'Priya Sharma', cat: 'MAID', city: 'Bengaluru', area: 'Koramangala', rate: 800, rating: 4.7, jobs: 201, featured: false, verified: true, guarantee: false, urgent: false, yrs: 6 },
    { phone: '+919876501004', name: 'Suresh Babu Nair', cat: 'CARPENTER', city: 'Chennai', area: 'T. Nagar', rate: 500, rating: 4.6, jobs: 67, featured: false, verified: true, guarantee: false, urgent: false, yrs: 15 },
    { phone: '+919876501005', name: 'Anita Devi Singh', cat: 'COOK', city: 'Delhi', area: 'Dwarka', rate: 600, rating: 4.8, jobs: 95, featured: false, verified: true, guarantee: true, urgent: false, yrs: 5 },
    { phone: '+919876501006', name: 'Arjun Rajesh Patil', cat: 'AC_TECHNICIAN', city: 'Pune', area: 'Baner', rate: 600, rating: 4.9, jobs: 143, featured: false, verified: true, guarantee: false, urgent: true, yrs: 9 },
    { phone: '+919876501007', name: 'Deepak Verma', cat: 'PAINTER', city: 'Hyderabad', area: 'Banjara Hills', rate: 200, rating: 4.5, jobs: 38, featured: false, verified: false, guarantee: false, urgent: false, yrs: 3 },
    { phone: '+919876501008', name: 'Kavya Reddy Nambiar', cat: 'TUTOR', city: 'Bengaluru', area: 'HSR Layout', rate: 500, rating: 5.0, jobs: 29, featured: false, verified: true, guarantee: false, urgent: false, yrs: 4 },
    { phone: '+919876501009', name: 'Ravi Shankar Gupta', cat: 'PEST_CONTROL', city: 'Delhi', area: 'Rohini', rate: 1200, rating: 4.7, jobs: 54, featured: false, verified: true, guarantee: false, urgent: false, yrs: 7 },
    { phone: '+919876501010', name: 'Fatima Begum', cat: 'BABYSITTER', city: 'Mumbai', area: 'Powai', rate: 600, rating: 4.8, jobs: 41, featured: false, verified: true, guarantee: false, urgent: false, yrs: 6 },
    { phone: '+919876501011', name: 'Chandan Kumar', cat: 'GARDENER', city: 'Bengaluru', area: 'Whitefield', rate: 800, rating: 4.6, jobs: 33, featured: false, verified: false, guarantee: false, urgent: false, yrs: 2 },
    { phone: '+919876501012', name: 'Sunita Rani Kapoor', cat: 'DRIVER', city: 'Delhi', area: 'Pitampura', rate: 1500, rating: 4.7, jobs: 78, featured: false, verified: true, guarantee: false, urgent: false, yrs: 10 },
  ];

  const workers: any[] = [];
  for (const w of workerData) {
    const user = await prisma.user.create({
      data: {
        phone: w.phone, name: w.name, role: 'WORKER', referralCode: `KW-${w.name.split(' ')[0].toUpperCase()}1`,
        workerProfile: {
          create: {
            category: w.cat as any, city: w.city, state: w.city === 'Delhi' ? 'Delhi' : w.city === 'Mumbai' ? 'Maharashtra' : w.city === 'Bengaluru' ? 'Karnataka' : w.city === 'Chennai' ? 'Tamil Nadu' : w.city === 'Pune' ? 'Maharashtra' : 'Telangana',
            pincode: '11000' + Math.floor(Math.random() * 9),
            latitude: cityCoords(w.city).lat + Math.random() * 0.02,
            longitude: cityCoords(w.city).lng + Math.random() * 0.02,
            hourlyRate: w.rate, rating: w.rating, totalRatings: Math.floor(w.jobs * 0.8), completedJobs: w.jobs, cancelledJobs: Math.floor(w.jobs * 0.05), disputedJobs: Math.floor(w.jobs * 0.02),
            totalEarned: w.jobs * w.rate, thisMonthEarned: Math.floor(Math.random() * 5000) + 2000, walletBalance: Math.floor(Math.random() * 3000),
            isAvailable: true, isOnline: true, isFeatured: w.featured, isGuaranteed: w.guarantee, isUrgentEligible: w.urgent,
            verificationStatus: w.verified ? 'VERIFIED' : 'PENDING', experienceYears: w.yrs, serviceRadiusKm: 10,
            languages: ['hi', 'en'], skills: [w.cat.toLowerCase().replace(/_/g, ' '), 'repair', 'installation'],
            responseTimeMinutes: Math.floor(Math.random() * 15) + 5, acceptanceRate: 85 + Math.floor(Math.random() * 15),
            bio: `Experienced ${w.cat.replace(/_/g, ' ').toLowerCase()} with ${w.yrs}+ years. ${w.jobs} happy customers. ${w.guarantee ? 'KaamWala Guaranteed.' : ''}`,
            services: {
              create: [
                { name: `Basic ${w.cat.replace(/_/g, ' ')} Service`, description: `Standard ${w.cat.replace(/_/g, ' ').toLowerCase()} service — inspection and repair`, basePrice: w.rate },
                { name: `Premium ${w.cat.replace(/_/g, ' ')} Service`, description: `Comprehensive ${w.cat.replace(/_/g, ' ').toLowerCase()} with warranty`, basePrice: w.rate * 1.5 },
              ],
            },
          },
        },
      },
      include: { workerProfile: { include: { services: true } } },
    });

    // Add achievements
    const badges = ['FIRST_JOB', 'RISING_STAR'];
    if (w.jobs > 50) badges.push('TRUSTED_PRO');
    if (w.jobs > 30) badges.push('PHOTO_PRO');
    if (w.rating > 4.8) badges.push('SPEED_DEMON');

    for (const badge of badges) {
      await prisma.workerAchievement.create({
        data: { workerProfileId: user.workerProfile!.id, badge, notified: true },
      });
    }

    workers.push(user);
  }

  // ─── Bookings (20) ─────────────────────────────────────
  const [neha, rohit, sanjay, pooja, amit, meera, akash, divya] = customers;
  const [ramesh, salim, priya, suresh, anita, arjun, deepak, kavya, ravi, fatima, chandan, sunita] = workers;

  const bookingSeeds = [
    { customer: neha, worker: ramesh, cat: 'PLUMBER', status: 'COMPLETED', amount: 350, desc: 'Tap replacement in kitchen', scheduledAt: new Date(Date.now() - 7 * 86400000), completedAt: new Date(Date.now() - 7 * 86400000 + 7200000), review: { rating: 5, comment: 'Excellent work! Fixed the leak quickly. Very professional.' } },
    { customer: rohit, worker: salim, cat: 'ELECTRICIAN', status: 'COMPLETED', amount: 400, desc: 'Wiring repair for new AC unit', scheduledAt: new Date(Date.now() - 5 * 86400000), completedAt: new Date(Date.now() - 5 * 86400000 + 5400000), review: { rating: 5, comment: 'Salim bhai ne wiring sahi ki. Bahut accha kaam.' } },
    { customer: pooja, worker: anita, cat: 'COOK', status: 'COMPLETED', amount: 600, desc: 'Daily cooking for family of 4', scheduledAt: new Date(Date.now() - 3 * 86400000), completedAt: new Date(Date.now() - 3 * 86400000 + 7200000), review: { rating: 4, comment: 'Good cook. Sabjiyaan tasty thi.' } },
    { customer: akash, worker: ramesh, cat: 'PLUMBER', status: 'COMPLETED', amount: 700, desc: 'Bathroom pipe leakage repair', scheduledAt: new Date(Date.now() - 2 * 86400000), completedAt: new Date(Date.now() - 2 * 86400000 + 3600000), review: { rating: 5, comment: 'Ramesh ji is the best plumber in Delhi. Third time booking!' } },
    { customer: divya, worker: fatima, cat: 'BABYSITTER', status: 'COMPLETED', amount: 600, desc: 'Evening babysitting for toddler', scheduledAt: new Date(Date.now() - 86400000), completedAt: new Date(Date.now() - 86400000 + 14400000), review: { rating: 5, comment: 'Fatima is so gentle with my baby. Highly recommend.' } },
    { customer: neha, worker: arjun, cat: 'AC_TECHNICIAN', status: 'IN_PROGRESS', amount: 600, desc: 'AC gas refill + service', scheduledAt: new Date(Date.now() - 1800000) },
    { customer: akash, worker: ravi, cat: 'PEST_CONTROL', status: 'IN_PROGRESS', amount: 1200, desc: 'Full home pest control — 3BHK', scheduledAt: new Date(Date.now() - 3600000) },
    { customer: rohit, worker: arjun, cat: 'AC_TECHNICIAN', status: 'IN_PROGRESS', amount: 900, desc: 'Split AC not cooling properly', scheduledAt: new Date(Date.now() - 7200000) },
    { customer: sanjay, worker: kavya, cat: 'TUTOR', status: 'ACCEPTED', amount: 500, desc: 'Mathematics tuition for Class 10', scheduledAt: new Date(Date.now() + 86400000) },
    { customer: meera, worker: suresh, cat: 'CARPENTER', status: 'ACCEPTED', amount: 500, desc: 'Custom bookshelf for bedroom', scheduledAt: new Date(Date.now() + 2 * 86400000) },
    { customer: pooja, worker: sunita, cat: 'DRIVER', status: 'ACCEPTED', amount: 1500, desc: 'Airport pickup and drop — full day', scheduledAt: new Date(Date.now() + 86400000) },
    { customer: amit, worker: deepak, cat: 'PAINTER', status: 'ACCEPTED', amount: 4000, desc: 'Living room painting — 2 coats', scheduledAt: new Date(Date.now() + 3 * 86400000) },
    { customer: neha, worker: priya, cat: 'MAID', status: 'PENDING', amount: 800, desc: 'Weekly deep cleaning — 2BHK', scheduledAt: new Date(Date.now() + 4 * 86400000) },
    { customer: akash, worker: chandan, cat: 'GARDENER', status: 'PENDING', amount: 800, desc: 'Garden maintenance — trimming + planting', scheduledAt: new Date(Date.now() + 5 * 86400000) },
    { customer: rohit, worker: salim, cat: 'ELECTRICIAN', status: 'PENDING', amount: 1200, desc: 'URGENT — No power in half the house!', scheduledAt: new Date(Date.now() + 1800000) }, // urgent
    { customer: divya, worker: fatima, cat: 'BABYSITTER', status: 'CANCELLED', amount: 600, desc: 'Weekend babysitting', scheduledAt: new Date(Date.now() - 2 * 86400000), cancelledAt: new Date(Date.now() - 3 * 86400000), cancelReason: 'Change of plans — going out of town' },
    { customer: amit, worker: suresh, cat: 'CARPENTER', status: 'CANCELLED', amount: 500, desc: 'Wardrobe repair', scheduledAt: new Date(Date.now() - 86400000), cancelledAt: new Date(Date.now() - 2 * 86400000), cancelReason: 'Found cheaper option elsewhere' },
    { customer: sanjay, worker: ramesh, cat: 'PLUMBER', status: 'DISPUTED', amount: 350, desc: 'Toilet flush repair', scheduledAt: new Date(Date.now() - 10 * 86400000) },
    { customer: pooja, worker: anita, cat: 'COOK', status: 'DISPUTED', amount: 600, desc: 'Weekly meal prep', scheduledAt: new Date(Date.now() - 8 * 86400000) },
    { customer: akash, worker: priya, cat: 'MAID', status: 'NEGOTIATING', amount: 800, desc: 'Bi-weekly cleaning service', scheduledAt: new Date(Date.now() + 86400000) },
  ];

  for (const b of bookingSeeds) {
    const booking = await prisma.booking.create({
      data: {
        type: b.status === 'PENDING' && b.cat === 'MAID' ? 'URGENT' : 'STANDARD',
        bookingNumber: `KW25${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        customerId: b.customer.id, workerId: b.worker.id,
        addressId: (await prisma.address.findFirst({ where: { userId: b.customer.id } }))!.id,
        serviceCategory: b.cat as any, serviceName: `${b.cat.replace(/_/g, ' ')} Service`,
        description: b.desc, scheduledAt: b.scheduledAt, estimatedDuration: 120,
        status: b.status as any, paymentStatus: b.status === 'COMPLETED' ? 'PAID' : 'PENDING',
        baseAmount: b.amount, platformFeePercent: 15, platformFee: Math.round(b.amount * 0.15),
        workerEarnings: b.amount - Math.round(b.amount * 0.15), totalAmount: b.amount,
        completedAt: (b as any).completedAt || undefined,
        cancelledAt: (b as any).cancelledAt || undefined,
        cancelReason: (b as any).cancelReason || undefined,
      },
    });

    // Completed reviews
    if (b.status === 'COMPLETED' && (b as any).review) {
      const r = (b as any).review;
      await prisma.review.create({
        data: {
          bookingId: booking.id, authorId: b.customer.id, targetId: b.worker.id,
          rating: r.rating, comment: r.comment, hasPhotos: Math.random() > 0.7, isVerifiedPurchase: true,
        },
      });

      // Create chat for completed bookings
      await prisma.chat.create({
        data: {
          bookingId: booking.id,
          messages: {
            create: [
              { senderId: b.customer.id, type: 'text', content: 'Hi! Are you available for the service tomorrow?', isRead: true, createdAt: b.scheduledAt },
              { senderId: b.worker.id, type: 'text', content: 'Yes, I will be there at 10 AM. Thank you!', isRead: true, createdAt: new Date(b.scheduledAt.getTime() + 60000) },
            ],
          },
        },
      });
    }

    // Negotiation for NEGOTIATING booking
    if (b.status === 'NEGOTIATING') {
      const neg = await prisma.negotiation.create({
        data: {
          bookingId: booking.id, status: 'OPEN', rounds: 1, expiresAt: new Date(Date.now() + 2 * 86400000),
          offers: {
            create: [
              { offeredBy: b.customer.id, amount: Math.round(b.amount * 0.8), message: `Can you do at ₹${Math.round(b.amount * 0.8)}?` },
            ],
          },
        },
      });
    }

    // Disputes
    if (b.status === 'DISPUTED') {
      await prisma.dispute.create({
        data: {
          bookingId: booking.id, raisedBy: b.customer.id,
          reason: 'Service not as expected. Work was incomplete.',
          customerEvidence: [], workerEvidence: [], decision: 'PENDING',
          timeline: { bookingCreated: b.scheduledAt, status: 'DISPUTED' },
        },
      });
    }

    // Feed items
    if (['COMPLETED', 'IN_PROGRESS'].includes(b.status)) {
      const workerUser = b.worker;
      await prisma.activityFeedItem.create({
        data: {
          city: b.cat === 'PLUMBER' || b.cat === 'MAID' || b.cat === 'COOK' || b.cat === 'DRIVER' || b.cat === 'PEST_CONTROL' ? 'Delhi' : b.cat === 'ELECTRICIAN' || b.cat === 'BABYSITTER' ? 'Mumbai' : b.cat === 'CARPENTER' ? 'Chennai' : b.cat === 'AC_TECHNICIAN' ? 'Pune' : 'Bengaluru',
          category: b.cat as any, eventType: b.status === 'COMPLETED' ? 'job_completed' : 'booking_created',
          message: b.status === 'COMPLETED'
            ? `A ${b.cat.replace(/_/g, ' ').toLowerCase()} just completed a job`
            : `${b.cat.replace(/_/g, ' ')} service in progress`,
        },
      });
    }
  }

  // ─── Job Photos (3 before/after) ────────────────────────
  const completedBookings = await prisma.booking.findMany({ where: { status: 'COMPLETED' }, take: 3 });
  for (let i = 0; i < completedBookings.length; i++) {
    const bk = completedBookings[i];
    const wp = await prisma.workerProfile.findUnique({ where: { userId: bk.workerId } });
    if (wp) {
      await prisma.jobPhoto.create({
        data: {
          workerProfileId: wp.id, bookingId: bk.id,
          beforeUrl: `https://res.cloudinary.com/demo/image/upload/v1/jobs/before_${i + 1}.jpg`,
          afterUrl: `https://res.cloudinary.com/demo/image/upload/v1/jobs/after_${i + 1}.jpg`,
          caption: `${bk.serviceName} — before and after`,
          customerApproved: true, isPublic: true,
        },
      });
    }
  }

  // ─── Worker Schedules ──────────────────────────────────
  const wpIds = await prisma.workerProfile.findMany({ select: { id: true, userId: true } });
  for (const wp of wpIds) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(Date.now() + d * 86400000);
      await prisma.workerSchedule.create({
        data: {
          workerProfileId: wp.id, date, // @db.Date accepts a JS Date, not a bare YYYY-MM-DD string
          morningSlot: true, afternoonSlot: d < 5, eveningSlot: d % 2 === 0,
        },
      });
    }
  }

  // ─── Demand Signals ────────────────────────────────────
  const cities = ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Pune', 'Hyderabad'];
  for (const city of cities) {
    for (const cat of ['PLUMBER', 'ELECTRICIAN', 'AC_TECHNICIAN', 'MAID', 'COOK']) {
      for (let h = 0; h < 24; h += 4) {
        const score = cat === 'PLUMBER' || cat === 'ELECTRICIAN' ? 1.3 + Math.random() * 0.4 : 0.8 + Math.random() * 0.5;
        await prisma.demandSignal.create({
          data: {
            category: cat as any, city, hour: h, dayOfWeek: Math.floor(Math.random() * 7),
            demandScore: score, surgeActive: score > 1.3, surgeMultiplier: score > 1.3 ? Math.min(1.0 + (score - 1.3) * 0.5, 1.5) : 1.0,
          },
        });
      }
    }
  }

  // ─── Market Rates ──────────────────────────────────────
  const rateData = [
    { cat: 'PLUMBER', city: 'Delhi', rate: 400 }, { cat: 'PLUMBER', city: 'Mumbai', rate: 500 }, { cat: 'PLUMBER', city: 'Bengaluru', rate: 450 },
    { cat: 'ELECTRICIAN', city: 'Delhi', rate: 450 }, { cat: 'ELECTRICIAN', city: 'Mumbai', rate: 550 }, { cat: 'ELECTRICIAN', city: 'Bengaluru', rate: 500 },
    { cat: 'MAID', city: 'Delhi', rate: 900 }, { cat: 'MAID', city: 'Mumbai', rate: 1200 }, { cat: 'MAID', city: 'Bengaluru', rate: 1000 },
    { cat: 'AC_TECHNICIAN', city: 'Delhi', rate: 700 }, { cat: 'AC_TECHNICIAN', city: 'Mumbai', rate: 800 }, { cat: 'AC_TECHNICIAN', city: 'Bengaluru', rate: 750 },
    { cat: 'CARPENTER', city: 'Delhi', rate: 600 }, { cat: 'CARPENTER', city: 'Mumbai', rate: 700 }, { cat: 'CARPENTER', city: 'Bengaluru', rate: 650 },
    { cat: 'COOK', city: 'Delhi', rate: 700 }, { cat: 'COOK', city: 'Mumbai', rate: 800 }, { cat: 'COOK', city: 'Bengaluru', rate: 750 },
    { cat: 'PAINTER', city: 'Delhi', rate: 250 }, { cat: 'PAINTER', city: 'Mumbai', rate: 300 }, { cat: 'PAINTER', city: 'Bengaluru', rate: 280 },
    { cat: 'PEST_CONTROL', city: 'Delhi', rate: 1500 }, { cat: 'PEST_CONTROL', city: 'Mumbai', rate: 1800 }, { cat: 'PEST_CONTROL', city: 'Bengaluru', rate: 1600 },
    { cat: 'DRIVER', city: 'Delhi', rate: 1800 }, { cat: 'DRIVER', city: 'Mumbai', rate: 2000 }, { cat: 'DRIVER', city: 'Bengaluru', rate: 1500 },
  ];

  for (const r of rateData) {
    await prisma.marketRate.create({
      data: { category: r.cat as any, city: r.city, serviceType: `${r.cat.toLowerCase()}_visit`, marketRate: r.rate },
    });
  }

  // ─── App Banners ───────────────────────────────────────
  await prisma.appBanner.createMany({
    data: [
      { title: 'MONSOON SALE!', subtitle: '50% OFF on AC servicing', imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/banners/ac_sale.png', deepLink: 'kaamwala://category/AC_TECHNICIAN', bgColor: '#FF5C00', type: 'promotional', sortOrder: 1 },
      { title: 'REFER & EARN', subtitle: 'Get ₹75 per referral', imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/banners/refer.png', deepLink: 'kaamwala://referral', bgColor: '#0D0D0D', type: 'promotional', sortOrder: 2 },
      { title: '⚡ HIGH DEMAND', subtitle: 'Electricians busy — book early', imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/banners/surge.png', deepLink: 'kaamwala://category/ELECTRICIAN', bgColor: '#8B1A1A', type: 'surge', sortOrder: 3 },
      { title: 'KAAMWALA PLUS', subtitle: 'Save 20% on every booking', imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/banners/plus.png', deepLink: 'kaamwala://subscription', bgColor: '#1A3A5C', type: 'promotional', sortOrder: 4 },
    ],
  });

  // ─── Subscriptions ─────────────────────────────────────
  for (const c of [customers[0], customers[6]]) { // Neha and Akash have Plus
    await prisma.userSubscription.create({
      data: {
        userId: c.id, plan: 'PLUS', status: 'active',
        currentPeriodStart: new Date(Date.now() - 15 * 86400000),
        currentPeriodEnd: new Date(Date.now() + 15 * 86400000),
      },
    });
  }

  // Worker plans are FREE/PRO/ELITE (separate from customer plans)
  if (workers.length >= 2) {
    await prisma.workerSubscription.create({
      data: {
        userId: workers[0].id, plan: 'PRO', status: 'active',
        currentPeriodStart: new Date(Date.now() - 15 * 86400000),
        currentPeriodEnd: new Date(Date.now() + 15 * 86400000),
      },
    });
    await prisma.workerSubscription.create({
      data: {
        userId: workers[1].id, plan: 'ELITE', status: 'active',
        currentPeriodStart: new Date(Date.now() - 15 * 86400000),
        currentPeriodEnd: new Date(Date.now() + 15 * 86400000),
      },
    });
  }

  // ─── Maintenance Plans ─────────────────────────────────
  await prisma.maintenancePlan.create({
    data: {
      customerId: customers[0].id, workerId: workers[0].id, serviceCategory: 'PLUMBER',
      serviceName: 'Quarterly Plumbing Check', frequencyMonths: 3,
      nextServiceAt: new Date(Date.now() + 30 * 86400000), isActive: true, totalServices: 2,
    },
  });
  await prisma.maintenancePlan.create({
    data: {
      customerId: customers[6].id, workerId: workers[5].id, serviceCategory: 'AC_TECHNICIAN',
      serviceName: 'AC Service — Every 3 Months', frequencyMonths: 3,
      nextServiceAt: new Date(Date.now() + 45 * 86400000), isActive: true, totalServices: 1,
    },
  });

  // ─── Saved Workers ─────────────────────────────────────
  await prisma.savedWorker.create({ data: { userId: customers[0].id, workerId: workers[0].id } });
  await prisma.savedWorker.create({ data: { userId: customers[0].id, workerId: workers[5].id } });
  await prisma.savedWorker.create({ data: { userId: customers[6].id, workerId: workers[0].id } });
  await prisma.savedWorker.create({ data: { userId: customers[1].id, workerId: workers[1].id } });

  // ─── Transactions ──────────────────────────────────────
  for (const b of completedBookings) {
    const bk = await prisma.booking.findUnique({ where: { id: b.id } });
    if (!bk) continue;
    await prisma.transaction.create({
      data: {
        userId: bk.customerId, bookingId: bk.id, type: 'BOOKING_PAYMENT',
        amount: bk.totalAmount, description: `Payment for ${bk.serviceName}`, status: 'completed',
      },
    });
    await prisma.transaction.create({
      data: {
        userId: bk.workerId, bookingId: bk.id, type: 'PLATFORM_COMMISSION',
        amount: bk.platformFee, description: 'Platform fee deducted', status: 'completed',
      },
    });
  }

  // ─── Price Alerts ──────────────────────────────────────
  await prisma.priceAlert.create({
    data: { userId: customers[0].id, category: 'AC_TECHNICIAN', city: 'Delhi', alertType: 'off_peak' },
  });
  await prisma.priceAlert.create({
    data: { userId: customers[1].id, category: 'ELECTRICIAN', city: 'Mumbai', alertType: 'surge_warning' },
  });

  // ─── Support Tickets ───────────────────────────────────
  await prisma.supportTicket.create({
    data: {
      userId: customers[2].id, subject: 'Payment not reflecting', description: 'I paid via UPI but the booking still shows pending.',
      status: 'open', priority: 'high',
    },
  });

  // ─── App Config ──────────────────────────────────────────────
  await prisma.appConfig.upsert({
    where: { key: 'LATE_CANCELLATION_FEE' },
    update: {},
    create: { key: 'LATE_CANCELLATION_FEE', value: '50', description: 'Late cancellation fee for BASIC plan users (₹)' },
  });

  // ─── Issue Taxonomy (What's Happening?) ─────────────────────
  const initialIssues: { category: string; canonicalId: string; label: string; aliases: string[] }[] = [
    // Plumbing
    { category: 'PLUMBER', canonicalId: 'PIPE_BURST', label: 'Pipe Burst / Leak', aliases: ['pipe burst', 'pipe leak', 'pipeline leak', 'pattar', 'paipe'] },
    { category: 'PLUMBER', canonicalId: 'TAP_REPAIR', label: 'Tap Repair', aliases: ['tap repair', 'tap fix', 'leaking tap', 'tap leak'] },
    { category: 'PLUMBER', canonicalId: 'TAP_INSTALLATION', label: 'Tap Installation', aliases: ['tap installation', 'install tap', 'tap fitting', 'nalka fitting', 'new tap'] },
    { category: 'PLUMBER', canonicalId: 'BLOCKED_DRAIN', label: 'Blocked Drain', aliases: ['blocked drain', 'drain clog', 'drainage block', 'choked drain'] },
    { category: 'PLUMBER', canonicalId: 'NO_WATER', label: 'No Water Supply', aliases: ['no water', 'water not coming', 'water supply issue'] },
    { category: 'PLUMBER', canonicalId: 'TOILET_BLOCKED', label: 'Blocked Toilet', aliases: ['toilet blocked', 'toilet clog', 'commode blocked'] },
    // Electrical
    { category: 'ELECTRICIAN', canonicalId: 'NO_POWER', label: 'No Power / Trip', aliases: ['no power', 'power cut', 'tripping', 'circuit trip', 'mcb trip'] },
    { category: 'ELECTRICIAN', canonicalId: 'SWITCH_SOCKET', label: 'Switch / Socket Repair', aliases: ['switch repair', 'socket repair', 'switch not working', 'socket not working'] },
    { category: 'ELECTRICIAN', canonicalId: 'FAN_REPAIR', label: 'Fan Repair', aliases: ['fan repair', 'fan not working', 'ceiling fan', 'fan fix'] },
    { category: 'ELECTRICIAN', canonicalId: 'WIRING', label: 'Wiring / Rewiring', aliases: ['wiring', 'rewiring', 'short circuit', 'wiring repair'] },
    // AC
    { category: 'AC_TECHNICIAN', canonicalId: 'AC_GAS_FILLING', label: 'AC Gas Filling', aliases: ['ac gas', 'gas filling', 'ac not cooling', 'refrigerant'] },
    { category: 'AC_TECHNICIAN', canonicalId: 'AC_SERVICE', label: 'AC Service / Cleaning', aliases: ['ac service', 'ac cleaning', 'ac maintenance', 'ac filter clean'] },
    { category: 'AC_TECHNICIAN', canonicalId: 'AC_NOT_COOLING', label: 'AC Not Cooling', aliases: ['ac not cooling', 'ac warm', 'no cooling'] },
    // Carpenter
    { category: 'CARPENTER', canonicalId: 'DOOR_REPAIR', label: 'Door Repair', aliases: ['door repair', 'door fix', 'door hinge', 'door not closing'] },
    { category: 'CARPENTER', canonicalId: 'FURNITURE_REPAIR', label: 'Furniture Repair', aliases: ['furniture repair', 'sofa repair', 'chair repair', 'table repair'] },
    { category: 'CARPENTER', canonicalId: 'WARDROBE', label: 'Wardrobe / Modular', aliases: ['wardrobe', 'almirah', 'cupboard', 'modular kitchen'] },
    // Cleaning
    { category: 'MAID', canonicalId: 'FULL_HOUSE_CLEANING', label: 'Full House Cleaning', aliases: ['full house cleaning', 'deep cleaning', 'full cleaning'] },
    { category: 'MAID', canonicalId: 'KITCHEN_CLEANING', label: 'Kitchen Cleaning', aliases: ['kitchen cleaning', 'kitchen scrub'] },
    { category: 'MAID', canonicalId: 'BATHROOM_CLEANING', label: 'Bathroom Cleaning', aliases: ['bathroom cleaning', 'washroom cleaning', 'toilet cleaning'] },
    // Painting
    { category: 'PAINTER', canonicalId: 'FULL_PAINTING', label: 'Full House Painting', aliases: ['full painting', 'house painting', 'complete painting'] },
    { category: 'PAINTER', canonicalId: 'WALL_REPAIR', label: 'Wall Repair / Putty', aliases: ['wall repair', 'putty', 'crack repair', 'wall crack'] },
    // Pest Control
    { category: 'PEST_CONTROL', canonicalId: 'COCKROACH', label: 'Cockroach Treatment', aliases: ['cockroach', 'roach', 'cockroach spray'] },
    { category: 'PEST_CONTROL', canonicalId: 'TERMITE', label: 'Termite Treatment', aliases: ['termite', 'termites', 'wood termite'] },
    { category: 'PEST_CONTROL', canonicalId: 'MOSQUITO', label: 'Mosquito Control', aliases: ['mosquito', 'mosquitoes', 'fogging'] },
  ];

  for (const issue of initialIssues) {
    const created = await prisma.issue.upsert({
      where: { category_canonicalId: { category: issue.category as any, canonicalId: issue.canonicalId } },
      update: { label: issue.label },
      create: {
        category: issue.category as any,
        canonicalId: issue.canonicalId,
        label: issue.label,
        lifecycle: 'ESTABLISHED',
      },
    });
    for (const alias of issue.aliases) {
      await prisma.issueAlias.upsert({
        where: { issueId_alias: { issueId: created.id, alias } },
        update: {},
        create: { issueId: created.id, alias },
      });
    }
  }

  // ─── Market Config defaults ──────────────────────────────────
  const marketConfigs = [
    { key: 'URGENT_MULTIPLIER', value: '1.3', description: 'Urgent booking multiplier applied to market base' },
    { key: 'URGENT_SEARCH_ROUND_SECONDS', value: '300', description: 'Urgent search round duration (seconds)' },
    { key: 'URGENT_MAX_MULTIPLIER', value: '3', description: 'Maximum offer multiple of base price' },
    { key: 'CANCELLATION_COMPENSATION', value: '50', description: 'Worker compensation when customer cancels after protected travel' },
    { key: 'PLATFORM_MIN_HOURLY', value: '150', description: 'Platform minimum hourly floor' },
    { key: 'ISSUE_PROMOTE_OCCURRENCE', value: '10', description: 'Min occurrences to promote a candidate issue' },
    { key: 'ISSUE_PROMOTE_USERS', value: '3', description: 'Min unique users to promote a candidate issue' },
    { key: 'PRICING_ALGORITHM_VERSION', value: 'LOCAL_MARKET_V1', description: 'Current pricing algorithm version' },
  ];
  for (const cfg of marketConfigs) {
    await prisma.marketConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: cfg,
    });
  }

  console.log('✅ Seed completed!');
  console.log(`  👤 Admin: 1 (Vikram Malhotra)`);
  console.log(`  👥 Customers: ${customers.length}`);
  console.log(`  🔧 Workers: ${workers.length}`);
  console.log(`  📅 Bookings: ${bookingSeeds.length}`);
  console.log(`  📊 Demand Signals & Market Rates loaded`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
