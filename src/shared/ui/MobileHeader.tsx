import { css } from '../../../styled-system/css'

const bar = css({
  display: { base: 'flex', md: 'none' }, justifyContent: 'space-between', alignItems: 'center', px: '5', pt: '5', pb: '1',
})
const titleText = css({ fontSize: '17', fontWeight: 'semibold', letterSpacing: 'title', color: 'ink' })
const avatar = css({
  w: '8', h: '8', rounded: 'full', bg: 'surface', borderWidth: '1px', borderColor: 'border',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11', fontWeight: 'semibold', color: 'ink',
})

export function MobileHeader({ title = 'centavo' }: { title?: string }) {
  return (
    <div className={bar}>
      <span className={titleText}>{title}</span>
      <div className={avatar}>LC</div>
    </div>
  )
}
