import * as Tone from 'tone'
import type { DrumPiece, DrumStyle } from './drums'
import { getDrumStyle } from './drums'

export type InstrumentId = 'piano' | 'epiano' | 'guitar' | 'pad' | 'pluck'

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
