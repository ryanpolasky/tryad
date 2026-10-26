import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { MenuContext } from './studioMenuContext'

export function StudioMenuProvider({ children }: { children: ReactNode }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-studio-menu-root], .studio-popover')) setOpenMenu(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return <MenuContext.Provider value={{ openMenu, setOpenMenu }}>{children}</MenuContext.Provider>
}
