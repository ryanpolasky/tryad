import {
  BORROWED_FROM_MINOR,
  borrowedPoolFor,
  diatonicChords,
  makeBorrowedChord,
  makeSecondaryDominant,
  nonDiatonicExtension,
  pcName,
  type Chord,
  type Extension,
  type PitchClass,
  type Scale,
} from './theory'

export type SubstituteCategory = 'function' | 'tritone' | 'secondary' | 'borrowed' | 'modal'

export interface SubstituteOption {
  chord: Chord
  /** short tag rendered on the chip, e.g. "tritone sub" */
  label: string
  /** longer hint for tooltip / aria. */
  rationale?: string
  category: SubstituteCategory
}

// ---------- tritone substitution ----------
// classic jazz move: replace a dominant 7th with the dom7 a tritone away.
// the two chords share the same B/F (or enharmonic) tritone, so they resolve
// to the same target. labelled "♭II7" because that's the tritone of V.
export function makeTritoneSub(chord: Chord, key: PitchClass, scale: Scale, extension: Extension): Chord {
  const root = ((((chord.root as number) + 6) % 12) + 12) % 12
  const ext = nonDiatonicExtension(extension)
  // tritone subs are almost always dom7; if the source is a triad we still spell
  // a dom7 below to keep the move musically honest (and the suggestion useful).
  const useSeventh = ext === 'seventh' || ext === 'ninth' || ext === 'triad'
  const intervals = useSeventh ? [0, 4, 7, 10] : [0, 4, 7]
  const realExt: Extension = useSeventh ? 'seventh' : 'triad'
  // tritone subs sit a half-step above their target, so flat spellings read most cleanly.
  const rootName = pcName(root as PitchClass, true)
  const symbol = realExt === 'seventh' ? `${rootName}7` : rootName
  // ♭II7 is the canonical roman, regardless of source roman.
  const roman = realExt === 'seventh' ? '♭II7' : '♭II'
  void key
  void scale
  return {
    root: root as PitchClass,
    quality: 'maj',
    degree: 0,
    roman,
    symbol,
    pitchClasses: intervals.map((s) => ((((root + s) % 12) + 12) % 12) as PitchClass),
    intervals,
    extension: realExt,
    secondaryOf: chord.degree || undefined,
  }
}

// stable signature so de-dupe works across categories regardless of object identity.
function chordSig(c: Chord): string {
  const pitches = c.intervals.map((i) => ((((c.root as number) + i) % 12) + 12) % 12)
  return `${c.root}|${pitches.sort((a, b) => a - b).join(',')}`
}

// ---------- smart suggestions ----------
export function suggestSubstitutes(opts: {
  chord: Chord
  index: number
  progression: Chord[]
  key: PitchClass
  scale: Scale
  extension: Extension
}): SubstituteOption[] {
  const { chord, index, progression, key, scale, extension } = opts
  const ext = nonDiatonicExtension(extension)
  const diatonic = diatonicChords(key, scale, extension)
  const currentSig = chordSig(chord)
  const seen = new Set<string>([currentSig])
  const out: SubstituteOption[] = []
  const push = (next: Chord, label: string, category: SubstituteCategory, rationale?: string) => {
    const sig = chordSig(next)
    if (seen.has(sig)) return
    seen.add(sig)
    out.push({ chord: next, label, rationale, category })
  }

  // ---- 1. functional / diatonic family substitutes ----
  // tonic-family (I, iii, vi) share two tones; same for subdominant (ii, IV) and dominant (V, vii°).
  if (chord.degree === 1) {
    if (diatonic[5]) push(diatonic[5], 'rel. minor', 'function', 'shares two tones with the tonic')
    if (diatonic[2]) push(diatonic[2], 'mediant', 'function', 'softer tonic-family sound')
  } else if (chord.degree === 6) {
    if (diatonic[0]) push(diatonic[0], 'rel. major', 'function', 'shares two tones with the vi')
    if (diatonic[2]) push(diatonic[2], 'mediant', 'function', 'tonic-family substitution')
  } else if (chord.degree === 3) {
    if (diatonic[0]) push(diatonic[0], 'tonic', 'function', 'iii\u2192I is the classic tonic swap')
  } else if (chord.degree === 4) {
    if (diatonic[1]) push(diatonic[1], 'pre-dominant', 'function', 'ii is IV\u2019s sibling \u2014 same function')
  } else if (chord.degree === 2) {
    if (diatonic[3]) push(diatonic[3], 'pre-dominant', 'function', 'IV is ii\u2019s sibling \u2014 same function')
  } else if (chord.degree === 5) {
    if (diatonic[6]) push(diatonic[6], 'leading tone', 'function', 'vii\u00b0 voices the same dominant tension')
  } else if (chord.degree === 7) {
    if (diatonic[4]) push(diatonic[4], 'dominant', 'function', 'V is the fuller dominant')
  }

  // ---- 2. secondary dominant of the next chord ----
  const next = progression[index + 1]
  if (
    next &&
    next.degree > 0 &&
    next.degree !== 1 &&
    next.quality !== 'dim' &&
    chord.degree !== next.degree // don't tonicize self
  ) {
    push(
      makeSecondaryDominant(key, scale, next, ext),
      `V/${next.roman.replace(/[\u266d\u266f].*/u, '').replace(/(maj|min|7|9|sus|dim|aug|\+|add).*/, '')}`,
      'secondary',
      `dominant of the next chord (${next.roman})`,
    )
  }

  // ---- 3. tritone substitution (only useful when current chord IS a dominant 7th-ish) ----
  // we treat V (or any major chord acting as dominant) as a candidate.
  const isDominantish =
    chord.quality === 'maj' &&
    (chord.degree === 5 || typeof chord.secondaryOf === 'number')
  if (isDominantish) {
    push(makeTritoneSub(chord, key, scale, extension), 'tritone sub', 'tritone', 'shares the V7 tritone with the original')
  }

  // ---- 4. borrowed iv as a tear-jerker for IV major ----
  if (chord.degree === 4 && chord.quality === 'maj') {
    const def = BORROWED_FROM_MINOR.find((b) => b.label === 'iv')
    if (def) {
      push(makeBorrowedChord(key, scale, def, ext), 'borrowed iv', 'borrowed', 'minor iv \u2014 modal interchange from parallel minor')
    }
  }

  // ---- 5. modal interchange picks (cap to keep the list short) ----
  const borrowedPool = borrowedPoolFor(scale.id)
  for (const def of borrowedPool) {
    if (out.length >= 5) break
    push(
      makeBorrowedChord(key, scale, def, ext),
      def.label,
      'modal',
      'borrowed from parallel mode',
    )
  }

  return out.slice(0, 5)
}

// the full diatonic palette for the "all options" section.
export function diatonicSubstitutes(opts: {
  key: PitchClass
  scale: Scale
  extension: Extension
}): Chord[] {
  return diatonicChords(opts.key, opts.scale, opts.extension)
}
