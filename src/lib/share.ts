import type { Chord, Extension, MoodId, PitchClass, ScaleId, TriadQuality } from './theory'
import type { InstrumentId, PlayMode } from './audio'

// shape we serialize into the URL hash. compact-ish but readable. version field
// lets us evolve the encoding without breaking already-shared links.
interface ShareV1 {
  v: 1
  k: number // key (pitch class)
  s: ScaleId
  m: MoodId
  x: Extension
  p: PlayMode
  b: number // bpm
  bp: number // beatsPerChord
  d: string // drumStyleId
  in: InstrumentId
  c: SerializedChord[]
  iv: number[]
  cb: number[]
  lk: number[] // locked indices (sparse beats counts of 1)
}

// trim chord to the minimum needed to round-trip display + playback. we
// re-derive nothing here — saving the strings is cheaper than rebuilding them
// for borrowed / secondary chords whose roman/symbol differ from the diatonic.
interface SerializedChord {
  r: number // root pitch class
  q: TriadQuality
  dg: number // diatonic degree, 0 = non-diatonic
  x: Extension
  R: string // roman
  S: string // symbol
  i: number[] // intervals from root
  bd?: 1 // borrowed flag
  sd?: number // secondaryOf diatonic degree
}

export interface ShareableState {
  key: PitchClass
  scaleId: ScaleId
  moodId: MoodId
  extension: Extension
  playMode: PlayMode
  bpm: number
  beatsPerChord: number
  drumStyleId: string
  instrument: InstrumentId
  chords: Chord[]
  inversions: number[]
  chordBeats: number[]
  locked: boolean[]
}

function serializeChord(c: Chord): SerializedChord {
  const out: SerializedChord = {
    r: c.root,
    q: c.quality,
    dg: c.degree,
    x: c.extension,
    R: c.roman,
    S: c.symbol,
    i: c.intervals,
  }
  if (c.borrowed) out.bd = 1
  if (typeof c.secondaryOf === 'number') out.sd = c.secondaryOf
  return out
}

function deserializeChord(s: SerializedChord): Chord {
  const root = s.r as PitchClass
  // pitchClasses are derivable from root + intervals, so we recompute.
  const pitchClasses = s.i.map((iv) => (((root + iv) % 12) + 12) % 12) as PitchClass[]
  const chord: Chord = {
    root,
    quality: s.q,
    degree: s.dg,
    roman: s.R,
    symbol: s.S,
    pitchClasses,
    intervals: s.i,
    extension: s.x,
  }
  if (s.bd) chord.borrowed = true
  if (typeof s.sd === 'number') chord.secondaryOf = s.sd
  return chord
}

// browser-safe base64url encode/decode. handles unicode via TextEncoder.
function b64urlEncode(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeState(state: ShareableState): string {
  const payload: ShareV1 = {
    v: 1,
    k: state.key,
    s: state.scaleId,
    m: state.moodId,
    x: state.extension,
    p: state.playMode,
    b: state.bpm,
    bp: state.beatsPerChord,
    d: state.drumStyleId,
    in: state.instrument,
    c: state.chords.map(serializeChord),
    iv: state.inversions,
    cb: state.chordBeats,
    lk: state.locked.map((b) => (b ? 1 : 0)),
  }
  return b64urlEncode(JSON.stringify(payload))
}

export function decodeState(hash: string): ShareableState | null {
  try {
    const raw = b64urlDecode(hash)
    const parsed = JSON.parse(raw) as ShareV1
    if (!parsed || parsed.v !== 1) return null
    if (!Array.isArray(parsed.c) || parsed.c.length === 0) return null
    const chords = parsed.c.map(deserializeChord)
    const len = chords.length
    const inversions =
      Array.isArray(parsed.iv) && parsed.iv.length === len
        ? parsed.iv
        : new Array(len).fill(0)
    const chordBeats =
      Array.isArray(parsed.cb) && parsed.cb.length === len
        ? parsed.cb
        : new Array(len).fill(parsed.bp)
    const locked =
      Array.isArray(parsed.lk) && parsed.lk.length === len
        ? parsed.lk.map((n) => Boolean(n))
        : new Array(len).fill(false)
    return {
      key: parsed.k as PitchClass,
      scaleId: parsed.s,
      moodId: parsed.m,
      extension: parsed.x,
      playMode: parsed.p,
      bpm: parsed.b,
      beatsPerChord: parsed.bp,
      drumStyleId: parsed.d,
      instrument: parsed.in,
      chords,
      inversions,
      chordBeats,
      locked,
    }
  } catch {
    return null
  }
}

const HASH_PREFIX = '#s='

// read once on page load. clears the hash so refreshes don't re-import.
export function readShareFromHash(): ShareableState | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (!hash.startsWith(HASH_PREFIX)) return null
  const encoded = hash.slice(HASH_PREFIX.length)
  return decodeState(encoded)
}

export function buildShareUrl(state: ShareableState): string {
  const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : ''
  return `${base}${HASH_PREFIX}${encodeState(state)}`
}
