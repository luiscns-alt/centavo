import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../../core/db'
import { LedgerError } from '../../core/ledger/base'
import { createAccount, deleteAccount, setAccountArchived, updateAccount } from './ledger'
import { useAccountBalances } from './useAccounts'
import { AccountEditor } from './AccountEditor'
import { AccountIcon } from './AccountIcon'
import { ACCOUNT_KINDS } from '../../core/constants/domain'
import { formatBalance } from '../../shared/utils/money'

type Editing = { mode: 'new' } | { mode: 'edit'; id: number } | { mode: 'delete'; id: number } | null


/** Ajustes → Contas: create, edit (incl. saldo inicial), archive, delete unused */
export function AccountsSection({ onOpenLoan, onNewLoan }: { onOpenLoan: (id: number) => void; onNewLoan: () => void }) {
  const { accounts, total } = useAccountBalances()
  const loans = useLiveQuery(() => db.loans.toArray())
  const loanOf = (accountId: number) => loans?.find(l => l.accountId === accountId)
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)

  const usage = useLiveQuery(async () => {
    const [txs, trs] = await Promise.all([db.transactions.toArray(), db.transfers.toArray()])
    const m = new Map<number, number>()
    const inc = (id: number) => m.set(id, (m.get(id) ?? 0) + 1)
    txs.forEach(t => inc(t.accountId))
    trs.forEach(t => { inc(t.fromAccountId); inc(t.toAccountId) })
    return m
  })

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      setEditing(null)
    } catch (e) {
      setError(e instanceof LedgerError ? e.message : 'Não foi possível concluir. Tente novamente.')
    }
  }

  return (
    <section className="mt-6">
      <div className="px-5 md:px-1 flex items-baseline justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-muted">Contas</div>
        {accounts.length > 0 && (
          <div className="text-[12px] text-muted nums">Patrimônio <span className="font-semibold text-ink">{formatBalance(total)}</span></div>
        )}
      </div>

      <div className="mx-5 md:mx-0 bg-surface border border-border rounded-2xl overflow-hidden">
        {accounts.length === 0 && editing?.mode !== 'new' && (
          <p className="m-0 px-5 pt-5 pb-2 text-[13px] text-muted leading-relaxed">
            Nenhuma conta ainda. Cadastre cada banco, poupança ou carteira com o saldo que já tem.
          </p>
        )}

        <ul className="m-0 p-0 list-none divide-y divide-border">
          {accounts.map(a => {
            const used = usage?.get(a.id) ?? 0
            if (editing?.mode === 'edit' && editing.id === a.id) {
              return (
                <li key={a.id} className="p-2">
                  <AccountEditor
                    title="Editar conta"
                    submitLabel="Salvar"
                    initial={{ name: a.name, kind: a.kind, icon: a.icon, bankId: a.bankId, openingBalance: a.openingBalance, openingDate: a.openingDate, card: a.card }}
                    onSubmit={async v => { await updateAccount(a.id, v); setEditing(null) }}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              )
            }
            const confirming = editing?.mode === 'delete' && editing.id === a.id
            return (
              <li key={a.id} className={`flex items-center gap-3 pl-4 pr-2 min-h-16 py-2 ${a.archived ? 'opacity-60' : ''}`}>
                <AccountIcon account={a} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate">{a.name}</div>
                  <div className="text-[12px] text-muted truncate">
                    {a.card ? `Cartão · fecha ${a.card.closingDay} · vence ${a.card.dueDay}` : a.kind === 'loan' ? 'Empréstimo · saldo devedor' : ACCOUNT_KINDS[a.kind].label}
                    {a.archived ? ' · arquivada' : ''}
                    {' · '}
                    <span className={`nums font-semibold ${a.balance < 0 ? 'text-expense' : 'text-ink'}`}>{formatBalance(a.balance)}</span>
                  </div>
                </div>
                {a.kind === 'loan' ? (
                  <button
                    onClick={() => { const l = loanOf(a.id); if (l) onOpenLoan(l.id as number) }}
                    className="h-8 px-3 rounded-full border border-border text-[12px] font-semibold text-ink hover:bg-bg"
                  >
                    Abrir
                  </button>
                ) : confirming ? (
                  <div className="flex items-center gap-1.5 slide-up">
                    <button onClick={() => setEditing(null)} className="h-8 px-3 rounded-full text-[12px] font-semibold text-muted hover:text-ink">
                      Cancelar
                    </button>
                    <button onClick={() => void run(() => deleteAccount(a.id))} className="h-8 px-3 rounded-full bg-ink text-bg text-[12px] font-semibold">
                      Excluir
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center shrink-0">
                    <IconButton label={`Editar ${a.name}`} onClick={() => { setError(null); setEditing({ mode: 'edit', id: a.id }) }}>
                      <Pencil size={16} strokeWidth={1.75} />
                    </IconButton>
                    <IconButton
                      label={a.archived ? `Reativar ${a.name}` : `Arquivar ${a.name}`}
                      onClick={() => void run(() => setAccountArchived(a.id, !a.archived))}
                    >
                      {a.archived ? <ArchiveRestore size={16} strokeWidth={1.75} /> : <Archive size={16} strokeWidth={1.75} />}
                    </IconButton>
                    <IconButton
                      label={`Excluir ${a.name}`}
                      disabled={used > 0}
                      title={used > 0 ? 'Tem movimentações — arquive em vez de excluir' : undefined}
                      onClick={() => { setError(null); setEditing({ mode: 'delete', id: a.id }) }}
                    >
                      <Trash2 size={16} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className={`${accounts.length ? 'border-t border-border' : ''} p-2`}>
          {editing?.mode === 'new' ? (
            <AccountEditor
              title="Nova conta"
              onSubmit={async v => { await createAccount(v); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <button
                onClick={() => { setError(null); setEditing({ mode: 'new' }) }}
                className="w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-semibold text-ink hover:bg-bg transition-colors"
              >
                <Plus size={16} strokeWidth={2} />
                Nova conta ou cartão
              </button>
              <button
                onClick={onNewLoan}
                className="w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-[14px] font-semibold text-ink hover:bg-bg transition-colors"
              >
                <Plus size={16} strokeWidth={2} />
                Empréstimo ou financiamento
              </button>
            </div>
          )}
        </div>
      </div>

      <p className={`px-5 md:px-1 mt-2 mb-0 text-[12px] ${error ? 'text-ink' : 'text-muted'}`} role={error ? 'alert' : undefined}>
        {error ?? 'Contas com movimentações podem ser arquivadas, mas não excluídas — o histórico fica intacto.'}
      </p>
    </section>
  )
}

function IconButton({ label, onClick, disabled, title, children }: {
  label: string; onClick: () => void; disabled?: boolean; title?: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-bg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}
