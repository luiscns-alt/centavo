import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android test build (debug APK only). The web build (`dist/`, made with `vite build --mode android`)
 * is bundled inside the APK and served from https://localhost — the app is 100% offline, so there
 * is no server URL, no cleartext traffic and no network config.
 */
const config: CapacitorConfig = {
  appId: 'com.centavo.app',
  appName: 'centavo',
  webDir: 'dist',
}

export default config
