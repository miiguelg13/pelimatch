import { router } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Label, Screen, Title } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { Me } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

export default function Pair() {
  const { me, setMe } = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | 'leave' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const couple = me?.couple;

  // En cuanto el otro entra (llega por el socket), a importar Letterboxd.
  useEffect(() => {
    if (couple?.complete) router.replace({ pathname: '/letterboxd', params: { onboarding: '1' } });
  }, [couple?.complete]);

  async function run(kind: 'create' | 'join' | 'leave', fn: () => Promise<Me>) {
    setBusy(kind);
    setError(null);
    try {
      setMe(await fn());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const create = () => run('create', () => api<Me>('/couple', { method: 'POST' }));
  const join = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return setError('El código tiene 6 caracteres');
    return run('join', () => api<Me>('/couple/join', { method: 'POST', body: { code: c } }));
  };
  const leave = () => run('leave', () => api<Me>('/couple/leave', { method: 'POST' }));

  const joinForm = (
    <View style={{ gap: space(3) }}>
      <Field
        label="Tengo un código"
        placeholder="ABC123"
        value={code}
        onChangeText={(t) => setCode(t.replace(/[^a-z0-9]/gi, '').toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        style={st.codeInput}
        returnKeyType="go"
        onSubmitEditing={join}
      />
      <Button title="Unirme" variant="secondary" onPress={join} loading={busy === 'join'} disabled={code.length !== 6} />
    </View>
  );

  if (couple && !couple.complete) {
    return (
      <Screen scroll>
        <Title>Pásale este código</Title>
        <Body muted>Cuando lo meta en su móvil, os emparejáis y seguís los dos.</Body>
        <Card style={{ alignItems: 'center', paddingVertical: space(8) }}>
          <Text style={st.code} selectable accessibilityLabel={`Código ${couple.code.split('').join(' ')}`}>
            {couple.code}
          </Text>
          <View style={st.waiting}>
            <ActivityIndicator color={colors.muted} size="small" />
            <Body muted>Esperando a tu pareja…</Body>
          </View>
        </Card>
        <Button
          title="Enviar código"
          icon={<Share2 size={18} color={colors.goldInk} />}
          onPress={() => Share.share({ message: `Únete a mi Pelimatch con el código ${couple.code}` })}
        />
        <View style={st.sep} />
        {joinForm}
        <ErrorText>{error}</ErrorText>
        <Button title="Cancelar" variant="ghost" onPress={leave} loading={busy === 'leave'} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Label>Hola, {me?.user.name}</Label>
      <Title>Ahora, tu pareja</Title>
      <Body muted>Uno crea la pareja y le pasa el código al otro.</Body>
      <Button title="Crear pareja" onPress={create} loading={busy === 'create'} style={{ marginTop: space(2) }} />
      <View style={st.sep} />
      {joinForm}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

const st = StyleSheet.create({
  code: { fontFamily: fonts.displayHeavy, fontSize: 48, letterSpacing: 8, color: colors.gold },
  codeInput: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: 6, textAlign: 'center' },
  waiting: { flexDirection: 'row', gap: space(2), alignItems: 'center', marginTop: space(4) },
  sep: { height: 1, backgroundColor: colors.line, marginVertical: space(2), borderRadius: radius.pill },
});
