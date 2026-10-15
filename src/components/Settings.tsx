import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO } from '../db'
import { BackupError, backupFilename, createBackup, parseBackup, restoreBackup, type Backup } from '../backup'
import {
  getLastBackupAt, getStorageStatus, requestPersistentStorage, setLastBackupAt, type StorageStatus,
} from '../storage'
import { Button } from './ui/Button'
import { ComponentsGallery } from './ComponentsGallery'

const formatLongDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(iso))
    .replaceAll('.', '')

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 pt-6">
      <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-3">{title}</div>
      {children}
    </section>
  )
}

export function Settings() {
  return (
    <div className="flex-1 bg-bg flex flex-col md:items-start md:justify-start md:p-10">
      <div className="flex-1 md:flex-none w-full md:max-w-[480px] md:bg-surface md:rounded-2xl md:border md:border-border md:shadow-sm flex flex-col pb-24 md:pb-6">
        <div className="px-5 py-4 border-b border-border">
          <span className="text-[17px] font-semibold text-ink">Ajustes</span>
        </div>

        <StorageSection />
        <BackupSection />

        {import.meta.env.DEV && (
          <details className="px-5 pt-8">
            <summary className="text-[12px] text-muted cursor-pointer">Galeria de componentes (dev)</summary>
            <div className="mt-4"><ComponentsGallery /></div>
          </details>
        )}
      </div>
    </div>
  )
}

// ─── Storage protection ───────────────────────────────────────────────────────

function StorageSection() {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    getStorageStatus().then(setStatus)
  }, [])

  async function protect() {
    const result = await requestPersistentStorage()
    setStatus(result)
    setDenied(result === 'not-persisted')
  }

  if (status === null) return null

  return (
    <Section title="Armazenamento">
      <div className="text-[15px] font-semibold text-ink">
        {status === 'persisted' ? 'Protegido' : status === 'unsupported' ? 'Proteção indisponível' : 'Não protegido'}
      </div>
      <p className="text-[13px] text-muted mt-1 leading-relaxed">
        {status === 'persisted' && 'O navegador não vai apagar seus dados para liberar espaço.'}
        {status === 'unsupported' && 'Este navegador não permite proteger os dados. Faça backups com frequência.'}
        {status === 'not-persisted' && !denied &&
          'Seus dados ficam só neste aparelho, e o navegador pode apagá-los se faltar espaço.'}
        {status === 'not-persisted' && denied &&
          'O navegador recusou. Instalar o Centavo na tela inicial costuma resolver — enquanto isso, faça backups.'}
      </p>
      {status === 'not-persisted' && !denied && (
        <Button variant="ghost" fullWidth className="mt-4" onClick={protect}>
          Proteger dados
        </Button>
      )}
    </Section>
  )
}

// ─── Backup export / restore ──────────────────────────────────────────────────

type RestoreState =
  | { step: 'idle' }
  | { step: 'confirm'; backup: Backup }
  | { step: 'restoring' }
  | { step: 'done'; count: number }
  | { step: 'error'; message: string }

function BackupSection() {
  const counts = useLiveQuery(async () => ({
    transactions: await db.transactions.count(),
    categories: await db.categories.count(),
  }))
  const [lastBackupAt, setLastBackup] = useState(getLastBackupAt)
  const [exporting, setExporting] = useState(false)
  const [restore, setRestore] = useState<RestoreState>({ step: 'idle' })
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    try {
      const backup = await createBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = backupFilename(todayISO())
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setLastBackupAt(backup.exportedAt)
      setLastBackup(backup.exportedAt)
    } catch {
      setRestore({ step: 'error', message: 'Não foi possível gerar o backup. Tente novamente.' })
    } finally {
      setExporting(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!file) return
    try {
      setRestore({ step: 'confirm', backup: parseBackup(await file.text()) })
    } catch (err) {
      const message = err instanceof BackupError ? err.message : 'Não foi possível ler o arquivo.'
      setRestore({ step: 'error', message })
    }
  }

  async function confirmRestore(backup: Backup) {
    setRestore({ step: 'restoring' })
    try {
      await restoreBackup(backup)
      setRestore({ step: 'done', count: backup.transactions.length })
    } catch {
      setRestore({ step: 'error', message: 'A restauração falhou. Seus dados atuais não foram alterados.' })
    }
  }

  return (
    <Section title="Backup">
      <div className="text-[15px] text-ink nums">
        {counts
          ? `${plural(counts.transactions, 'lançamento', 'lançamentos')} · ${plural(counts.categories, 'categoria', 'categorias')}`
          : '-'}
      </div>
      <p className="text-[13px] text-muted mt-1">
        {lastBackupAt ? `Último backup neste aparelho: ${formatLongDate(lastBackupAt)}` : 'Nenhum backup feito neste aparelho.'}
      </p>

      <div className="flex flex-col gap-3 mt-4">
        <Button fullWidth onClick={handleExport} disabled={exporting || restore.step === 'restoring'}>
          {exporting ? 'Gerando...' : 'Exportar backup'}
        </Button>
        <Button
          variant="ghost"
          fullWidth
          onClick={() => fileInput.current?.click()}
          disabled={restore.step === 'restoring'}
        >
          Restaurar backup
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {restore.step === 'confirm' && (
        <div className="mt-4 bg-surface border border-border rounded-xl p-4" role="alertdialog" aria-labelledby="restore-title">
          <div id="restore-title" className="text-[15px] font-semibold text-ink">
            Restaurar backup{restore.backup.exportedAt ? ` de ${formatLongDate(restore.backup.exportedAt)}` : ''}?
          </div>
          <p className="text-[13px] text-muted mt-1 leading-relaxed">
            Ele tem {plural(restore.backup.transactions.length, 'lançamento', 'lançamentos')} e{' '}
            {plural(restore.backup.categories.length, 'categoria', 'categorias')}.
            {counts && counts.transactions > 0 &&
              ` Os ${plural(counts.transactions, 'lançamento atual', 'lançamentos atuais')} serão substituídos.`}
          </p>
          <div className="flex gap-3 mt-4">
            <Button variant="ghost" className="flex-1" onClick={() => setRestore({ step: 'idle' })}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={() => confirmRestore(restore.backup)}>
              Substituir dados
            </Button>
          </div>
        </div>
      )}

      {restore.step === 'restoring' && (
        <p className="text-[13px] text-muted mt-4">Restaurando...</p>
      )}
      {restore.step === 'done' && (
        <p className="text-[13px] text-ink mt-4" role="status">
          Backup restaurado: {plural(restore.count, 'lançamento', 'lançamentos')}.
        </p>
      )}
      {restore.step === 'error' && (
        <p className="text-[13px] text-ink mt-4" role="alert">{restore.message}</p>
      )}
    </Section>
  )
}
