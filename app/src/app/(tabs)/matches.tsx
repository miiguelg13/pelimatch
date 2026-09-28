import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { metaLine } from '@/components/MovieCard';
import { ProviderLogos } from '@/components/ProviderLogos';
import { Body, ErrorText, Label, Loading, Title } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { MatchItem } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

export default function Matches() {
  const { matchesVersion } = useStore();
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ matches: MatchItem[] }>('/matches');
      setItems(r.matches);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ matches: MatchItem[] }>('/matches')
      .then((r) => {
        if (!alive) return;
        setItems(r.matches);
        setError(null);
      })
      .catch((err) => alive && setError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [matchesVersion]);

  async function toggle(m: MatchItem) {
    setItems((list) => list?.map((x) => (x.id === m.id ? { ...x, watched: !m.watched } : x)) ?? null);
    try {
      await api(`/matches/${m.id}`, { method: 'PATCH', body: { watched: !m.watched } });
    } catch (err) {
      setItems((list) => list?.map((x) => (x.id === m.id ? { ...x, watched: m.watched } : x)) ?? null);
      setError(errorText(err));
    }
  }

  if (!items) {
    return error ? (
      <SafeAreaView style={st.screen}>
        <ErrorText>{error}</ErrorText>
      </SafeAreaView>
    ) : (
      <Loading />
    );
  }

  const pending = items.filter((m) => !m.watched);
  const watched = items.filter((m) => m.watched);
  const rows: ({ kind: 'head'; label: string } | { kind: 'item'; m: MatchItem })[] = [
    ...(pending.length ? [{ kind: 'head' as const, label: 'Por ver' }, ...pending.map((m) => ({ kind: 'item' as const, m }))] : []),
    ...(watched.length ? [{ kind: 'head' as const, label: 'Ya vistas juntos' }, ...watched.map((m) => ({ kind: 'item' as const, m }))] : []),
  ];

  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'head' ? r.label : r.m.id)}
        contentContainerStyle={{ padding: space(5), gap: space(3), flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.gold}
            colors={[colors.gold]}
            progressBackgroundColor={colors.surface}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: space(1), marginBottom: space(2) }}>
            <Title>Matches</Title>
            <ErrorText>{error}</ErrorText>
          </View>
        }
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Body muted style={{ textAlign: 'center' }}>
              Aún no hay ninguno. Cuando a los dos os guste la misma peli, aparecerá aquí.
            </Body>
          </View>
        }
        renderItem={({ item: r }) =>
          r.kind === 'head' ? (
            <Label style={{ marginTop: space(3) }}>{r.label}</Label>
          ) : (
            <Pressable
              style={[st.row, r.m.watched && { opacity: 0.6 }]}
              onPress={() => router.push({ pathname: '/movie/[id]', params: { id: String(r.m.movie.id), matchId: r.m.id, watched: r.m.watched ? '1' : '' } })}
            >
              <Image source={r.m.movie.poster} style={st.poster} contentFit="cover" />
              <View style={{ flex: 1, gap: space(1) }}>
                <Text style={st.title} numberOfLines={2}>
                  {r.m.movie.title}
                </Text>
                <Text style={st.meta}>{metaLine(r.m.movie)}</Text>
                <ProviderLogos providers={r.m.movie.providers} size={22} style={{ marginTop: space(1) }} />
              </View>
              <Pressable
                onPress={() => toggle(r.m)}
                hitSlop={10}
                style={[st.check, r.m.watched && st.checkOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: r.m.watched }}
                accessibilityLabel={`${r.m.movie.title}: vista`}
              >
                <Check size={18} color={r.m.watched ? colors.goldInk : colors.muted} strokeWidth={2.5} />
              </Pressable>
            </Pressable>
          )
        }
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    gap: space(3),
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space(3),
    borderWidth: 1,
    borderColor: colors.line,
  },
  poster: { width: 60, height: 90, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  check: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
