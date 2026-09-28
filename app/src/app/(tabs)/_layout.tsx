import { Redirect, Tabs } from 'expo-router';
import { Clapperboard, Heart, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/lib/store';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  const { me } = useStore();
  const insets = useSafeAreaInsets();
  if (!me) return <Redirect href="/welcome" />;
  if (!me.couple?.complete) return <Redirect href="/pair" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          height: 66 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 6 + insets.bottom,
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Elegir', tabBarIcon: ({ color }) => <Clapperboard color={color} size={22} /> }} />
      <Tabs.Screen name="matches" options={{ title: 'Matches', tabBarIcon: ({ color }) => <Heart color={color} size={22} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: ({ color }) => <Settings color={color} size={22} /> }} />
    </Tabs>
  );
}
