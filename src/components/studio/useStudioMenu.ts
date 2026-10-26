import { useContext } from 'react'
import { MenuContext } from './studioMenuContext'

export function useStudioMenu() {
  const value = useContext(MenuContext)
  if (!value) throw new Error('StudioMenuProvider is required')
  return value
}
