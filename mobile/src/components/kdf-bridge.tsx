// Unsichtbarer WebView für schnelles PBKDF2 bei der Anmeldung (siehe lib/fast-kdf.ts)
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { WebView as WebViewType, WebViewMessageEvent } from 'react-native-webview';
import { KDF_PAGE, attachRunner, onBridgeMessage } from '@/lib/fast-kdf';

// react-native-webview gibt es nur auf Android und iOS (im Web rechnet fast-kdf.ts direkt mit crypto.subtle)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

export default function KdfBridge() {
  const ref = useRef<WebViewType | null>(null);
  useEffect(() => {
    attachRunner((js) => ref.current?.injectJavaScript(js));
    return () => attachRunner(null);
  }, []);
  if (!WebView) return null;
  return (
    <View style={s.hidden} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        ref={ref}
        source={{ html: KDF_PAGE, baseUrl: 'https://localhost' }}
        originWhitelist={['https://localhost']}
        onMessage={(e: WebViewMessageEvent) => onBridgeMessage(e.nativeEvent.data)}
        javaScriptEnabled
        // Nur diese eine Seite – keine Navigation woandershin
        onShouldStartLoadWithRequest={(r: { url: string }) => r.url === 'about:blank' || r.url.startsWith('https://localhost')}
        style={s.web}
      />
    </View>
  );
}

const s = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10, overflow: 'hidden' },
  web: { width: 1, height: 1, backgroundColor: 'transparent' }
});
