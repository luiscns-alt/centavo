import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO } from '../../core/db'
import { BackupError, backupFilename, createBackup, parseBackup, restoreBackup, type Backup } from './backup'
import { getLastBackupAt, getStorageStatus, requestPersistentStorage, setLastBackupAt, type StorageStatus } from '../../core/storage'
import { Download, HardDrive, ShieldCheck, ShieldAlert, Upload } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { MobileHeader } from '../../shared/ui/MobileHeader'
import { ComponentsGallery } from './ComponentsGallery'
import { CategoriesSection } from '../categories'
import { AccountsSection } from '../accounts'

const formatLongDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(iso))
    .replaceAll('.', '')

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const listPt = (items: string[]) => new Intl.ListFormat('pt-BR', { type: 'conjunction' }).format(items)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="px-5 md:px-1 text-[11px] font-semibold uppercase tracking-[.1em] text-muted mb-2">{title}</div>
      <div className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl p-5 slide-up">{children}</div>
    </section>
  )
}

function StatusLine({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <div className="w-9 h-9 rounded-[10px] border border-border flex items-center justify-center text-ink shrink-0" aria-hidden>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-ink leading-snug">{title}</div>
        <div className="text-[13px] text-muted mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

export function Settings({ onOpenLoan, onNewLoan }: { onOpenLoan: (id: number) => void; onNewLoan: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto pb-28 md:pb-12">
      <MobileHeader title="Ajustes" />
      <div className="md:max-w-[560px] md:mx-auto md:px-10 md:pt-8 pt-4">
        <h1 className="hidden md:block text-[22px] font-semibold tracking-[-.01em] text-ink m-0 mb-6">Ajustes</h1>

        <AccountsSection onOpenLoan={onOpenLoan} onNewLoan={onNewLoan} />
        <StorageSection />
        <BackupSection />
        <CategoriesSection />

        <p className="px-5 md:px-1 mt-8 text-[12px] text-muted leading-relaxed">
          O centavo funciona offline e guarda tudo só neste aparelho — sem conta, sem servidor, sem banco conectado.
          {' '}As logos de bancos são marcas dos respectivos bancos e aparecem só para identificar as suas contas.
        </p>

        {import.meta.env.DEV && (
          <details className="px-5 md:px-1 pt-6">
            <summary className="text-[12px] text-muted cursor-pointer hover:text-ink">Galeria de componentes (dev)</summary>
            <div className="mt-4 -mx-5 md:mx-0"><ComponentsGallery /></div>
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
      <StatusLine
        icon={status === 'persisted' ? <ShieldCheck size={18} strokeWidth={1.75} /> : <ShieldAlert size={18} strokeWidth={1.75} />}
        title={status === 'persisted' ? 'Protegido' : status === 'unsupported' ? 'Proteção indisponível' : 'Não protegido'}
      >
        {status === 'persisted' && 'O navegador não vai apagar seus dados para liberar espaço.'}
        {status === 'unsupported' && 'Este navegador não permite proteger os dados. Faça backups com frequência.'}
        {status === 'not-persisted' && !denied &&
          'Seus dados ficam só neste aparelho, e o navegador pode apagá-los se faltar espaço.'}
        {status === 'not-persisted' && denied &&
          'O navegador recusou. Instalar o centavo na tela inicial costuma resolver — enquanto isso, faça backups.'}
      </StatusLine>
      {status === 'not-persisted' && !denied && (
        <Button variant="ghost" fullWidth className="mt-5" onClick={protect}>
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
    accounts: await db.accounts.count(),
    transfers: await db.transfers.count(),
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
      <StatusLine
        icon={<HardDrive size={18} strokeWidth={1.75} />}
        title={counts
          ? `${plural(counts.accounts, 'conta', 'contas')} · ${plural(counts.transactions + counts.transfers, 'lançamento', 'lançamentos')}`
          : '–'}
      >
        {lastBackupAt ? `Último backup neste aparelho: ${formatLongDate(lastBackupAt)}` : 'Nenhum backup feito neste aparelho.'}
      </StatusLine>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        <Button
          fullWidth
          onClick={handleExport}
          disabled={exporting || restore.step === 'restoring'}
          className="flex items-center justify-center gap-2"
        >
          <Download size={17} strokeWidth={2} />
          {exporting ? 'Gerando...' : 'Exportar'}
        </Button>
        <Button
          variant="ghost"
          fullWidth
          onClick={() => fileInput.current?.click()}
          disabled={restore.step === 'restoring'}
          className="flex items-center justify-center gap-2"
        >
          <Upload size={17} strokeWidth={2} />
          Restaurar
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
        <div className="mt-5 bg-bg border border-border rounded-xl p-4 slide-up" role="alertdialog" aria-labelledby="restore-title">
          <div id="restore-title" className="text-[15px] font-semibold text-ink">
            Restaurar backup{restore.backup.exportedAt ? ` de ${formatLongDate(restore.backup.exportedAt)}` : ''}?
          </div>
          <p className="text-[13px] text-muted mt-1 leading-relaxed">
            Ele tem {listPt([
              plural(restore.backup.accounts.length, 'conta', 'contas'),
              plural(restore.backup.transactions.length + restore.backup.transfers.length, 'lançamento', 'lançamentos'),
              plural(restore.backup.categories.length, 'categoria', 'categorias'),
            ])}.
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
