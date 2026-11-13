// Browser: Adressleiste, Zurück/Vor/Neu laden, Seitenfortschritt
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { WebView as WebViewType, WebViewNavigation } from 'react-native-webview';
import { Empty } from '@/components/ui';
import { useSession } from '@/lib/session';
import { C, hostOf, toUrl } from '@/lib/theme';

// react-native-webview gibt es nur auf Android und iOS
const WebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

export default function Browser() {
  const { browser, openUrl, visited } = useSession();
  const ref = useRef<WebViewType>(null);
  const [url, setUrl] = useState(browser.url);
  const [input, setInput] = useState(browser.url);
  const [editing, setEditing] = useState(false);
  const [nav, setNav] = useState({ back: false, forward: false, loading: false, progress: 0, title: '' });

  // Neue Adresse von Start, Lesezeichen oder PC-Tabs
  useEffect(() => { if (browser.url) { setUrl(browser.url); setInput(browser.url); } }, [browser.nonce, browser.url]);

  const submit = () => { const u = toUrl(input); if (u) openUrl(u); setEditing(false); };
  const onNav = (e: WebViewNavigation) => {
    setNav((n) => ({ ...n, back: e.canGoBack, forward: e.canGoForward, loading: e.loading, title: e.title }));
    if (!editing) setInput(e.url);
    if (!e.loading) visited(e.url);
  };
  const secure = /^https:/.test(input);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg2 }} edges={['top']}>
      <View style={s.bar}>
        <View style={s.address}>
          <Ionicons name={editing ? 'search' : secure ? 'lock-closed' : 'globe-outline'} size={15} color={secure && !editing ? C.green : C.text3} />
          <TextInput
            style={s.input}
            value={editing ? input : hostOf(input) || input}
            onChangeText={setInput}
            onFocus={() => setEditing(true)}
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
          {url ? (
            <Pressable hitSlop={10} onPress={() => (nav.loading ? ref.current?.stopLoading() : ref.current?.reload())}>
              <Ionicons name={nav.loading ? 'close' : 'refresh'} size={18} color={C.text2} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {nav.loading ? <View style={[s.progress, { width: `${Math.max(8, nav.progress * 100)}%` }]} /> : <View style={s.progressSpace} />}

      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {!url ? (
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <Empty icon="globe-outline" title="Wohin soll’s gehen?" text="Gib oben eine Adresse oder einen Suchbegriff ein – oder öffne ein Lesezeichen." />
          </View>
        ) : WebView ? (
          <WebView
            ref={ref}
            source={{ uri: url }}
            onNavigationStateChange={onNav}
            onLoadProgress={(e: { nativeEvent: { progress: number } }) => setNav((n) => ({ ...n, progress: e.nativeEvent.progress }))}
            allowsBackForwardNavigationGestures
            pullToRefreshEnabled
            setSupportMultipleWindows={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            decelerationRate="normal"
            style={{ flex: 1 }}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <Empty icon="phone-portrait-outline" title="Browser in der App" text={`Der eingebaute Browser läuft in Expo Go auf dem Handy.\nGeöffnet würde: ${url}`} />
          </View>
        )}
      </View>

      <View style={s.tools}>
        <Tool icon="chevron-back" disabled={!nav.back} onPress={() => ref.current?.goBack()} />
        <Tool icon="chevron-forward" disabled={!nav.forward} onPress={() => ref.current?.goForward()} />
        <Tool icon="home-outline" onPress={() => router.navigate('/')} />
        <Tool icon="bookmarks-outline" onPress={() => router.navigate('/bookmarks')} />
        <Tool icon="desktop-outline" onPress={() => router.navigate('/devices')} />
      </View>
    </SafeAreaView>
  );
}

function Tool({ icon, onPress, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [s.tool, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
      <Ionicons name={icon} size={22} color={disabled ? C.text3 : C.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 13, borderRadius: 21, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  input: { flex: 1, color: C.text, fontSize: 15, height: '100%' },
  progress: { height: 2, backgroundColor: C.accent },
  progressSpace: { height: 2 },
  tools: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.bg2 },
  tool: { width: 52, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }
});
