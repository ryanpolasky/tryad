import { useCallback, useRef, useState } from 'react'

interface UseHistoryOptions {
  /** how many snapshots to keep. older entries are dropped. */
  maxSize?: number
  /** if push() is called twice with the same label inside this window, the
   *  later call is treated as a continuation and doesn't add a new entry.
   *  this is what stops a slider drag from filling history with 60 frames. */
  coalesceWindowMs?: number
}

export interface HistoryAPI<T> {
  /** record `current` so future undo() can restore it. coalesces by label. */
  push: (current: T, label?: string) => void
  /** pop the last past entry; the supplied `current` becomes a redo entry. */
  undo: (current: T) => T | null
  /** pop the last future entry; the supplied `current` becomes a past entry. */
  redo: (current: T) => T | null
  /** wipe both stacks. used on share-import / saved-load to avoid stale undo. */
  clear: () => void
  canUndo: boolean
  canRedo: boolean
}

// generic two-stack undo with label coalescing. caller owns the snapshot shape.
export function useHistory<T>(opts: UseHistoryOptions = {}): HistoryAPI<T> {
  const maxSize = opts.maxSize ?? 30
  const windowMs = opts.coalesceWindowMs ?? 700
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const lastLabel = useRef<string | null>(null)
  const lastTime = useRef(0)
  const [, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  const push = useCallback(
    (current: T, label?: string) => {
      const now = Date.now()
      if (label && lastLabel.current === label && now - lastTime.current < windowMs) {
        // continuous edit (slider drag, repeated key tap). don't pile up entries;
        // just extend the coalesce window so it keeps swallowing follow-ups.
        lastTime.current = now
        return
      }
      past.current.push(current)
      if (past.current.length > maxSize) past.current.shift()
      future.current = []
      lastLabel.current = label ?? null
      lastTime.current = now
      bump()
    },
    [maxSize, windowMs, bump],
  )

  const undo = useCallback(
    (current: T): T | null => {
      if (past.current.length === 0) return null
      const prev = past.current.pop() as T
      future.current.push(current)
      // reset coalescing — the next action is a fresh edit, not a continuation.
      lastLabel.current = null
      bump()
      return prev
    },
    [bump],
  )

  const redo = useCallback(
    (current: T): T | null => {
      if (future.current.length === 0) return null
      const next = future.current.pop() as T
      past.current.push(current)
      lastLabel.current = null
      bump()
      return next
    },
    [bump],
  )

  const clear = useCallback(() => {
    past.current = []
    future.current = []
    lastLabel.current = null
    bump()
  }, [bump])

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
