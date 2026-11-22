// Vorschlagsliste unter Such- und Adressleiste: Suche, Lesezeichen, Verlauf, Suchvorschläge.
// Der Pfeil rechts übernimmt einen Vorschlag in das Eingabefeld, ohne ihn gleich zu öffnen (wie in Chrome).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Suggestion } from '@/lib/suggest';
import { C } from '@/lib/theme';

const ICON = { search: 'search', history: 'time-outline', bookmark: 'star-outline' } as const;

export default function Suggestions({ items, onPick, onFill }: { items: Suggestion[]; onPick: (s: Suggestion) => void; onFill?: (text: string) => void }) {
  if (!items.length) return null;
  return (
    <View style={s.list}>
      {items.map((it, i) => (
        <Pressable key={`${it.kind}:${it.url || it.text}:${i}`} onPress={() => onPick(it)} style={({ pressed }) => [s.row, pressed && s.pressed]}
          accessibilityRole="button" accessibilityLabel={it.kind === 'search' ? `${it.text} suchen` : `${it.text} öffnen`}>
          <Ionicons name={ICON[it.kind]} size={17} color={it.kind === 'bookmark' ? C.gold : C.text3} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={s.text}>{it.text}</Text>
            {it.sub ? <Text numberOfLines={1} style={s.sub}>{it.sub}</Text> : null}
          </View>
          {onFill ? (
            <Pressable hitSlop={10} onPress={() => onFill(it.url || it.text)} accessibilityLabel="In das Suchfeld übernehmen" style={s.fill}>
              <Ionicons name="arrow-up-outline" size={17} color={C.text3} style={{ transform: [{ rotate: '-45deg' }] }} />
            </Pressable>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  list: { backgroundColor: C.raised, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, minHeight: 48 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  text: { color: C.text, fontSize: 15 },
  sub: { color: C.text3, fontSize: 12, marginTop: 1 },
  fill: { padding: 2 }
});
