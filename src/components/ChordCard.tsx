import type { Chord } from '../lib/theory'
import { bassPitchClass, pcName } from '../lib/theory'

export type ChordCardDensity = 'full' | 'compact' | 'tight'

interface ChordCardProps {
  chord: Chord
  index: number
  active: boolean
  playing: boolean
  selected?: boolean
  preferFlat?: boolean
  onClick: () => void
  onRemove?: () => void
  onMove?: (dir: -1 | 1) => void
  onRegenerate?: () => void
  locked?: boolean
  onToggleLock?: () => void
  onOpenSwap?: (anchor: HTMLElement) => void
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDragEnd?: () => void
  onDrop?: () => void
  beats?: number
  showBeats?: boolean
  density?: ChordCardDensity
  inversion?: number
  onCycleInversion?: () => void
}

export function ChordCard({
  chord,
  index,
  active,
  playing,
  selected,
  preferFlat,
  onClick,
  onRemove,
  onMove,
  onRegenerate,
  locked,
  onToggleLock,
  onOpenSwap,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  beats,
  showBeats,
  density = 'full',
  inversion = 0,
  onCycleInversion,
}: ChordCardProps) {
  const inverted = inversion > 0
  const bassName = inverted ? pcName(bassPitchClass(chord, inversion), preferFlat) : null
  const invLabel =
    inversion === 1 ? '1st' : inversion === 2 ? '2nd' : inversion === 3 ? '3rd' : `${inversion}th`
  // sus has no third, so quality colouring doesn't apply. render neutral.
  const noThird = chord.extension === 'sus2' || chord.extension === 'sus4'
  const qualityClass =
    noThird
      ? 'text-ink'
      : chord.quality === 'maj'
        ? 'text-ink'
        : chord.quality === 'min'
          ? 'text-accent'
          : chord.quality === 'dim'
            ? 'text-warn'
            : 'text-ink'

  const cardPadding =
    density === 'tight'
      ? 'px-2 py-1.5'
      : density === 'compact'
        ? 'px-3 py-2'
        : 'px-3 py-2.5'
  const cardGap =
    density === 'tight' ? 'gap-0.5' : 'gap-1'
  const symbolSize =
    density === 'tight'
      ? 'text-lg'
      : density === 'compact'
        ? 'text-xl sm:text-2xl'
        : 'text-2xl sm:text-3xl'
  const romanSize = density === 'tight' ? 'text-[9px]' : 'text-[10px]'
  const beatsText =
    density === 'tight'
      ? beats === 1
        ? '×1'
        : `×${beats}`
      : beats === 1
        ? '1 beat'
        : `${beats} beats`

  return (
    <div
      data-chord-idx={index}
      draggable={Boolean(onDragStart)}
      onDragStart={(e) => {
        if (!onDragStart) return
        e.dataTransfer.effectAllowed = 'move'
        // firefox needs *something* in dataTransfer to start a drag.
        e.dataTransfer.setData('text/plain', String(index))
        onDragStart()
      }}
      onDragOver={(e) => {
        if (!onDragOver) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOver()
      }}
      onDrop={(e) => {
        if (!onDrop) return
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`group relative card ${cardPadding} flex flex-col ${cardGap} cursor-grab active:cursor-grabbing min-w-0
        transition-[border-color,background-color,transform,opacity] duration-150
        ${active || selected ? 'border-accent/70 bg-accent/[0.04]' : 'hover:border-ink-mute/40 hover:bg-bg-hover'}
        ${playing ? 'ring-1 ring-accent/70' : ''}
        ${locked ? 'border-accent/40' : ''}
        ${isDragging ? 'opacity-40' : ''}
        ${isDragOver && !isDragging ? 'border-accent ring-1 ring-accent/50 -translate-y-0.5' : ''}
      `}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${chord.symbol}${inverted && bassName ? `/${bassName}` : ''}, ${chord.roman}, chord ${index + 1}${locked ? ', locked' : ''}`}
      onKeyDown={(e) => {
        // enter / space → preview chord (opens drawer)
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
          return
        }
        // keyboard equivalents for the hover row. shift+arrow moves (a11y fallback
        // for drag), del/backspace removes, i cycles inversion, r regenerates,
        // l toggles lock.
        if (e.key === 'ArrowLeft' && e.shiftKey && onMove) {
          e.preventDefault()
          onMove(-1)
        } else if (e.key === 'ArrowRight' && e.shiftKey && onMove) {
          e.preventDefault()
          onMove(1)
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove) {
          e.preventDefault()
          onRemove()
        } else if ((e.key === 'i' || e.key === 'I') && onCycleInversion) {
          e.preventDefault()
          onCycleInversion()
        } else if ((e.key === 'r' || e.key === 'R') && onRegenerate && !locked) {
          e.preventDefault()
          onRegenerate()
        } else if ((e.key === 'l' || e.key === 'L') && onToggleLock) {
          e.preventDefault()
          onToggleLock()
        } else if ((e.key === 's' || e.key === 'S') && onOpenSwap) {
          e.preventDefault()
          // anchor the popover to the card itself when triggered by keyboard.
          if (e.currentTarget instanceof HTMLElement) onOpenSwap(e.currentTarget)
        }
      }}
    >
      {locked ? (
        <span
          className="pointer-events-none absolute -top-1.5 -left-1.5 z-10 h-4 w-4 rounded-full border border-accent/60 bg-bg-card text-accent flex items-center justify-center"
          aria-hidden="true"
          title="locked"
        >
          <LockIcon />
        </span>
      ) : null}
      <div className="flex items-center justify-between gap-1 min-w-0">
        <span
          className={`font-mono ${romanSize} tracking-widest ${qualityClass} truncate min-w-0`}
        >
          {chord.roman}
        </span>
        {density !== 'tight' && (
          <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-dim shrink-0">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </div>

      <div className={`font-display font-medium leading-none ${symbolSize} tracking-tight text-ink truncate`}>
        <span className={!noThird && chord.quality === 'min' ? 'italic' : ''}>{chord.symbol}</span>
        {inverted && bassName ? (
          <span className="text-ink-mute">
            <span className="mx-0.5">/</span>
            {bassName}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 min-w-0">
        {showBeats && beats !== undefined ? (
          <div
            className={`font-mono uppercase tracking-widest text-accent/70 truncate ${
              density === 'tight' ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            {beatsText}
          </div>
        ) : (
          <span />
        )}
        {onCycleInversion ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCycleInversion()
            }}
            title={
              inverted
                ? `${invLabel} inversion (click to cycle)`
                : 'auto voice-leading (click to force an inversion)'
            }
            aria-label={
              inverted
                ? `${invLabel} inversion, click to cycle`
                : 'auto voice-leading, click to force an inversion'
            }
            className={`shrink-0 font-mono uppercase tracking-widest rounded-full border px-1.5 py-[1px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
              density === 'tight' ? 'text-[8.5px]' : 'text-[9.5px]'
            } ${
              inverted
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-bg-line text-ink-dim hover:text-ink hover:border-ink-mute'
            }`}
          >
            {inverted ? invLabel : 'auto'}
          </button>
        ) : null}
      </div>

      {(onRemove || onRegenerate || onToggleLock || onOpenSwap) && (
        <div
          // centered above so the controls don't overflow into neighbours' headers.
          className={`absolute -top-3 right-0 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
            density === 'tight' ? 'left-0 justify-center' : 'inset-x-3 justify-end'
          }`}
          onClick={(e) => e.stopPropagation()}
          // suppress drag from the action row so clicking buttons doesn't start a card drag.
          onPointerDown={(e) => e.stopPropagation()}
          draggable={false}
          onDragStart={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {onOpenSwap ? (
            <button
              type="button"
              aria-label="Swap chord"
              title="swap chord"
              onClick={(e) => onOpenSwap(e.currentTarget)}
              className="h-5 w-5 rounded-full border border-bg-line bg-bg-soft text-ink-mute hover:text-accent hover:border-accent/60 text-[11px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 flex items-center justify-center"
            >
              <SwapIcon />
            </button>
          ) : null}
          {onToggleLock ? (
            <button
              type="button"
              aria-label={locked ? 'Unlock chord' : 'Lock chord'}
              title={locked ? 'unlock' : 'lock'}
              onClick={onToggleLock}
              className={`h-5 w-5 rounded-full border text-[11px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 flex items-center justify-center ${
                locked
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-bg-line bg-bg-soft text-ink-mute hover:text-ink hover:border-ink-mute'
              }`}
            >
              <LockIcon />
            </button>
          ) : null}
          {onRegenerate && !locked ? (
            <button
              type="button"
              aria-label="Regenerate chord"
              onClick={onRegenerate}
              className="h-5 w-5 rounded-full border border-bg-line bg-bg-soft text-ink-mute hover:text-accent hover:border-accent/60 text-[11px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              ↻
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              aria-label="Remove chord"
              onClick={onRemove}
              className="h-5 w-5 rounded-full border border-bg-line bg-bg-soft text-bad hover:border-bad text-[11px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              ×
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="5.5" width="7" height="4.5" rx="0.8" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" strokeLinecap="round" />
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h7l-2-2M10 8H3l2 2" />
    </svg>
  )
}
