/**
 * Fixed-point decimal arithmetic on BigInt, for rate math in loans (no dependency, as agreed).
 * A Dec is a bigint holding value × 10^30. Money stays in integer centavos everywhere else;
 * Dec is only used for rates, powers and roots, and is rounded back to centavos explicitly.
 */
export type Dec = bigint

const DIGITS = 30
export const SCALE = 10n ** BigInt(DIGITS)
export const ONE: Dec = SCALE
export const ZERO: Dec = 0n

/** Divide rounding half away from zero */
function divRound(a: bigint, b: bigint): bigint {
  const neg = (a < 0n) !== (b < 0n)
  const A = a < 0n ? -a : a
  const B = b < 0n ? -b : b
  const q = (A * 2n + B) / (B * 2n)
  return neg ? -q : q
}

/** "0,7974" / "0.7974" / "12" → Dec. Throws on anything else. */
export function dec(text: string): Dec {
  const s = text.trim().replace(',', '.')
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s)
  if (!m) throw new Error(`Número inválido: ${text}`)
  const frac = (m[3] ?? '').slice(0, DIGITS).padEnd(DIGITS, '0')
  const v = BigInt(m[2]) * SCALE + BigInt(frac)
  return m[1] ? -v : v
}

export const fromInt = (n: number | bigint): Dec => BigInt(n) * SCALE
export const add = (a: Dec, b: Dec): Dec => a + b
export const sub = (a: Dec, b: Dec): Dec => a - b
export const mul = (a: Dec, b: Dec): Dec => divRound(a * b, SCALE)
export const div = (a: Dec, b: Dec): Dec => {
  if (b === 0n) throw new Error('Divisão por zero')
  return divRound(a * SCALE, b)
}

export function powInt(base: Dec, n: number): Dec {
  if (!Number.isInteger(n) || n < 0) throw new Error('Expoente inválido')
  let result = ONE
  let b = base
  let e = n
  while (e > 0) {
    if (e & 1) result = mul(result, b)
    b = mul(b, b)
    e >>= 1
  }
  return result
}

/** n-th root of a positive Dec, Newton's method to full precision */
export function nthRoot(a: Dec, n: number): Dec {
  if (a < 0n) throw new Error('Raiz de número negativo')
  if (a === 0n || n === 1) return a
  const N = BigInt(n)
  // Start from the float estimate, then refine in exact arithmetic
  let x = dec(Math.pow(Number(a) / Number(SCALE), 1 / n).toFixed(15))
  if (x <= 0n) x = ONE
  for (let i = 0; i < 200; i++) {
    const next = divRound((N - 1n) * x + div(a, powInt(x, n - 1)), N)
    const delta = next > x ? next - x : x - next
    x = next
    if (delta <= 1n) break
  }
  return x
}

/** Round a Dec to the nearest integer (half away from zero) */
export const roundInt = (a: Dec): bigint => divRound(a, SCALE)
export const floorInt = (a: Dec): bigint => (a >= 0n ? a / SCALE : -((-a + SCALE - 1n) / SCALE))
export const toNumber = (a: Dec): number => Number(a) / Number(SCALE)

/** Integer centavos × Dec factor → centavos, rounded half up (the per-period rounding rule) */
export const centavosTimes = (centavos: number, factor: Dec): number => Number(roundInt(mul(fromInt(centavos), factor)))

/** Dec → string with `places` decimals (display / storage), rounded */
export function format(a: Dec, places: number): string {
  const unit = 10n ** BigInt(DIGITS - places)
  const r = divRound(a, unit)
  const neg = r < 0n
  const s = (neg ? -r : r).toString().padStart(places + 1, '0')
  const out = places ? `${s.slice(0, -places)}.${s.slice(-places)}` : s
  return neg ? `-${out}` : out
}
