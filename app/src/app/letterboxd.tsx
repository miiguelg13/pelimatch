import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { ExternalLink, FileUp } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Label, Screen, Title } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { ImportJob, Me } from '@/lib/types';
import { colors, fonts, radius, space } from '@/theme';

const EXPORT_URL = 'https://letterboxd.com/user/exportdata/';

export default function Letterboxd() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { me, setMe, refreshMe } = useStore();
  const mine = me?.couple?.members.find((m) => m.id === me.user.id);

  // ---- RSS
  const [user, setUser] = useState(me?.user.letterboxdUser ?? '');
  const [rssBusy, setRssBusy] = useState(false);
  const [rssMsg, setRssMsg] = useState<string | null>(null);
  const [rssErr, setRssErr] = useState<string | null>(null);

  async function saveUser() {
    const u = user.trim().replace(/^@/, '');
    setRssBusy(true);
    setRssErr(null);
    setRssMsg(null);
    try {
      const r = await api<Me & { rss: { added: number; total: number } | null }>('/me', {
        method: 'PATCH',
        body: { letterboxdUser: u || null },
      });
      setMe(r);
      setRssMsg(r.rss ? `Conectado. ${r.rss.added} ${r.rss.added === 1 ? 'película nueva' : 'películas nuevas'} de tu diario.` : 'Desconectado.');
    } catch (err) {
      setRssErr(errorText(err));
    } finally {
      setRssBusy(false);
    }
  }

  // ---- export
  const [job, setJob] = useState<ImportJob | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (poll.current) clearInterval(poll.current);
    },
    [],
  );

  async function pick() {
    setUpErr(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'text/csv', 'text/comma-separated-values', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    if (!/\.(zip|csv)$/i.test(asset.name)) {
      setUpErr('Elige el .zip que te da Letterboxd (o uno de sus .csv).');
      return;
    }
    setFileName(asset.name);
    setUpBusy(true);
    setJob(null);
    try {
      const blob = (Platform.OS === 'web' ? asset.file : new FsFile(asset.uri)) as unknown as Blob;
      const r = await api<{ jobId: string; total: number }>(`/import?filename=${encodeURIComponent(asset.name)}`, {
        method: 'POST',
        raw: blob,
        timeoutMs: 120_000,
      });
      setJob({ id: r.jobId, status: 'running', total: r.total, done: 0, matched: 0, unmatched: [] });
      poll.current = setInterval(async () => {
        try {
          const j = await api<ImportJob>(`/import/${r.jobId}`);
          setJob(j);
          if (j.status !== 'running') {
            if (poll.current) clearInterval(poll.current);
            setUpBusy(false);
            refreshMe().catch(() => {});
          }
        } catch {
          /* siguiente intento */
        }
      }, 1000);
    } catch (err) {
      setUpErr(errorText(err));
      setUpBusy(false);
    }
  }

  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <Screen scroll edges={['bottom']}>
      {onboarding ? (
        <>
          <Title>¿Qué habéis visto?</Title>
          <Body muted>Así nunca os saldrá una peli que alguno ya ha visto. Cada uno conecta su cuenta desde su móvil.</Body>
        </>
      ) : null}

      {mine && (mine.watched > 0 || mine.watchlist > 0) ? (
        <View style={st.stats}>
          <Stat n={mine.watched} label="vistas" />
          <Stat n={mine.watchlist} label="en tu watchlist" />
        </View>
      ) : null}

      <Card>
        <Label>1 · Tu historial completo</Label>
        <Body>
          En letterboxd.com (en el navegador, con tu sesión iniciada) ve a <Text style={st.b}>Settings → Data → Export your data</Text>. Te
          descarga un .zip: elígelo aquí.
        </Body>
        <Button
          title="Abrir Letterboxd"
          variant="ghost"
          icon={<ExternalLink size={18} color={colors.text} />}
          onPress={() => Linking.openURL(EXPORT_URL)}
        />
        <Button title="Elegir el .zip" icon={<FileUp size={18} color={colors.goldInk} />} onPress={pick} loading={upBusy && !job} disabled={upBusy} />
        {job ? (
          <View style={{ gap: space(2) }} accessibilityLiveRegion="polite">
            <Body muted>
              {job.status === 'running' ? `Buscando tus películas… ${job.done} de ${job.total}` : job.status === 'done' ? `Listo: ${job.matched} películas de ${fileName}.` : 'La importación ha fallado.'}
            </Body>
            <View style={st.bar}>
              <View style={[st.fill, { width: `${job.status === 'done' ? 100 : pct}%` }]} />
            </View>
            {job.status === 'done' && job.unmatched.length ? (
              <Body muted style={{ fontSize: 14 }}>
                No se encontraron {job.unmatched.length}: {job.unmatched.slice(0, 5).join(', ')}
                {job.unmatched.length > 5 ? '…' : ''}
              </Body>
            ) : null}
          </View>
        ) : null}
        <ErrorText>{upErr}</ErrorText>
      </Card>

      <Card>
        <Label>2 · Lo que veas a partir de hoy</Label>
        <Body>Con tu usuario leemos tu diario público cada hora, así lo nuevo se añade solo.</Body>
        <Field
          label="Usuario de Letterboxd"
          placeholder="tu_usuario"
          value={user}
          onChangeText={setUser}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={saveUser}
          error={rssErr}
        />
        {rssMsg ? <Body style={{ color: colors.ok }}>{rssMsg}</Body> : null}
        <Button title="Guardar usuario" variant="secondary" onPress={saveUser} loading={rssBusy} />
      </Card>

      {onboarding ? (
        <Button
          title={mine && mine.watched > 0 ? 'Siguiente' : 'Saltar por ahora'}
          variant={mine && mine.watched > 0 ? 'primary' : 'ghost'}
          onPress={() => router.replace({ pathname: '/providers', params: { onboarding: '1' } })}
        />
      ) : null}
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statN}>{n}</Text>
      <Body muted style={{ fontSize: 14 }}>
        {label}
      </Body>
    </View>
  );
}

const st = StyleSheet.create({
  b: { fontFamily: fonts.bold },
  stats: { flexDirection: 'row', gap: space(3) },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: colors.line },
  statN: { fontFamily: fonts.display, fontSize: 28, color: colors.gold },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.gold },
});
