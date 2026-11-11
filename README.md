# centavo

## APK de teste (Android, debug)

APK só para testes internos: o app web vai embutido (100% offline, sem servidor), sem minificação e assinado com a chave de debug compartilhada da equipe.

**Pré-requisitos (uma vez):** Node.js 22+, Android Studio Otter (2025.2.1) ou mais novo com o Android SDK 36 — o JDK que vem com ele serve. Defina `JAVA_HOME` para o JDK do Android Studio (`C:\Program Files\Android\Android Studio\jbr`) e `ANDROID_HOME` para o SDK (`%LOCALAPPDATA%\Android\Sdk`).

```bash
npm install
npm run android:setup   # só na primeira vez: cria android/ e aplica os ajustes de teste
npm run apk:debug       # gera dist-apk/centavo-debug.apk
```

Instalar: copie o APK para o celular e abra (permita "instalar apps desconhecidos"), ou com o cabo: `adb install -r dist-apk/centavo-debug.apk`.

- No celular aparece como **centavo (teste)**, pacote `com.centavo.app.debug`.
- Chave: `keystores/debug.keystore` (alias `androiddebugkey`, senha `android`) — só para debug, nunca para publicar. SHA-1: `F6:C4:D1:ED:C5:13:90:54:6D:47:76:7C:35:1E:29:BE:3B:51:9D:62`.
- Os dados ficam no aparelho. **Desinstalar apaga tudo** — exporte um backup em Ajustes antes. Como todos assinam com a mesma chave, um APK novo instala por cima sem perder dados.
- Depois de mudar o código, basta `npm run apk:debug` de novo.

---

## Template (React + TypeScript + Vite)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
