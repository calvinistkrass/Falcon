// Browser mit mehreren Tabs: Adressleiste, Zurück/Vor/Neu laden, Tab-Übersicht und Menü
// (Lesezeichen, Inkognito, Passwörter ausfüllen und speichern, Seite übersetzen, teilen, melden)
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { WebView as WebViewType, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import { Empty, IconName } from '@/components/ui';
import TabSwitcher from '@/components/TabSwitcher';
import Suggestions from '@/components/Suggestions';
import { useSuggestions } from '@/lib/suggest';
import { setDefaultBrowser } from '@/lib/default-browser';
import { CAPTURE_SCRIPT, fillScript, translateUrl, untranslate } from '@/lib/inject';
import { ADBLOCK_SCRIPT, isAdHost, useAdblock } from '@/lib/adblock';
import { Tab, errorText, hasBookmark, originOf, useSession } from '@/lib/session';
import { C, R, hostOf, toUrl } from '@/lib/theme';

// react-native-webview gibt es nur auf Android und iOS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

type Nav = { back: boolean; forward: boolean; loading: boolean; progress: number };
const NO_NAV: Nav = { back: false, forward: false, loading: false, progress: 0 };

export default function Browser() {
  const session = useSession();
  const { tabs, activeId, navigate, newTab, updateTab, visited, user, searchEngine, passwords, pwNever, savePassword, neverSave, history, bookmarks } = session;
  const refs = useRef<Record<string, WebViewType | null>>({});
  const seen = useRef<Record<string, { src: string; nonce: number }>>({});
  const lastOffer = useRef('');
  const [navs, setNavs] = useState<Record<string, Nav>>({});
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  // Beim Antippen die ganze Adresse markieren (wie in Chrome) – solange, bis man tippt oder den Cursor setzt
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const inputRef = useRef<TextInputInstance>(null);
  const [switcher, setSwitcher] = useState(false);
  const [menu, setMenu] = useState(false);
  const [adblock, setAdblock] = useAdblock();
  const [blocked, setBlocked] = useState<Record<string, number>>({});

  const active = tabs.find((t) => t.id === activeId) || tabs[0];
  const nav = navs[active.id] || NO_NAV;

  // Eine neue Adresse lädt die WebView über ihre source selbst; dieselbe Adresse erneut → neu laden
  useEffect(() => {
    for (const t of tabs) {
      if (!t.src) continue;
      const prev = seen.current[t.id];
      if (prev && prev.nonce !== t.nonce && prev.src === t.src) refs.current[t.id]?.reload();
      seen.current[t.id] = { src: t.src, nonce: t.nonce };
    }
    // Verwaiste Einträge geschlossener Tabs entfernen
    for (const id of Object.keys(seen.current)) if (!tabs.some((t) => t.id === id)) { delete seen.current[id]; delete refs.current[id]; }
  }, [tabs]);

  const suggestions = useSuggestions(editing && input !== active.url ? input : '', { history, bookmarks, engine: searchEngine, enabled: editing });
  const go = (text: string) => { const u = toUrl(text, searchEngine); if (u) navigate(u); setEditing(false); setSelection(undefined); inputRef.current?.blur(); };
  const submit = () => go(input);
  const onNav = (tab: Tab) => (e: WebViewNavigation) => {
    setNavs((n) => ({ ...n, [tab.id]: { ...(n[tab.id] || NO_NAV), back: e.canGoBack, forward: e.canGoForward, loading: e.loading } }));
    const title = e.title && !/^https?:\/\//.test(e.title) ? e.title : tab.title;
    updateTab(tab.id, { url: e.url, title });
    if (!e.loading && tab.id === activeId) visited(e.url, title, tab.incognito);
  };

  // Anmeldedaten von der Seite → Speichern anbieten (nicht in Inkognito-Tabs, nicht für „Nie“-Seiten)
  const onMessage = (tab: Tab) => (e: WebViewMessageEvent) => {
    let msg: { t?: string; u?: string; p?: string; n?: number };
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.t === 'ads') { const n = Number(msg.n) || 0; setBlocked((b) => (b[tab.id] === n ? b : { ...b, [tab.id]: n })); return; }
    if (msg.t !== 'pw' || !msg.p || !user || tab.incognito) return;
    const origin = originOf(e.nativeEvent.url || tab.url);
    if (!origin || pwNever.includes(origin)) return;
    const username = String(msg.u || '').slice(0, 200);
    const password = String(msg.p).slice(0, 500);
    const sig = `${origin}\n${username}\n${password}`;
    if (sig === lastOffer.current) return;
    const existing = passwords.find((p) => p.origin === origin && p.username === username);
    if (existing && existing.password === password) return;
    lastOffer.current = sig;
    Alert.alert(existing ? 'Passwort aktualisieren?' : 'Passwort speichern?', `${hostOf(origin)}${username ? ` · ${username}` : ''}\nVerschlüsselt in deinem Falcon-Konto – auch auf dem PC verfügbar.`, [
      { text: 'Nie für diese Seite', onPress: () => { neverSave(origin).catch(() => {}); } },
      { text: 'Nicht jetzt', style: 'cancel' },
      { text: existing ? 'Aktualisieren' : 'Speichern', onPress: () => { savePassword({ origin, username, password }).catch((err) => Alert.alert('Nicht gespeichert', errorText(err))); } }
    ]);
  };

  const secure = /^https:/.test(active.url);
  const ref = refs.current[active.id];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: active.incognito ? '#17121f' : C.bg2 }} edges={['top']}>
      <View style={s.bar}>
        <View style={[s.address, active.incognito && s.addressIncognito]}>
          <Ionicons name={active.incognito && !editing ? 'eye-off' : editing ? 'search' : secure ? 'lock-closed' : 'globe-outline'} size={15}
            color={active.incognito && !editing ? '#c2baff' : secure && !editing ? C.green : C.text3} />
          <TextInput
            ref={inputRef}
            style={s.input}
            value={editing ? input : hostOf(active.url) || active.url}
            onChangeText={(t) => { setInput(t); setSelection(undefined); }}
            selection={editing ? selection : undefined}
            onSelectionChange={(e) => {
              const r = e.nativeEvent.selection;
              if (selection && (r.start !== selection.start || r.end !== selection.end)) setSelection(undefined);
            }}
            onFocus={() => { const u = active.url; setInput(u); setEditing(true); setSelection({ start: 0, end: u.length }); }}
            onBlur={() => { setEditing(false); setSelection(undefined); }}
            onSubmitEditing={submit}
            placeholder={active.incognito ? 'Inkognito – suchen oder Adresse' : 'Suchen oder Adresse eingeben'}
            placeholderTextColor={C.text3}
            selectionColor={C.accent}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'web-search' : 'default'}
            returnKeyType="go"
          />
          {editing ? (
            input ? (
              // Eingabe löschen – das Feld bleibt aktiv, damit man gleich weitertippen kann
              <Pressable hitSlop={10} onPress={() => { setInput(''); setSelection(undefined); inputRef.current?.focus(); }} accessibilityLabel="Eingabe löschen">
                <Ionicons name="close-circle" size={18} color={C.text2} />
              </Pressable>
            ) : null
          ) : active.src ? (
            <Pressable hitSlop={10} onPress={() => (nav.loading ? ref?.stopLoading() : ref?.reload())} accessibilityLabel={nav.loading ? 'Laden abbrechen' : 'Neu laden'}>
              <Ionicons name={nav.loading ? 'close' : 'refresh'} size={18} color={C.text2} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {nav.loading ? <View style={[s.progress, { width: `${Math.max(8, nav.progress * 100)}%` }]} /> : <View style={s.progressSpace} />}

      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {editing && suggestions.length ? (
          <ScrollView style={[StyleSheet.absoluteFill, s.suggest]} contentContainerStyle={{ padding: 12 }} keyboardShouldPersistTaps="handled">
            <Suggestions items={suggestions} onPick={(it) => go(it.url || it.text)}
              onFill={(text) => { setInput(text); setSelection(undefined); inputRef.current?.focus(); }} />
          </ScrollView>
        ) : null}
        {tabs.map((t) => {
          const shown = t.id === active.id;
          if (!t.src) {
            return shown ? (
              <View key={t.id} style={StyleSheet.absoluteFill}>
                {t.incognito
                  ? <Empty icon="eye-off-outline" title="Inkognito-Tab" text="Seiten aus diesem Tab landen nicht im Verlauf, Passwörter werden nicht gespeichert und Cookies nicht behalten." />
                  : <Empty icon="globe-outline" title="Neuer Tab" text="Gib oben eine Adresse oder einen Suchbegriff ein – oder öffne ein Lesezeichen." />}
              </View>
            ) : null;
          }
          if (!WebView) {
            return shown ? (
              <View key={t.id} style={StyleSheet.absoluteFill}>
                <Empty icon="phone-portrait-outline" title="Browser in der App" text={`Der eingebaute Browser läuft in Expo Go auf dem Handy.\nDieser Tab zeigt: ${t.url}`} />
              </View>
            ) : null;
          }
          return (
            <View key={t.id} style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, !shown && s.hidden]} pointerEvents={shown ? 'auto' : 'none'}>
              <WebView
                ref={(r: WebViewType | null) => { refs.current[t.id] = r; }}
                source={{ uri: t.src }}
                incognito={!!t.incognito}
                onNavigationStateChange={onNav(t)}
                onMessage={onMessage(t)}
                injectedJavaScriptBeforeContentLoaded={[t.incognito ? '' : CAPTURE_SCRIPT, adblock ? ADBLOCK_SCRIPT : ''].join('\n') || undefined}
                onShouldStartLoadWithRequest={(r: { url: string }) => !(adblock && r.url !== t.src && isAdHost(r.url))}
                onLoadProgress={(e: { nativeEvent: { progress: number } }) =>
                  setNavs((n) => ({ ...n, [t.id]: { ...(n[t.id] || NO_NAV), progress: e.nativeEvent.progress } }))}
                allowsBackForwardNavigationGestures
                pullToRefreshEnabled
                setSupportMultipleWindows={false}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                style={{ flex: 1 }}
              />
            </View>
          );
        })}
      </View>

      <View style={s.tools}>
        <Tool icon="chevron-back" label="Zurück" disabled={!nav.back} onPress={() => ref?.goBack()} />
        <Tool icon="chevron-forward" label="Vor" disabled={!nav.forward} onPress={() => ref?.goForward()} />
        <Tool icon="add" label="Neuer Tab" onPress={() => newTab()} />
        <Pressable onPress={() => setSwitcher(true)} hitSlop={6} style={({ pressed }) => [s.tool, pressed && s.toolPressed]} accessibilityLabel={`${tabs.length} Tabs anzeigen`}>
          <View style={s.tabCount}><Text style={s.tabCountText}>{tabs.length > 99 ? '99+' : tabs.length}</Text></View>
        </Pressable>
        <Tool icon="ellipsis-horizontal" label="Menü" onPress={() => setMenu(true)} />
      </View>

      <TabSwitcher visible={switcher} onClose={() => setSwitcher(false)} />
      {menu ? <BrowserMenu tab={active} onClose={() => setMenu(false)} inject={(js) => ref?.injectJavaScript(js)}
        adblock={adblock} blocked={blocked[active.id] || 0} onAdblock={(on) => { setAdblock(on); ref?.reload(); }} /> : null}
    </SafeAreaView>
  );
}

function BrowserMenu({ tab, onClose, inject, adblock, blocked, onAdblock }: { tab: Tab; onClose: () => void; inject: (js: string) => void; adblock: boolean; blocked: number; onAdblock: (on: boolean) => void }) {
  const { user, bookmarks, addBookmark, removeBookmark, newTab, navigate, passwords } = useSession();
  const page = /^https?:/.test(tab.url) ? tab.url : '';
  const marked = !!page && hasBookmark(bookmarks, page);
  const origin = page ? originOf(page) : '';
  const host = hostOf(page);
  const logins = origin ? passwords.filter((p) => p.origin === origin || hostOf(p.origin) === host) : [];
  const original = untranslate(page);
  const { bottom } = useSafeAreaInsets();

  // Der Fingertipp, der das Menü öffnet, darf es nicht gleich wieder schließen oder einen Eintrag auslösen
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 350); return () => clearTimeout(t); }, []);
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const needsAccount = (fn: () => void) => () => {
    onClose();
    if (!user) { Alert.alert('Falcon-Konto', 'Dafür musst du angemeldet sein.', [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Anmelden', onPress: () => router.navigate('/account') }]); return; }
    fn();
  };
  const fill = () => {
    if (logins.length === 1) { inject(fillScript(logins[0].username, logins[0].password)); return; }
    Alert.alert('Passwort ausfüllen', host, [
      ...logins.slice(0, 6).map((p) => ({ text: p.username || '(ohne Benutzername)', onPress: () => inject(fillScript(p.username, p.password)) })),
      { text: 'Abbrechen', style: 'cancel' as const }
    ]);
  };
  const translate = () => {
    if (original) { navigate(original); return; }
    navigate(translateUrl(page));
  };

  const items: { icon: IconName; label: string; onPress: () => void; hidden?: boolean; tag?: string }[] = [
    { icon: marked ? 'star' : 'star-outline', label: marked ? 'Lesezeichen entfernen' : 'Lesezeichen hinzufügen', hidden: !page,
      onPress: needsAccount(() => { (marked ? removeBookmark(page) : addBookmark(page, tab.title)).catch((e) => Alert.alert('Lesezeichen', errorText(e))); }) },
    { icon: 'key-outline', label: logins.length === 1 ? `Passwort ausfüllen (${logins[0].username || host})` : 'Passwort ausfüllen', hidden: !logins.length, onPress: run(fill) },
    { icon: 'language-outline', label: original ? 'Original anzeigen' : 'Seite übersetzen', hidden: !page, onPress: run(translate) },
    { icon: 'share-outline', label: 'Teilen', hidden: !page, onPress: run(() => { Share.share(Platform.OS === 'ios' ? { url: page } : { message: page }).catch(() => {}); }) },
    { icon: 'link-outline', label: 'Link kopieren', hidden: !page, onPress: run(() => { Clipboard.setStringAsync(page).catch(() => {}); }) },
    { icon: adblock ? 'shield-checkmark-outline' : 'shield-outline', label: adblock ? 'Werbeblocker ausschalten' : 'Werbeblocker einschalten',
      tag: adblock && blocked ? `${blocked} blockiert` : undefined, onPress: run(() => onAdblock(!adblock)) },
    { icon: 'eye-off-outline', label: 'Neuer Inkognito-Tab', onPress: run(() => newTab(true)) },
    { icon: 'bookmarks-outline', label: 'Lesezeichen', onPress: run(() => router.navigate('/bookmarks')) },
    { icon: 'time-outline', label: 'Verlauf', onPress: run(() => router.push('/history')) },
    { icon: 'key-outline', label: 'Passwörter', hidden: !!logins.length, onPress: run(() => router.push('/passwords')) },
    { icon: 'globe-outline', label: 'Als Standardbrowser festlegen', onPress: run(setDefaultBrowser) },
    { icon: 'bug-outline', label: page ? 'Problem mit dieser Seite melden' : 'Fehler melden', onPress: run(() => router.push(page ? { pathname: '/report', params: { url: page } } : '/report')) }
  ];

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[s.backdrop, { pointerEvents: ready ? 'auto' : 'none' }]} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: 30 + bottom }]} onPress={() => {}}>
          {page ? <Text style={s.sheetHost} numberOfLines={1}>{tab.incognito ? 'Inkognito · ' : ''}{host}</Text> : null}
          {items.filter((i) => !i.hidden).map((i) => (
            <Pressable key={i.label} onPress={i.onPress} style={({ pressed }) => [s.item, pressed && { backgroundColor: C.raised }]} accessibilityLabel={i.label}>
              <Ionicons name={i.icon} size={20} color={i.icon === 'star' ? C.gold : C.text2} />
              <Text style={s.itemText}>{i.label}</Text>
              {i.tag ? <View style={s.tag}><Text style={s.tagText}>{i.tag}</Text></View> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Tool({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityLabel={label}
      style={({ pressed }) => [s.tool, pressed && s.toolPressed]}>
      <Ionicons name={icon} size={23} color={disabled ? C.text3 : C.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  // liegt über den WebViews (zIndex für iOS, elevation für Android)
  suggest: { backgroundColor: C.bg, zIndex: 10, elevation: 10 },
  addressIncognito: { backgroundColor: '#251d33', borderColor: 'rgba(124,108,255,0.35)' },
  input: { flex: 1, color: C.text, fontSize: 15, height: '100%' },
  progress: { height: 2, backgroundColor: C.accent },
  progressSpace: { height: 2 },
  hidden: { opacity: 0, zIndex: -1 },
  tools: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.bg2 },
  tool: { width: 52, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  tabCount: { minWidth: 22, height: 22, paddingHorizontal: 4, borderRadius: 6, borderWidth: 2, borderColor: C.text, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { color: C.text, fontSize: 11.5, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: 10, paddingBottom: 30, paddingHorizontal: 10, borderWidth: 1, borderColor: C.line },
  sheetHost: { color: C.text3, fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, height: 48, borderRadius: R.md },
  itemText: { flex: 1, color: C.text, fontSize: 15.5, fontWeight: '500' },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: C.accentSoft },
  tagText: { color: '#c2baff', fontSize: 11.5, fontWeight: '700' }
});
