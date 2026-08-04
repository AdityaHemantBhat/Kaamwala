import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';

export default function AdminLayout() {
  const { user } = useAuthStore();

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    return <Redirect href="/(customer)/home" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="dashboard" />

      <Stack.Screen name="workers" />
      <Stack.Screen name="bookings" />
      <Stack.Screen name="withdrawals" />
      <Stack.Screen name="tickets" />
      <Stack.Screen name="revenue" />
      <Stack.Screen name="cancellations" />
      <Stack.Screen name="issues" />
      <Stack.Screen name="guarantee" />
      <Stack.Screen name="leads" />
      <Stack.Screen name="pricing" />
      <Stack.Screen name="risk" />
      <Stack.Screen name="marketplace" />
      <Stack.Screen name="super-admin" />
      <Stack.Screen name="disputes" />
      <Stack.Screen name="disputes/[id]" />
    </Stack>
  );
}
