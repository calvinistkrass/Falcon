# Falcon Mobile

The Falcon companion app for iPhone and Android, built with [Expo](https://expo.dev) (SDK 58) and Expo Router.

- **Browser** with address bar, back/forward and pull-to-refresh
- **Bookmarks** and **tabs from your PCs**, synced from Falcon on Windows
- **FalCoins**: balance, daily reward (+10, +50 bonus every 7th day) and +1 per visited website
- Sign-in with your Falcon account; sync data is decrypted **on the phone** (PBKDF2-SHA256 + AES-256-GCM, same format as the desktop app)

## Try it with Expo Go

1. Install **Expo Go** from the App Store or Google Play.
2. In this folder:
   ```bash
   npm install
   npx expo start
   ```
3. Scan the QR code – with the camera app on iPhone, or inside Expo Go on Android. Phone and PC need to be on the same Wi-Fi; otherwise use `npx expo start --tunnel`.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/` | Screens (Expo Router): `(tabs)/index` start page, `browser`, `bookmarks`, `devices`, `account` |
| `src/lib/session.tsx` | Account state, decryption, FalCoins, daily reward |
| `src/lib/firebase.ts` | Firebase Auth and Firestore via REST |
| `src/lib/crypto.ts` | Pure-JS crypto compatible with Falcon desktop (runs in Expo Go) |
| `src/components/ui.tsx` | Shared UI components |

## Checks

```bash
npx tsc --noEmit
npx expo-doctor
```

For local testing against a Firebase emulator, set `EXPO_PUBLIC_FIREBASE_EMULATOR=http://<host>:<port>` (development builds only).
