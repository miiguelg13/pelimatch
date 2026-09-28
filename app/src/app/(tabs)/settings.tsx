import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Label, Screen, Title } from '@/components/ui';
import { api, API_URL, errorText } from '@/lib/api';
import { usePartner, useStore } from '@/lib/store';
import type { Me } from '@/lib/types';
import { colors, fonts, space } from '@/theme';

export default function Settings() {
  const { me, setMe, forgetDevice } = useStore();
  const partner = usePartner();
  const [name, setName] = useState(me?.user.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = me?.couple?.members.find((m) => m.id === me.user.id);

  async function saveName() {
    if (!name.trim() || name.trim() === me?.user.name) return;
    setBusy(true);
    try {
      setMe(await api<Me>('/me', { method: 'PATCH', body: { name: name.trim() } }));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    Alert.alert('¿Dejar la pareja?', `Dejaréis de compartir sesiones y matches con ${partner?.name ?? 'tu pareja'}. Para volver necesitaréis un código nuevo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Dejar la pareja',
        style: 'destructive',
        onPress: async () => {
          try {
            setMe(await api<Me>('/couple/leave', { method: 'POST' }));
            router.replace('/pair');
          } catch (err) {
            setError(errorText(err));
          }
        },
      },
    ]);
  }

  function forget() {
    Alert.alert('¿Olvidar este móvil?', 'Se borra tu sesión de este teléfono y no podrás recuperar esta cuenta. Úsalo solo si vas a empezar de cero.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Olvidar',
        style: 'destructive',
        onPress: async () => {
          await forgetDevice();
          router.replace('/welcome');
        },
      },
    ]);
  }

  return (
    <Screen scroll edges={['top']}>
      <Title>Ajustes</Title>

      <Card>
        <Field label="Tu nombre" value={name} onChangeText={setName} onBlur={saveName} onSubmitEditing={saveName} maxLength={40} returnKeyType="done" />
        {busy ? <Body muted style={{ fontSize: 13 }}>Guardando…</Body> : null}
      </Card>

      <View style={{ gap: space(2) }}>
        <Row
          title="Letterboxd"
          detail={mine ? `${mine.watched} vistas · ${mine.watchlist} en watchlist${me?.user.letterboxdUser ? ` · @${me.user.letterboxdUser}` : ''}` : ''}
          onPress={() => router.push('/letterboxd')}
        />
        <Row
          title="Vuestras plataformas"
          detail={me?.couple?.providers.length ? `${me.couple.providers.length} elegidas` : 'Ninguna elegida'}
          onPress={() => router.push('/providers')}
        />
      </View>

      <Card>
        <Label>Pareja</Label>
        <Body>
          {me?.user.name} y {partner?.name ?? '…'}
        </Body>
        {partner ? (
          <Body muted style={{ fontSize: 14 }}>
            {partner.name}: {partner.watched} vistas · {partner.watchlist} en watchlist
          </Body>
        ) : null}
        <Button title="Dejar la pareja" variant="danger" onPress={leave} />
      </Card>

      <ErrorText>{error}</ErrorText>

      <View style={{ gap: space(2), marginTop: space(2) }}>
        <Text style={st.attrib}>
          Este producto usa la API de TMDB, pero TMDB no lo respalda ni lo certifica. Datos de plataformas de JustWatch. Películas vistas de tu
          cuenta de Letterboxd.
        </Text>
        <Text style={st.attrib}>Servidor: {API_URL}</Text>
        <Button title="Olvidar este móvil" variant="ghost" onPress={forget} />
      </View>
    </Screen>
  );
}

function Row({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [st.row, pressed && { backgroundColor: colors.surface2 }]} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.rowTitle}>{title}</Text>
        {detail ? <Text style={st.rowDetail}>{detail}</Text> : null}
      </View>
      <ChevronRight size={20} color={colors.muted} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: space(4),
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  rowDetail: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  attrib: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.faint },
});
