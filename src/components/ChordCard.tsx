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
  onMoveLeft?: () => void
  onMoveRight?: () => void
  onRegenerate?: () => void
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
  onMoveLeft,
  onMoveRight,
  onRegenerate,
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
      className={`group relative card ${cardPadding} flex flex-col ${cardGap} cursor-pointer min-w-0
        transition-colors duration-200
        ${active || selected ? 'border-accent/70 bg-accent/[0.04]' : 'hover:border-ink-mute/40 hover:bg-bg-hover'}
        ${playing ? 'ring-1 ring-accent/70' : ''}
      `}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${chord.symbol}${inverted && bassName ? `/${bassName}` : ''}, ${chord.roman}, chord ${index + 1}`}
      onKeyDown={(e) => {
        // enter / space → preview chord (opens drawer)
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
          return
        }
        // keyboard equivalents for the hover row. shift+arrow moves, del/backspace
        // removes, i cycles inversion, r regenerates.
        if (e.key === 'ArrowLeft' && e.shiftKey && onMoveLeft) {
          e.preventDefault()
          onMoveLeft()
        } else if (e.key === 'ArrowRight' && e.shiftKey && onMoveRight) {
          e.preventDefault()
          onMoveRight()
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && onRemove) {
          e.preventDefault()
          onRemove()
        } else if ((e.key === 'i' || e.key === 'I') && onCycleInversion) {
          e.preventDefault()
          onCycleInversion()
        } else if ((e.key === 'r' || e.key === 'R') && onRegenerate) {
          e.preventDefault()
          onRegenerate()
        }
      }}
    >
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

      {(onRemove || onMoveLeft || onMoveRight || onRegenerate) && (
        <div
          // centered above so the controls don't overflow into neighbours' headers.
          className={`absolute -top-3 right-0 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ${
            density === 'tight' ? 'left-0 justify-center' : 'inset-x-3 justify-end'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {onRegenerate ? (
            <button
              type="button"
              aria-label="Regenerate chord"
              onClick={onRegenerate}
              className="h-5 w-5 rounded-full border border-bg-line bg-bg-soft text-ink-mute hover:text-accent hover:border-accent/60 text-[11px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              ↻
            </button>
          ) : null}
          {onMoveLeft ? (
            <button
              type="button"
              aria-label="Move chord left"
              onClick={onMoveLeft}
              className="h-5 w-5 rounded-full border border-bg-line bg-bg-soft text-ink-mute hover:text-ink hover:border-ink-mute text-[11px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              ‹
            </button>
          ) : null}
          {onMoveRight ? (
            <button
              type="button"
              aria-label="Move chord right"
              onClick={onMoveRight}
              className="h-5 w-5 rounded-full border border-bg-line bg-bg-soft text-ink-mute hover:text-ink hover:border-ink-mute text-[11px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              ›
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
