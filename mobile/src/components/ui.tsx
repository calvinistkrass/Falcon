// Gemeinsame Bausteine im Falcon-Look
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { C, R, favicon } from '@/lib/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={s.title}>{children}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({ title, onPress, icon, variant = 'primary', loading, disabled, small }: {
  title: string; onPress?: () => void; icon?: IconName; variant?: 'primary' | 'ghost' | 'gold'; loading?: boolean; disabled?: boolean; small?: boolean;
}) {
  const bg = variant === 'primary' ? C.accent : variant === 'gold' ? C.gold : 'rgba(255,255,255,0.06)';
  const fg = variant === 'gold' ? '#3d2700' : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: C.line2 }]}
      accessibilityRole="button"
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[s.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { icon?: IconName }) {
  const { icon, style, ...rest } = props;
  return (
    <View style={s.field}>
      {icon ? <Ionicons name={icon} size={18} color={C.text3} /> : null}
      <TextInput placeholderTextColor={C.text3} selectionColor={C.accent} style={[s.input, style]} {...rest} />
    </View>
  );
}

export function Favicon({ url, size = 20 }: { url: string; size?: number }) {
  return <Image source={{ uri: favicon(url) }} style={{ width: size, height: size, borderRadius: 4 }} contentFit="contain" transition={120} />;
}

export function CoinIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={[s.coin, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#5a3a00', fontWeight: '800', fontSize: size * 0.55 }}>F</Text>
    </View>
  );
}

export function Row({ icon, iconUrl, title, sub, onPress, right }: {
  icon?: IconName; iconUrl?: string; title: string; sub?: string; onPress?: () => void; right?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: 'rgba(255,255,255,0.04)' } : null]}>
      <View style={s.rowIcon}>
        {iconUrl ? <Favicon url={iconUrl} /> : icon ? <Ionicons name={icon} size={19} color={C.accent} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={s.rowTitle}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={s.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIc}><Ionicons name={icon} size={28} color={C.accent} /></View>
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
      {children}
    </View>
  );
}

export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: 58 }} />;

const s = StyleSheet.create({
  title: { color: C.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  sub: { color: C.text2, fontSize: 15, marginTop: 6, lineHeight: 21 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  btn: { height: 50, borderRadius: R.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  btnSmall: { height: 38, borderRadius: 10, paddingHorizontal: 14 },
  btnText: { fontSize: 15.5, fontWeight: '700' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, borderRadius: R.md, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  input: { flex: 1, color: C.text, fontSize: 16, height: '100%' },
  coin: { backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffd66b' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 13, minHeight: 58 },
  rowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised },
  rowTitle: { color: C.text, fontSize: 15.5, fontWeight: '600' },
  rowSub: { color: C.text3, fontSize: 13, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  emptyIc: { width: 60, height: 60, borderRadius: 18, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: C.text2, fontSize: 14.5, textAlign: 'center', lineHeight: 20 }
});
