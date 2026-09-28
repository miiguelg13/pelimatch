import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Heart, Plus, Undo2, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Label, Screen, Title } from '@/components/ui';
import { SwipeDeck, type DeckHandle } from '@/components/SwipeDeck';
import { api, errorText } from '@/lib/api';
import { usePartner, useStore } from '@/lib/store';
import type { Card, Movie } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

export default function Choose() {
  const { session, showMatch } = useStore();
  const partner = usePartner();
  const deck = useRef<DeckHandle>(null);
  // Swipes hechos en este móvil encima de `session.mySwipes` (null = deshecho: vuelve a salir).
  const [local, setLocal] = useState<Record<number, boolean | null>>({});
  const [last, setLast] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionId = session?.id;
  const [seenSession, setSeenSession] = useState(sessionId);
  if (seenSession !== sessionId) {
    // Sesión nueva: se olvida lo local.
    setSeenSession(sessionId);
    setLocal({});
    setLast(null);
  }

  const remaining = useMemo(
    () =>
      session
        ? session.cards.filter((c) => {
            const v = local[c.id];
            if (v === null) return true;
            if (v !== undefined) return false;
            return !(String(c.id) in session.mySwipes);
          })
        : [],
    [session, local],
  );

  if (!session) {
    return (
      <Screen>
        <View style={st.empty}>
          <Title style={{ textAlign: 'center' }}>¿Qué vemos hoy?</Title>
          <Body muted style={{ textAlign: 'center' }}>
            Crea una sesión con lo que os apetezca y {partner?.name ?? 'tu pareja'} la verá al momento en su móvil.
          </Body>
          <Button title="Nueva sesión" icon={<Plus size={18} color={colors.goldInk} />} onPress={() => router.push('/new-session')} />
        </View>
      </Screen>
    );
  }

  const total = session.cards.length;
  const mine = total - remaining.length;
  const theirs = partner ? (session.progress[partner.id] ?? 0) : 0;

  async function swipe(card: Card, liked: boolean) {
    setLocal((l) => ({ ...l, [card.id]: liked }));
    setLast(card);
    setError(null);
    try {
      const r = await api<{ match: Movie | null }>(`/sessions/${session!.id}/swipe`, { method: 'POST', body: { tmdbId: card.id, liked } });
      if (r.match) showMatch(r.match);
    } catch (err) {
      // No se guardó: la carta vuelve al mazo.
      setLocal((l) => {
        const { [card.id]: _, ...rest } = l;
        return rest;
      });
      setError(errorText(err));
    }
  }

  function undo() {
    if (!last) return;
    // Vuelve arriba del mazo; al deslizarla otra vez se sobrescribe en el servidor.
    setLocal((l) => ({ ...l, [last.id]: null }));
    setLast(null);
  }

  const matchedCards = session.cards.filter((c) => session.matches.includes(c.id));

  return (
    <Screen edges={['top']} style={{ paddingBottom: space(3) }}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <Label>
            Tú {mine}/{total} · {partner?.name ?? 'Pareja'} {theirs}/{total}
          </Label>
          <View style={st.bars}>
            <View style={st.track}>
              <View style={[st.fill, { width: `${(mine / total) * 100}%` }]} />
            </View>
            <View style={st.track}>
              <View style={[st.fill, { width: `${(theirs / total) * 100}%`, backgroundColor: colors.muted }]} />
            </View>
          </View>
        </View>
        <Pressable onPress={() => router.push('/new-session')} style={st.iconBtn} hitSlop={8} accessibilityLabel="Nueva sesión">
          <Plus size={22} color={colors.text} />
        </Pressable>
      </View>

      {remaining.length ? (
        <>
          <View style={{ flex: 1 }}>
            <SwipeDeck ref={deck} cards={remaining} onSwipe={swipe} />
          </View>
          <ErrorText>{error}</ErrorText>
          <View style={st.actions}>
            <RoundButton label="Deshacer" size={48} onPress={undo} disabled={!last}>
              <Undo2 size={20} color={colors.muted} />
            </RoundButton>
            <RoundButton label="Paso" size={68} onPress={() => deck.current?.swipe(false)} border={colors.coral}>
              <X size={30} color={colors.coral} strokeWidth={2.5} />
            </RoundButton>
            <RoundButton label="Me apetece" size={68} onPress={() => deck.current?.swipe(true)} fill={colors.gold}>
              <Heart size={28} color={colors.goldInk} fill={colors.goldInk} />
            </RoundButton>
            <View style={{ width: 48 }} />
          </View>
        </>
      ) : (
        <View style={st.doneBox}>
          <Title>{matchedCards.length ? '¡Tenéis peli!' : 'Mazo terminado'}</Title>
          <Body muted>
            {theirs < total
              ? `${partner?.name ?? 'Tu pareja'} va por la ${theirs} de ${total}. Los matches os llegarán en cuanto termine.`
              : matchedCards.length
                ? 'Estas os han gustado a los dos:'
                : 'Esta vez no ha habido suerte. Probad con otros filtros.'}
          </Body>
          {matchedCards.length ? (
            <View style={st.matchRow}>
              {matchedCards.map((c) => (
                <Pressable key={c.id} onPress={() => router.push({ pathname: '/movie/[id]', params: { id: String(c.id) } })} style={{ width: '31%' }}>
                  <Image source={c.poster} style={st.miniPoster} contentFit="cover" />
                  <Text style={st.miniTitle} numberOfLines={2}>
                    {c.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Button title="Nueva sesión" variant={matchedCards.length ? 'secondary' : 'primary'} onPress={() => router.push('/new-session')} />
        </View>
      )}
    </Screen>
  );
}

function RoundButton({
  children,
  label,
  size,
  onPress,
  disabled,
  fill,
  border,
}: {
  children: React.ReactNode;
  label: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
  fill?: string;
  border?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fill ?? colors.surface,
          borderWidth: fill ? 0 : 1.5,
          borderColor: border ?? colors.line,
          opacity: disabled ? 0.35 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

const st = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', gap: space(4) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  bars: { gap: 4, marginTop: space(2) },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.gold },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(5), paddingTop: space(2) },
  doneBox: { flex: 1, justifyContent: 'center', gap: space(4) },
  matchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  miniPoster: { width: '100%', aspectRatio: 2 / 3, borderRadius: radius.md, backgroundColor: colors.surface2 },
  miniTitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.text, marginTop: space(1) },
});
