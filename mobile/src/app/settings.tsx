// Konto-Einstellungen: Name, E-Mail-Bestätigung, Passwort ändern, Konto löschen
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Empty, Field, Screen, Section } from '@/components/ui';
import { errorText, useSession } from '@/lib/session';
import { C } from '@/lib/theme';

export default function Settings() {
  const { user, updateName, resendVerification, changePassword, deleteAccount } = useSession();
  const [name, setName] = useState(user?.name || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [delPw, setDelPw] = useState('');
  const [busy, setBusy] = useState('');
  if (!user) return <Screen title="Konto-Einstellungen"><Empty icon="person-outline" title="Nicht angemeldet" /></Screen>;

  const run = async (what: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(what);
    try { await fn(); if (ok) Alert.alert('Erledigt', ok); } catch (e) { Alert.alert('Das hat nicht geklappt', errorText(e)); }
    setBusy('');
  };
  const savePw = () => {
    if (next.length < 8) { Alert.alert('Passwort ändern', 'Das neue Passwort muss mindestens 8 Zeichen lang sein.'); return; }
    if (next !== repeat) { Alert.alert('Passwort ändern', 'Die Passwörter stimmen nicht überein.'); return; }
    run('pw', async () => { await changePassword(current, next); setCurrent(''); setNext(''); setRepeat(''); }, 'Dein Passwort wurde geändert. Nutze es ab jetzt auch in Falcon auf dem PC.');
  };
  const remove = () => Alert.alert('Konto endgültig löschen?', 'Alle synchronisierten Daten (Lesezeichen, Passwörter, Verlauf, Tabs) werden gelöscht. Das lässt sich nicht rückgängig machen.', [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Endgültig löschen', style: 'destructive', onPress: () => run('del', async () => { await deleteAccount(delPw); router.navigate('/account'); }, 'Dein Konto wurde gelöscht.') }
  ]);

  return (
    <Screen title="Konto-Einstellungen">
      <Section>Profil</Section>
      <Card style={s.card}>
        <Field icon="person-outline" placeholder="Name" value={name} onChangeText={setName} maxLength={60} />
        <Button title="Name speichern" small onPress={() => run('name', () => updateName(name), 'Dein Name wurde gespeichert.')} loading={busy === 'name'} disabled={name.trim() === user.name} />
        <Text style={s.small}>{user.email}{user.emailVerified ? ' · bestätigt' : ' · noch nicht bestätigt'}</Text>
        {user.emailVerified ? null : <Button title="Bestätigungs-E-Mail erneut senden" small variant="ghost" onPress={() => run('mail', resendVerification, 'Schau in dein Postfach.')} loading={busy === 'mail'} />}
      </Card>

      <Section>Passwort ändern</Section>
      <Card style={s.card}>
        <Field icon="lock-closed-outline" placeholder="Aktuelles Passwort" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
        <Field icon="key-outline" placeholder="Neues Passwort (mindestens 8 Zeichen)" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
        <Field icon="key-outline" placeholder="Neues Passwort wiederholen" value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" />
        <Button title="Passwort ändern" small onPress={savePw} loading={busy === 'pw'} disabled={!current || !next} />
        <Text style={s.small}>Deine Sync-Daten bleiben erhalten – ihr Schlüssel wird mit dem neuen Passwort neu verschlüsselt.</Text>
      </Card>

      <Section>Konto löschen</Section>
      <Card style={s.card}>
        <Field icon="lock-closed-outline" placeholder="Passwort zur Bestätigung" value={delPw} onChangeText={setDelPw} secureTextEntry />
        <View><Button title="Konto löschen" small variant="ghost" onPress={remove} loading={busy === 'del'} disabled={!delPw} /></View>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  small: { color: C.text3, fontSize: 12.5, lineHeight: 17 }
});
