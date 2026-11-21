// Ladebildschirm beim Start – dieselbe Server-Animation und derselbe „Falcon“-Schriftzug wie am PC.
// Verschwindet erst, wenn alles geladen ist: Anmeldung geprüft, gespeicherte Tabs gelesen und (angemeldet)
// Kontodaten geladen. Frühestens nach 900 ms (wie am PC), spätestens nach 10 s (z. B. kein Netz).
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';
import { DEFS, LINE_V1, LINE_V2, NODE_SERVER, PANEL, PARTICLES, PARTICLE_TIMING, REFLECTORS } from './boot-svg';

const ZOOM = 1.2; // wie #svg-global { zoom: 1.2 }
const W = 94 * ZOOM;
const H = 136 * ZOOM;
const MIN_MS = 900;
const MAX_MS = 10_000;

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 94 136" width="${W}" height="${H}">${DEFS}${body}</svg>`;
const NAME = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="28" viewBox="0 0 110 28">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#91ddfb"/><stop offset="1" stop-color="#8f7dff"/></linearGradient></defs>
  <text x="55" y="21" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" letter-spacing="0.4" fill="url(#g)">Falcon</text>
</svg>`;

// radial-gradient(60% 50% at 50% 45%, rgb(87 40 204 / .18), transparent 70%) wie am PC
const GLOW = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
  <defs><radialGradient id="r" cx="50" cy="45" r="42" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5728cc" stop-opacity="0.2"/><stop offset="1" stop-color="#5728cc" stop-opacity="0"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#r)"/>
</svg>`;

/** bounce-lines: 3 s hoch und runter um 3 Einheiten, mit Verzögerung */
function useBounce(delay: number, still: boolean) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: -3 * ZOOM, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    ]));
    const t = setTimeout(() => anim.start(), delay);
    return () => { clearTimeout(t); anim.stop(); };
  }, [v, delay, still]);
  return v;
}

/** floatUp: von unten 40 Einheiten nach oben, kurz einblenden, dann ausblenden */
function Particle({ path, duration, delay, still }: { path: string; duration: number; delay: number; still: boolean }) {
  const [p] = useState(() => new Animated.Value(still ? 0.5 : 0));
  useEffect(() => {
    if (still) return;
    const anim = Animated.loop(Animated.timing(p, { toValue: 1, duration: duration * 1000, easing: Easing.linear, useNativeDriver: true }), { iterations: -1, resetBeforeIteration: true });
    const t = setTimeout(() => anim.start(), delay * 1000);
    return () => { clearTimeout(t); anim.stop(); };
  }, [p, duration, delay, still]);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [0, -40 * ZOOM] });
  const opacity = still ? 1 : p.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateY }] }]}>
      <SvgXml xml={svg(path)} width={W} height={H} />
    </Animated.View>
  );
}

export default function BootLoader() {
  const { status, tabsReady, loadingData } = useSession();
  const [still, setStill] = useState(false); // „Bewegung reduzieren“ → keine Animation (wie am PC)
  const [gone, setGone] = useState(false);
  const [fade] = useState(() => new Animated.Value(1));
  const [started] = useState(() => Date.now());

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {}); }, []);

  const v1 = useBounce(0, still);
  const v2 = useBounce(200, still);
  const server = useBounce(400, still);
  const [glow] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (still) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 0.5, duration: 2500, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 1, duration: 2500, useNativeDriver: true })
    ]));
    anim.start();
    return () => anim.stop();
  }, [glow, still]);

  const ready = status !== 'loading' && tabsReady && !loadingData;
  useEffect(() => {
    if (gone) return;
    const hide = () => Animated.timing(fade, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setGone(true));
    // Nach dem Anmelden startet das Laden der Kontodaten erst einen Moment später – kurz warten, ob noch etwas kommt
    const wait = ready ? Math.max(250, MIN_MS - (Date.now() - started)) : Math.max(0, MAX_MS - (Date.now() - started));
    const t = setTimeout(hide, wait);
    return () => clearTimeout(t);
  }, [ready, gone, fade, started]);

  if (gone) return null;
  return (
    <Animated.View style={[s.screen, { opacity: fade }]} pointerEvents="auto" accessibilityLabel="Falcon wird geladen">
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><SvgXml xml={GLOW} width="100%" height="100%" /></View>
      <View style={{ width: W, height: H }}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: v1 }] }]}><SvgXml xml={svg(LINE_V1)} width={W} height={H} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: v2 }] }]}><SvgXml xml={svg(LINE_V2)} width={W} height={H} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: server }] }]}><SvgXml xml={svg(NODE_SERVER)} width={W} height={H} /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: glow, transform: [{ translateY: server }] }]}>
          {PARTICLES.map((p, i) => <Particle key={i} path={p} duration={PARTICLE_TIMING[i]?.[0] ?? 2.4} delay={PARTICLE_TIMING[i]?.[1] ?? 0} still={still} />)}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: server }] }]}><SvgXml xml={svg(REFLECTORS + PANEL)} width={W} height={H} /></Animated.View>
      </View>
      <SvgXml xml={NAME} width={110} height={28} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // gleiche Farbe wie der native Startbildschirm (app.json backgroundColor), damit nichts aufblitzt
  screen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 26 }
});
