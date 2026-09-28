// Celebración del match: el momento raro y bueno de la app, aquí sí va el «deleite».
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, Keyframe, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '@/lib/store';
import { colors, fonts, radius, space } from '@/theme';
import { metaLine } from './MovieCard';
import { ProviderLogos } from './ProviderLogos';
import { Button } from './ui';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

const posterIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.9 }, { rotate: '-4deg' }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { rotate: '-2deg' }], easing: EASE_OUT },
}).duration(420);

const titleIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 12 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_OUT },
})
  .delay(120)
  .duration(320);

export function MatchOverlay() {
  const { match, clearMatch } = useStore();
  const reduced = useReducedMotion();
  if (!match) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st.backdrop]} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <SafeAreaView style={st.inner} accessibilityViewIsModal>
        <Animated.View entering={reduced ? FadeIn.duration(200) : titleIn} style={{ alignItems: 'center' }}>
          <Text style={st.kicker} accessibilityRole="header">
            ¡Match!
          </Text>
          <Text style={st.sub}>Os apetece a los dos</Text>
        </Animated.View>

        <Animated.View entering={reduced ? FadeIn.duration(200) : posterIn} style={st.posterWrap}>
          {match.poster ? <Image source={match.poster} style={st.poster} contentFit="cover" /> : null}
        </Animated.View>

        <View style={{ alignItems: 'center', gap: space(1) }}>
          <Text style={st.title} numberOfLines={2}>
            {match.title}
          </Text>
          <Text style={st.meta}>{metaLine(match)}</Text>
          <ProviderLogos providers={match.providers} style={{ marginTop: space(2), justifyContent: 'center' }} />
        </View>

        <View style={{ gap: space(3), alignSelf: 'stretch' }}>
          <Button
            title="Ver dónde verla"
            onPress={() => {
              clearMatch();
              router.push({ pathname: '/movie/[id]', params: { id: String(match.id) } });
            }}
          />
          <Button title="Seguir deslizando" variant="ghost" onPress={clearMatch} />
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(12,10,14,0.96)', zIndex: 100 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: space(6) },
  kicker: { fontFamily: fonts.displayHeavy, fontSize: 56, lineHeight: 60, color: colors.gold, letterSpacing: -1.5 },
  sub: { fontFamily: fonts.medium, fontSize: 16, color: colors.muted },
  posterWrap: {
    width: '62%',
    aspectRatio: 2 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: colors.surface2,
  },
  poster: { width: '100%', height: '100%' },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text, textAlign: 'center' },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
});
