import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { Check, ExternalLink, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { metaLine } from '@/components/MovieCard';
import { Body, Button, ErrorText, Label, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import type { Movie, Provider } from '@/lib/types';
import { useStore } from '@/lib/store';
import { colors, fonts, radius, space } from '@/theme';

export default function MovieScreen() {
  const { id, matchId, watched: watchedParam } = useLocalSearchParams<{ id: string; matchId?: string; watched?: string }>();
  const { me } = useStore();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(!!watchedParam);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Movie>(`/movies/${id}`)
      .then(setMovie)
      .catch((err) => setError(errorText(err)));
  }, [id]);

  async function markWatched() {
    if (!matchId) return;
    setBusy(true);
    try {
      await api(`/matches/${matchId}`, { method: 'PATCH', body: { watched: !watched } });
      setWatched((w) => !w);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!movie) return error ? <View style={st.pad}><ErrorText>{error}</ErrorText></View> : <Loading />;
  const mine = new Set(me?.couple?.providers ?? []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: space(10) }}>
      <View style={st.hero}>
        {movie.backdrop || movie.poster ? (
          <Image source={movie.backdrop ?? movie.poster} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        <LinearGradient colors={['rgba(18,16,20,0.2)', colors.bg]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={st.pad}>
        <Text style={st.title}>{movie.title}</Text>
        {movie.originalTitle && movie.originalTitle !== movie.title ? <Body muted>{movie.originalTitle}</Body> : null}
        <Text style={st.meta}>{metaLine(movie)}</Text>
        {movie.genres.length ? <Body muted>{movie.genres.join(' · ')}</Body> : null}

        <View style={{ gap: space(3), marginTop: space(2) }}>
          {movie.trailer ? (
            <Button title="Ver tráiler" icon={<Play size={18} color={colors.goldInk} fill={colors.goldInk} />} onPress={() => Linking.openURL(movie.trailer!)} />
          ) : null}
          {matchId ? (
            <Button
              title={watched ? 'Vista juntos' : 'Marcar como vista'}
              variant="secondary"
              loading={busy}
              icon={<Check size={18} color={watched ? colors.gold : colors.text} />}
              onPress={markWatched}
            />
          ) : null}
        </View>

        {movie.overview ? <Body style={{ marginTop: space(2) }}>{movie.overview}</Body> : null}
        {movie.director ? <Body muted>Dirige {movie.director}</Body> : null}
        {movie.cast.length ? <Body muted>Con {movie.cast.join(', ')}</Body> : null}

        <View style={{ gap: space(3), marginTop: space(4) }}>
          <Label>Dónde verla</Label>
          {movie.providers.length ? (
            <ProviderList list={movie.providers} mine={mine} />
          ) : (
            <Body muted>No está en ninguna plataforma de suscripción en España.</Body>
          )}
          {movie.rentOrBuy.length ? (
            <>
              <Label style={{ marginTop: space(2) }}>Alquiler o compra</Label>
              <ProviderList list={movie.rentOrBuy} mine={mine} />
            </>
          ) : null}
          {movie.watchLink ? (
            <Button title="Ver todas las opciones" variant="ghost" icon={<ExternalLink size={18} color={colors.text} />} onPress={() => Linking.openURL(movie.watchLink!)} />
          ) : null}
          <Text style={st.attrib}>Plataformas: JustWatch · Datos: TMDB</Text>
        </View>
        <ErrorText>{error}</ErrorText>
      </View>
    </ScrollView>
  );
}

function ProviderList({ list, mine }: { list: Provider[]; mine: Set<number> }) {
  return (
    <View style={{ gap: space(2) }}>
      {list.map((p) => (
        <View key={p.id} style={st.prov}>
          {p.logo ? <Image source={p.logo} style={st.logo} /> : <View style={st.logo} />}
          <Text style={st.provName}>{p.name}</Text>
          {mine.has(p.id) ? <Text style={st.yours}>La tenéis</Text> : null}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  hero: { height: 300, backgroundColor: colors.surface },
  pad: { paddingHorizontal: space(5), gap: space(2), marginTop: -space(10) },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.text, letterSpacing: -0.5 },
  meta: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  prov: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  logo: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  provName: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  yours: { fontFamily: fonts.bold, fontSize: 13, color: colors.gold },
  attrib: { fontFamily: fonts.body, fontSize: 12, color: colors.faint, marginTop: space(2) },
});
