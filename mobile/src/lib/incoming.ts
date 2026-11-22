// Links, die andere Apps an Falcon schicken (Falcon als Standardbrowser auf Android). +native-intent.tsx legt
// sie hier ab, die Session öffnet sie in einem Tab, sobald die gespeicherten Tabs geladen sind.
let pending: string | null = null;
const listeners = new Set<() => void>();

export function pushIncoming(url: string) {
  pending = url;
  listeners.forEach((fn) => fn());
}
export function takeIncoming() {
  const u = pending;
  pending = null;
  return u;
}
export function onIncoming(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
