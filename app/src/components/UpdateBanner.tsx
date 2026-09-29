// Actualizaciones sin reinstalar (EAS Update): la app baja la versión nueva en segundo plano
// al abrirse o al volver a primer plano, y cuando la tiene lista ofrece reiniciar.
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, space } from '@/theme';

export function UpdateBanner() {
  // En desarrollo y en web no hay actualizaciones: ni se monta.
  if (!Updates.isEnabled) return null;
  return <Banner />;
}

function Banner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Sin red o sin servidor de actualizaciones: ya lo intentará la próxima vez.
      }
    });
    return () => sub.remove();
  }, []);

  if (!isUpdatePending) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(150)}
      style={[st.wrap, { bottom: insets.bottom + 84 }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={st.text}>Hay una versión nueva de Pelimatch</Text>
      <Pressable
        onPress={() => {
          setRestarting(true);
          Updates.reloadAsync().catch(() => setRestarting(false));
        }}
        disabled={restarting}
        hitSlop={8}
        accessibilityRole="button"
        style={st.btn}
      >
        <Text style={st.btnText}>{restarting ? 'Reiniciando…' : 'Reiniciar'}</Text>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space(4),
    right: space(4),
    zIndex: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
    paddingLeft: space(4),
    paddingRight: space(2),
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  text: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  btn: { paddingHorizontal: space(4), minHeight: 40, justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.gold },
  btnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.goldInk },
});
