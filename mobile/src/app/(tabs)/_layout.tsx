import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (on: IconName, off: IconName) => ({ color, focused }: { color: ColorValue; focused: boolean }) =>
  <Ionicons name={focused ? on : off} size={23} color={typeof color === 'string' ? color : C.text3} />;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.text3,
        tabBarStyle: { backgroundColor: C.bg2, borderTopColor: C.line, height: 86, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: C.bg }
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Start', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="browser" options={{ title: 'Browser', tabBarIcon: icon('globe', 'globe-outline') }} />
      <Tabs.Screen name="bookmarks" options={{ title: 'Lesezeichen', tabBarIcon: icon('bookmark', 'bookmark-outline') }} />
      <Tabs.Screen name="devices" options={{ title: 'PC-Tabs', tabBarIcon: icon('desktop', 'desktop-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'Konto', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
