import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Body, Button, Chip, ErrorText, Label, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { DeckSource, Filters, Session } from '@/lib/types';
import { colors, fonts, space } from '@/theme';

const SOURCES: { id: DeckSource; label: string }[] = [
  { id: 'watchlist', label: 'Vuestras watchlists' },
  { id: 'recommended', label: 'Recomendadas' },
  { id: 'popular', label: 'Populares' },
];

const RUNTIMES: { v: number | null; label: string }[] = [
  { v: null, label: 'Sin límite' },
  { v: 100, label: 'Hasta 1 h 40' },
  { v: 120, label: 'Hasta 2 h' },
  { v: 150, label: 'Hasta 2 h 30' },
];

const ERAS: { id: string; label: string; min: number | null; max: number | null }[] = [
  { id: 'any', label: 'Cualquiera', min: null, max: null },
  { id: 'classic', label: 'Antes de 1980', min: null, max: 1979 },
  { id: '80s90s', label: 'Años 80 y 90', min: 1980, max: 1999 },
  { id: '2000s', label: '2000 – 2014', min: 2000, max: 2014 },
  { id: 'recent', label: 'Desde 2015', min: 2015, max: null },
];

export default function NewSession() {
  const { session, me, setSession } = useStore();
  const prev = session?.filters;
  const [sources, setSources] = useState<DeckSource[]>(prev?.sources ?? ['watchlist', 'recommended', 'popular']);
  const [genres, setGenres] = useState<number[]>(prev?.genres ?? []);
  const [maxRuntime, setMaxRuntime] = useState<number | null>(prev?.maxRuntime ?? null);
  const [era, setEra] = useState(ERAS.find((e) => e.min === (prev?.minYear ?? null) && e.max === (prev?.maxYear ?? null))?.id ?? 'any');
  const hasProviders = !!me?.couple?.providers.length;
  const [onlyMine, setOnlyMine] = useState(prev?.onlyMyProviders ?? hasProviders);
  const [allGenres, setAllGenres] = useState<{ id: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ genres: { id: number; name: string }[] }>('/genres')
      .then((r) => setAllGenres(r.genres))
      .catch(() => {});
  }, []);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function create() {
    if (!sources.length) return setError('Elige al menos de dónde sacar las pelis');
    const e = ERAS.find((x) => x.id === era)!;
    const filters: Filters = { sources, genres, maxRuntime, minYear: e.min, maxYear: e.max, onlyMyProviders: onlyMine && hasProviders };
    setBusy(true);
    setError(null);
    try {
      setSession(await api<Session>('/sessions', { method: 'POST', body: filters, timeoutMs: 120_000 }));
      router.back();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Screen scroll edges={['bottom']}>
      {session ? <Body muted>La sesión actual se cerrará y os saldrá a los dos el mazo nuevo.</Body> : null}

      <Group label="De dónde">
        {SOURCES.map((s) => (
          <Chip key={s.id} label={s.label} selected={sources.includes(s.id)} onPress={() => setSources((l) => toggle(l, s.id))} />
        ))}
      </Group>

      <View style={st.switchRow}>
        <Pressable style={{ flex: 1 }} onPress={() => hasProviders && setOnlyMine((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: onlyMine, disabled: !hasProviders }}>
          <Text style={st.switchTitle}>Solo en nuestras plataformas</Text>
          <Body muted style={{ fontSize: 14 }}>
            {hasProviders ? 'Que se pueda ver ya, sin alquilar.' : 'Primero elige vuestras plataformas en Ajustes.'}
          </Body>
        </Pressable>
        <Switch
          value={onlyMine && hasProviders}
          onValueChange={setOnlyMine}
          disabled={!hasProviders}
          trackColor={{ true: colors.gold, false: colors.surface2 }}
          thumbColor={colors.text}
          accessibilityLabel="Solo en nuestras plataformas"
        />
      </View>

      <Group label="Duración">
        {RUNTIMES.map((r) => (
          <Chip key={r.label} label={r.label} selected={maxRuntime === r.v} onPress={() => setMaxRuntime(r.v)} />
        ))}
      </Group>

      <Group label="Época">
        {ERAS.map((e) => (
          <Chip key={e.id} label={e.label} selected={era === e.id} onPress={() => setEra(e.id)} />
        ))}
      </Group>

      <Group label={genres.length ? `Géneros (${genres.length})` : 'Géneros · cualquiera'}>
        {allGenres.map((g) => (
          <Chip key={g.id} label={g.name} selected={genres.includes(g.id)} onPress={() => setGenres((l) => toggle(l, g.id))} />
        ))}
      </Group>

      <ErrorText>{error}</ErrorText>
      <Button title={busy ? 'Preparando el mazo…' : 'Crear mazo'} onPress={create} loading={busy} />
    </Screen>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(3) }}>
      <Label>{label}</Label>
      <View style={st.chips}>{children}</View>
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(1) },
  switchTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
});
