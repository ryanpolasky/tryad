// notes, scales, diatonic chords, progression generation.
// pitch-class based (0..11) until we hand off to MIDI/audio.

export type PitchClass = number // 0..11

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export const ALL_KEYS = NOTE_NAMES_SHARP

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const

export type ScaleId =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'harmonicMinor'
  | 'melodicMinor'

export interface Scale {
  id: ScaleId
  name: string
  intervals: number[] // 7 semitone offsets from root
  /** diatonic triad qualities */
  triadQualities: TriadQuality[]
}

export type TriadQuality = 'maj' | 'min' | 'dim' | 'aug'

export const SCALES: Record<ScaleId, Scale> = {
  major: {
    id: 'major',
    name: 'Major (Ionian)',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    triadQualities: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
  },
  minor: {
    id: 'minor',
    name: 'Natural Minor (Aeolian)',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    triadQualities: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
  },
  dorian: {
    id: 'dorian',
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    triadQualities: ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
  },
  phrygian: {
    id: 'phrygian',
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    triadQualities: ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
  },
  lydian: {
    id: 'lydian',
    name: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    triadQualities: ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
  },
  mixolydian: {
    id: 'mixolydian',
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    triadQualities: ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
  },
  locrian: {
    id: 'locrian',
    name: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    triadQualities: ['dim', 'maj', 'min', 'min', 'maj', 'maj', 'min'],
  },
  harmonicMinor: {
    id: 'harmonicMinor',
    name: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    triadQualities: ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim'],
  },
  melodicMinor: {
    id: 'melodicMinor',
    name: 'Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    triadQualities: ['min', 'min', 'aug', 'maj', 'maj', 'dim', 'dim'],
  },
}

export const SCALE_LIST: Scale[] = Object.values(SCALES)

export type Extension = 'triad' | 'seventh' | 'ninth' | 'sus2' | 'sus4' | 'add9'

export const EXTENSIONS: { id: Extension; label: string }[] = [
  { id: 'triad', label: 'Triad' },
  { id: 'seventh', label: '7th' },
  { id: 'ninth', label: '9th' },
  { id: 'sus2', label: 'sus2' },
  { id: 'sus4', label: 'sus4' },
  { id: 'add9', label: 'add9' },
]

export interface Chord {
  /** root pitch class */
  root: PitchClass
  quality: TriadQuality
  /** scale degree 1..7. 0 = non-diatonic (secondary dominant / borrowed). */
  degree: number
  /** e.g. "IV", "ii", "vii°", "V/vi", "♭VI" */
  roman: string
  /** e.g. "Cmaj7" */
  symbol: string
  pitchClasses: PitchClass[]
  /** semitone offsets from root */
  intervals: number[]
  extension: Extension
  /** diatonic degree it tonicizes, if a secondary dominant */
  secondaryOf?: number
  /** borrowed from parallel mode */
  borrowed?: boolean
}

export function pcName(pc: PitchClass, preferFlat = false): string {
  const norm = ((pc % 12) + 12) % 12
  return preferFlat ? NOTE_NAMES_FLAT[norm] : NOTE_NAMES_SHARP[norm]
}

function scalePrefersFlats(key: PitchClass, scale: Scale): boolean {
  // flat keys always flats; minor-feeling scales default to flats.
  const flatKeys = new Set([1, 3, 5, 8, 10]) // Db, Eb, F, Ab, Bb
  if (flatKeys.has(key)) return true
  const flatScales = new Set<ScaleId>([
    'minor',
    'phrygian',
    'dorian',
    'harmonicMinor',
    'melodicMinor',
  ])
  return flatScales.has(scale.id)
}

function triadIntervals(q: TriadQuality): number[] {
  switch (q) {
    case 'maj':
      return [0, 4, 7]
    case 'min':
      return [0, 3, 7]
    case 'dim':
      return [0, 3, 6]
    case 'aug':
      return [0, 4, 8]
  }
}

function applyExtension(
  triad: number[],
  q: TriadQuality,
  ext: Extension,
  scaleIntervalsFromChordRoot: number[],
): number[] {
  // diatonic 7th/9th relative to the chord's root.
  switch (ext) {
    case 'triad':
      return triad
    case 'seventh': {
      // diatonic 7th relative to chord root.
      const seventh = scaleIntervalsFromChordRoot[6] // 7th scale step relative to root
      return [...triad, seventh]
    }
    case 'ninth': {
      const seventh = scaleIntervalsFromChordRoot[6]
      const ninth = scaleIntervalsFromChordRoot[1] + 12
      return [...triad, seventh, ninth]
    }
    case 'sus2': {
      // chromatic M2 + P5. diatonic-2nd would give a phrygian-flavoured chord that
      // the sus2 label would lie about.
      return [0, 2, 7]
    }
    case 'sus4': {
      // chromatic P4 + P5. avoids tritone-flavoured sus on lydian iv.
      return [0, 5, 7]
    }
    case 'add9': {
      const ninth = scaleIntervalsFromChordRoot[1] + 12
      return [...triad, ninth]
    }
    default:
      void q
      return triad
  }
}

function safeExtensionForChord(
  requested: Extension,
  q: TriadQuality,
  scaleIntervalsFromChordRoot: number[],
): Extension {
  if (requested !== 'ninth') return requested
  const seventh = scaleIntervalsFromChordRoot[6]
  const ninth = scaleIntervalsFromChordRoot[1] + 12
  if (q === 'dim' || q === 'aug') return 'seventh'
  if (ninth !== 14) return 'seventh'
  if (q === 'min' && seventh !== 10) return 'add9'
  if (q === 'maj' && seventh !== 10 && seventh !== 11) return 'add9'
  return 'ninth'
}

function symbolFor(
  rootName: string,
  q: TriadQuality,
  ext: Extension,
  seventhSemis: number | null,
): string {
  // base quality marker
  const base = (() => {
    switch (q) {
      case 'maj':
        return ''
      case 'min':
        return 'm'
      case 'dim':
        return 'dim'
      case 'aug':
        return 'aug'
    }
  })()

  switch (ext) {
    case 'triad':
      return rootName + base
    case 'seventh': {
      // maj7 = 11, dom/min7 = 10, dim7 = 9.
      if (q === 'maj' && seventhSemis === 11) return `${rootName}maj7`
      if (q === 'min' && seventhSemis === 11) return `${rootName}m(maj7)`
      if (q === 'min') return `${rootName}m7`
      if (q === 'dim' && seventhSemis === 9) return `${rootName}°7`
      if (q === 'dim' && seventhSemis === 10) return `${rootName}m7♭5`
      if (q === 'aug' && seventhSemis === 11) return `${rootName}aug(maj7)`
      if (q === 'aug') return `${rootName}7♯5`
      return `${rootName}7`
    }
    case 'ninth':
      if (q === 'maj' && seventhSemis === 11) return `${rootName}maj9`
      if (q === 'min') return `${rootName}m9`
      if (q === 'dim') return `${rootName}m9♭5`
      if (q === 'aug') return `${rootName}9♯5`
      return `${rootName}9`
    case 'sus2':
      // sus has no third, so quality marker doesn't apply.
      return `${rootName}sus2`
    case 'sus4':
      return `${rootName}sus4`
    case 'add9':
      return rootName + base + 'add9'
  }
}

function romanFor(q: TriadQuality, degree: number, ext: Extension, seventhSemis: number | null): string {
  const upper = ROMAN[degree - 1]
  // sus has no third. drop case + quality marker, show plain numeral.
  if (ext === 'sus2') return `${upper}sus2`
  if (ext === 'sus4') return `${upper}sus4`

  const numeral = q === 'maj' || q === 'aug' ? upper : upper.toLowerCase()
  let suffix = ''
  // skip the dim/aug marker if the extension already encodes it (ø7 / °7).
  if (ext === 'seventh') {
    if (q === 'maj' && seventhSemis === 11) suffix = 'maj7'
    else if (q === 'min' && seventhSemis === 11) suffix = 'm(maj7)'
    else if (q === 'dim' && seventhSemis === 9) suffix = '°7'
    else if (q === 'dim' && seventhSemis === 10) suffix = 'ø7'
    else if (q === 'aug' && seventhSemis === 11) suffix = '+M7'
    else if (q === 'aug') suffix = '+7'
    else suffix = '7'
  } else if (ext === 'ninth') {
    if (q === 'dim') suffix = 'ø9'
    else if (q === 'aug') suffix = '+9'
    else suffix = '9'
  } else if (ext === 'add9') {
    if (q === 'dim') suffix = '°add9'
    else if (q === 'aug') suffix = '+add9'
    else suffix = 'add9'
  } else {
    // triad
    if (q === 'dim') suffix = '°'
    else if (q === 'aug') suffix = '+'
  }
  return numeral + suffix
}

// the seven diatonic chords for (key, scale) at the given extension.
export function diatonicChords(key: PitchClass, scale: Scale, extension: Extension): Chord[] {
  const preferFlat = scalePrefersFlats(key, scale)
  const chords: Chord[] = []
  for (let i = 0; i < 7; i++) {
    const degree = i + 1
    const rootOffset = scale.intervals[i]
    const root = ((key + rootOffset) % 12) as PitchClass
    const q = scale.triadQualities[i]
    const baseTriad = triadIntervals(q)

    // scale intervals rotated to start from this chord's root.
    const rotated: number[] = []
    for (let j = 0; j < 7; j++) {
      const idx = (i + j) % 7
      const wrap = i + j >= 7 ? 12 : 0
      rotated.push(scale.intervals[idx] - scale.intervals[i] + wrap)
    }

    const chordExtension = safeExtensionForChord(extension, q, rotated)
    const intervals = applyExtension(baseTriad, q, chordExtension, rotated)
    const seventhSemis =
      chordExtension === 'seventh' || chordExtension === 'ninth' ? rotated[6] : null

    const rootName = pcName(root, preferFlat)
    chords.push({
      root,
      quality: q,
      degree,
      roman: romanFor(q, degree, chordExtension, seventhSemis),
      symbol: symbolFor(rootName, q, chordExtension, seventhSemis),
      pitchClasses: intervals.map((s) => (((root + s) % 12) + 12) % 12),
      intervals,
      extension: chordExtension,
    })
  }
  return chords
}

// ---------- Progression generation ----------

export type MoodId =
  | 'pop'
  | 'sad'
  | 'happy'
  | 'epic'
  | 'jazz'
  | 'rnb'
  | 'dreamy'
  | 'lofi'
  | 'cinematic'
  | 'random'

export interface Mood {
  id: MoodId
  label: string
  /** allowed scales; first is the default suggestion */
  scales: ScaleId[]
  /** degree templates (1-based). one picked at random. */
  templates: number[][]
  defaultExtension?: Extension
  /** prob of swapping a chord for V/(next) */
  secondaryProb?: number
  /** prob of borrowing a non-tonic chord from the parallel mode */
  borrowedProb?: number
  /** prob of rewriting the tail to land a cadence */
  cadenceProb?: number
}

export const MOODS: Mood[] = [
  {
    id: 'pop',
    label: 'Pop',
    scales: ['major'],
    templates: [
      [1, 5, 6, 4],
      [6, 4, 1, 5],
      [1, 6, 4, 5],
      [4, 1, 5, 6],
      [1, 4, 6, 5],
      [1, 5, 4, 5],
      [1, 5, 6, 3, 4, 1, 4, 5],
      [1, 4, 5, 1, 6, 4, 1, 5],
      [2, 5, 1, 6],
      [6, 2, 5, 1],
      [1, 3, 6, 4],
    ],
    defaultExtension: 'triad',
    secondaryProb: 0.18,
    borrowedProb: 0.08,
    cadenceProb: 0.55,
  },
  {
    id: 'sad',
    label: 'Sad',
    scales: ['minor', 'dorian'],
    templates: [
      [1, 6, 3, 7],
      [1, 4, 6, 5],
      [1, 7, 6, 7],
      [6, 4, 1, 5],
      [1, 4, 5, 1],
      [1, 7, 4, 1],
      [1, 3, 7, 6],
      [6, 7, 1, 5],
      [1, 4, 7, 1, 6, 3, 4, 5],
      [1, 6, 4, 5, 1, 7, 6, 5],
    ],
    defaultExtension: 'triad',
    secondaryProb: 0.1,
    borrowedProb: 0.05,
    cadenceProb: 0.6,
  },
  {
    id: 'happy',
    label: 'Happy',
    scales: ['major', 'lydian'],
    templates: [
      [1, 4, 5, 1],
      [1, 5, 4, 1],
      [1, 4, 1, 5],
      [1, 2, 5, 1],
      [1, 6, 2, 5],
      [1, 5, 6, 4],
      [1, 4, 6, 5],
      [1, 4, 2, 5, 1, 6, 4, 5],
    ],
    secondaryProb: 0.22,
    borrowedProb: 0.06,
    cadenceProb: 0.7,
  },
  {
    id: 'epic',
    label: 'Epic',
    scales: ['minor', 'harmonicMinor', 'phrygian'],
    templates: [
      [1, 6, 7, 1],
      [1, 4, 6, 1],
      [1, 7, 6, 5],
      [6, 7, 1, 1],
      [1, 5, 6, 7],
      [1, 7, 1, 5],
      [1, 6, 3, 7, 1, 4, 5, 1],
      [1, 7, 6, 5, 4, 3, 2, 5],
    ],
    defaultExtension: 'triad',
    secondaryProb: 0.2,
    borrowedProb: 0.12,
    cadenceProb: 0.65,
  },
  {
    id: 'jazz',
    label: 'Jazz',
    scales: ['major', 'dorian', 'mixolydian'],
    templates: [
      [2, 5, 1, 6],
      [1, 6, 2, 5],
      [3, 6, 2, 5],
      [1, 4, 3, 6],
      [2, 5, 3, 6],
      [1, 6, 2, 5, 3, 6, 2, 5],
      [2, 5, 3, 6, 2, 5, 1, 6],
      [1, 2, 3, 6, 2, 5, 1, 6],
      [4, 3, 6, 2, 5, 1],
    ],
    defaultExtension: 'seventh',
    secondaryProb: 0.35,
    borrowedProb: 0.12,
    cadenceProb: 0.55,
  },
  {
    id: 'rnb',
    label: 'R&B',
    scales: ['minor', 'dorian'],
    templates: [
      [1, 4, 5, 1],
      [1, 6, 4, 5],
      [2, 5, 1, 1],
      [4, 3, 6, 5],
      [1, 7, 4, 5],
      [1, 3, 4, 1],
      [1, 4, 6, 3, 1, 4, 7, 5],
    ],
    defaultExtension: 'seventh',
    secondaryProb: 0.2,
    borrowedProb: 0.1,
    cadenceProb: 0.5,
  },
  {
    id: 'dreamy',
    label: 'Dreamy',
    scales: ['lydian', 'major'],
    templates: [
      [1, 2, 1, 2],
      [1, 4, 2, 5],
      [1, 6, 4, 2],
      [1, 5, 6, 4],
      [1, 4, 1, 2],
      [1, 3, 6, 4, 1, 2, 4, 5],
    ],
    defaultExtension: 'add9',
    secondaryProb: 0.08,
    borrowedProb: 0.12,
    cadenceProb: 0.35,
  },
  {
    id: 'lofi',
    label: 'Lofi',
    scales: ['minor', 'dorian'],
    templates: [
      [1, 4, 6, 5],
      [6, 4, 1, 5],
      [1, 3, 4, 6],
      [2, 5, 1, 4],
      [4, 6, 1, 5],
      [1, 4, 7, 3, 6, 2, 5, 1],
    ],
    defaultExtension: 'ninth',
    secondaryProb: 0.18,
    borrowedProb: 0.15,
    cadenceProb: 0.45,
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    scales: ['minor', 'harmonicMinor', 'phrygian', 'dorian'],
    templates: [
      [1, 6, 4, 5],
      [1, 3, 7, 6],
      [6, 4, 1, 5],
      [1, 7, 6, 5, 1, 4, 5, 1],
      [1, 4, 5, 6, 4, 5, 1, 1],
      [6, 4, 1, 5, 6, 4, 5, 1],
    ],
    defaultExtension: 'triad',
    secondaryProb: 0.28,
    borrowedProb: 0.2,
    cadenceProb: 0.6,
  },
  {
    id: 'random',
    label: 'Random',
    scales: ['major', 'minor', 'dorian', 'lydian', 'mixolydian', 'phrygian', 'harmonicMinor'],
    templates: [],
    secondaryProb: 0.15,
    borrowedProb: 0.1,
    cadenceProb: 0.4,
  },
]

const DEGREE_OPTIONS = [1, 2, 3, 4, 5, 6, 7]

const TRANSITION_WEIGHTS: Record<number, Record<number, number>> = {
  1: { 1: 1, 2: 3, 3: 2, 4: 5, 5: 5, 6: 4, 7: 2 },
  2: { 1: 1, 3: 1, 4: 2, 5: 6, 7: 1 },
  3: { 1: 1, 4: 3, 6: 4 },
  4: { 1: 4, 2: 2, 3: 1, 5: 5, 6: 2 },
  5: { 1: 6, 4: 1, 6: 4 },
  6: { 1: 1, 2: 4, 3: 1, 4: 4, 5: 3 },
  7: { 1: 5, 3: 1, 6: 1 },
}

function transitionWeight(from: number, to: number): number {
  return TRANSITION_WEIGHTS[from]?.[to] ?? 1
}

function pickFromWeightedPool(pool: { d: number; w: number }[], rng: () => number): number {
  const total = pool.reduce((a, b) => a + b.w, 0)
  let r = rng() * total
  for (const p of pool) {
    if ((r -= p.w) <= 0) return p.d
  }
  return pool[0]?.d ?? 1
}

function pickContextualDegree(
  prev: number | undefined,
  next: number | undefined,
  current: number | undefined,
  rng: () => number,
): number {
  let candidates = DEGREE_OPTIONS.filter((d) => d !== current)
  if (prev !== undefined && candidates.length > 1) {
    candidates = candidates.filter((d) => d !== prev)
  }
  if (next !== undefined && candidates.length > 1) {
    candidates = candidates.filter((d) => d !== next)
  }
  const pool = candidates.map((d) => {
    let w = 1
    if (prev !== undefined) {
      w *= transitionWeight(prev, d)
    } else if (d === 1) {
      w *= 4
    } else if (d === 4 || d === 6) {
      w *= 2
    }
    if (next !== undefined) {
      w *= transitionWeight(d, next)
    } else if (d === 1) {
      w *= 3
    } else if (d === 5) {
      w *= 2
    }
    if (d === 7) w *= 0.35
    return { d, w }
  })
  return pickFromWeightedPool(pool, rng)
}

function smoothDegreeRepeats(degrees: number[], rng: () => number): void {
  for (let i = 1; i < degrees.length; i++) {
    if (degrees[i] !== degrees[i - 1]) continue
    degrees[i] = pickContextualDegree(degrees[i - 1], degrees[i + 1], degrees[i], rng)
  }
}

function pickWeightedNext(
  prev: number,
  options: number[],
  rng: () => number,
  avoid: number[] = [],
): number {
  // function-style next-chord weights, common-practice tonality.
  const source = options.filter((d) => !avoid.includes(d))
  const poolOptions = source.length > 0 ? source : options
  const pool: { d: number; w: number }[] = []
  for (const d of poolOptions) {
    pool.push({ d, w: transitionWeight(prev, d) })
  }
  return pickFromWeightedPool(pool, rng)
}

// degree sequence for a mood + length. returns the template idx too so
// repeat-generate can avoid picking the same template twice in a row.
// random mood uses the markov table and returns -1.
export function generateDegreesWithMeta(
  mood: Mood,
  length: number,
  rng: () => number = Math.random,
  avoidTemplateIdx?: number,
): { degrees: number[]; templateIdx: number } {
  if (mood.id === 'random' || mood.templates.length === 0) {
    const out: number[] = []
    out.push(rng() < 0.55 ? 1 : DEGREE_OPTIONS[Math.floor(rng() * DEGREE_OPTIONS.length)])
    for (let i = 1; i < length; i++) {
      const prev = out[i - 1]
      out.push(pickWeightedNext(prev, DEGREE_OPTIONS, rng, [prev]))
    }
    smoothDegreeRepeats(out, rng)
    return { degrees: out, templateIdx: -1 }
  }
  // pick a template, then truncate/extend to fit length.
  const pool = mood.templates
  let idx = Math.floor(rng() * pool.length)
  if (
    pool.length > 1 &&
    avoidTemplateIdx !== undefined &&
    avoidTemplateIdx >= 0 &&
    avoidTemplateIdx < pool.length &&
    idx === avoidTemplateIdx
  ) {
    // bump to a different one.
    idx = (idx + 1 + Math.floor(rng() * (pool.length - 1))) % pool.length
    if (idx === avoidTemplateIdx) idx = (idx + 1) % pool.length
  }
  const tpl = pool[idx]
  const out = tpl.slice(0, Math.min(length, tpl.length))
  while (out.length < length) {
    const prev = out[out.length - 1]
    out.push(pickWeightedNext(prev, DEGREE_OPTIONS, rng, [prev]))
  }
  // some spice.
  const subProb = 0.1
  const tailLockStart = out.length >= 4 ? out.length - 2 : out.length
  for (let i = 1; i < tailLockStart; i++) {
    if (rng() < subProb) {
      out[i] = pickContextualDegree(out[i - 1], out[i + 1], out[i], rng)
    }
  }
  smoothDegreeRepeats(out, rng)
  return { degrees: out, templateIdx: idx }
}

export function generateDegrees(mood: Mood, length: number, rng: () => number = Math.random): number[] {
  return generateDegreesWithMeta(mood, length, rng).degrees
}

export interface Progression {
  key: PitchClass
  scaleId: ScaleId
  moodId: MoodId
  extension: Extension
  chords: Chord[]
  /** template idx used (>=0), or -1 if the mood walked the markov table */
  templateIdx?: number
}

export function nonDiatonicExtension(extension: Extension): Extension {
  return extension === 'ninth' ? 'seventh' : extension
}

// ---------- Non-diatonic chord builders ----------

// V/X: root a P5 above X, always major, minor 7th if extension is 7th/9th.
export function makeSecondaryDominant(
  key: PitchClass,
  scale: Scale,
  target: Chord,
  extension: Extension,
): Chord {
  const root = (((target.root + 7) % 12) + 12) % 12
  const intervals: number[] = (() => {
    switch (extension) {
      case 'triad':
        return [0, 4, 7]
      case 'seventh':
        return [0, 4, 7, 10]
      case 'ninth':
        return [0, 4, 7, 10, 14]
      case 'sus4':
        return [0, 5, 7]
      case 'sus2':
        return [0, 2, 7]
      case 'add9':
        return [0, 4, 7, 14]
    }
  })()
  const preferFlat = scalePrefersFlats(key, scale)
  const rootName = pcName(root, preferFlat)
  const targetRomanRaw = ROMAN[target.degree - 1] ?? '?'
  const targetRoman =
    target.quality === 'maj' || target.quality === 'aug'
      ? targetRomanRaw
      : targetRomanRaw.toLowerCase()
  const symbol =
    extension === 'triad'
      ? rootName
      : extension === 'seventh'
        ? `${rootName}7`
        : extension === 'ninth'
          ? `${rootName}9`
          : extension === 'sus2'
            ? `${rootName}sus2`
            : extension === 'sus4'
              ? `${rootName}sus4`
              : `${rootName}add9`
  const roman =
    extension === 'triad'
      ? `V/${targetRoman}`
      : extension === 'seventh'
        ? `V7/${targetRoman}`
        : extension === 'ninth'
          ? `V9/${targetRoman}`
          : extension === 'sus2'
            ? `Vsus2/${targetRoman}`
            : extension === 'sus4'
              ? `Vsus4/${targetRoman}`
              : `Vadd9/${targetRoman}`
  return {
    root: root as PitchClass,
    quality: 'maj',
    degree: 0,
    roman,
    symbol,
    pitchClasses: intervals.map((s) => ((((root + s) % 12) + 12) % 12) as PitchClass),
    intervals,
    extension,
    secondaryOf: target.degree,
  }
}

export interface BorrowedDef {
  /** semitones above tonic */
  rootOffset: number
  quality: TriadQuality
  /** roman label, e.g. "♭VI", "iv" */
  label: string
}

// borrowed chords from parallel minor (when source scale is major-ish).
export const BORROWED_FROM_MINOR: BorrowedDef[] = [
  { rootOffset: 5, quality: 'min', label: 'iv' },
  { rootOffset: 3, quality: 'maj', label: '♭III' },
  { rootOffset: 8, quality: 'maj', label: '♭VI' },
  { rootOffset: 10, quality: 'maj', label: '♭VII' },
]

// borrowed chords from parallel major (when source scale is minor-ish).
export const BORROWED_FROM_MAJOR: BorrowedDef[] = [
  { rootOffset: 7, quality: 'maj', label: 'V' },
  { rootOffset: 5, quality: 'maj', label: 'IV' },
  { rootOffset: 9, quality: 'min', label: 'vi' },
]

const MAJORISH_SCALES = new Set<ScaleId>(['major', 'lydian', 'mixolydian'])

export function borrowedPoolFor(scaleId: ScaleId): BorrowedDef[] {
  return MAJORISH_SCALES.has(scaleId) ? BORROWED_FROM_MINOR : BORROWED_FROM_MAJOR
}

export function makeBorrowedChord(
  key: PitchClass,
  scale: Scale,
  def: BorrowedDef,
  extension: Extension,
): Chord {
  const root = (((key + def.rootOffset) % 12) + 12) % 12
  const triad = triadIntervals(def.quality)
  // keep the extension shape but spell it from the borrowed chord's own quality,
  // not the source scale's diatonic intervals.
  let intervals: number[] = triad
  let seventhSemis: number | null = null
  switch (extension) {
    case 'triad':
      intervals = triad
      break
    case 'seventh':
      // dom7 (10) feels more natural for borrowed than maj7 (11).
      seventhSemis = 10
      intervals = [...triad, 10]
      break
    case 'ninth':
      seventhSemis = 10
      intervals = [...triad, 10, 14]
      break
    case 'sus2':
      intervals = [0, 2, 7]
      break
    case 'sus4':
      intervals = [0, 5, 7]
      break
    case 'add9':
      intervals = [...triad, 14]
      break
  }
  // ♭VI / ♭VII should always spell with flats, regardless of source scale.
  const labelUsesFlat = def.label.startsWith('♭')
  const preferFlat = labelUsesFlat || scalePrefersFlats(key, scale)
  const rootName = pcName(root, preferFlat)
  const symbol = symbolFor(rootName, def.quality, extension, seventhSemis)
  // append the extension suffix onto the borrowed roman.
  let romanSuffix = ''
  if (extension === 'seventh') romanSuffix = '7'
  else if (extension === 'ninth') romanSuffix = '9'
  else if (extension === 'sus2') romanSuffix = 'sus2'
  else if (extension === 'sus4') romanSuffix = 'sus4'
  else if (extension === 'add9') romanSuffix = 'add9'
  return {
    root: root as PitchClass,
    quality: def.quality,
    degree: 0,
    roman: def.label + romanSuffix,
    symbol,
    pitchClasses: intervals.map((s) => ((((root + s) % 12) + 12) % 12) as PitchClass),
    intervals,
    extension,
    borrowed: true,
  }
}

// ---------- Cadence patterns ----------

// land a cadence on the tail. authentic / plagal / deceptive.
function applyCadence(degrees: number[], rng: () => number): void {
  if (degrees.length < 2) return
  const r = rng()
  const prev = degrees[degrees.length - 3]
  const choices =
    prev === 5
      ? [
          [4, 1],
          [2, 5],
          [5, 6],
        ]
      : [
          [5, 1],
          [4, 1],
          [5, 6],
        ]
  const idx = r < 0.6 ? 0 : r < 0.85 ? 1 : 2
  const [penultimate, final] = choices[idx]
  degrees[degrees.length - 2] = penultimate
  degrees[degrees.length - 1] = final
}

export function generateProgression(opts: {
  key: PitchClass
  scaleId?: ScaleId
  moodId: MoodId
  length: number
  extension?: Extension
  rng?: () => number
  /** skip this template when picking, so repeat-generate doesn't feel stale */
  avoidTemplateIdx?: number
}): Progression {
  const rng = opts.rng ?? Math.random
  const mood = MOODS.find((m) => m.id === opts.moodId) ?? MOODS[0]
  const scaleId =
    opts.scaleId ?? mood.scales[Math.floor(rng() * mood.scales.length)]
  const scale = SCALES[scaleId]
  const extension = opts.extension ?? mood.defaultExtension ?? 'triad'
  const diatonic = diatonicChords(opts.key, scale, extension)

  const meta = generateDegreesWithMeta(mood, opts.length, rng, opts.avoidTemplateIdx)
  const degrees = meta.degrees

  // cadence pass on the tail
  if (degrees.length >= 2 && rng() < (mood.cadenceProb ?? 0.5)) {
    applyCadence(degrees, rng)
    smoothDegreeRepeats(degrees, rng)
  }

  // materialize
  const chords: Chord[] = degrees.map((d) => diatonic[d - 1])

  // modal interchange: swap a non-tonic chord for a borrowed one.
  const borrowedPool = borrowedPoolFor(scale.id)
  const borrowedProb = (mood.borrowedProb ?? 0) * (extension === 'ninth' ? 0.55 : 1)
  const appliedExtension = nonDiatonicExtension(extension)
  if (borrowedProb > 0 && borrowedPool.length > 0) {
    for (let i = 0; i < chords.length; i++) {
      // leave tonic alone, don't touch the last chord (cadence integrity).
      if (chords[i].degree === 1) continue
      if (i === chords.length - 1) continue
      if (rng() < borrowedProb) {
        const def = borrowedPool[Math.floor(rng() * borrowedPool.length)]
        chords[i] = makeBorrowedChord(opts.key, scale, def, appliedExtension)
      }
    }
  }

  // secondary dominants: replace i with V/(i+1).
  // skip if target is tonic / dim / already non-diatonic.
  const secondaryProb = (mood.secondaryProb ?? 0) * (extension === 'ninth' ? 0.55 : 1)
  if (secondaryProb > 0) {
    for (let i = 0; i < chords.length - 1; i++) {
      const target = chords[i + 1]
      const current = chords[i]
      if (current.degree === 0) continue // already non-diatonic
      if (target.degree === 0) continue // can't cleanly tonicize a non-diatonic target
      if (target.degree === 1) continue // V/I is just V, boring
      if (target.quality === 'dim') continue
      if (rng() < secondaryProb) {
        chords[i] = makeSecondaryDominant(opts.key, scale, target, appliedExtension)
      }
    }
  }

  return { key: opts.key, scaleId, moodId: mood.id, extension, chords, templateIdx: meta.templateIdx }
}

export function regenerateChordInProgression(opts: {
  key: PitchClass
  scaleId: ScaleId
  moodId: MoodId
  extension: Extension
  chords: Chord[]
  index: number
  rng?: () => number
}): Chord {
  const rng = opts.rng ?? Math.random
  const mood = MOODS.find((m) => m.id === opts.moodId) ?? MOODS[0]
  const scale = SCALES[opts.scaleId]
  const diatonic = diatonicChords(opts.key, scale, opts.extension)
  const index = Math.max(0, Math.min(opts.index, Math.max(0, opts.chords.length - 1)))
  const current = opts.chords[index]
  const prevDegree = opts.chords[index - 1]?.degree
  const nextDegree = opts.chords[index + 1]?.degree
  const prev = prevDegree && prevDegree > 0 ? prevDegree : undefined
  const next = nextDegree && nextDegree > 0 ? nextDegree : undefined
  const currentDegree = current?.degree && current.degree > 0 ? current.degree : undefined
  const wantsCadence =
    index === opts.chords.length - 1 &&
    currentDegree !== 1 &&
    prev !== 1 &&
    (mood.cadenceProb ?? 0) >= 0.5 &&
    rng() < 0.6
  const degree = wantsCadence ? 1 : pickContextualDegree(prev, next, currentDegree, rng)
  return diatonic[degree - 1] ?? diatonic[0]
}

// ---------- Voicing & MIDI ----------

export interface VoiceContext {
  prevTopMidi?: number
  prevBassMidi?: number
  /** force this inversion, skip auto-VL. 0 = root, 1 = first, etc. */
  forcedInversion?: number
}

// rotate a chord's note list by `inv`, lifting each rotated note an octave.
function rotateInversion(notes: number[], inv: number): number[] {
  const out = [...notes]
  const n = ((inv % out.length) + out.length) % out.length
  for (let i = 0; i < n; i++) {
    const x = out.shift()!
    out.push(x + 12)
  }
  return out
}

// pick the best inversion for `chord` given voice-leading context.
// forcedInversion wins (including 0). no prev chord => root position.
// scoring: minimize top-note jump, penalize parallel 5ths/8ves, then minimize bass leap.
export function pickInversion(
  chord: Chord,
  octave = 4,
  prevOrCtx?: number | VoiceContext,
): number {
  const ctx: VoiceContext =
    typeof prevOrCtx === 'number' ? { prevTopMidi: prevOrCtx } : (prevOrCtx ?? {})

  if (ctx.forcedInversion !== undefined) {
    return ((ctx.forcedInversion % chord.intervals.length) + chord.intervals.length) %
      chord.intervals.length
  }

  if (ctx.prevTopMidi === undefined) return 0

  const rootMidi = chord.root + 12 * (octave + 1)
  const baseNotes = chord.intervals.map((s) => rootMidi + s)

  let bestInv = 0
  let bestCost = Infinity
  for (let inv = 0; inv < chord.intervals.length; inv++) {
    const rotated = rotateInversion(baseNotes, inv)
    const top = rotated[rotated.length - 1]
    const bass = rotated[0]

    let cost = Math.abs(top - ctx.prevTopMidi)

    if (ctx.prevBassMidi !== undefined) {
      const prevOuter = ctx.prevTopMidi - ctx.prevBassMidi
      const newOuter = top - bass
      const prevOuterMod = ((prevOuter % 12) + 12) % 12
      const newOuterMod = ((newOuter % 12) + 12) % 12
      const topMoved = top !== ctx.prevTopMidi
      const bassMoved = bass !== ctx.prevBassMidi
      if (topMoved && bassMoved && prevOuterMod === newOuterMod) {
        if (prevOuterMod === 7) cost += 5 // parallel 5th
        if (prevOuterMod === 0) cost += 5 // parallel octave / unison
      }
      cost += 0.4 * Math.abs(bass - ctx.prevBassMidi)
    }

    if (cost < bestCost) {
      bestCost = cost
      bestInv = inv
    }
  }
  return bestInv
}

// chord -> midi notes around `octave`. forcedInversion wins, else auto-VL picks.
export function voiceChord(
  chord: Chord,
  octave = 4,
  prevOrCtx?: number | VoiceContext,
): number[] {
  const ctx: VoiceContext =
    typeof prevOrCtx === 'number' ? { prevTopMidi: prevOrCtx } : (prevOrCtx ?? {})
  const rootMidi = chord.root + 12 * (octave + 1) // 60 = C4
  const baseNotes = chord.intervals.map((s) => rootMidi + s)
  const inv = pickInversion(chord, octave, ctx)
  return rotateInversion(baseNotes, inv)
}

// bass pitch class for a given inversion (0 = root, 1 = third, ...).
export function bassPitchClass(chord: Chord, inversion: number): PitchClass {
  const n = chord.intervals.length
  const idx = ((inversion % n) + n) % n
  const semis = chord.intervals[idx]
  return ((((chord.root + semis) % 12) + 12) % 12) as PitchClass
}

export function midiToNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES_SHARP[pc]}${octave}`
}
