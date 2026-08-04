import { Redirect } from 'expo-router';
import { useAuthStore } from '../store/auth.store';
import { View } from 'react-native';
import { Colors } from '../constants/colors';

export default function Index() {
  const { isAuthenticated, user, _hasHydrated, hasSelectedLanguage } = useAuthStore();

  if (!_hasHydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.cream }} />
    );
  }

  if (!hasSelectedLanguage) {
    return <Redirect href="/(auth)/language-select" />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }
  
  if (user?.isBanned) {
    return <Redirect href="/(banned)" />;
  }

  if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') {
    return <Redirect href="/(admin)/dashboard" />;
  }
  
  if (user?.role === 'WORKER') {
    return <Redirect href="/(worker)/dashboard" />;
  }

  // Default to customer home
  return <Redirect href="/(customer)/home" />;
}
