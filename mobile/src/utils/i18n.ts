import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '../translations/en';
import hi from '../translations/hi';
import mr from '../translations/mr';
import bn from '../translations/bn';
import te from '../translations/te';
import ta from '../translations/ta';
import ur from '../translations/ur';
import gu from '../translations/gu';
import kn from '../translations/kn';
import ml from '../translations/ml';
import or from '../translations/or';
import pa from '../translations/pa';
import as from '../translations/as';
import ne from '../translations/ne';
import mai from '../translations/mai';
import sat from '../translations/sat';
import sd from '../translations/sd';
import kok from '../translations/kok';
import doi from '../translations/doi';
import bho from '../translations/bho';

const LANG_KEY = 'kaamwala_language';

const allTranslations: Record<string, Record<string, string>> = {
  en,
  hi,
  mr,
  bn,
  te,
  ta,
  ur,
  gu,
  kn,
  ml,
  or,
  pa,
  as,
  ne,
  mai,
  sat,
  sd,
  kok,
  doi,
  bho
};

let currentLang = 'en';
let currentTranslations: Record<string, string> = en; // Default to English
const listeners: (() => void)[] = [];

export async function initI18n() {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    if (saved) {
      await setLanguage(saved);
    } else {
      // No saved language - ensure English is loaded
      currentLang = 'en';
      currentTranslations = en;
      listeners.forEach(fn => fn());
    }
  } catch {
    // Fallback to English on error
    currentLang = 'en';
    currentTranslations = en;
    listeners.forEach(fn => fn());
  }
}

export async function hasSavedLanguage() {
  try {
    return !!(await AsyncStorage.getItem(LANG_KEY));
  } catch {
    return false;
  }
}

export function getCurrentLang() {
  return currentLang;
}

export async function setLanguage(code: string) {
  currentLang = code;
  currentTranslations = allTranslations[code] || en; // Fallback to English
  try {
    await AsyncStorage.setItem(LANG_KEY, code);
  } catch {}
  // Notify all React components to re-render
  listeners.forEach(fn => fn());
}

export function t(key: string, fallback?: string): string {
  return currentTranslations[key] || fallback || key;
}

export function translateDynamic(text: string): string {
  if (!text) return text;

  // E.g., "A worker is interested in your request: Plumbing"
  const workerInterest = text.match(/^(A worker is interested in your request:) (.*)$/);
  if (workerInterest) return `${t(workerInterest[1])} ${t(workerInterest[2])}`;

  // E.g., "You've been selected for: Plumbing"
  const selectedFor = text.match(/^(You've been selected for:) (.*)$/);
  if (selectedFor) return `${t(selectedFor[1])} ${t(selectedFor[2])}`;

  // E.g., "You have a new booking: Plumbing"
  const newBooking = text.match(/^(You have a new booking:) (.*)$/);
  if (newBooking) return `${t(newBooking[1])} ${t(newBooking[2])}`;

  // E.g., "You have a new request for Plumbing"
  const newReq = text.match(/^(You have a new request for) (.*)$/);
  if (newReq) return `${t(newReq[1])} ${t(newReq[2])}`;

  // E.g., "Booking #B-123 was cancelled. Reason: WORKER_DELAY"
  const cancelMatch = text.match(/^Booking (#[a-zA-Z0-9-]+) (was cancelled\. Reason:) (.*)$/);
  if (cancelMatch) return `${t('Booking')} ${cancelMatch[1]} ${t(cancelMatch[2])} ${t(cancelMatch[3])}`;

  // E.g., "Booking cancelled by you. Reason: WORKER_DELAY"
  const cancelYouMatch = text.match(/^(Booking cancelled by you\. Reason:) (.*)$/);
  if (cancelYouMatch) return `${t(cancelYouMatch[1])} ${t(cancelYouMatch[2])}`;

  // E.g., "Booking cancelled by the worker. Reason: WORKER_DELAY"
  const cancelWorkerMatch = text.match(/^(Booking cancelled by the worker\. Reason:) (.*)$/);
  if (cancelWorkerMatch) return `${t(cancelWorkerMatch[1])} ${t(cancelWorkerMatch[2])}`;

  return t(text);
}

// React hook that forces re-render when language changes
export function useT() {
  const [, setVer] = useState(0);
  useEffect(() => {
    const fn = () => setVer(v => v + 1);
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);
  return t;
}
