import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useStore } from '@/lib/store';
import type { Provider } from '@/lib/types';
import { colors, fonts, space } from '@/theme';

/** Logos de las plataformas; las vuestras primero y resaltadas. */
export function ProviderLogos({ providers, style, size = 28 }: { providers: Provider[]; style?: StyleProp<ViewStyle>; size?: number }) {
  const { me } = useStore();
  const mine = new Set(me?.couple?.providers ?? []);
  if (!providers.length) return null;
  const sorted = [...providers].sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id))).slice(0, 5);
  const ours = sorted.filter((p) => mine.has(p.id));
  return (
    <View style={[st.row, style]} accessibilityLabel={`Disponible en ${providers.map((p) => p.name).join(', ')}`}>
      {sorted.map((p) =>
        p.logo ? (
          <Image
            key={p.id}
            source={p.logo}
            style={[{ width: size, height: size, borderRadius: size / 4 }, mine.has(p.id) ? st.mine : st.other]}
          />
        ) : null,
      )}
      {ours.length ? <Text style={st.text}>La tenéis en {ours[0].name}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), flexWrap: 'wrap' },
  mine: { borderWidth: 1.5, borderColor: colors.gold },
  other: { opacity: 0.6 },
  text: { fontFamily: fonts.medium, fontSize: 13, color: colors.gold, marginLeft: space(1) },
});
