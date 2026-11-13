// Sicherer Speicher: Schlüsselbund (iOS) bzw. Keystore (Android); im Web nur für Tests localStorage
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const web = Platform.OS === 'web';
export async function save(key: string, value: string | null) {
  if (web) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* egal */ } return; }
  if (value == null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
export async function load(key: string): Promise<string | null> {
  if (web) { try { return localStorage.getItem(key); } catch { return null; } }
  return SecureStore.getItemAsync(key);
}
