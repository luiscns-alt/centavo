// Adjusts the generated android/ project for the team's test APK. Idempotent — safe to rerun.
//  - debug build: applicationId com.centavo.app.debug, versionName "-debug", name "centavo (teste)"
//  - debug signing with the shared team key (keystores/debug.keystore) so any machine's APK
//    installs over another's without uninstalling (uninstalling wipes the app's IndexedDB)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const gradlePath = path.join(root, 'android', 'app', 'build.gradle')
if (!fs.existsSync(gradlePath)) {
  console.error('android/app/build.gradle não encontrado — rode "npx cap add android" antes.')
  process.exit(1)
}
if (!fs.existsSync(path.join(root, 'keystores', 'debug.keystore'))) {
  console.error('keystores/debug.keystore não encontrado.')
  process.exit(1)
}

let gradle = fs.readFileSync(gradlePath, 'utf8')
const MARK = '// centavo: debug test build'

if (!gradle.includes(MARK)) {
  const at = gradle.search(/\n(\s*)buildTypes\s*\{/)
  if (at < 0) {
    console.error('Bloco "buildTypes { ... }" não encontrado em android/app/build.gradle — ajuste manual necessário.')
    process.exit(1)
  }
  const indent = /\n(\s*)buildTypes/.exec(gradle.slice(at))[1]
  const i2 = indent + '    '
  const i3 = i2 + '    '
  const signing = [
    `${indent}${MARK}`,
    `${indent}signingConfigs {`,
    `${i2}debug {`,
    `${i3}storeFile file('../../keystores/debug.keystore')`,
    `${i3}storePassword 'android'`,
    `${i3}keyAlias 'androiddebugkey'`,
    `${i3}keyPassword 'android'`,
    `${i2}}`,
    `${indent}}`,
  ].join('\n')
  gradle = gradle.slice(0, at) + '\n' + signing + gradle.slice(at)
  gradle = gradle.replace(/(\n\s*buildTypes\s*\{)/, `$1
${i2}debug {
${i3}applicationIdSuffix '.debug'
${i3}versionNameSuffix '-debug'
${i3}signingConfig signingConfigs.debug
${i3}minifyEnabled false
${i2}}`)
  fs.writeFileSync(gradlePath, gradle)
  console.log('✓ build.gradle: applicationId .debug + chave compartilhada')
} else {
  console.log('• build.gradle já ajustado')
}

// The debug source set overrides the app name shown on the phone
const valuesDir = path.join(root, 'android', 'app', 'src', 'debug', 'res', 'values')
fs.mkdirSync(valuesDir, { recursive: true })
fs.writeFileSync(path.join(valuesDir, 'strings.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">centavo (teste)</string>
    <string name="title_activity_main">centavo (teste)</string>
</resources>
`)
console.log('✓ nome no celular: "centavo (teste)"')
