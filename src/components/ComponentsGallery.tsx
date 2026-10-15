import { useState } from 'react'
import { Button } from './ui/Button'
import { TransactionRow } from './ui/TransactionRow'
import { Badge } from './ui/Badge'
import { AlertCard } from './ui/AlertCard'
import { MonthSelector } from './ui/MonthSelector'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl p-5 border border-border">
      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted mb-4">
        {title}
      </div>
      {children}
    </div>
  )
}

export function ComponentsGallery() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  function prevMonth() {
    setMonth(m => {
      if (m === 1) { setYear(y => y - 1); return 12 }
      return m - 1
    })
  }

  function nextMonth() {
    setMonth(m => {
      if (m === 12) { setYear(y => y + 1); return 1 }
      return m + 1
    })
  }

  return (
    <div className="flex-1 bg-bg overflow-y-auto pb-24">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-muted">
          Components
        </div>
      </div>

      <div className="px-5 pt-5 grid grid-cols-1 gap-4">

        {/* BUTTONS */}
        <Section title="Buttons">
          <div className="flex flex-col gap-3">
            <Button variant="primary" fullWidth>Salvar lançamento</Button>
            <Button variant="ghost" fullWidth>Cancelar</Button>
            <Button variant="income" fullWidth>+ Receita</Button>
            <Button variant="expense" fullWidth>− Despesa</Button>
          </div>
        </Section>

        {/* TRANSACTION ROWS */}
        <Section title="Transaction Rows">
          <TransactionRow
            icon="💼"
            type="income"
            title="Pagamento PJ"
            subtitle="Freelance · 14 abr"
            amount="R$3.000"
          />
          <TransactionRow
            icon="🛵"
            type="expense"
            title="iFood"
            subtitle="Alimentação · 11 abr"
            amount="R$124"
          />
          <TransactionRow
            icon="🚗"
            type="expense"
            title="Uber"
            subtitle="Transporte · 10 abr"
            amount="R$32"
          />
        </Section>

        {/* BADGES */}
        <Section title="Badges">
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="income">✏️ Receita</Badge>
            <Badge variant="expense">✏️ Despesa</Badge>
            <Badge variant="neutral">abril 2026</Badge>
          </div>
          <div className="flex flex-col gap-3">
            <AlertCard
              variant="positive"
              title="Saldo positivo"
              description="Você fechou o mês no azul."
            />
            <AlertCard
              variant="negative"
              title="Saldo negativo"
              description="Despesas superaram receitas este mês."
            />
          </div>
        </Section>

        {/* MONTH SELECTOR */}
        <Section title="Month Selector">
          <div className="border border-border rounded-xl overflow-hidden">
            <MonthSelector
              year={year}
              month={month}
              onPrev={prevMonth}
              onNext={nextMonth}
              showLabel
            />
          </div>
        </Section>

      </div>
    </div>
  )
}
