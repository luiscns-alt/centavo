import { Capacitor } from '@capacitor/core'

export type SaveBackupResult =
  | { kind: 'download' }
  /** Android/iOS app: `location` = where a copy stayed on the phone (null if the folder isn't writable); `shared` = sent through the share sheet */
  | { kind: 'device'; location: string | null; shared: boolean }

/**
 * Hands the backup JSON to the user.
 *
 * Browser: a regular download. In the Android app (Capacitor WebView) a download link does
 * nothing, so instead:
 *  1. a copy is written to Documentos/centavo/ (best effort — some Android versions refuse it);
 *  2. the share sheet opens, so the file can leave the phone (Drive, e-mail, WhatsApp, Arquivos).
 *     A backup that only lives on the phone is lost with the phone.
 */
export async function saveBackupFile(filename: string, json: string): Promise<SaveBackupResult> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return { kind: 'download' }
  }

  const { Directory, Encoding, Filesystem } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  let location: string | null = null
  try {
    await Filesystem.writeFile({
      path: `centavo/${filename}`, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true,
    })
    location = `Documentos/centavo/${filename}`
  } catch { /* public Documents not writable here — the share sheet still works */ }

  const cached = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
  let shared = false
  try {
    await Share.share({ title: 'Backup do centavo', files: [cached.uri], dialogTitle: 'Salvar ou enviar o backup' })
    shared = true
  } catch { /* closed without choosing — the Documentos copy (if any) remains */ }

  return { kind: 'device', location, shared }
}
