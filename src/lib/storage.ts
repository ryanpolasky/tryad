import type { Chord, Extension, MoodId, PitchClass, ScaleId } from './theory'

const KEY = 'tryad:saved:v1'
// legacy `ryff` key. one-time migration so early users don't lose their saves.
const LEGACY_KEY = 'ryff:saved:v1'

function migrateLegacy() {
  if (typeof localStorage === 'undefined') return
  try {
    if (localStorage.getItem(KEY)) return
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (!legacy) return
    localStorage.setItem(KEY, legacy)
    // leave the old key in place so cached service workers / older builds keep working.
  } catch {
    // no localStorage. shrug.
  }
}

migrateLegacy()

export interface SavedProgression {
  id: string
  name: string
  createdAt: number
  key: PitchClass
  scaleId: ScaleId
  moodId: MoodId
  extension: Extension
  /** diatonic degrees 1..7; 0 for non-diatonic. use `chords` to reconstruct exactly. */
  degrees: number[]
  /** full chord objects including secondary dominants / borrowed. preferred on load. */
  chords?: Chord[]
  /** per-chord beat counts; falls back to beatsPerChord */
  chordBeats?: number[]
  /** per-chord inversion (0 = auto/root, 1 = first, ...) */
  inversions?: number[]
  /** per-chord lock; true = preserved across generate. defaults to all false. */
  locked?: boolean[]
  bpm: number
  beatsPerChord: number
  instrument: string
}

function read(): SavedProgression[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr as SavedProgression[]
  } catch {
    return []
  }
}

function write(items: SavedProgression[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(items))
}

export const storage = {
  list(): SavedProgression[] {
    return read().sort((a, b) => b.createdAt - a.createdAt)
  },
  save(item: Omit<SavedProgression, 'id' | 'createdAt'>): SavedProgression {
    const all = read()
    const full: SavedProgression = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    all.unshift(full)
    write(all.slice(0, 200))
    return full
  },
  remove(id: string) {
    write(read().filter((x) => x.id !== id))
  },
  clear() {
    write([])
  },
}
