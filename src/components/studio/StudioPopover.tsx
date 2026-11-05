import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Placement = 'below-start' | 'below-end' | 'above-end' | 'above-center'

export function StudioPopover({ className, anchor, placement = 'below-start', children }: {
  className: string
  anchor?: string
  placement?: Placement
  children: ReactNode
}) {
  const markerRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const update = () => {
      const root = markerRef.current?.parentElement
      const target = (anchor ? root?.querySelector<HTMLElement>(anchor) : null) ?? root
      const popover = popoverRef.current
      if (!target || !popover) return
      const box = target.getBoundingClientRect()
      const width = popover.offsetWidth
      const height = popover.scrollHeight
      const gap = 4
      const roomBelow = window.innerHeight - box.bottom - gap - 8
      const roomAbove = box.top - gap - 8
      const wantsAbove = placement.startsWith('above')
      const above = wantsAbove ? roomAbove >= height || roomAbove > roomBelow : roomBelow < height && roomAbove > roomBelow
      const room = Math.max(120, above ? roomAbove : roomBelow)
      const shown = Math.min(height, room)
      const top = above ? box.top - gap - shown : box.bottom + gap
      const rawLeft = placement.endsWith('end') ? box.right - width : placement.endsWith('center') ? box.left + box.width / 2 - width / 2 : box.left
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - width - 8))
      setStyle({ position: 'fixed', zIndex: 10000, top, left, right: 'auto', bottom: 'auto', transform: 'none', maxHeight: room, overflowY: 'auto' })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, placement])
  return (
    <>
      <span ref={markerRef} hidden />
      {createPortal(
        <div ref={popoverRef} className={`studio-popover ${className}`} style={style ?? { position: 'fixed', top: 0, left: 0, right: 'auto', bottom: 'auto', transform: 'none', visibility: 'hidden' }}>{children}</div>,
        document.body,
      )}
    </>
  )
}
