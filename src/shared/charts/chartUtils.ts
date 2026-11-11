import { useEffect, useRef, useState } from 'react'

/** Round a step to 1, 2 or 5 × 10ⁿ */
function niceStep(raw: number): number {
  const exp = 10 ** Math.floor(Math.log10(raw))
  const f = raw / exp
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp
}

/** Evenly spaced round ticks covering [min, max]; zero is always included */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  if (lo === hi) return [0, 100] // empty chart: a token R$ 1 scale
  const step = niceStep((hi - lo) / count)
  const ticks: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) {
    ticks.push(Math.round(v))
  }
  return ticks
}

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

/** Axis label for integer centavos — "2,5 mil", "-800", "1,2 mi" (currency is implied by the chart title) */
export function formatAxis(centavos: number): string {
  return compact.format(centavos / 100)
}

/**
 * SVG path for a bar from `yBase` to `yEnd` with the data end rounded (radius r)
 * and the baseline end square. Returns '' for zero-height bars.
 */
export function barPath(x: number, w: number, yBase: number, yEnd: number, r = 4): string {
  const h = yBase - yEnd
  if (Math.abs(h) < 0.5 || w <= 0) return ''
  const rr = Math.min(r, w / 2, Math.abs(h))
  const s = h > 0 ? 1 : -1 // up: data end above baseline
  return [
    `M${x},${yBase}`,
    `V${yEnd + s * rr}`,
    `Q${x},${yEnd} ${x + rr},${yEnd}`,
    `H${x + w - rr}`,
    `Q${x + w},${yEnd} ${x + w},${yEnd + s * rr}`,
    `V${yBase}`,
    'Z',
  ].join(' ')
}

/** Width of an element, kept current with a ResizeObserver */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
