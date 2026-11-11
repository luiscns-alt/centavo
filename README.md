# centavo

Controle de fluxo de caixa pessoal: contas, cartões de crédito, empréstimos, orçamentos e estornos. **Privacy-first e offline:** não há servidor; os dados ficam no aparelho (IndexedDB) e saem só por backup exportado em Ajustes.

**Stack:** React 19 · TypeScript · Vite 8 · Panda CSS (`@pandacss/vite`) · Dexie (IndexedDB) · Capacitor 8 para o APK de teste.

## Desenvolvimento

Requer **Node.js 22+**.

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint       # ESLint, incluindo as regras de arquitetura e de cores
npm test           # Vitest
npm run build      # checagem de tipos + build de produção em dist/
```

Antes de mexer no código, leia:

- **CLAUDE.md** — arquitetura (`app/`, `core/`, `shared/`, `features/`), regras de gravação (todo dinheiro passa pelos `ledger.ts`) e convenções.
- **DESIGN.md** — tipografia, cores (cor só para dinheiro), componentes e decisões de design.

## APK de teste (Android, debug)

APK só para testes internos: o app web vai embutido (100% offline), sem minificação, e assinado com a chave de debug compartilhada da equipe. A pasta `android/` já está no repositório.

### 1. Preparar a máquina (uma vez)

Instale o **Android Studio Otter (2025.2.1) ou mais novo**. Em **More Actions → SDK Manager**, marque:

- *SDK Platforms*: **Android 16 (API 36)**
- *SDK Tools*: **Android SDK Platform-Tools** e **Android SDK Build-Tools**

Depois defina as variáveis de ambiente no PowerShell (valem para o seu usuário, de forma permanente):

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")

# opcional: adb no terminal, para instalar pelo cabo
$pt = "$env:LOCALAPPDATA\Android\Sdk\platform-tools"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$pt*") { [Environment]::SetEnvironmentVariable("Path", "$userPath;$pt", "User") }
```

**Feche e abra o terminal** (e o VS Code, se usar o terminal dele) e confira:

```powershell
$env:ANDROID_HOME                      # C:\Users\<você>\AppData\Local\Android\Sdk
dir "$env:ANDROID_HOME\platforms"      # precisa listar android-36
& "$env:JAVA_HOME\bin\java" -version   # versão 21
adb version                            # se configurou o Path
```

### 2. Gerar o APK

```bash
npm install
npm run apk:debug      # gera dist-apk/centavo-debug.apk
```

O primeiro build demora alguns minutos (o Gradle baixa as dependências). Depois de mudar o código, basta rodar `npm run apk:debug` de novo.

### 3. Instalar no celular

- **Sem cabo:** copie `dist-apk\centavo-debug.apk` para o celular e abra o arquivo (permita "instalar apps desconhecidos").
- **Com cabo** (depuração USB ligada em *Opções do desenvolvedor*):

  ```powershell
  adb devices                                # o aparelho aparece como "device"
  adb install -r dist-apk\centavo-debug.apk
  ```

### Bom saber

- No celular o app aparece como **centavo (teste)**, pacote `com.centavo.app.debug`.
- Chave: `keystores/debug.keystore` (alias `androiddebugkey`, senha `android`), só para debug, nunca para publicar. SHA-1: `F6:C4:D1:ED:C5:13:90:54:6D:47:76:7C:35:1E:29:BE:3B:51:9D:62`.
- Os dados ficam no aparelho e **desinstalar apaga tudo**: exporte um backup em Ajustes antes. Como todos assinam com a mesma chave, um APK novo instala por cima sem perder dados.
- Os dados do APK são separados dos que você tem no navegador.
- Sem internet, os textos aparecem com a fonte do sistema (as fontes vêm do Google Fonts).
- O botão "voltar" do Android ainda fecha o app em vez de fechar a tela aberta.

### Problemas comuns

| Erro | Solução |
| --- | --- |
| `npm error could not determine executable to run` | Os pacotes do Capacitor não foram instalados: rode `npm install`. |
| `SDK location not found` ou `ANDROID_HOME` vazio | Defina as variáveis do passo 1 e abra um terminal novo. |
| `adb` não é reconhecido | Acrescente `platform-tools` ao `Path` (passo 1) ou instale copiando o APK. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | O app instalado foi assinado com outra chave: desinstale (exporte o backup antes) e instale de novo. |
| Precisa recriar a pasta `android/` | Apague-a e rode `npm run android:setup`, que cria o projeto e reaplica os ajustes de teste. |
