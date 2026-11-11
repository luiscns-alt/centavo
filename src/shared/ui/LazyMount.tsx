import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Renders its children only once they come near the viewport (below-the-fold widgets) */
export function LazyMount({ children, minHeight = 400, margin = '300px' }: { children: ReactNode; minHeight?: number; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    if (visible || !ref.current) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: margin })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [visible, margin])

  return <div ref={ref} style={visible ? undefined : { minHeight }}>{visible ? children : null}</div>
}
