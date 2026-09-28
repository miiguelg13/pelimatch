import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { usePartner, useStore } from '@/lib/store';
import type { Card } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';
import { ProviderLogos } from './ProviderLogos';

export function runtimeText(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

export function metaLine(m: { year: number | null; runtime: number | null; rating: number }) {
  return [m.year, runtimeText(m.runtime), m.rating ? `★ ${m.rating.toFixed(1).replace('.', ',')}` : null].filter(Boolean).join('  ·  ');
}

/** Por qué sale esta película (lo más útil primero). */
function useReason(card: Card) {
  const { me } = useStore();
  const partner = usePartner();
  if (card.reason === 'watchlist') {
    if (card.inWatchlistOf.length > 1) return 'En vuestras dos watchlists';
    if (card.inWatchlistOf[0] === me?.user.id) return 'En tu watchlist';
    return `En la watchlist de ${partner?.name ?? 'tu pareja'}`;
  }
  if (card.reason === 'recommended') return 'Por lo que os ha gustado';
  return 'Popular';
}

export function MovieCard({ card, details }: { card: Card; details: boolean }) {
  const reason = useReason(card);
  const both = card.reason === 'watchlist' && card.inWatchlistOf.length > 1;
  return (
    <View style={st.card}>
      {card.poster ? (
        // El póster no recibe toques: el gesto es de la carta (en web, además, evita el arrastre nativo de <img>).
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image source={card.poster} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={String(card.id)} />
        </View>
      ) : null}
      <LinearGradient
        colors={['rgba(18,16,20,0)', 'rgba(18,16,20,0.55)', 'rgba(18,16,20,0.97)']}
        locations={[0.35, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {details ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(18,16,20,0.82)' }]} /> : null}

      <View style={[st.badge, both && st.badgeGold]}>
        <Text style={[st.badgeText, both && { color: colors.goldInk }]}>{reason}</Text>
      </View>

      <View style={st.info}>
        <Text style={st.title} numberOfLines={details ? 3 : 2}>
          {card.title}
        </Text>
        <Text style={st.meta}>{metaLine(card)}</Text>
        {card.genres.length ? <Text style={st.genres}>{card.genres.slice(0, 3).join(' · ')}</Text> : null}
        {details ? (
          <View style={{ gap: space(2), marginTop: space(2) }}>
            {card.overview ? (
              <Text style={st.overview} numberOfLines={9}>
                {card.overview}
              </Text>
            ) : null}
            {card.director ? <Text style={st.credit}>Dirige {card.director}</Text> : null}
            {card.cast.length ? <Text style={st.credit}>Con {card.cast.slice(0, 3).join(', ')}</Text> : null}
          </View>
        ) : null}
        <ProviderLogos providers={card.providers} style={{ marginTop: space(3) }} />
        {!details ? <Text style={st.hint}>Toca para ver la sinopsis</Text> : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  badge: {
    position: 'absolute',
    top: space(4),
    left: space(4),
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderRadius: 999,
    backgroundColor: 'rgba(18,16,20,0.78)',
  },
  badgeGold: { backgroundColor: colors.gold },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space(5), gap: space(1) },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 33, color: colors.text, letterSpacing: -0.5 },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.text, opacity: 0.9 },
  genres: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  overview: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  credit: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.faint, marginTop: space(2) },
});
