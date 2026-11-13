// Offene Tabs deiner PCs
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Divider, Empty, Row, Title } from '@/components/ui';
import { useSession } from '@/lib/session';
import { C, hostOf } from '@/lib/theme';

function ago(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

export default function Devices() {
  const { user, devices, loadingData, reload, openUrl } = useSession();
  const open = (url: string) => { openUrl(url); router.navigate('/browser'); };

  if (!user) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <View style={s.pad}><Title sub="Mach weiter, wo du am PC aufgehört hast.">PC-Tabs</Title></View>
        <Empty icon="desktop-outline" title="Nicht angemeldet" text="Melde dich an, um die offenen Tabs deiner PCs zu sehen.">
          <View style={{ marginTop: 10 }}><Button title="Anmelden" icon="log-in-outline" onPress={() => router.navigate('/account')} small /></View>
        </Empty>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={loadingData} onRefresh={reload} tintColor={C.text2} />}>
        <Title sub="Mach weiter, wo du am PC aufgehört hast.">PC-Tabs</Title>
        {devices.length ? devices.map((d) => (
          <View key={d.id} style={{ marginBottom: 22 }}>
            <View style={s.devHead}>
              <Ionicons name="desktop-outline" size={17} color={C.text2} />
              <Text style={s.devName} numberOfLines={1}>{d.name}</Text>
              <Text style={s.devAt}>{ago(d.at)}</Text>
            </View>
            {d.tabs.length ? (
              <Card>
                {d.tabs.map((t, i) => (
                  <View key={`${t.url}-${i}`}>
                    {i ? <Divider /> : null}
                    <Row iconUrl={t.url} title={t.title || hostOf(t.url)} sub={hostOf(t.url)} onPress={() => open(t.url)} />
                  </View>
                ))}
              </Card>
            ) : <Text style={s.none}>Keine offenen Tabs</Text>}
          </View>
        )) : loadingData ? null : (
          <Empty icon="desktop-outline" title="Noch keine PCs" text="Melde dich in Falcon auf dem PC an. Dessen offene Tabs erscheinen dann hier." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 20, paddingBottom: 40 },
  devHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  devName: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1 },
  devAt: { color: C.text3, fontSize: 13 },
  none: { color: C.text3, fontSize: 14, paddingHorizontal: 4 }
});
