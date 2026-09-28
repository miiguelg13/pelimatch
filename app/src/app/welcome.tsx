import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Field, Screen } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useStore } from '@/lib/store';
import { colors, fonts, space } from '@/theme';

const STEPS = [
  ['1', 'Os emparejáis con un código.'],
  ['2', 'Traéis lo que habéis visto de Letterboxd.'],
  ['3', 'Deslizáis a la vez. Si a los dos os gusta, hay peli.'],
] as const;

export default function Welcome() {
  const { signUp } = useStore();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!name.trim()) return setError('Escribe cómo te llamas');
    setBusy(true);
    setError(null);
    try {
      await signUp(name.trim());
      router.replace('/pair');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.hero}>
          <Text style={st.brand}>
            Peli<Text style={{ color: colors.gold }}>match</Text>
          </Text>
          <Body muted style={st.tag}>
            Se acabó pasar media hora eligiendo qué ver.
          </Body>
          <View style={st.steps}>
            {STEPS.map(([n, t]) => (
              <View key={n} style={st.step}>
                <Text style={st.num}>{n}</Text>
                <Body style={{ flex: 1 }}>{t}</Body>
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: space(4) }}>
          <Field
            label="¿Cómo te llamas?"
            placeholder="Tu nombre"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="given-name"
            maxLength={40}
            returnKeyType="go"
            onSubmitEditing={go}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Empezar" onPress={go} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { flex: 1, justifyContent: 'center', gap: space(3) },
  brand: { fontFamily: fonts.displayHeavy, fontSize: 52, lineHeight: 56, color: colors.text, letterSpacing: -1.5 },
  tag: { fontSize: 18, lineHeight: 26, maxWidth: 320 },
  steps: { marginTop: space(6), gap: space(4) },
  step: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  num: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.gold,
    color: colors.gold,
    textAlign: 'center',
    lineHeight: 28,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
