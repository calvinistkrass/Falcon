// Lesezeichen aus Falcon (entschlüsselt), mit Ordnern und Suche
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Divider, Empty, Field, Row, Title } from '@/components/ui';
import { Bookmark, useSession } from '@/lib/session';
import { C, hostOf } from '@/lib/theme';

function flat(list: Bookmark[], out: Bookmark[] = []) {
  for (const b of list) { if (b.folder) flat(b.children || [], out); else if (b.url) out.push(b); }
  return out;
}

export default function Bookmarks() {
  const { user, bookmarks, loadingData, reload, openUrl } = useSession();
  const [q, setQ] = useState('');
  const [path, setPath] = useState<Bookmark[]>([]); // geöffnete Ordner
  const open = (url: string) => { openUrl(url); router.navigate('/browser'); };

  const current = path.length ? path[path.length - 1].children || [] : bookmarks;
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? flat(bookmarks).filter((b) => (b.title || '').toLowerCase().includes(t) || (b.url || '').toLowerCase().includes(t)) : null;
  }, [q, bookmarks]);
  const list = hits ?? current;

  if (!user) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <View style={s.pad}><Title sub="Deine Lesezeichen aus Falcon, immer dabei.">Lesezeichen</Title></View>
        <Empty icon="bookmark-outline" title="Nicht angemeldet" text="Melde dich mit deinem Falcon-Konto an, um deine Lesezeichen zu sehen.">
          <View style={{ marginTop: 10 }}><Button title="Anmelden" icon="log-in-outline" onPress={() => router.navigate('/account')} small /></View>
        </Empty>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loadingData} onRefresh={reload} tintColor={C.text2} />}>
        <Title>Lesezeichen</Title>
        <Field icon="search" placeholder="Lesezeichen durchsuchen" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" />

        {!hits && path.length ? (
          <Pressable style={s.crumb} onPress={() => setPath((p) => p.slice(0, -1))}>
            <Ionicons name="chevron-back" size={18} color={C.accent} />
            <Text style={s.crumbText} numberOfLines={1}>{path.length > 1 ? path[path.length - 2].title : 'Alle Lesezeichen'}</Text>
            <Text style={s.crumbHere} numberOfLines={1}>· {path[path.length - 1].title}</Text>
          </Pressable>
        ) : <View style={{ height: 16 }} />}

        {list.length ? (
          <Card>
            {list.map((b, i) => (
              <View key={`${b.title}-${b.url}-${i}`}>
                {i ? <Divider /> : null}
                {b.folder ? (
                  <Row icon="folder" title={b.title || 'Ordner'} sub={`${flat(b.children || []).length} Lesezeichen`}
                    onPress={() => setPath((p) => [...p, b])} right={<Ionicons name="chevron-forward" size={18} color={C.text3} />} />
                ) : (
                  <Row iconUrl={b.url} title={b.title || hostOf(b.url || '')} sub={hostOf(b.url || '')} onPress={() => open(b.url as string)} />
                )}
              </View>
            ))}
          </Card>
        ) : loadingData ? null : (
          <Empty icon={hits ? 'search' : 'bookmark-outline'} title={hits ? 'Keine Treffer' : 'Noch keine Lesezeichen'}
            text={hits ? undefined : 'Lesezeichen, die du in Falcon auf dem PC anlegst, erscheinen hier nach dem nächsten Sync.'} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 20, paddingBottom: 40 },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 14 },
  crumbText: { color: C.accent, fontSize: 15, fontWeight: '600', maxWidth: '50%' },
  crumbHere: { color: C.text3, fontSize: 15, flex: 1 }
});
