/**
 * Shared subscription constants, colors, and plan configurations
 * Used by both customer and worker subscription screens
 */

export const SUBSCRIPTION_COLORS = {
  primary: '#FF5C00',
  dark: '#0D0D0D',
  light: '#F5F0E8',
  gray: '#6B6B6B',
  white: '#FFFFFF',
  lightGray: '#F0EDE6',
  darkGray: '#4A4A4A',
  border: '#EBEBEB',
  elite: '#4A148C',
  success: '#2E7D32',
  warning: '#FFE0B2',
  info: '#FFF4E5',
};

export const SUBSCRIPTION_STYLES = {
  // Shadows
  shadowSmall: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  shadowMedium: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  shadowLarge: {
    elevation: 3,
    shadowColor: '#FF5C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
};

export const CUSTOMER_PLANS = [
  {
    id: 'BASIC',
    name: 'Basic',
    price: 0,
    label: '₹0',
    color: '#6B6B6B',
    features: ['Standard search', '15% commission', 'Email support'],
  },
  {
    id: 'PLUS',
    name: 'Plus',
    price: 199,
    label: '₹199/mo',
    color: '#FF5C00',
    popular: true,
    features: ['10% off all bookings', 'Priority matching', 'Free cancellation', 'Chat support'],
  },
  {
    id: 'PRO',
    name: 'Pro',
    price: 499,
    label: '₹499/mo',
    color: '#D4A017',
    features: [
      '20% off all bookings',
      'Priority matching',
      'Free cancellation',
      'Chat support',
      'Emergency included',
      'Monthly AC checkup',
      '24/7 support',
    ],
  },
];

export const WORKER_PLAN_DETAILS = {
  FREE: {
    commission: '15%',
    color: '#6B6B6B',
    features: [],
  },
  PRO: {
    commission: '10%',
    color: '#FF5C00',
    price: 199,
    features: ['Priority listing', 'Unlimited leads', '10% Flat Commission'],
  },
  ELITE: {
    commission: '5%',
    color: '#4A148C',
    price: 499,
    features: [
      'Featured profile badge',
      'Unlimited priority leads',
      'Only 5% Commission',
      '24/7 dedicated support',
    ],
  },
};
