import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Loading, Title, s } from '@/components/ui';
import { useStore } from '@/lib/store';
import { space } from '@/theme';

/** Decide a dónde ir según el estado: bienvenida → emparejar → app. */
export default function Index() {
  const { boot, slowBoot, me, retryBoot } = useStore();
  if (boot === 'loading') {
    return <Loading text={slowBoot ? 'Despertando el servidor…\nLa primera vez del día puede tardar un minuto.' : undefined} />;
  }
  if (boot === 'offline') {
    return (
      <View style={[s.center, { gap: space(4) }]}>
        <Title style={{ textAlign: 'center' }}>No hay conexión</Title>
        <Body muted style={{ textAlign: 'center' }}>
          No se ha podido hablar con el servidor. Comprueba que tienes internet y vuelve a probar.
        </Body>
        <Button title="Reintentar" onPress={retryBoot} />
      </View>
    );
  }
  if (!me) return <Redirect href="/welcome" />;
  if (!me.couple?.complete) return <Redirect href="/pair" />;
  return <Redirect href="/(tabs)" />;
}
