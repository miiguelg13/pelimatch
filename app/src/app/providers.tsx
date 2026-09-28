import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { Me, Provider } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

const FIRST = 12;

export default function Providers() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { me, setMe } = useStore();
  const [list, setList] = useState<Provider[] | null>(null);
  const [sel, setSel] = useState<number[]>(me?.couple?.providers ?? []);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ providers: Provider[] }>('/providers')
      .then((r) => setList(r.providers))
      .catch((err) => setError(errorText(err)));
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setMe(await api<Me>('/couple/providers', { method: 'PUT', body: { providers: sel } }));
      if (onboarding) router.replace('/(tabs)');
      else router.back();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (!list) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  // Las ya elegidas siempre visibles aunque no estén entre las primeras.
  const shown = all ? list : list.filter((p, i) => i < FIRST || sel.includes(p.id));

  return (
    <Screen scroll edges={['bottom']}>
      {onboarding ? <Title>¿Dónde veis pelis?</Title> : null}
      <Body muted>Marcad las plataformas que tenéis entre los dos. Podréis pedir que solo salgan pelis que estén en ellas.</Body>
      <View style={st.grid}>
        {shown.map((p) => {
          const on = sel.includes(p.id);
          return (
            <Pressable
              key={p.id}
              style={[st.item, on && st.itemOn]}
              onPress={() => setSel((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.name}
            >
              {p.logo ? <Image source={p.logo} style={st.logo} contentFit="cover" /> : <View style={st.logo} />}
              <Text style={st.name} numberOfLines={2}>
                {p.name}
              </Text>
              {on ? (
                <View style={st.check}>
                  <Check size={14} color={colors.goldInk} strokeWidth={3} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {!all && list.length > FIRST ? <Button title={`Ver todas (${list.length})`} variant="ghost" onPress={() => setAll(true)} /> : null}
      <ErrorText>{error}</ErrorText>
      <Button title={sel.length ? `Guardar (${sel.length})` : onboarding ? 'Saltar' : 'Guardar'} onPress={save} loading={busy} />
      <Body muted style={st.attrib}>Datos de plataformas: JustWatch</Body>
    </Screen>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  item: {
    width: '30.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: space(2),
    padding: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  itemOn: { borderColor: colors.gold, backgroundColor: '#2A2217' },
  logo: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surface2 },
  name: { fontFamily: fonts.medium, fontSize: 12, color: colors.text, textAlign: 'center' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attrib: { fontSize: 12, textAlign: 'center' },
});
