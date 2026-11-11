// Builds the debug APK: web build (unminified) → cap sync → gradlew assembleDebug, then copies the
// APK to dist-apk/centavo-debug.apk. Works on Windows (gradlew.bat) and macOS/Linux (./gradlew).
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })

if (!fs.existsSync(path.join(root, 'android'))) {
  console.error('Pasta android/ não existe — rode "npm run android:setup" uma vez.')
  process.exit(1)
}

run('npm run build:android')
run('npx cap sync android')
run(process.platform === 'win32' ? 'gradlew.bat assembleDebug' : './gradlew assembleDebug', path.join(root, 'android'))

const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const out = path.join(root, 'dist-apk')
fs.mkdirSync(out, { recursive: true })
fs.copyFileSync(apk, path.join(out, 'centavo-debug.apk'))
console.log(`\n✓ APK pronto: ${path.join(out, 'centavo-debug.apk')}`)
