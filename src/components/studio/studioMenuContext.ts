import { createContext } from 'react'

export interface MenuContextValue {
  openMenu: string | null
  setOpenMenu: (id: string | null) => void
}

export const MenuContext = createContext<MenuContextValue | null>(null)
