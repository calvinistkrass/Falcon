// Alert.alert macht in react-native-web nichts – im Web (Vorschau/Tests) auf die Browser-Dialoge abbilden
import { Alert, AlertButton, Platform } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = (buttons || []).filter((b) => b.style !== 'cancel');
    const cancel = (buttons || []).find((b) => b.style === 'cancel');
    if (!actions.length) { window.alert(text); cancel?.onPress?.(); return; }
    if (actions.length === 1) { if (window.confirm(text)) actions[0].onPress?.(); else cancel?.onPress?.(); return; }
    const pick = window.prompt(`${text}\n\n${actions.map((a, i) => `${i + 1} = ${a.text}`).join('\n')}`);
    const chosen = actions[Number(pick) - 1];
    if (chosen) chosen.onPress?.(); else cancel?.onPress?.();
  };
}
