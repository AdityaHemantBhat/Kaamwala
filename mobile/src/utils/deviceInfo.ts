import { Platform, Dimensions } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Application from 'expo-application';

/**
 * Snapshot of the device the app is running on, sent at login so the backend
 * can persist it on User.deviceInfo. Every read is defensive — a missing value
 * becomes null instead of breaking login.
 */
export async function getDeviceInfo(): Promise<Record<string, unknown>> {
  let deviceId: string | null = null;
  try {
    deviceId =
      Platform.OS === 'android'
        ? Application.getAndroidId()
        : await Application.getIosIdForVendorAsync();
  } catch {
    deviceId = null;
  }

  return {
    platform: Platform.OS,
    osVersion: Platform.Version,
    model: Device.modelName,
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    isTablet: Device.deviceType === Device.DeviceType.TABLET,
    deviceId,
    appVersion: Constants.expoConfig?.version ?? null,
    screen: {
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
    },
  };
}
