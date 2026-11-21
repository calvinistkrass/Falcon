// Rückerstattung beantragen: Kauf wählen, E-Mail, Grund – die Antwort erscheint beim nächsten Start
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, CoinIcon, Empty, Field, Screen } from '@/components/ui';
import { ITEM_NAME, Purchase, errorText, fmtDate, useSession } from '@/lib/session';
import { C, R } from '@/lib/theme';

const STATE: Record<string, string> = { pending: 'Beantragt', approved: 'Erstattet', denied: 'Abgelehnt' };

export default function Refund() {
  const { user, listPurchases, requestRefund } = useSession();
  const [list, setList] = useState<Purchase[] | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    listPurchases().then((l) => { setList(l); setPicked(l.find((p) => !p.refund && !p.expired)?.id || ''); }).catch((e) => setError(errorText(e)));
  }, [user, listPurchases]);

  if (!user) return <Screen title="Rückerstattung"><Empty icon="person-outline" title="Nicht angemeldet" /></Screen>;
  const valid = !!picked && !!reason.trim() && /^\S+@\S+\.\S+$/.test(email.trim());
  const send = async () => {
    setBusy(true);
    try {
      await requestRefund({ purchaseId: picked, email, reason });
      Alert.alert('Antrag gesendet', 'Die Antwort bekommst du beim nächsten Start von Falcon.');
      router.back();
    } catch (e) { Alert.alert('Nicht gesendet', errorText(e)); }
    setBusy(false);
  };

  return (
    <Screen title="Rückerstattung">
      <Text style={s.sub}>Etwas aus Versehen gekauft? Wähle den Kauf aus und sag kurz, warum. Die Antwort bekommst du beim nächsten Start von Falcon.</Text>
      <Text style={s.sub}>Beim Beta-Zugriff geht eine Rückerstattung nur innerhalb von 24 Stunden nach dem Kauf.</Text>
      {error ? <Empty icon="cloud-offline-outline" title="Nicht geladen" text={error} />
        : !list ? <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
          : !list.length ? <Empty icon="storefront-outline" title="Noch keine Käufe" text="Du hast noch nichts im Shop gekauft." />
            : (
              <View style={{ gap: 12 }}>
                <Text style={s.label}>Kauf</Text>
                {list.map((p) => {
                  const on = picked === p.id;
                  return (
                    <Pressable key={p.id} disabled={!!p.refund || p.expired} onPress={() => setPicked(p.id)} style={[s.row, on && s.rowOn, (!!p.refund || p.expired) && { opacity: 0.5 }]}
                      accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !!p.refund || p.expired }}>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? C.accent : C.text3} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.title}>{ITEM_NAME(p.item)}</Text>
                        <Text style={s.small}>{fmtDate(p.at)}{p.refund ? ` · ${STATE[p.refund] || p.refund}` : p.expired ? ' · Frist abgelaufen' : p.refundUntil ? ` · ${p.hoursLeft <= 1 ? 'noch unter 1 Stunde' : `noch ${p.hoursLeft} Stunden`}` : ''}</Text>
                      </View>
                      <View style={s.price}><CoinIcon size={14} /><Text style={s.priceText}>{p.price.toLocaleString('de-DE')}</Text></View>
                    </Pressable>
                  );
                })}
                {!list.some((p) => !p.refund && !p.expired) ? <Text style={s.small}>{list.some((p) => p.expired && !p.refund) ? 'Für deine Käufe ist keine Rückerstattung mehr möglich: Beim Beta-Zugriff geht das nur innerhalb von 24 Stunden nach dem Kauf.' : 'Für alle deine Käufe läuft schon eine Rückerstattung.'}</Text> : null}
                <Text style={s.label}>E-Mail-Adresse</Text>
                <Field icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-Mail-Adresse" />
                <Text style={s.label}>Grund</Text>
                <TextInput style={s.area} multiline value={reason} onChangeText={setReason} placeholder="Warum möchtest du den Kauf zurückgeben?"
                  placeholderTextColor={C.text3} selectionColor={C.accent} textAlignVertical="top" maxLength={1000} />
                <Button title="Antrag senden" icon="send" onPress={send} loading={busy} disabled={!valid} />
              </View>
            )}
    </Screen>
  );
}

const s = StyleSheet.create({
  sub: { color: C.text2, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  label: { color: C.text3, fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.md, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  rowOn: { borderColor: C.accent },
  title: { color: C.text, fontSize: 15, fontWeight: '700' },
  small: { color: C.text3, fontSize: 12.5, marginTop: 2 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceText: { color: C.gold, fontSize: 14, fontWeight: '800' },
  area: { minHeight: 120, padding: 14, borderRadius: R.md, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, color: C.text, fontSize: 15.5 }
});
