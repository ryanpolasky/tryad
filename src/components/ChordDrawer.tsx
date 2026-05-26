import { useEffect, useRef } from 'react'
import type { Chord } from '../lib/theory'
import { ChordVisualizer, type VisualizerMode } from './ChordVisualizer'

interface ChordDrawerProps {
  open: boolean
  chord: Chord | null
  index: number
  total: number
  inversion: number
  preferFlat?: boolean
  mode: VisualizerMode
  onModeChange: (m: VisualizerMode) => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onCycleInversion: () => void
}

export function ChordDrawer({
  open,
  chord,
  index,
  total,
  inversion,
  preferFlat,
  mode,
  onModeChange,
  onClose,
  onPrev,
  onNext,
  onCycleInversion,
}: ChordDrawerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  // esc / arrows while open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onNext()
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        onCycleInversion()
      } else if (e.key === 'Tab') {
        // focus trap
        const dialog = dialogRef.current
        if (!dialog) return
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onPrev, onNext, onCycleInversion])

  // move focus into the dialog on open; restore on close.
  useEffect(() => {
    if (open) {
      lastFocusRef.current = document.activeElement as HTMLElement | null
      // defer to next tick so the dialog is mounted
      const t = window.setTimeout(() => {
        const dialog = dialogRef.current
        const focusable = dialog?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        focusable?.focus()
      }, 50)
      return () => window.clearTimeout(t)
    }
    // on close, return focus to whatever opened the drawer.
    if (lastFocusRef.current && document.body.contains(lastFocusRef.current)) {
      lastFocusRef.current.focus()
    }
  }, [open])

  // make the rest of the page inert while open so screen readers ignore it
  // and Tab can't escape. backdrop stays clickable for dismissal.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('header, main, footer'),
    )
    if (open) {
      for (const el of targets) {
        el.setAttribute('inert', '')
        el.setAttribute('aria-hidden', 'true')
      }
    } else {
      for (const el of targets) {
        el.removeAttribute('inert')
        el.removeAttribute('aria-hidden')
      }
    }
    return () => {
      for (const el of targets) {
        el.removeAttribute('inert')
        el.removeAttribute('aria-hidden')
      }
    }
  }, [open])

  return (
    <>
      {/* backdrop - soft fade, no blur (keeps page visible) */}
      <div
        className={`fixed inset-0 z-40 bg-bg/70 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* drawer */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chord visualizer"
        // cap mobile height so the progression strip stays visible behind the drawer.
        className={`fixed inset-x-0 bottom-0 z-50
                    max-h-[70vh] overflow-y-auto overscroll-contain
                    border-t border-bg-line bg-bg-card/95 backdrop-blur
                    shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.55)]
                    transition-transform duration-300 ease-out
                    ${open ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-5 flex flex-col gap-4">
          {/* drawer header: nav + close */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrev}
                disabled={total <= 1}
                aria-label="Previous chord"
                className="pill-icon"
              >
                <Arrow dir="left" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={total <= 1}
                aria-label="Next chord"
                className="pill-icon"
              >
                <Arrow dir="right" />
              </button>
              <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-dim ml-1">
                {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
              </span>
              <span className="hidden sm:flex items-center gap-1 ml-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
                <span className="kbd">←</span>
                <span className="kbd">→</span>
                step
                <span className="kbd ml-2">i</span>
                invert
                <span className="kbd ml-2">esc</span>
                close
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close visualizer"
              className="pill-icon"
            >
              <CloseIcon />
            </button>
          </div>

          {chord ? (
            <ChordVisualizer
              chord={chord}
              inversion={inversion}
              preferFlat={preferFlat}
              mode={mode}
              onModeChange={onModeChange}
              onCycleInversion={onCycleInversion}
            />
          ) : null}
        </div>
      </div>
    </>
  )
}

function Arrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        d={dir === 'left' ? 'M12 4 L6 10 L12 16' : 'M8 4 L14 10 L8 16'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 5 L15 15 M15 5 L5 15" strokeLinecap="round" />
    </svg>
  )
}
