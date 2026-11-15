// Gespeicherte Passwörter – dieselbe verschlüsselte Liste wie in Falcon auf dem PC
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Empty, Favicon, Field, Screen } from '@/components/ui';
import { Password, errorText, originOf, useSession } from '@/lib/session';
import { C, R, hostOf } from '@/lib/theme';

// Vor dem Anzeigen mit Fingerabdruck, Gesicht oder Geräte-PIN bestätigen (wenn das Gerät das kann)
async function unlock() {
  if (Platform.OS === 'web') return true;
  try {
    if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return true;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Passwörter anzeigen', cancelLabel: 'Abbrechen' });
    return r.success;
  } catch { return true; }
}

export default function Passwords() {
  const { user, passwords, savePassword, deletePassword } = useSession();
  const [unlocked, setUnlocked] = useState(false);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Password> | null>(null);

  useEffect(() => { if (user) unlock().then(setUnlocked); }, [user]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...passwords].filter((p) => !t || p.origin.toLowerCase().includes(t) || p.username.toLowerCase().includes(t))
      .sort((a, b) => hostOf(a.origin).localeCompare(hostOf(b.origin)));
  }, [passwords, q]);

  if (!user) return <Screen title="Passwörter"><Empty icon="key-outline" title="Nicht angemeldet" text="Melde dich an, um deine gespeicherten Passwörter zu sehen." /></Screen>;
  if (!unlocked) {
    return (
      <Screen title="Passwörter">
        <Empty icon="lock-closed-outline" title="Gesperrt" text="Bestätige, dass du es bist, um deine Passwörter zu sehen.">
          <View style={{ marginTop: 12 }}><Button title="Entsperren" icon="finger-print" onPress={() => unlock().then(setUnlocked)} /></View>
        </Empty>
      </Screen>
    );
  }

  const copy = async (text: string, what: string) => { await Clipboard.setStringAsync(text); Alert.alert('Kopiert', `${what} ist in der Zwischenablage.`); };
  const remove = (p: Password) => Alert.alert('Passwort löschen?', `${hostOf(p.origin)}${p.username ? ` · ${p.username}` : ''} wird auf allen Geräten gelöscht.`, [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Löschen', style: 'destructive', onPress: () => deletePassword(p.id).catch((e) => Alert.alert('Fehler', errorText(e))) }
  ]);

  return (
    <Screen title="Passwörter" right={<Pressable hitSlop={10} onPress={() => setEdit({})} accessibilityLabel="Passwort hinzufügen"><Ionicons name="add" size={26} color={C.text} /></Pressable>}>
      <Field icon="search" placeholder="Passwörter durchsuchen" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} />
      <View style={{ height: 14 }} />
      {!passwords.length ? (
        <Empty icon="key-outline" title="Noch keine Passwörter" text="Passwörter, die du in Falcon auf dem PC oder hier im Browser speicherst, erscheinen hier." />
      ) : (
        <Card>
          {list.map((p, i) => (
            <View key={p.id} style={[s.row, i > 0 && s.sep]}>
              <Pressable style={s.main} onPress={() => setShown(shown === p.id ? null : p.id)}>
                <Favicon url={p.origin} size={22} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.host} numberOfLines={1}>{hostOf(p.origin)}</Text>
                  <Text style={s.user} numberOfLines={1}>{p.username || '(ohne Benutzername)'}</Text>
                  {shown === p.id ? <Text style={s.pw} selectable>{p.password}</Text> : null}
                </View>
              </Pressable>
              <View style={s.actions}>
                {p.username ? <Icon name="person-outline" label="Benutzername kopieren" onPress={() => copy(p.username, 'Der Benutzername')} /> : null}
                <Icon name="copy-outline" label="Passwort kopieren" onPress={() => copy(p.password, 'Das Passwort')} />
                <Icon name="create-outline" label="Bearbeiten" onPress={() => setEdit(p)} />
                <Icon name="trash-outline" label="Löschen" onPress={() => remove(p)} danger />
              </View>
            </View>
          ))}
        </Card>
      )}
      <Text style={s.note}>Ende-zu-Ende-verschlüsselt mit deinem Kontopasswort. Änderungen erscheinen auch in Falcon auf dem PC.</Text>
      {edit ? <Editor initial={edit} onClose={() => setEdit(null)} onSave={savePassword} /> : null}
    </Screen>
  );
}

function Icon({ name, label, onPress, danger }: { name: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [s.icon, pressed && { backgroundColor: C.raised }]} accessibilityLabel={label}>
      <Ionicons name={name} size={18} color={danger ? C.danger : C.text2} />
    </Pressable>
  );
}

function Editor({ initial, onClose, onSave }: { initial: Partial<Password>; onClose: () => void; onSave: (p: { origin: string; username: string; password: string; id?: string }) => Promise<void> }) {
  const [site, setSite] = useState(initial.origin || '');
  const [username, setUsername] = useState(initial.username || '');
  const [password, setPassword] = useState(initial.password || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    const origin = originOf(/^https?:\/\//i.test(site.trim()) ? site.trim() : `https://${site.trim()}`);
    if (!origin) { setError('Bitte gib eine Website ein, z. B. steampowered.com.'); return; }
    if (!password) { setError('Bitte gib ein Passwort ein.'); return; }
    setBusy(true);
    try { await onSave({ id: initial.id, origin, username: username.trim(), password }); onClose(); } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>{initial.id ? 'Passwort bearbeiten' : 'Passwort hinzufügen'}</Text>
          <Field icon="globe-outline" placeholder="Website" value={site} onChangeText={setSite} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Field icon="person-outline" placeholder="Benutzername / E-Mail" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          <Field icon="key-outline" placeholder="Passwort" value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} secureTextEntry />
          {error ? <Text style={{ color: C.danger }}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Abbrechen" variant="ghost" onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button title="Speichern" onPress={save} loading={busy} /></View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  main: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  host: { color: C.text, fontSize: 15, fontWeight: '700' },
  user: { color: C.text3, fontSize: 13, marginTop: 1 },
  pw: { color: C.text, fontSize: 14, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  icon: { width: 36, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  note: { color: C.text3, fontSize: 13, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  sheet: { backgroundColor: C.surface, borderRadius: R.lg, padding: 18, gap: 12, borderWidth: 1, borderColor: C.line }
});
