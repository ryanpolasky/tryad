import * as Tone from 'tone'
import type { DrumPiece, DrumStyle } from './drums'
import { getDrumStyle } from './drums'
import type { Project, Section, TrackConfig, TrackKind } from './project'
import { sectionBeats } from './project'
import { midiToNoteName, pickInversion, voiceChord } from './theory'

export type InstrumentId = 'piano' | 'epiano' | 'guitar' | 'pad' | 'pluck' | 'lead' | 'bass-electric' | 'synth-bass'

export interface InstrumentDef {
  id: InstrumentId
  label: string
  description: string
}

export const INSTRUMENTS: InstrumentDef[] = [
  { id: 'piano', label: 'grand piano', description: 'Salamander acoustic piano (sampled)' },
  { id: 'epiano', label: 'electric piano', description: 'Warm electric piano (sampled)' },
  { id: 'guitar', label: 'acoustic guitar', description: 'Nylon guitar (sampled)' },
  { id: 'pad', label: 'pad', description: 'Lush analog-style pad (synth)' },
  { id: 'pluck', label: 'pluck', description: 'Percussive pluck (synth)' },
  { id: 'lead', label: 'synth lead', description: 'Bright monophonic-style lead' },
  { id: 'bass-electric', label: 'electric bass', description: 'Sampled electric bass' },
  { id: 'synth-bass', label: 'synth bass', description: 'Monophonic synth bass' },
]

const PIANO_URLS: Record<string, string> = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
  A7: 'A7.mp3', C8: 'C8.mp3',
}

// nbrosowsky/tonejs-instruments. CC0.
const NBROS_BASE = 'https://nbrosowsky.github.io/tonejs-instruments/samples/'

const EPIANO_URLS: Record<string, string> = {
  A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3',
  C2: 'C2.mp3', C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3', C6: 'C6.mp3',
}

const GUITAR_URLS: Record<string, string> = {
  A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3',
  C3: 'C3.mp3', C4: 'C4.mp3', C5: 'C5.mp3',
  'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3',
  'F#2': 'Fs2.mp3', 'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3',
}

interface Voice {
  triggerAttackRelease: (notes: string[], duration: number, time?: number, velocity?: number) => void
  releaseAll: (time?: number) => void
  dispose: () => void
  output: Tone.ToneAudioNode
}

interface AudioGraph {
  master: Tone.Gain
  reverb: Tone.Reverb
  limiter: Tone.Limiter
  drumBus: Tone.Gain
}

let _graph: AudioGraph | null = null

function ensureGraph(): AudioGraph {
  if (_graph) return _graph
  const limiter = new Tone.Limiter(-1).toDestination()
  const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.22 }).connect(limiter)
  const master = new Tone.Gain(0.85).connect(reverb)
  // drums bypass reverb (slightly dry, kick stays punchy)
  const drumBus = new Tone.Gain(0.95).connect(limiter)
  _graph = { master, reverb, limiter, drumBus }
  return _graph
}

function makeSamplerVoice(
  urls: Record<string, string>,
  baseUrl: string,
  output: Tone.ToneAudioNode,
  release = 1.4,
): Voice & { loaded: Promise<void> } {
  let resolve!: () => void
  const loaded = new Promise<void>((r) => (resolve = r))
  const sampler = new Tone.Sampler({
    urls,
    baseUrl,
    release,
    onload: () => resolve(),
  })
  sampler.connect(output)
  return {
    triggerAttackRelease(notes, duration, time, velocity) {
      sampler.triggerAttackRelease(notes, duration, time, velocity)
    },
    releaseAll(time) {
      sampler.releaseAll(time)
    },
    dispose() {
      sampler.dispose()
    },
    output: sampler,
    loaded,
  }
}

function makePadVoice(output: Tone.ToneAudioNode): Voice & { loaded: Promise<void> } {
  const filter = new Tone.Filter({ frequency: 1500, Q: 0.8, type: 'lowpass' })
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 24 } as Tone.OmniOscillatorOptions,
    envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 1.8 },
  })
  synth.volume.value = -10
  synth.chain(filter, output)
  return {
    triggerAttackRelease(notes, duration, time, velocity) {
      synth.triggerAttackRelease(notes, duration, time, velocity)
    },
    releaseAll(time) {
      synth.releaseAll(time)
    },
    dispose() {
      synth.dispose()
      filter.dispose()
    },
    output: synth,
    loaded: Promise.resolve(),
  }
}

function makePluckVoice(output: Tone.ToneAudioNode): Voice & { loaded: Promise<void> } {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' } as Tone.OmniOscillatorOptions,
    envelope: { attack: 0.005, decay: 0.5, sustain: 0.1, release: 1.0 },
  })
  synth.volume.value = -8
  synth.connect(output)
  return {
    triggerAttackRelease(notes, duration, time, velocity) {
      synth.triggerAttackRelease(notes, duration, time, velocity)
    },
    releaseAll(time) {
      synth.releaseAll(time)
    },
    dispose() {
      synth.dispose()
    },
    output: synth,
    loaded: Promise.resolve(),
  }
}

function makeLeadVoice(output: Tone.ToneAudioNode): Voice & { loaded: Promise<void> } {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'square' } as Tone.OmniOscillatorOptions,
    envelope: { attack: 0.012, decay: 0.12, sustain: 0.42, release: 0.18 },
    portamento: 0,
  })
  const vibrato = new Tone.Vibrato({ frequency: 5.2, depth: 0.08, wet: 0.2 })
  synth.volume.value = -7
  synth.chain(vibrato, output)
  return {
    triggerAttackRelease(notes, duration, time, velocity) {
      synth.triggerAttackRelease(notes, duration, time, velocity)
    },
    releaseAll(time) {
      synth.releaseAll(time)
    },
    dispose() {
      synth.dispose()
      vibrato.dispose()
    },
    output: synth,
    loaded: Promise.resolve(),
  }
}

function buildVoice(
  id: InstrumentId,
  output: Tone.ToneAudioNode,
): Voice & { loaded: Promise<void> } {
  switch (id) {
    case 'piano':
      return makeSamplerVoice(PIANO_URLS, 'https://tonejs.github.io/audio/salamander/', output)
    case 'epiano':
      return makeSamplerVoice(EPIANO_URLS, `${NBROS_BASE}piano/`, output)
    case 'guitar':
      return makeSamplerVoice(GUITAR_URLS, `${NBROS_BASE}guitar-acoustic/`, output)
    case 'pad':
      return makePadVoice(output)
    case 'pluck':
      return makePluckVoice(output)
    case 'lead':
      return makeLeadVoice(output)
    case 'bass-electric':
      return buildVoice('synth-bass', output)
    case 'synth-bass': {
      const synth = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { Q: 1, type: 'lowpass', rolloff: -24, frequency: 360 },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.55, release: 0.2 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.2, baseFrequency: 90, octaves: 2.5 },
      })
      synth.volume.value = -7
      synth.connect(output)
      return {
        triggerAttackRelease(notes, duration, time, velocity) {
          notes.forEach((note) => synth.triggerAttackRelease(note, duration, time, velocity))
        },
        releaseAll(time) { synth.triggerRelease(time) },
        dispose() { synth.dispose() },
        output: synth,
        loaded: Promise.resolve(),
      }
    }
  }
}

// ---------- drum voices (synthesized) ----------

interface DrumKit {
  trigger: (piece: DrumPiece, time: number, velocity: number) => void
  dispose: () => void
}

function buildDrumKit(output: Tone.ToneAudioNode): DrumKit {
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 4,
    envelope: { attack: 0.001, decay: 0.42, sustain: 0.01, release: 0.5 },
  })
  kick.volume.value = -2
  kick.connect(output)

  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
  })
  const snareHP = new Tone.Filter(1500, 'highpass')
  snareNoise.connect(snareHP)
  snareHP.connect(output)
  snareNoise.volume.value = -6

  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 5,
    envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
  })
  snareBody.volume.value = -16
  snareBody.connect(output)

  const hat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.045, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  })
  hat.volume.value = -20
  hat.connect(output)

  const open = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.22, release: 0.08 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 5000,
    octaves: 1.5,
  })
  open.volume.value = -22
  open.connect(output)

  const ride = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.3, release: 0.2 },
    harmonicity: 8,
    modulationIndex: 16,
    resonance: 7000,
    octaves: 1.2,
  })
  ride.volume.value = -22
  ride.connect(output)

  const rim = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 8,
    envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
  })
  rim.volume.value = -14
  rim.connect(output)

  return {
    trigger(piece, time, velocity) {
      const v = Math.max(0, Math.min(1, velocity))
      switch (piece) {
        case 'kick':
          kick.triggerAttackRelease('C1', 0.18, time, v)
          break
        case 'snare':
          snareNoise.triggerAttackRelease(0.12, time, v)
          snareBody.triggerAttackRelease('D2', 0.05, time, v * 0.6)
          break
        case 'hihat':
          hat.triggerAttackRelease('C5', 0.04, time, v * 0.45)
          break
        case 'openhat':
          open.triggerAttackRelease('C5', 0.2, time, v * 0.5)
          break
        case 'ride':
          ride.triggerAttackRelease('C5', 0.28, time, v * 0.45)
          break
        case 'rim':
          rim.triggerAttackRelease('G4', 0.02, time, v * 0.7)
          break
      }
    },
    dispose() {
      kick.dispose()
      snareNoise.dispose()
      snareBody.dispose()
      snareHP.dispose()
      hat.dispose()
      open.dispose()
      ride.dispose()
      rim.dispose()
    },
  }
}

export type PlayMode =
  | 'block'
  | 'arpUp'
  | 'arpDown'
  | 'arpUpDown'
  | 'arpRandom'
  | 'strum'
  | 'rolled'
  | 'alberti'
  | 'ballad'
  | 'pulse'
  | 'syncopated'

export const PLAY_MODES: { id: PlayMode; label: string }[] = [
  { id: 'block', label: 'block' },
  { id: 'strum', label: 'strum' },
  { id: 'rolled', label: 'rolled (harp)' },
  { id: 'pulse', label: 'pulse (8ths)' },
  { id: 'syncopated', label: 'syncopated' },
  { id: 'arpUp', label: 'arp up' },
  { id: 'arpDown', label: 'arp down' },
  { id: 'arpUpDown', label: 'arp up-down' },
  { id: 'arpRandom', label: 'arp random' },
  { id: 'alberti', label: 'alberti' },
  { id: 'ballad', label: 'ballad (oom-pah)' },
]

// grouped layout for the play-mode <select> so the 9 options scan as
// sustained / strummed / arpeggios / patterns instead of one long list.
export const PLAY_MODE_GROUPS: {
  label: string
  options: { value: PlayMode; label: string }[]
}[] = [
  {
    label: 'sustained',
    options: [{ value: 'block', label: 'block' }],
  },
  {
    label: 'strummed',
    options: [
      { value: 'strum', label: 'strum' },
      { value: 'rolled', label: 'rolled (harp)' },
    ],
  },
  {
    label: 'arpeggios',
    options: [
      { value: 'arpUp', label: 'arp up' },
      { value: 'arpDown', label: 'arp down' },
      { value: 'arpUpDown', label: 'arp up-down' },
      { value: 'arpRandom', label: 'arp random' },
    ],
  },
  {
    label: 'patterns',
    options: [
      { value: 'pulse', label: 'pulse (8ths)' },
      { value: 'syncopated', label: 'syncopated' },
      { value: 'alberti', label: 'alberti' },
      { value: 'ballad', label: 'ballad (oom-pah)' },
    ],
  },
]

interface ChordEvent {
  time: number
  idx: number
  notes: string[]
  duration: number
  /** first sub-event of a chord; fires onStep */
  first: boolean
}

interface DrumEvent {
  time: number
  piece: DrumPiece
  velocity: number
}

// flatten a chord into sub-events for the given play mode.
// total duration stays the same, only the internal note layout changes.
function buildChordSubEvents(
  notes: string[],
  startTime: number,
  duration: number,
  mode: PlayMode,
  secondsPerBeat: number,
  chordIdx: number,
): ChordEvent[] {
  if (notes.length === 0) return []

  if (mode === 'block') {
    return [
      { time: startTime, idx: chordIdx, notes, duration: duration * 0.95, first: true },
    ]
  }

  // quick strum (guitar pick) vs slow rolled (harp gliss).
  // cap the stagger so the whole roll stays within ~60% of the chord at extreme bpm.
  if (mode === 'strum' || mode === 'rolled') {
    const idealStagger = mode === 'rolled' ? 0.085 : 0.025
    const maxStagger = (duration * 0.6) / Math.max(1, notes.length - 1)
    const stagger = Math.min(idealStagger, maxStagger)
    return notes.map((n, i) => ({
      time: startTime + i * stagger,
      idx: chordIdx,
      notes: [n],
      duration: Math.max(0.05, duration - i * stagger - 0.02),
      first: i === 0,
    }))
  }

  // pulse: repeated 8th-note block chords
  if (mode === 'pulse') {
    const noteDur = secondsPerBeat * 0.5
    const count = Math.max(1, Math.floor(duration / noteDur))
    const out: ChordEvent[] = []
    for (let i = 0; i < count; i++) {
      out.push({
        time: startTime + i * noteDur,
        idx: chordIdx,
        notes,
        duration: noteDur * 0.85,
        first: i === 0,
      })
    }
    return out
  }

  // syncopated: 3-3-2 tresillo pattern in 8th notes (1.5 beats, 1.5 beats, 1.0 beats)
  if (mode === 'syncopated') {
    const eighth = secondsPerBeat * 0.5
    const subDurs = [3, 3, 2] // duration in 8ths
    
    // how many 8th notes in the whole chord duration?
    const totalEighths = Math.max(1, Math.floor(duration / eighth))
    const out: ChordEvent[] = []
    
    let currentEighth = 0
    let patternIdx = 0
    while (currentEighth < totalEighths) {
      const hitDurs = subDurs[patternIdx % subDurs.length]
      // don't exceed the chord duration
      const actualDurs = Math.min(hitDurs, totalEighths - currentEighth)
      out.push({
        time: startTime + currentEighth * eighth,
        idx: chordIdx,
        notes,
        duration: actualDurs * eighth * 0.85,
        first: currentEighth === 0,
      })
      currentEighth += actualDurs
      patternIdx++
    }
    return out
  }

  // ballad / oom-pah: alternate bass-only and upper-notes on 8th grid.
  // bass = notes[0], upper = notes[1..] (or the same single note if mono).
  if (mode === 'ballad') {
    const noteDur = secondsPerBeat * 0.5
    const count = Math.max(1, Math.floor(duration / noteDur))
    const bass = [notes[0]]
    const upper = notes.length > 1 ? notes.slice(1) : notes
    const out: ChordEvent[] = []
    for (let i = 0; i < count; i++) {
      out.push({
        time: startTime + i * noteDur,
        idx: chordIdx,
        notes: i % 2 === 0 ? bass : upper,
        duration: noteDur * 0.92,
        first: i === 0,
      })
    }
    return out
  }

  // arp + alberti share an 8th-note grid; the sequence picks which note plays each tick.
  const noteDur = secondsPerBeat * 0.5
  let seq: string[]
  if (mode === 'arpUp') {
    seq = notes
  } else if (mode === 'arpDown') {
    seq = [...notes].reverse()
  } else if (mode === 'arpUpDown') {
    seq = notes.length <= 2 ? notes : [...notes, ...notes.slice(1, -1).reverse()]
  } else if (mode === 'arpRandom') {
    // shuffled cycle (Fisher-Yates) so it sounds varied but still uses each tone.
    seq = [...notes]
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[seq[i], seq[j]] = [seq[j], seq[i]]
    }
  } else {
    // alberti: classic [root, top, mid, top] broken-chord pattern.
    // floor(length/2) lands on the recognizable middle voice for triads and 7ths.
    if (notes.length === 1) {
      seq = notes
    } else if (notes.length === 2) {
      seq = [notes[0], notes[1], notes[0], notes[1]]
    } else {
      const last = notes.length - 1
      const mid = Math.floor(notes.length / 2)
      seq = [notes[0], notes[last], notes[mid], notes[last]]
    }
  }

  const count = Math.max(1, Math.floor(duration / noteDur))
  const out: ChordEvent[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      time: startTime + i * noteDur,
      idx: chordIdx,
      notes: [seq[i % seq.length]],
      duration: noteDur * 0.95,
      first: i === 0,
    })
  }
  return out
}

class AudioEngine {
  private voice: (Voice & { loaded: Promise<void> }) | null = null
  private current: InstrumentId | null = null
  private chordPart: Tone.Part<ChordEvent> | null = null
  private drumPart: Tone.Part<DrumEvent> | null = null
  private drumKit: DrumKit | null = null

  async start(): Promise<void> {
    await Tone.start()
  }

  async setInstrument(id: InstrumentId): Promise<void> {
    if (this.current === id && this.voice) return
    const next = buildVoice(id, ensureGraph().master)
    await next.loaded
    if (this.voice) this.voice.dispose()
    this.voice = next
    this.current = id
  }

  get currentInstrument(): InstrumentId | null {
    return this.current
  }

  playNotes(noteNames: string[], duration = 0.9, velocity = 0.8) {
    this.voice?.triggerAttackRelease(noteNames, duration, undefined, velocity)
  }

  stopAll() {
    this.clearScheduled()
    this.voice?.releaseAll()
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel(0)
  }

  private clearScheduled() {
    if (this.chordPart) {
      this.chordPart.stop()
      this.chordPart.dispose()
      this.chordPart = null
    }
    if (this.drumPart) {
      this.drumPart.stop()
      this.drumPart.dispose()
      this.drumPart = null
    }
  }

  // schedule a looping progression (+ optional drums). chord and drum parts share
  // the same Tone.Transport so they stay locked.
  scheduleProgression(opts: {
    chordNotes: string[][]
    bpm: number
    beatsPerChord: number
    /** per-chord beat counts; falls back to beatsPerChord */
    chordBeats?: number[]
    drumStyleId: string
    playMode?: PlayMode
    onStep?: (stepIndex: number) => void
  }): () => void {
    const { chordNotes, bpm, beatsPerChord, chordBeats, drumStyleId, onStep } = opts
    const playMode: PlayMode = opts.playMode ?? 'block'
    const transport = Tone.getTransport()

    this.clearScheduled()
    transport.cancel(0)
    transport.stop()
    transport.position = 0
    transport.bpm.value = bpm

    const secondsPerBeat = 60 / bpm
    const beats = chordNotes.map((_, i) => chordBeats?.[i] ?? beatsPerChord)
    const durations = beats.map((b) => b * secondsPerBeat)
    // cumulative start times
    const starts: number[] = []
    let acc = 0
    for (const d of durations) {
      starts.push(acc)
      acc += d
    }
    const progressionSeconds = acc

    // chord part: flatten chords into sub-events per play mode.
    const chordEvents: ChordEvent[] = []
    chordNotes.forEach((notes, idx) => {
      const subs = buildChordSubEvents(
        notes,
        starts[idx],
        durations[idx],
        playMode,
        secondsPerBeat,
        idx,
      )
      chordEvents.push(...subs)
    })
    const chordPart = new Tone.Part<ChordEvent>((time, value) => {
      this.voice?.triggerAttackRelease(value.notes, value.duration, time, 0.75)
      if (value.first && onStep) Tone.getDraw().schedule(() => onStep(value.idx), time)
    }, chordEvents)
    chordPart.loop = true
    chordPart.loopEnd = progressionSeconds
    chordPart.start(0)
    this.chordPart = chordPart

    // drum part: loop the pattern across the full progression length so it restarts
    // aligned with the chord cycle. avoids LCM phase-drift between unequal loops.
    const style = getDrumStyle(drumStyleId)
    if (style.id !== 'off') {
      if (!this.drumKit) this.drumKit = buildDrumKit(ensureGraph().drumBus)
      const drumKit = this.drumKit
      const oneLoop = buildDrumEvents(style, bpm)
      const drumLoopSeconds = style.bars * 4 * secondsPerBeat
      const repeats = Math.max(1, Math.ceil(progressionSeconds / drumLoopSeconds))
      const drumEvents: DrumEvent[] = []
      for (let r = 0; r < repeats; r++) {
        const offset = r * drumLoopSeconds
        for (const e of oneLoop) {
          if (offset + e.time >= progressionSeconds) continue
          drumEvents.push({ time: offset + e.time, piece: e.piece, velocity: e.velocity })
        }
      }
      const drumPart = new Tone.Part<DrumEvent>((time, value) => {
        drumKit.trigger(value.piece, time, value.velocity)
      }, drumEvents)
      drumPart.loop = true
      drumPart.loopEnd = progressionSeconds
      drumPart.start(0)
      this.drumPart = drumPart
    }

    transport.start('+0.05')

    return () => {
      this.clearScheduled()
      transport.stop()
      transport.cancel(0)
      this.voice?.releaseAll()
    }
  }
}

function buildDrumEvents(style: DrumStyle, bpm: number): DrumEvent[] {
  const secondsPerBeat = 60 / bpm
  const sixteenthSeconds = secondsPerBeat / 4
  const events: DrumEvent[] = []
  style.patterns.forEach((bar, barIdx) => {
    const barOffset = barIdx * 16 * sixteenthSeconds
    ;(Object.keys(bar.steps) as DrumPiece[]).forEach((piece) => {
      const steps = bar.steps[piece] ?? []
      const vels = bar.vel?.[piece] ?? []
      steps.forEach((step, i) => {
        events.push({
          time: barOffset + step * sixteenthSeconds,
          piece,
          velocity: vels[i] ?? 0.9,
        })
      })
    })
  })
  return events
}

// render the same chord + drum schedule to an AudioBuffer for export.
// builds its own graph inside Tone.Offline so it doesn't conflict with the
// live engine. samples re-fetch but hit the browser cache.
export async function renderProgression(opts: {
  chordNotes: string[][]
  bpm: number
  beatsPerChord: number
  chordBeats?: number[]
  drumStyleId: string
  playMode?: PlayMode
  instrument: InstrumentId
  /** seconds of tail beyond the loop to capture reverb decay. */
  tailSeconds?: number
}): Promise<AudioBuffer> {
  const playMode: PlayMode = opts.playMode ?? 'block'
  const secondsPerBeat = 60 / opts.bpm
  const beats = opts.chordNotes.map((_, i) => opts.chordBeats?.[i] ?? opts.beatsPerChord)
  const durations = beats.map((b) => b * secondsPerBeat)
  const starts: number[] = []
  let acc = 0
  for (const d of durations) {
    starts.push(acc)
    acc += d
  }
  const progressionSeconds = acc
  const tail = opts.tailSeconds ?? 2.5
  const totalDuration = progressionSeconds + tail

  const rendered = await Tone.Offline(async (ctx) => {
    // build a self-contained graph for this offline context.
    const limiter = new Tone.Limiter(-1).toDestination()
    const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.22 }).connect(limiter)
    // wait for the reverb impulse to generate inside the offline context.
    await reverb.generate()
    const master = new Tone.Gain(0.85).connect(reverb)
    const drumBus = new Tone.Gain(0.95).connect(limiter)

    const voice = buildVoice(opts.instrument, master)
    await voice.loaded

    const chordEvents: ChordEvent[] = []
    opts.chordNotes.forEach((notes, idx) => {
      const subs = buildChordSubEvents(
        notes,
        starts[idx],
        durations[idx],
        playMode,
        secondsPerBeat,
        idx,
      )
      chordEvents.push(...subs)
    })
    const chordPart = new Tone.Part<ChordEvent>((time, value) => {
      voice.triggerAttackRelease(value.notes, value.duration, time, 0.75)
    }, chordEvents)
    chordPart.start(0)

    const style = getDrumStyle(opts.drumStyleId)
    if (style.id !== 'off') {
      const drumKit = buildDrumKit(drumBus)
      const oneLoop = buildDrumEvents(style, opts.bpm)
      const drumLoopSeconds = style.bars * 4 * secondsPerBeat
      const repeats = Math.max(1, Math.ceil(progressionSeconds / drumLoopSeconds))
      const drumEvents: DrumEvent[] = []
      for (let r = 0; r < repeats; r++) {
        const offset = r * drumLoopSeconds
        for (const e of oneLoop) {
          if (offset + e.time >= progressionSeconds) continue
          drumEvents.push({ time: offset + e.time, piece: e.piece, velocity: e.velocity })
        }
      }
      const drumPart = new Tone.Part<DrumEvent>((time, value) => {
        drumKit.trigger(value.piece, time, value.velocity)
      }, drumEvents)
      drumPart.start(0)
    }

    ctx.transport.bpm.value = opts.bpm
    ctx.transport.start(0)
  }, totalDuration)

  // ToneAudioBuffer wraps the native AudioBuffer.
  return rendered.get() as AudioBuffer
}

export const audio = new AudioEngine()

interface SongEvent {
  time: number
  kind: TrackKind | 'metronome'
  notes?: string[]
  duration?: number
  velocity?: number
  piece?: DrumPiece
  chordIndex?: number
  sectionId?: string
  beat?: number
}

interface SongChannel {
  config: TrackConfig
  gain: Tone.Gain
  voice: (Voice & { loaded: Promise<void> }) | null
  kit: DrumKit | null
}

function secondsAtBeat(beat: number, bpm: number): number {
  return beat * 60 / bpm
}

function songEvents(project: Project, sections: Section[], startBeat: number): SongEvent[] {
  const bpm = project.bpm
  const secondsPerBeat = 60 / bpm
  const events: SongEvent[] = []
  let sectionOffset = 0
  sections.forEach((section) => {
    let chordOffset = sectionOffset
    let previousTop: number | undefined
    let previousBass: number | undefined
    section.chords.forEach((slot, chordIndex) => {
      const inv = slot.inversion > 0
        ? slot.inversion
        : pickInversion(slot.chord, 4 + slot.octave, { prevTopMidi: previousTop, prevBassMidi: previousBass })
      const midiNotes = voiceChord(slot.chord, 4 + slot.octave, { forcedInversion: inv })
      previousTop = midiNotes[midiNotes.length - 1]
      previousBass = midiNotes[0]
      const chordStart = chordOffset
      const chordEnd = chordStart + slot.beats
      if (chordEnd > startBeat) {
        const notes = midiNotes.map(midiToNoteName)
        const startSeconds = secondsAtBeat(Math.max(chordStart, startBeat), bpm)
        const duration = secondsAtBeat(chordEnd - Math.max(chordStart, startBeat), bpm)
        const subs = buildChordSubEvents(
          notes,
          startSeconds - secondsAtBeat(startBeat, bpm),
          duration,
          project.tracks.find((track) => track.kind === 'chords')?.playMode ?? 'block',
          secondsPerBeat,
          chordIndex,
        )
        subs.forEach((sub) => events.push({
          time: sub.time,
          kind: 'chords',
          notes: sub.notes,
          duration: sub.duration,
          velocity: 0.76,
          chordIndex: sub.idx,
          sectionId: section.id,
          beat: chordStart,
        }))
      }
      chordOffset += slot.beats
    })
    const appendNotes = (kind: 'melody' | 'bass', notes: Section['melody']) => {
      notes.forEach((note) => {
        const beat = sectionOffset + note.start
        if (beat + note.dur <= startBeat) return
        const clippedStart = Math.max(beat, startBeat)
        events.push({
          time: secondsAtBeat(clippedStart - startBeat, bpm),
          kind,
          notes: [midiToNoteName(note.midi)],
          duration: secondsAtBeat(beat + note.dur - clippedStart, bpm),
          velocity: note.vel,
          sectionId: section.id,
          beat,
        })
      })
    }
    appendNotes('melody', section.melody)
    appendNotes('bass', section.bass)
    if (section.drums) {
      ;(Object.keys(section.drums.steps) as DrumPiece[]).forEach((piece) => {
        section.drums?.steps[piece]?.forEach((hit, step) => {
          const beat = sectionOffset + step / 4
          if (!hit || beat < startBeat) return
          events.push({
            time: secondsAtBeat(beat - startBeat, bpm),
            kind: 'drums',
            piece,
            velocity: step % 4 === 0 ? 0.9 : 0.66,
            sectionId: section.id,
            beat,
          })
        })
      })
    }
    sectionOffset += sectionBeats(section)
  })
  return events.sort((a, b) => a.time - b.time)
}

function voiceForTrack(track: TrackConfig, output: Tone.ToneAudioNode): (Voice & { loaded: Promise<void> }) | null {
  if (track.kind === 'drums') return null
  return buildVoice((track.instrument || (track.kind === 'bass' ? 'synth-bass' : 'piano')) as InstrumentId, output)
}

class SongAudioEngine {
  private channels = new Map<TrackKind, SongChannel>()
  private parts: Tone.Part<SongEvent>[] = []
  private metronome: Tone.MembraneSynth | null = null
  private startBeat = 0
  private rangeBeats = 0
  private transportStartTicks = 0
  private playheadCallback: ((sectionId: string, chordIndex: number) => void) | null = null
  private currentProject: Project | null = null
  private sectionIds: string[] = []
  private updateTimer: number | null = null
  private pendingSectionSwitch: number | null = null

  async setTracks(tracks: TrackConfig[], masterVolume: number): Promise<void> {
    const graph = ensureGraph()
    graph.master.gain.rampTo(masterVolume, 0.04)
    const hasSolo = tracks.some((track) => track.solo)
    for (const [kind, channel] of this.channels) {
      if (!tracks.some((track) => track.kind === kind)) {
        channel.voice?.dispose()
        channel.kit?.dispose()
        channel.gain.dispose()
        this.channels.delete(kind)
      }
    }
    for (const track of tracks) {
      let channel = this.channels.get(track.kind)
      if (channel && channel.config.instrument !== track.instrument) {
        channel.voice?.dispose()
        channel.kit?.dispose()
        channel.gain.dispose()
        this.channels.delete(track.kind)
        channel = undefined
      }
      if (!channel) {
        const gain = new Tone.Gain(track.volume).connect(graph.master)
        channel = { config: track, gain, voice: voiceForTrack(track, gain), kit: track.kind === 'drums' ? buildDrumKit(gain) : null }
        this.channels.set(track.kind, channel)
        if (channel.voice) await channel.voice.loaded
      }
      channel.config = track
      channel.gain.gain.rampTo(track.mute || (hasSolo && !track.solo) ? 0 : track.volume, 0.035)
    }
  }

  setTrackControls(kind: TrackKind, controls: Partial<Pick<TrackConfig, 'volume' | 'mute' | 'solo'>>): void {
    const channel = this.channels.get(kind)
    if (!channel) return
    channel.config = { ...channel.config, ...controls }
    const hasSolo = Array.from(this.channels.values()).some((item) => item.config.solo)
    const level = channel.config.mute || (hasSolo && !channel.config.solo) ? 0 : channel.config.volume
    channel.gain.gain.rampTo(level, 0.035)
  }

  async start(): Promise<void> {
    await Tone.start()
  }

  scheduleSong(opts: {
    project: Project
    startBeat?: number
    sectionIds?: string[]
    onChord?: (sectionId: string, chordIndex: number) => void
  }): () => void {
    this.stop()
    const { project } = opts
    this.currentProject = project
    this.sectionIds = opts.sectionIds?.length ? opts.sectionIds : project.sections.map((section) => section.id)
    const sections = this.sectionIds.map((id) => project.sections.find((section) => section.id === id)).filter((section): section is Section => Boolean(section))
    this.startBeat = Math.max(0, opts.startBeat ?? 0)
    this.rangeBeats = sections.reduce((sum, section) => sum + sectionBeats(section), 0)
    this.playheadCallback = opts.onChord ?? null
    const transport = Tone.getTransport()
    transport.cancel(0)
    transport.stop()
    transport.position = 0
    transport.bpm.value = project.bpm
    this.transportStartTicks = transport.ticks
    const events = songEvents(project, sections, this.startBeat)
    const part = new Tone.Part<SongEvent>((time, event) => {
      if (event.kind === 'metronome') {
        this.metronome?.triggerAttackRelease('C6', 0.035, time, event.velocity ?? 0.5)
        return
      }
      if (event.kind === 'drums') {
        if (event.piece) this.channels.get('drums')?.kit?.trigger(event.piece, time, event.velocity ?? 0.75)
        return
      }
      const channel = this.channels.get(event.kind)
      if (channel?.voice && event.notes) channel.voice.triggerAttackRelease(event.notes, event.duration ?? 0.2, time, event.velocity ?? 0.7)
      if (event.kind === 'chords' && event.sectionId && typeof event.chordIndex === 'number') {
        Tone.getDraw().schedule(() => this.playheadCallback?.(event.sectionId as string, event.chordIndex as number), time)
      }
    }, events)
    const secondsLength = secondsAtBeat(Math.max(0.25, this.rangeBeats - this.startBeat), project.bpm)
    part.loop = true
    part.loopEnd = secondsLength
    part.start(0)
    this.parts.push(part)
    if (project.metronome) {
      this.metronome ??= new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } }).connect(ensureGraph().master)
      const clicks = Array.from({ length: Math.ceil(this.rangeBeats - this.startBeat) }, (_, i) => ({
        time: secondsAtBeat(i, project.bpm),
        kind: 'metronome' as const,
        velocity: (i + Math.ceil(this.startBeat)) % 4 === 0 ? 0.68 : 0.28,
      }))
      const clickPart = new Tone.Part<SongEvent>((time, event) => this.metronome?.triggerAttackRelease('C6', 0.035, time, event.velocity), clicks)
      clickPart.loop = true
      clickPart.loopEnd = secondsLength
      clickPart.start(0)
      this.parts.push(clickPart)
    }
    transport.start('+0.04')
    return () => this.stop()
  }

  scheduleLiveUpdate(opts: {
    project: Project
    startBeat?: number
    sectionIds?: string[]
    onChord?: (sectionId: string, chordIndex: number) => void
    retrigger?: boolean
  }): void {
    if (!this.isPlaying) return
    if (this.updateTimer !== null) window.clearTimeout(this.updateTimer)
    const currentBeat = opts.startBeat ?? this.getPlayheadBeat()
    this.updateTimer = window.setTimeout(() => {
      this.updateTimer = null
      void this.applyLiveUpdate(opts, currentBeat)
    }, 50)
  }

  switchSectionAtNextBar(opts: {
    project: Project
    sectionId: string
    onChord?: (sectionId: string, chordIndex: number) => void
  }): void {
    const transport = Tone.getTransport()
    if (this.pendingSectionSwitch !== null) transport.clear(this.pendingSectionSwitch)
    const currentBeat = this.getPlayheadBeat()
    const boundary = Math.ceil((currentBeat + 0.001) / 4) * 4
    const delay = secondsAtBeat(Math.max(0.05, boundary - currentBeat), opts.project.bpm)
    this.pendingSectionSwitch = transport.scheduleOnce(() => {
      this.pendingSectionSwitch = null
      this.scheduleLiveUpdate({ ...opts, sectionIds: [opts.sectionId], startBeat: 0, retrigger: true })
    }, transport.seconds + delay)
  }

  private async applyLiveUpdate(
    opts: { project: Project; startBeat?: number; sectionIds?: string[]; onChord?: (sectionId: string, chordIndex: number) => void; retrigger?: boolean },
    requestedBeat: number,
  ): Promise<void> {
    if (!this.isPlaying) return
    await this.setTracks(opts.project.tracks, opts.project.masterVolume)
    if (opts.retrigger) {
      const now = Tone.now()
      for (const channel of this.channels.values()) channel.voice?.releaseAll(now)
    }
    const transport = Tone.getTransport()
    transport.bpm.rampTo(opts.project.bpm, 0.05)
    const project = opts.project
    this.currentProject = project
    this.sectionIds = opts.sectionIds?.length ? opts.sectionIds : project.sections.map((section) => section.id)
    const sections = this.sectionIds.map((id) => project.sections.find((section) => section.id === id)).filter((section): section is Section => Boolean(section))
    this.rangeBeats = sections.reduce((sum, section) => sum + sectionBeats(section), 0)
    if (this.rangeBeats <= 0) return
    const beat = ((requestedBeat % this.rangeBeats) + this.rangeBeats) % this.rangeBeats
    this.startBeat = beat
    this.playheadCallback = opts.onChord ?? this.playheadCallback
    this.transportStartTicks = transport.ticks
    for (const part of this.parts) {
      part.stop()
      part.dispose()
    }
    this.parts = []

    const startAtTicks = Math.round(transport.ticks + (0.04 * transport.bpm.value * transport.PPQ) / 60)
    const loopStartTicks = startAtTicks + Math.round((this.rangeBeats - beat) * transport.PPQ)
    const loopEndTicks = Math.round(this.rangeBeats * transport.PPQ)
    const addPart = (events: SongEvent[], atTicks: number, loop: boolean, endTicks: number) => {
      const partEvents = events.map((event) => ({
        ...event,
        time: `${Math.round((event.time * project.bpm * transport.PPQ) / 60)}i`,
      })) as unknown as SongEvent[]
      const part = new Tone.Part<SongEvent>((time, event) => {
        if (event.kind === 'metronome') {
          this.metronome?.triggerAttackRelease('C6', 0.035, time, event.velocity ?? 0.5)
          return
        }
        if (event.kind === 'drums') {
          if (event.piece) this.channels.get('drums')?.kit?.trigger(event.piece, time, event.velocity ?? 0.75)
          return
        }
        const channel = this.channels.get(event.kind)
        if (channel?.voice && event.notes) channel.voice.triggerAttackRelease(event.notes, event.duration ?? 0.2, time, event.velocity ?? 0.7)
        if (event.kind === 'chords' && event.sectionId && typeof event.chordIndex === 'number') {
          Tone.getDraw().schedule(() => this.playheadCallback?.(event.sectionId as string, event.chordIndex as number), time)
        }
      }, partEvents)
      part.loop = loop
      part.loopEnd = `${endTicks}i`
      part.start(`${atTicks}i`)
      this.parts.push(part)
    }

    const tailEvents = songEvents(project, sections, beat)
    const scheduledTailEvents = opts.retrigger ? tailEvents : tailEvents.filter((event) => event.time > 0.02)
    addPart(scheduledTailEvents, startAtTicks, false, Math.round((this.rangeBeats - beat) * transport.PPQ))
    addPart(songEvents(project, sections, 0), loopStartTicks, true, loopEndTicks)
    if (project.metronome) {
      this.metronome ??= new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } }).connect(ensureGraph().master)
      const tailClicks = Array.from({ length: Math.ceil(this.rangeBeats - beat) }, (_, index) => ({
        time: secondsAtBeat(index + Math.ceil(beat) - beat, project.bpm),
        kind: 'metronome' as const,
        velocity: (index + Math.ceil(beat)) % 4 === 0 ? 0.68 : 0.28,
      }))
      const loopClicks = Array.from({ length: Math.ceil(this.rangeBeats) }, (_, index) => ({
        time: secondsAtBeat(index, project.bpm),
        kind: 'metronome' as const,
        velocity: index % 4 === 0 ? 0.68 : 0.28,
      }))
      addPart(tailClicks, startAtTicks, false, Math.round((this.rangeBeats - beat) * transport.PPQ))
      addPart(loopClicks, loopStartTicks, true, loopEndTicks)
    }
  }

  getPlayheadBeat(): number {
    if (!this.currentProject || this.rangeBeats <= 0) return 0
    const transport = Tone.getTransport()
    const elapsedBeats = Math.max(0, (transport.ticks - this.transportStartTicks) / transport.PPQ)
    return (this.startBeat + elapsedBeats) % this.rangeBeats
  }

  getPlayheadPosition(): { beat: number; sectionId: string; chordIndex: number } | null {
    if (!this.currentProject) return null
    const beat = this.getPlayheadBeat()
    let offset = 0
    for (const sectionId of this.sectionIds) {
      const section = this.currentProject.sections.find((item) => item.id === sectionId)
      if (!section) continue
      const length = sectionBeats(section)
      if (beat < offset + length) {
        const within = beat - offset
        let chordOffset = 0
        const index = section.chords.findIndex((slot) => {
          const inSlot = within < chordOffset + slot.beats
          chordOffset += slot.beats
          return inSlot
        })
        return { beat: within, sectionId, chordIndex: Math.max(0, index) }
      }
      offset += length
    }
    return null
  }

  playNotes(notes: string[], duration = 0.5): void {
    const voice = this.channels.get('chords')?.voice ?? this.channels.get('melody')?.voice
    voice?.triggerAttackRelease(notes, duration)
  }

  stop(): void {
    const transport = Tone.getTransport()
    if (this.updateTimer !== null) window.clearTimeout(this.updateTimer)
    this.updateTimer = null
    if (this.pendingSectionSwitch !== null) transport.clear(this.pendingSectionSwitch)
    this.pendingSectionSwitch = null
    for (const part of this.parts) {
      part.stop()
      part.dispose()
    }
    this.parts = []
    transport.stop()
    transport.cancel(0)
    for (const channel of this.channels.values()) channel.voice?.releaseAll()
  }

  get isPlaying(): boolean {
    return Tone.getTransport().state === 'started'
  }
}

export const songAudio = new SongAudioEngine()

export async function renderSong(project: Project): Promise<AudioBuffer> {
  const sections = project.sections
  const lengthBeats = sections.reduce((sum, section) => sum + sectionBeats(section), 0)
  const tail = 2.5
  const tracks = project.tracks
  const hasSolo = tracks.some((track) => track.solo)
  const events = songEvents(project, sections, 0)
  const duration = secondsAtBeat(lengthBeats, project.bpm) + tail
  const rendered = await Tone.Offline(async (offlineContext) => {
    const transport = offlineContext.transport
    transport.bpm.value = project.bpm
    const limiter = new Tone.Limiter(-1).toDestination()
    const reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.22 }).connect(limiter)
    await reverb.generate()
    const master = new Tone.Gain(project.masterVolume).connect(reverb)
    const channels = new Map<TrackKind, SongChannel>()
    for (const track of tracks) {
      const gain = new Tone.Gain(track.mute || (hasSolo && !track.solo) ? 0 : track.volume).connect(master)
      const channel: SongChannel = { config: track, gain, voice: voiceForTrack(track, gain), kit: track.kind === 'drums' ? buildDrumKit(gain) : null }
      channels.set(track.kind, channel)
      if (channel.voice) await channel.voice.loaded
    }
    const metronome = project.metronome
      ? new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } }).connect(master)
      : null
    const allEvents = [...events]
    if (metronome) {
      for (let beat = 0; beat < lengthBeats; beat++) allEvents.push({ time: secondsAtBeat(beat, project.bpm), kind: 'metronome', velocity: beat % 4 === 0 ? 0.68 : 0.28 })
    }
    const part = new Tone.Part<SongEvent>((time, event) => {
      if (event.kind === 'metronome') {
        metronome?.triggerAttackRelease('C6', 0.035, time, event.velocity)
      } else if (event.kind === 'drums') {
        if (event.piece) channels.get('drums')?.kit?.trigger(event.piece, time, event.velocity ?? 0.75)
      } else {
        const channel = channels.get(event.kind)
        if (channel?.voice && event.notes) channel.voice.triggerAttackRelease(event.notes, event.duration ?? 0.2, time, event.velocity ?? 0.7)
      }
    }, allEvents)
    part.start(0)
    transport.start(0)
  }, duration)
  return rendered.get() as AudioBuffer
}
