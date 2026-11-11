import { useState } from 'react'
import { bankById } from './banks/catalog'
import type { Account } from '../../core/types'

interface Props {
  account: Pick<Account, 'icon' | 'bankId'>
  /** Tile edge in px (logo tiles) — 'inline' renders a small glyph for chips and pills */
  size?: number | 'inline'
}

/**
 * The account's bank logo on a white tile (same in light and dark mode, like an app icon),
 * or its emoji when there is no known bank or the file fails to load.
 */
export function AccountIcon({ account, size = 36 }: Props) {
  const bank = bankById(account.bankId)
  const [failed, setFailed] = useState<string | null>(null)
  const logo = bank?.logo && failed !== bank.logo ? bank.logo : null

  if (size === 'inline') {
    return logo ? (
      <img
        src={logo}
        alt=""
        width={16}
        height={16}
        decoding="async"
        onError={() => setFailed(logo)}
        className="w-4 h-4 rounded-[4px] bg-white object-contain shrink-0"
      />
    ) : (
      <span aria-hidden>{account.icon}</span>
    )
  }

  const box = { width: size, height: size }
  return logo ? (
    <div
      className="rounded-[10px] bg-white border border-border flex items-center justify-center overflow-hidden shrink-0"
      style={box}
      aria-hidden
    >
      <img
        src={logo}
        alt=""
        width={size - 10}
        height={size - 10}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(logo)}
        className="object-contain"
        style={{ width: size - 10, height: size - 10 }}
      />
    </div>
  ) : (
    <div
      className="rounded-[10px] border border-border bg-bg flex items-center justify-center shrink-0"
      style={{ ...box, fontSize: Math.round(size * 0.45) }}
      aria-hidden
    >
      {account.icon}
    </div>
  )
}
