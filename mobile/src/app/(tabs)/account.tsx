// Konto: Anmeldung, FalCoins, tägliche Belohnung, Abmelden
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CoinIcon, Divider, Field, Row, Title } from '@/components/ui';
import { APP_VERSION, ERRORS, errorText, useSession } from '@/lib/session';
import { resetPassword } from '@/lib/firebase';
import { useUpdateRequired } from '@/lib/required';
import { C, R } from '@/lib/theme';


export default function Account() {
  const session = useSession();
  const mustUpdate = useUpdateRequired();
  if (mustUpdate) return <MustUpdate />;
  if (session.status === 'loading') return <SafeAreaView style={[s.screen, s.center]}><ActivityIndicator color={C.accent} /></SafeAreaView>;
  return session.user && session.status === 'signedIn' ? <Profile /> : <Login />;
}

function MustUpdate() {
  return (
    <SafeAreaView style={[s.screen, s.center, { padding: 28, gap: 14 }]}>
      <Ionicons name="arrow-down-circle" size={46} color={C.accent} />
      <Text style={{ color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Update erforderlich</Text>
      <Text style={{ color: C.text2, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>Falcon ist zu alt. Aktualisiere Falcon, um dein Konto wieder zu nutzen. Danach bist du automatisch wieder angemeldet.</Text>
      <Button title="Zum Update" icon="download-outline" onPress={() => router.navigate('/')} />
    </SafeAreaView>
  );
}

function Login() {
  const { signIn, signUp, status } = useSession();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const up = mode === 'signup';

  const submit = async () => {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Bitte gib eine gültige E-Mail-Adresse ein.'); return; }
    if (!password) { setError('Bitte gib dein Passwort ein.'); return; }
    if (up && password.length < 8) { setError('Das Passwort muss mindestens 8 Zeichen lang sein.'); return; }
    if (up && password !== repeat) { setError('Die Passwörter stimmen nicht überein.'); return; }
    setBusy(true);
    try {
      if (up) {
        await signUp(name, email, password);
        Alert.alert(`Willkommen bei Falcon${name.trim() ? `, ${name.trim()}` : ''}!`, 'Wir haben dir eine E-Mail geschickt. Bitte bestätige darin deine Adresse. Dein Konto funktioniert auch in Falcon auf dem PC.');
      } else {
        await signIn(email, password);
      }
      setPassword(''); setRepeat('');
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const forgot = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Gib zuerst deine E-Mail-Adresse ein.'); return; }
    try { await resetPassword(email.trim()); } catch { /* aus Datenschutzgründen immer dieselbe Meldung */ }
    Alert.alert('Passwort zurücksetzen', `Falls es ein Konto für ${email.trim()} gibt, ist der Link unterwegs.`);
  };
  const switchMode = () => { setMode(up ? 'signin' : 'signup'); setError(''); };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.pad, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Image source={require('../../../assets/logo.png')} style={{ width: 72, height: 72, marginBottom: 16 }} />
            <Text style={s.h1}>{up ? 'Falcon-Konto erstellen' : 'Bei Falcon anmelden'}</Text>
            <Text style={s.lead}>{up
              ? 'Kostenlos – für Lesezeichen und Tabs auf all deinen Geräten und FalCoins.'
              : 'Mit deinem Falcon-Konto siehst du Lesezeichen und die Tabs deiner PCs und sammelst FalCoins.'}</Text>
          </View>

          <View style={s.segment}>
            {(['signin', 'signup'] as const).map((m) => (
              <Pressable key={m} onPress={() => { setMode(m); setError(''); }} style={[s.segBtn, mode === m && s.segOn]}>
                <Text style={[s.segText, mode === m && { color: C.text }]}>{m === 'signin' ? 'Anmelden' : 'Registrieren'}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 12 }}>
            {up ? <Field icon="person-outline" placeholder="Name (optional)" value={name} onChangeText={setName} autoComplete="name" textContentType="name" /> : null}
            <Field icon="mail-outline" placeholder="E-Mail-Adresse" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
              keyboardType="email-address" textContentType={up ? 'emailAddress' : 'username'} autoComplete="email" />
            <Field icon="lock-closed-outline" placeholder={up ? 'Passwort (mindestens 8 Zeichen)' : 'Passwort'} value={password} onChangeText={setPassword} secureTextEntry
              textContentType={up ? 'newPassword' : 'password'} autoComplete={up ? 'new-password' : 'password'} onSubmitEditing={up ? undefined : submit} returnKeyType={up ? 'next' : 'go'} />
            {up ? <Field icon="lock-closed-outline" placeholder="Passwort wiederholen" value={repeat} onChangeText={setRepeat} secureTextEntry
              textContentType="newPassword" autoComplete="new-password" onSubmitEditing={submit} returnKeyType="go" /> : null}
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Button
              title={status === 'unlocking' ? (up ? 'Sync-Schlüssel wird erstellt …' : 'Sync-Daten werden entschlüsselt …') : up ? 'Konto erstellen' : 'Anmelden'}
              onPress={submit} loading={busy && status !== 'unlocking'} disabled={busy} />
            {status === 'unlocking' ? <Text style={s.note}>Das dauert auf dem Handy ein paar Sekunden.</Text> : null}
            {up ? null : <Pressable onPress={forgot} style={{ alignSelf: 'center', padding: 8 }}><Text style={s.link}>Passwort vergessen?</Text></Pressable>}
            <Pressable onPress={switchMode} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={s.switchText}>{up ? 'Schon ein Konto? ' : 'Noch kein Konto? '}<Text style={s.link}>{up ? 'Anmelden' : 'Registrieren'}</Text></Text>
            </Pressable>
          </View>
          <View style={s.hint}>
            <Ionicons name="lock-closed" size={15} color={C.green} />
            <Text style={s.hintText}>{up
              ? 'Mit diesem Passwort werden auch deine Sync-Daten verschlüsselt. Merk es dir gut – ohne es lassen sich die Daten nicht wiederherstellen.'
              : 'Deine Daten werden erst hier auf dem Handy mit deinem Passwort entschlüsselt.'}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Profile() {
  const { user, wallet, daily, claimDaily, signOut, reload, loadingData, dataError, bookmarks, devices, passwords, history, missions, admin } = useSession();
  const [claiming, setClaiming] = useState(false);
  if (!user) return null;
  const name = user.name || user.email.split('@')[0];
  const coins = wallet.balance + wallet.pending;
  const ready = missions.filter((m) => m.done && !m.claimed).length;

  const claim = async () => {
    setClaiming(true);
    try { const r = await claimDaily(); Alert.alert('Tägliche Belohnung', `+${r.reward} FalCoins · Tag ${r.streak} in Folge`); } catch (e) { Alert.alert('Tägliche Belohnung', errorText(e)); }
    setClaiming(false);
  };
  const logout = () => Alert.alert('Abmelden?', 'Deine Daten bleiben in deinem Falcon-Konto gespeichert.', [
    { text: 'Abbrechen', style: 'cancel' }, { text: 'Abmelden', style: 'destructive', onPress: signOut }
  ]);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.pad}>
        <Title>Konto</Title>
        <Card style={s.profile}>
          <View style={s.avatar}><Text style={s.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.email} numberOfLines={1}>{user.email}</Text>
          </View>
        </Card>

        <Card style={s.wallet}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CoinIcon size={30} />
            <Text style={s.coins}>{coins.toLocaleString('de-DE')}</Text>
            <Text style={s.coinsLabel}>FalCoins</Text>
          </View>
          <Text style={s.walletNote}>1 FalCoin pro Website, die du besuchst – hier und in Falcon auf dem PC.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Shop" icon="storefront-outline" small onPress={() => router.push('/shop')} /></View>
            <View style={{ flex: 1 }}><Button title="Verlauf" icon="time-outline" small variant="ghost" onPress={() => router.push('/coinlog')} /></View>
          </View>
          {daily.available ? (
            <Button title={`Tägliche Belohnung: +${daily.next} abholen`} icon="gift-outline" variant="gold" onPress={claim} loading={claiming} />
          ) : (
            <View style={s.claimed}><Ionicons name="checkmark-circle" size={18} color={C.green} /><Text style={s.claimedText}>Heute abgeholt · Serie: {daily.streak} {daily.streak === 1 ? 'Tag' : 'Tage'}</Text></View>
          )}
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Row icon="flag-outline" title="Belohnungen & Missionen" sub={ready ? `${ready} ${ready === 1 ? 'Mission' : 'Missionen'} bereit zum Abholen` : daily.available ? 'Tägliche Belohnung wartet' : 'Missionen von heute'}
            onPress={() => router.push('/rewards')} right={ready ? <View style={s.dot}><Text style={s.dotText}>{ready}</Text></View> : undefined} />
        </Card>

        <Text style={s.section}>Synchronisierung</Text>
        <Card>
          <Row icon="bookmark-outline" title="Lesezeichen" sub={`${countBookmarks(bookmarks)} synchronisiert`} onPress={() => router.navigate("/bookmarks")} />
          <Divider />
          <Row icon="key-outline" title="Passwörter" sub={`${passwords.length} gespeichert`} onPress={() => router.push('/passwords')} />
          <Divider />
          <Row icon="time-outline" title="Verlauf" sub={`${history.length} Einträge`} onPress={() => router.push('/history')} />
          <Divider />
          <Row icon="desktop-outline" title="Andere Geräte" sub={`${devices.length} mit offenen Tabs`} onPress={() => router.navigate('/devices')} />
          <Divider />
          <Row icon="refresh" title={loadingData ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'} sub={dataError ? ERRORS[dataError] || `Fehler: ${dataError}` : 'Ende-zu-Ende-verschlüsselt'} onPress={reload}
            right={loadingData ? <ActivityIndicator color={C.text2} /> : undefined} />
        </Card>

        <Text style={s.section}>Mehr</Text>
        <Card>
          <Row icon="settings-outline" title="Konto-Einstellungen" sub="Name, Passwort, Konto löschen" onPress={() => router.push('/settings')} />
          <Divider />
          <Row icon="bug-outline" title="Fehler melden" sub="Und alle Meldungen ansehen" onPress={() => router.push('/report')} />
          <Divider />
          {admin ? <><Row icon="shield-checkmark-outline" title="Admin: FalCoins verwalten" onPress={() => router.push('/admin')} /><Divider /></> : null}
          <Row icon="download-outline" title="Falcon für Windows" sub="falconbrowser.de" onPress={() => Linking.openURL('https://falconbrowser.de/download')} />
          <Divider />
          <Row icon="log-out-outline" title="Abmelden" onPress={logout} />
        </Card>
        <Text style={s.version}>Falcon Mobile {APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function countBookmarks(list: { folder?: boolean; children?: any[] }[]): number {
  return list.reduce((n, b) => n + (b.folder ? countBookmarks(b.children || []) : 1), 0);
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 20, paddingBottom: 48 },
  h1: { color: C.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  lead: { color: C.text2, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21, maxWidth: 320 },
  error: { color: C.danger, fontSize: 14 },
  note: { color: C.text3, fontSize: 13, textAlign: 'center' },
  link: { color: C.accent, fontSize: 15, fontWeight: '600' },
  switchText: { color: C.text3, fontSize: 15 },
  segment: { flexDirection: 'row', padding: 4, marginBottom: 16, borderRadius: R.md, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  segBtn: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line2 },
  segText: { color: C.text2, fontSize: 14.5, fontWeight: '700' },
  hint: { flexDirection: 'row', gap: 10, marginTop: 28, padding: 14, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  hintText: { flex: 1, color: C.text2, fontSize: 13, lineHeight: 19 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { color: C.text, fontSize: 18, fontWeight: '700' },
  email: { color: C.text3, fontSize: 14, marginTop: 2 },
  wallet: { marginTop: 14, padding: 18, gap: 14, borderColor: 'rgba(245,181,68,0.3)' },
  coins: { color: C.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  coinsLabel: { color: C.text2, fontSize: 16, marginTop: 6 },
  walletNote: { color: C.text2, fontSize: 13.5, lineHeight: 19 },
  claimed: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  claimedText: { color: C.text2, fontSize: 14.5 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: C.accentSoft },
  tagText: { color: '#c2baff', fontSize: 12.5, fontWeight: '700' },
  section: { color: C.text3, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 26, marginBottom: 10, marginLeft: 4 },
  dot: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#3d2700', fontSize: 12, fontWeight: '800' },
  version: { color: C.text3, fontSize: 12, textAlign: 'center', marginTop: 28 }
});
