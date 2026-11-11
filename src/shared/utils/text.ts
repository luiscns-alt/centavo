/** First grapheme of what the user typed — an emoji, or a letter as fallback */
export function firstGrapheme(text: string): string {
  const t = text.trim()
  if (!t) return ''
  const seg = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(t)[Symbol.iterator]().next()
  return seg.done ? '' : seg.value.segment
}
