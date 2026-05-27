import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  diatonicChords,
  pcName,
  type Chord,
  type Extension,
  type PitchClass,
  type Scale,
} from '../lib/theory'
import { suggestSubstitutes, type SubstituteOption } from '../lib/substitutes'

interface ChordSwapPopoverProps {
  anchor: HTMLElement
  current: Chord
  index: number
  progression: Chord[]
  songKey: PitchClass
  scale: Scale
  /** extension the global progression is currently using; pre-selects the chip. */
  extension: Extension
  preferFlat?: boolean
  onSelect: (chord: Chord) => void
  onClose: () => void
}

const POPOVER_WIDTH = 320

// kept in sync with theory.ts EXTENSIONS but ordered for the chip strip.
const EXTENSION_CHIPS: { id: Extension; label: string }[] = [
  { id: 'triad', label: 'triad' },
  { id: 'seventh', label: '7th' },
  { id: 'ninth', label: '9th' },
  { id: 'sus2', label: 'sus2' },
  { id: 'sus4', label: 'sus4' },
  { id: 'add9', label: 'add9' },
]

export function ChordSwapPopover({
  anchor,
  current,
  index,
  progression,
  songKey,
  scale,
  extension,
  preferFlat = false,
  onSelect,
  onClose,
}: ChordSwapPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(
    null,
  )
  // local extension override — lets the user audition a chord with a different
  // harmonic density without changing the global setting.
  const [ext, setExt] = useState<Extension>(extension)

  const suggestions = useMemo(
    () =>
      suggestSubstitutes({
        chord: current,
        index,
        progression,
        key: songKey,
        scale,
        extension: ext,
      }),
    [current, index, progression, songKey, scale, ext],
  )
  const diatonic = useMemo(
    () => diatonicChords(songKey, scale, ext),
    [songKey, scale, ext],
  )

  // measure + place. recomputes on scroll / resize / content size change so the
  // popover follows the anchor if the layout shifts or our own body grows.
  useLayoutEffect(() => {
    const compute = () => {
      const r = anchor.getBoundingClientRect()
      const margin = 8
      const estHeight = ref.current?.offsetHeight ?? 320
      const viewportH = window.innerHeight
      const viewportW = window.innerWidth
      let left = r.left + r.width / 2 - POPOVER_WIDTH / 2
      if (left < margin) left = margin
      if (left + POPOVER_WIDTH > viewportW - margin) left = viewportW - POPOVER_WIDTH - margin
      let top = r.bottom + 8
      let placement: 'below' | 'above' = 'below'
      if (top + estHeight > viewportH - margin) {
        // flip above if there's not enough room below.
        const aboveTop = r.top - estHeight - 8
        if (aboveTop >= margin) {
          top = aboveTop
          placement = 'above'
        } else {
          // clamp into the viewport as a last resort.
          top = Math.max(margin, viewportH - estHeight - margin)
        }
      }
      setPos({ top, left, placement })
    }
    compute()
    // re-run when the popover's own size changes (extension switch resizes the
    // suggestions list, which can push the bottom edge past the viewport).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null
    if (ro && ref.current) ro.observe(ref.current)
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [anchor])

  // outside click + escape to close. mousedown (not click) so we beat react
  // handlers that might re-open the popover on the same gesture.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (anchor.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  // focus management — pull focus into the popover so keyboard users can
  // tab through options immediately. only fires on mount, not on ext change
  // (changing extension shouldn't steal focus back from the chip strip).
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button[data-swap-option]')?.focus()
  }, [])

  const body = (
    <PopoverBody
      current={current}
      suggestions={suggestions}
      diatonic={diatonic}
      ext={ext}
      onExtChange={setExt}
      preferFlat={preferFlat}
      onSelect={onSelect}
    />
  )

  if (!pos) {
    // first render: measure invisibly so we know our height before placing.
    return createPortal(
      <div
        ref={ref}
        className="card p-3 fixed opacity-0 pointer-events-none"
        style={{ width: POPOVER_WIDTH, top: -9999, left: -9999, zIndex: 60 }}
        aria-hidden="true"
      >
        {body}
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Swap chord ${current.symbol}`}
      className="card p-3 fixed shadow-2xl shadow-black/40"
      style={{ width: POPOVER_WIDTH, top: pos.top, left: pos.left, zIndex: 60 }}
    >
      {body}
    </div>,
    document.body,
  )
}

function PopoverBody({
  current,
  suggestions,
  diatonic,
  ext,
  onExtChange,
  preferFlat,
  onSelect,
}: {
  current: Chord
  suggestions: SubstituteOption[]
  diatonic: Chord[]
  ext: Extension
  onExtChange: (next: Extension) => void
  preferFlat: boolean
  onSelect: (chord: Chord) => void
}) {
  const currentDegree = current.degree
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="section-tag">swap with</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
          now <span className="text-ink">{current.roman}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-dim">
          extension
        </div>
        <div className="flex flex-wrap gap-1">
          {EXTENSION_CHIPS.map((chip) => {
            const active = chip.id === ext
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onExtChange(chip.id)}
                className={`px-2 py-1 rounded border font-mono text-[10px] uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  active
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-bg-line bg-bg-soft text-ink-mute hover:text-ink hover:border-ink-mute'
                }`}
                aria-pressed={active}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-dim">
            suggestions
          </div>
          <div className="flex flex-col gap-1">
            {suggestions.map((opt, i) => (
              <button
                key={i}
                type="button"
                data-swap-option
                onClick={() => onSelect(opt.chord)}
                title={opt.rationale}
                className="group flex items-start gap-2 px-2 py-1.5 rounded border border-bg-line bg-bg-soft hover:border-accent/60 hover:bg-accent/[0.04] transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <span className="font-mono text-[13px] text-ink min-w-[3.5rem] pt-px">
                  {opt.chord.roman}
                </span>
                <span className="flex flex-col min-w-0 gap-0.5">
                  <span className="font-mono text-[11px] text-ink-mute truncate">
                    {opt.chord.symbol}
                  </span>
                  <span className="font-mono text-[9.5px] text-ink-dim/80 truncate">
                    {notesPreview(opt.chord, preferFlat)}
                  </span>
                </span>
                <span
                  className={`ml-auto font-mono text-[9.5px] uppercase tracking-widest shrink-0 pt-px ${
                    categoryClass(opt.category)
                  }`}
                >
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-dim">
          diatonic
        </div>
        <div className="grid grid-cols-7 gap-1">
          {diatonic.map((c, i) => {
            const isCurrent = currentDegree > 0 && c.degree === currentDegree
            return (
              <button
                key={i}
                type="button"
                data-swap-option={isCurrent ? undefined : true}
                disabled={isCurrent}
                onClick={() => !isCurrent && onSelect(c)}
                title={`${c.roman} · ${c.symbol} · ${notesPreview(c, preferFlat)}`}
                className={`flex flex-col items-center justify-center px-1 py-1.5 rounded border text-[10px] font-mono leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  isCurrent
                    ? 'border-accent/50 bg-accent/10 text-accent cursor-default'
                    : 'border-bg-line bg-bg-soft text-ink-mute hover:text-ink hover:border-ink-mute'
                }`}
              >
                <span className="text-[11px]">{c.roman}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="font-mono text-[9.5px] uppercase tracking-widest text-ink-dim/70">
        esc to close
      </div>
    </div>
  )
}

// flatten the chord's pitch classes to a tight note list. de-dupes so a 9th
// chord whose 9 wraps back to the root doesn't show "C·E·G·B♭·C".
function notesPreview(chord: Chord, preferFlat: boolean): string {
  const seen = new Set<number>()
  const ordered: PitchClass[] = []
  for (const pc of chord.pitchClasses) {
    const norm = ((pc % 12) + 12) % 12
    if (seen.has(norm)) continue
    seen.add(norm)
    ordered.push(norm as PitchClass)
  }
  return ordered.map((pc) => pcName(pc, preferFlat)).join('·')
}

function categoryClass(category: SubstituteOption['category']): string {
  // colour-code the category tag so the eye can scan options fast.
  switch (category) {
    case 'function':
      return 'text-ink-mute'
    case 'secondary':
      return 'text-accent'
    case 'tritone':
      return 'text-accent'
    case 'borrowed':
      return 'text-warn'
    case 'modal':
      return 'text-warn'
  }
}
