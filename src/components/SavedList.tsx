import type { SavedProgression } from '../lib/storage'
import { pcName } from '../lib/theory'

interface SavedListProps {
  items: SavedProgression[]
  activeId: string | null
  onLoad: (item: SavedProgression) => void
  onRemove: (id: string) => void
}

export function SavedList({ items, activeId, onLoad, onRemove }: SavedListProps) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-ink-mute border border-bg-line rounded-2xl p-5">
        nothing saved yet. hit <span className="kbd">save</span> on a tryad you like and it'll land
        here, stored locally on this device. nothing uploaded.
      </div>
    )
  }
  return (
    <div className="border border-bg-line rounded-2xl divide-y divide-bg-line max-h-[480px] overflow-y-auto">
      {items.map((it) => (
        <div
          key={it.id}
          className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
            ${activeId === it.id ? 'bg-bg-hover' : 'hover:bg-bg-hover/60'}`}
          onClick={() => onLoad(it)}
        >
          <div className="flex-1 min-w-0">
            <div className="font-display text-base lowercase truncate text-ink">{it.name}</div>
            <div className="font-mono text-[10.5px] uppercase tracking-widest text-ink-mute mt-0.5">
              {pcName(it.key).toLowerCase()} {it.scaleId} · {it.moodId} · {it.degrees.length}{' '}
              chords · {it.bpm}bpm
            </div>
          </div>
          <button
            type="button"
            className="h-7 w-7 rounded-full border border-bg-line text-ink-mute hover:text-bad hover:border-bad text-[14px] leading-none opacity-60 group-hover:opacity-100 transition-opacity"
            aria-label="Delete saved progression"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(it.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
