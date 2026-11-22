// Startseite: Suche, Verknüpfungen, tägliche Belohnung und Gratis-Spiele
import React, { useEffect, useState } from 'react';
import { Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CoinIcon, Field, Favicon } from '@/components/ui';
import { errorText, useSession } from '@/lib/session';
import { fetchJson } from '@/lib/firebase';
import { C, R, toUrl } from '@/lib/theme';
import { useAppUpdate } from '@/lib/update';
import { useSuggestions } from '@/lib/suggest';
import Suggestions from '@/components/Suggestions';

const SHORTCUTS = [
  ['YouTube', 'https://m.youtube.com'], ['Twitch', 'https://m.twitch.tv'], ['Steam', 'https://store.steampowered.com'],
  ['Epic Games', 'https://store.epicgames.com'], ['Discord', 'https://discord.com/app'], ['Reddit', 'https://www.reddit.com'],
  ['GOG', 'https://www.gog.com'], ['Humble', 'https://www.humblebundle.com']
];
type Game = { title: string; image: string; url: string; platform: string; worth: string };

export default function Start() {
  const { user, wallet, daily, claimDaily, openUrl, history, bookmarks, searchEngine } = useSession();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const suggestions = useSuggestions(q, { history, bookmarks, engine: searchEngine, enabled: searching });
  const [games, setGames] = useState<Game[]>([]);
  const [claiming, setClaiming] = useState(false);
  const { update, download, dismiss, progress, error: updateError, openWebsite } = useAppUpdate();
  const downloading = typeof progress === 'number';

  useEffect(() => {
    fetchJson<any[]>('https://www.gamerpower.com/api/giveaways?platform=pc&type=game&sort-by=popularity')
      .then((list) => setGames(list.slice(0, 8).map((g) => ({
        title: String(g.title || '').replace(/\s*\((Steam|Epic Games|GOG|PC)\)\s*Giveaway$/i, '').replace(/\s*Giveaway$/i, ''),
        image: g.thumbnail, url: g.open_giveaway_url || g.gamerpower_url,
        platform: String(g.platforms || '').split(',').map((x: string) => x.trim()).filter((x: string) => x && x !== 'PC').join(', ') || 'PC',
        worth: g.worth && g.worth !== 'N/A' ? g.worth : ''
      }))))
      .catch(() => setGames([]));
  }, []);

  const go = (url: string) => { openUrl(url); router.navigate('/browser'); };
  const search = (text: string) => { const url = toUrl(text, searchEngine); if (url) { Keyboard.dismiss(); setSearching(false); go(url); setQ(''); } };
  const submit = () => search(q);
  const claim = async () => {
    setClaiming(true);
    try {
      const r = await claimDaily();
      Alert.alert('Tägliche Belohnung', r.streak % 7 === 0 ? `+${r.reward} FalCoins – ${r.streak} Tage in Folge, Bonus!` : `+${r.reward} FalCoins · Tag ${r.streak} in Folge`);
    } catch (e) { Alert.alert('Tägliche Belohnung', errorText(e)); }
    setClaiming(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <View style={s.brand}>
            <Image source={require('../../../assets/logo.png')} style={{ width: 34, height: 34 }} />
            <Text style={s.brandText}>Falcon</Text>
          </View>
          {user ? (
            <Pressable style={s.coins} onPress={() => router.push('/shop')} accessibilityLabel="FalCoin-Shop">
              <CoinIcon size={18} />
              <Text style={s.coinsText}>{(wallet.balance + wallet.pending).toLocaleString('de-DE')}</Text>
            </Pressable>
          ) : null}
        </View>

        {update ? (
          <Card style={s.update}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.updateIc}><Ionicons name="arrow-down-circle" size={24} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Neue Version verfügbar</Text>
                <Text style={s.cardText}>
                  Falcon Mobile {update.version}{update.size ? ` · ${Math.round(update.size / 1048576)} MB` : ''}
                  {downloading ? ` – wird heruntergeladen … ${Math.round(progress * 100)} %`
                    : progress === 'ready' ? ' – bestätige die Installation im Fenster von Android.'
                    : ' – Falcon lädt das Update herunter, danach bestätigst du nur noch die Installation.'}
                </Text>
              </View>
            </View>
            {downloading ? <View style={s.updateBar}><View style={[s.updateBarFill, { width: `${Math.round(progress * 100)}%` }]} /></View> : null}
            {updateError ? <Text style={s.updateError}>{updateError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                {updateError ? <Button title="falconbrowser.de" variant="ghost" small onPress={openWebsite} />
                  : <Button title="Später" variant="ghost" small onPress={dismiss} disabled={downloading} />}
              </View>
              <View style={{ flex: 1 }}>
                <Button title={progress === 'ready' ? 'Installieren' : 'Aktualisieren'} icon="download-outline" small onPress={download} loading={downloading} />
              </View>
            </View>
          </Card>
        ) : null}

        <Field icon="search" placeholder="Suchen oder Adresse eingeben" value={q} onChangeText={setQ} onSubmitEditing={submit}
          onFocus={() => setSearching(true)} onBlur={() => setSearching(false)} submitBehavior="blurAndSubmit"
          returnKeyType="search" autoCapitalize="none" autoCorrect={false} keyboardType={Platform.OS === 'ios' ? 'web-search' : 'default'}
          right={q ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable hitSlop={10} onPress={() => setQ('')} accessibilityLabel="Eingabe löschen"><Ionicons name="close-circle" size={18} color={C.text2} /></Pressable>
              <Pressable hitSlop={10} onPress={submit} accessibilityLabel="Suchen" style={s.searchGo}><Ionicons name="arrow-forward" size={17} color="#fff" /></Pressable>
            </View>
          ) : null} />
        {searching && suggestions.length > 1 ? (
          <View style={{ marginTop: 8 }}>
            <Suggestions items={suggestions} onPick={(it) => search(it.url || it.text)} onFill={(text) => setQ(text)} />
          </View>
        ) : null}

        <View style={s.grid}>
          {SHORTCUTS.map(([title, url]) => (
            <Pressable key={url} style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]} onPress={() => go(url)}>
              <View style={s.tileIc}><Favicon url={url} size={26} /></View>
              <Text numberOfLines={1} style={s.tileText}>{title}</Text>
            </Pressable>
          ))}
        </View>

        {user && daily.available ? (
          <Card style={s.daily}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={s.dailyIc}><Ionicons name="gift" size={22} color={C.gold} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Tägliche Belohnung</Text>
                <Text style={s.cardText}>Tag {daily.streak + 1} in Folge · +{daily.next} FalCoins</Text>
              </View>
            </View>
            <Button title={`+${daily.next} abholen`} variant="gold" onPress={claim} loading={claiming} small />
          </Card>
        ) : null}
        {!user ? (
          <Card style={s.daily}>
            <Text style={s.cardTitle}>Falcon auf dem Handy</Text>
            <Text style={s.cardText}>Melde dich an, um Lesezeichen und die Tabs deiner PCs zu sehen und FalCoins zu sammeln.</Text>
            <Button title="Anmelden" icon="log-in-outline" onPress={() => router.navigate('/account')} small />
          </Card>
        ) : null}

        {games.length ? (
          <View style={{ marginTop: 26 }}>
            <View style={s.secHead}><View style={s.dot} /><Text style={s.secTitle}>Gerade kostenlos</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
              {games.map((g) => (
                <Pressable key={g.url} style={({ pressed }) => [s.game, pressed && { opacity: 0.8 }]} onPress={() => go(g.url)}>
                  <Image source={{ uri: g.image }} style={s.gameImg} contentFit="cover" transition={150} />
                  <View style={s.badge}><Text style={s.badgeText}>Kostenlos</Text></View>
                  <View style={{ padding: 10, gap: 2 }}>
                    <Text numberOfLines={1} style={s.gameTitle}>{g.title}</Text>
                    <Text numberOfLines={1} style={s.gameSub}>{g.platform}{g.worth ? ` · statt ${g.worth}` : ''}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 20, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, marginTop: 4 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  coins: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: C.goldSoft },
  coinsText: { color: C.text, fontWeight: '800', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 22, marginHorizontal: -6 },
  tile: { width: '25%', alignItems: 'center', paddingVertical: 10, gap: 8 },
  tileIc: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: C.text2, fontSize: 12.5, maxWidth: 76 },
  daily: { marginTop: 18, padding: 16, gap: 14 },
  searchGo: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  update: { marginBottom: 18, padding: 16, gap: 14, borderColor: 'rgba(124,108,255,0.45)' },
  updateBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  updateBarFill: { height: '100%', borderRadius: 2, backgroundColor: C.accent },
  updateError: { color: C.danger, fontSize: 13, lineHeight: 18 },
  updateIc: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  dailyIc: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  cardText: { color: C.text2, fontSize: 14, marginTop: 3, lineHeight: 19 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  secTitle: { color: C.text2, fontSize: 14, fontWeight: '700' },
  game: { width: 200, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  gameImg: { width: '100%', height: 94, backgroundColor: C.raised },
  badge: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: C.green },
  badgeText: { color: '#06150d', fontSize: 11, fontWeight: '800' },
  gameTitle: { color: C.text, fontSize: 13.5, fontWeight: '700' },
  gameSub: { color: C.text3, fontSize: 12 }
});
