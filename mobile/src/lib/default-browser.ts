// „Als Standardbrowser festlegen“: Android öffnet die Systemeinstellung für Standard-Apps. Auf iOS erlaubt
// Apple das nur App-Store-Browsern mit Sondergenehmigung – dort gibt es nur einen Hinweis.
import { Alert, Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

export function setDefaultBrowser() {
  if (Platform.OS !== 'android') {
    Alert.alert('Standardbrowser', 'Auf iOS-Geräten dürfen nur Browser aus dem App Store mit einer Sondergenehmigung von Apple Standardbrowser werden. Falcon als .ipa kann das deshalb leider nicht.');
    return;
  }
  Alert.alert('Falcon als Standardbrowser', 'Gleich öffnen sich die Android-Einstellungen. Tippe dort auf „Browser-App“ und wähle Falcon.', [
    { text: 'Abbrechen', style: 'cancel' },
    {
      text: 'Weiter',
      onPress: () => {
        IntentLauncher.startActivityAsync('android.settings.MANAGE_DEFAULT_APPS_SETTINGS').catch(() => { Linking.openSettings().catch(() => {}); });
      }
    }
  ]);
}
