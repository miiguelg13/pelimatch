import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, useFonts } from '@expo-google-fonts/dm-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MatchOverlay } from '@/components/MatchOverlay';
import { UpdateBanner } from '@/components/UpdateBanner';
import { StoreProvider, useStore } from '@/lib/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root() {
  const { boot } = useStore();
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const ready = fontsLoaded && boot !== 'loading';
  useEffect(() => {
    // Con las fuentes listas se quita el splash; si el servidor tarda, index.tsx avisa.
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: 'DMSans_700Bold' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="pair" options={{ headerShown: false }} />
        <Stack.Screen name="letterboxd" options={{ title: 'Letterboxd' }} />
        <Stack.Screen name="providers" options={{ title: 'Vuestras plataformas' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="new-session" options={{ title: 'Nueva sesión', presentation: 'modal' }} />
        <Stack.Screen name="movie/[id]" options={{ title: '' , headerTransparent: true }} />
      </Stack>
      {ready ? <UpdateBanner /> : null}
      {ready ? <MatchOverlay /> : null}
      <StatusBar style="light" />
    </>
  );
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StoreProvider>
          <Root />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
