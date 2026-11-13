// Konto: Anmeldung, FalCoins, tägliche Belohnung, Abmelden
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CoinIcon, Divider, Field, Row, Title } from '@/components/ui';
import { ERRORS, errorText, useSession } from '@/lib/session';
import { resetPassword } from '@/lib/firebase';
import { C, R } from '@/lib/theme';

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

export default function Account() {
  const session = useSession();
  if (session.status === 'loading') return <SafeAreaView style={[s.screen, s.center]}><ActivityIndicator color={C.accent} /></SafeAreaView>;
  return session.user && session.status === 'signedIn' ? <Profile /> : <Login />;
}

function Login() {
  const { signIn, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { setError('Bitte gib E-Mail-Adresse und Passwort ein.'); return; }
    setBusy(true); setError('');
    try { await signIn(email, password); setPassword(''); } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const forgot = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Gib zuerst deine E-Mail-Adresse ein.'); return; }
    try { await resetPassword(email.trim()); } catch { /* aus Datenschutzgründen immer dieselbe Meldung */ }
    Alert.alert('Passwort zurücksetzen', `Falls es ein Konto für ${email.trim()} gibt, ist der Link unterwegs.`);
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.pad, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <Image source={require('../../../assets/logo.png')} style={{ width: 76, height: 76, marginBottom: 16 }} />
            <Text style={s.h1}>Bei Falcon anmelden</Text>
            <Text style={s.lead}>Mit deinem Falcon-Konto siehst du Lesezeichen und die Tabs deiner PCs und sammelst FalCoins.</Text>
          </View>
          <View style={{ gap: 12 }}>
            <Field icon="mail-outline" placeholder="E-Mail-Adresse" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
              keyboardType="email-address" textContentType="username" autoComplete="email" />
            <Field icon="lock-closed-outline" placeholder="Passwort" value={password} onChangeText={setPassword} secureTextEntry
              textContentType="password" autoComplete="password" onSubmitEditing={submit} returnKeyType="go" />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Button title={status === 'unlocking' ? 'Sync-Daten werden entschlüsselt …' : 'Anmelden'} onPress={submit} loading={busy && status !== 'unlocking'} disabled={busy} />
            {status === 'unlocking' ? <Text style={s.note}>Das dauert auf dem Handy ein paar Sekunden.</Text> : null}
            <Pressable onPress={forgot} style={{ alignSelf: 'center', padding: 8 }}><Text style={s.link}>Passwort vergessen?</Text></Pressable>
          </View>
          <View style={s.hint}>
            <Ionicons name="lock-closed" size={15} color={C.green} />
            <Text style={s.hintText}>Deine Daten werden erst hier auf dem Handy mit deinem Passwort entschlüsselt. Noch kein Konto? Erstelle es in Falcon auf dem PC.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Profile() {
  const { user, wallet, daily, claimDaily, signOut, reload, loadingData, dataError, bookmarks, devices } = useSession();
  const [claiming, setClaiming] = useState(false);
  if (!user) return null;
  const name = user.name || user.email.split('@')[0];
  const coins = wallet.balance + wallet.pending;
  const gm = wallet.gameModeUntil > Date.now();
  const beta = wallet.betaUntil > Date.now();

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
          <Text style={s.walletNote}>1 FalCoin pro Website, die du hier im Browser besuchst. Im Shop in Falcon auf dem PC tauschst du sie gegen Game Mode und Beta-Zugriff.</Text>
          {daily.available ? (
            <Button title={`Tägliche Belohnung: +${daily.next} abholen`} icon="gift-outline" variant="gold" onPress={claim} loading={claiming} />
          ) : (
            <View style={s.claimed}><Ionicons name="checkmark-circle" size={18} color={C.green} /><Text style={s.claimedText}>Heute abgeholt · Serie: {daily.streak} {daily.streak === 1 ? 'Tag' : 'Tage'}</Text></View>
          )}
          {gm || beta ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {gm ? <View style={s.tag}><Text style={s.tagText}>Game Mode bis {fmtDate(wallet.gameModeUntil)}</Text></View> : null}
              {beta ? <View style={s.tag}><Text style={s.tagText}>Beta bis {fmtDate(wallet.betaUntil)}</Text></View> : null}
            </View>
          ) : null}
        </Card>

        <Text style={s.section}>Synchronisierung</Text>
        <Card>
          <Row icon="bookmark-outline" title="Lesezeichen" sub={`${countBookmarks(bookmarks)} synchronisiert`} />
          <Divider />
          <Row icon="desktop-outline" title="PCs" sub={`${devices.length} ${devices.length === 1 ? 'PC' : 'PCs'} mit offenen Tabs`} />
          <Divider />
          <Row icon="refresh" title={loadingData ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'} sub={dataError ? ERRORS[dataError] || `Fehler: ${dataError}` : 'Ende-zu-Ende-verschlüsselt'} onPress={reload}
            right={loadingData ? <ActivityIndicator color={C.text2} /> : undefined} />
        </Card>

        <Text style={s.section}>Mehr</Text>
        <Card>
          <Row icon="download-outline" title="Falcon für Windows" sub="falconbrowser.de" onPress={() => Linking.openURL('https://falconbrowser.de/download')} />
          <Divider />
          <Row icon="log-out-outline" title="Abmelden" onPress={logout} />
        </Card>
        <Text style={s.version}>Falcon Mobile 1.0.0</Text>
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
  version: { color: C.text3, fontSize: 12, textAlign: 'center', marginTop: 28 }
});
