// Tab-Übersicht: alle offenen Tabs als Karten – antippen zum Wechseln, ✕ zum Schließen
import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Favicon } from './ui';
import { useSession } from '@/lib/session';
import { C, R, hostOf } from '@/lib/theme';

export default function TabSwitcher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { tabs, activeId, switchTab, closeTab, closeAllTabs, newTab } = useSession();

  const pick = (id: string) => { switchTab(id); onClose(); };
  const add = () => { newTab(); onClose(); };
  const closeAll = () => Alert.alert('Alle Tabs schließen?', `${tabs.length} ${tabs.length === 1 ? 'Tab wird' : 'Tabs werden'} geschlossen.`, [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Alle schließen', style: 'destructive', onPress: () => { closeAllTabs(); onClose(); } }
  ]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={s.screen}>
        <View style={s.head}>
          <Text style={s.title}>{tabs.length} {tabs.length === 1 ? 'Tab' : 'Tabs'}</Text>
          {tabs.length > 1 ? <Pressable onPress={closeAll} hitSlop={8}><Text style={s.closeAll}>Alle schließen</Text></Pressable> : null}
        </View>

        <ScrollView contentContainerStyle={s.grid}>
          {tabs.map((t) => {
            const on = t.id === activeId;
            const host = hostOf(t.url);
            return (
              <Pressable key={t.id} onPress={() => pick(t.id)} style={({ pressed }) => [s.card, on && s.cardOn, pressed && { opacity: 0.85 }]}
                accessibilityLabel={`Tab ${t.title || host || 'Neuer Tab'} öffnen`}>
                <View style={s.cardHead}>
                  {t.url ? <Favicon url={t.url} size={16} /> : <Ionicons name="add-circle-outline" size={16} color={C.text3} />}
                  <Text numberOfLines={1} style={s.cardTitle}>{t.title || host || 'Neuer Tab'}</Text>
                  <Pressable onPress={() => closeTab(t.id)} hitSlop={10} style={s.x} accessibilityLabel="Tab schließen">
                    <Ionicons name="close" size={16} color={C.text2} />
                  </Pressable>
                </View>
                <View style={s.preview}>
                  {t.url ? (
                    <>
                      <Favicon url={t.url} size={40} />
                      <Text numberOfLines={2} style={s.previewHost}>{host}</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="globe-outline" size={34} color={C.text3} />
                      <Text style={s.previewHost}>Neuer Tab</Text>
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.foot}>
          <Pressable onPress={add} style={({ pressed }) => [s.footBtn, pressed && { opacity: 0.7 }]} accessibilityLabel="Neuer Tab">
            <Ionicons name="add" size={26} color={C.text} />
          </Pressable>
          <Pressable onPress={onClose} style={({ pressed }) => [s.done, pressed && { opacity: 0.8 }]}>
            <Text style={s.doneText}>Fertig</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title: { color: C.text, fontSize: 22, fontWeight: '800' },
  closeAll: { color: C.danger, fontSize: 15, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16, paddingBottom: 32 },
  card: { width: '47.5%', borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, overflow: 'hidden' },
  cardOn: { borderColor: C.accent },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 10, paddingRight: 6, height: 36, backgroundColor: C.raised },
  cardTitle: { flex: 1, color: C.text, fontSize: 12.5, fontWeight: '600' },
  x: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  preview: { height: 150, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10 },
  previewHost: { color: C.text2, fontSize: 13, textAlign: 'center' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  footBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' },
  done: { height: 42, paddingHorizontal: 22, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '700' }
});
