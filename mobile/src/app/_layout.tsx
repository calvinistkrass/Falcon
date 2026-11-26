import { Stack } from 'expo-router';
import '@/lib/web-alert';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { Notices } from '@/components/notices';
import BootLoader from '@/components/BootLoader';
import KdfBridge from '@/components/kdf-bridge';
import { C } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Notices />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        <KdfBridge />
        <BootLoader />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
