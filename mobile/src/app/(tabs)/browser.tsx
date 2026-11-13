// Browser mit mehreren Tabs: Adressleiste, Zurück/Vor/Neu laden, Tab-Übersicht
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { WebView as WebViewType, WebViewNavigation } from 'react-native-webview';
import { Empty } from '@/components/ui';
import TabSwitcher from '@/components/TabSwitcher';
import { Tab, useSession } from '@/lib/session';
import { C, hostOf, toUrl } from '@/lib/theme';

// react-native-webview gibt es nur auf Android und iOS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

type Nav = { back: boolean; forward: boolean; loading: boolean; progress: number };
const NO_NAV: Nav = { back: false, forward: false, loading: false, progress: 0 };

export default function Browser() {
  const { tabs, activeId, navigate, newTab, updateTab, visited } = useSession();
  const refs = useRef<Record<string, WebViewType | null>>({});
  const seen = useRef<Record<string, { src: string; nonce: number }>>({});
  const [navs, setNavs] = useState<Record<string, Nav>>({});
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [switcher, setSwitcher] = useState(false);

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

  const submit = () => { const u = toUrl(input); if (u) navigate(u); setEditing(false); };
  const onNav = (tab: Tab) => (e: WebViewNavigation) => {
    setNavs((n) => ({ ...n, [tab.id]: { ...(n[tab.id] || NO_NAV), back: e.canGoBack, forward: e.canGoForward, loading: e.loading } }));
    updateTab(tab.id, { url: e.url, title: e.title && !/^https?:\/\//.test(e.title) ? e.title : tab.title });
    if (!e.loading && tab.id === activeId) visited(e.url);
  };
  const secure = /^https:/.test(active.url);
  const ref = refs.current[active.id];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg2 }} edges={['top']}>
      <View style={s.bar}>
        <View style={s.address}>
          <Ionicons name={editing ? 'search' : secure ? 'lock-closed' : 'globe-outline'} size={15} color={secure && !editing ? C.green : C.text3} />
          <TextInput
            style={s.input}
            value={editing ? input : hostOf(active.url) || active.url}
            onChangeText={setInput}
            onFocus={() => { setInput(active.url); setEditing(true); }}
            onBlur={() => setEditing(false)}
            onSubmitEditing={submit}
            placeholder="Suchen oder Adresse eingeben"
            placeholderTextColor={C.text3}
            selectionColor={C.accent}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="web-search"
            returnKeyType="go"
            selectTextOnFocus
          />
          {active.src ? (
            <Pressable hitSlop={10} onPress={() => (nav.loading ? ref?.stopLoading() : ref?.reload())} accessibilityLabel={nav.loading ? 'Laden abbrechen' : 'Neu laden'}>
              <Ionicons name={nav.loading ? 'close' : 'refresh'} size={18} color={C.text2} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {nav.loading ? <View style={[s.progress, { width: `${Math.max(8, nav.progress * 100)}%` }]} /> : <View style={s.progressSpace} />}

      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {tabs.map((t) => {
          const shown = t.id === active.id;
          if (!t.src) {
            return shown ? (
              <View key={t.id} style={StyleSheet.absoluteFill}>
                <Empty icon="globe-outline" title="Neuer Tab" text="Gib oben eine Adresse oder einen Suchbegriff ein – oder öffne ein Lesezeichen." />
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
                onNavigationStateChange={onNav(t)}
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
        <Tool icon="add" label="Neuer Tab" onPress={newTab} />
        <Pressable onPress={() => setSwitcher(true)} hitSlop={6} style={({ pressed }) => [s.tool, pressed && s.toolPressed]} accessibilityLabel={`${tabs.length} Tabs anzeigen`}>
          <View style={s.tabCount}><Text style={s.tabCountText}>{tabs.length > 99 ? '99+' : tabs.length}</Text></View>
        </Pressable>
        <Tool icon="bookmarks-outline" label="Lesezeichen" onPress={() => router.navigate('/bookmarks')} />
      </View>

      <TabSwitcher visible={switcher} onClose={() => setSwitcher(false)} />
    </SafeAreaView>
  );
}

function Tool({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
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
  input: { flex: 1, color: C.text, fontSize: 15, height: '100%' },
  progress: { height: 2, backgroundColor: C.accent },
  progressSpace: { height: 2 },
  hidden: { opacity: 0, zIndex: -1 },
  tools: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.bg2 },
  tool: { width: 52, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  tabCount: { minWidth: 22, height: 22, paddingHorizontal: 4, borderRadius: 6, borderWidth: 2, borderColor: C.text, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { color: C.text, fontSize: 11.5, fontWeight: '800' }
});
