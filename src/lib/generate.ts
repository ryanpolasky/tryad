import { DRUM_STYLES, type DrumPiece } from './drums'
import { bassPitchClass, diatonicChords, generateProgression, keySignaturePrefersFlats, regenerateChordInProgression, SCALES, ALL_KEYS } from './theory'
import type { Chord, Extension, MoodId, PitchClass, ScaleId } from './theory'
import { makeSection, sectionBeats, sectionRoleForName } from './project'
import type { DrumGrid, NoteEvent, Project, Section, SectionRole, TrackConfig } from './project'

export type MelodyStyle = 'flowing' | 'rhythmic' | 'sparse' | 'arp'
export type BassStyle = 'groove' | 'root' | 'pulse' | 'rootFifth' | 'octave' | 'walking'

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function freshRng(): () => number {
  const seed = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(seed)
  else seed[0] = Math.floor(Math.random() * 4294967296)
  return mulberry32(seed[0])
}

function choose<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]
}

interface ChordGenerationOptions {
  avoidTemplateIdx?: number
  forbiddenSequences?: Set<string>
}

interface GeneratedChordSequence {
  chords: Chord[]
  beats: number[]
  templateIdx: number
}

const isMajorish = (scaleId: ScaleId) => ['major', 'lydian', 'mixolydian'].includes(scaleId)
const chordSequenceKey = (chords: Chord[]) => chords.map((chord) => chord.symbol).join('|')

function sequenceForRole(
  project: Project,
  section: Section,
  rng: () => number,
  options: ChordGenerationOptions,
): GeneratedChordSequence {
  const role = section.role ?? sectionRoleForName(section.name)
  const slots = section.chords.length ? section.chords : [{ beats: 4, locked: false } as Section['chords'][number]]
  const length = slots.length
  const avoidTemplateIdx = options.avoidTemplateIdx
  const forbidden = options.forbiddenSequences ?? new Set<string>()
  const diatonic = diatonicChords(project.key, SCALES[project.scaleId], project.extension, project.keySpelling)
  const major = isMajorish(project.scaleId)
  let latest: GeneratedChordSequence = { chords: [], beats: [], templateIdx: -1 }

  for (let attempt = 0; attempt < 9; attempt++) {
    const progression = generateProgression({
      key: project.key,
      keySpelling: project.keySpelling,
      scaleId: project.scaleId,
      moodId: project.moodId,
      length,
      extension: project.extension,
      rng,
      avoidTemplateIdx: role === 'chorus' ? avoidTemplateIdx : undefined,
    })
    const chords = [...progression.chords]
    if (role === 'bridge' && chords.length) {
      const firstDegree = choose(major ? [6, 4] : [6, 4], rng)
      chords[0] = diatonic[firstDegree - 1] ?? chords[0]
      if (chords.length > 1) {
        const harmonicDominant = diatonicChords(project.key, SCALES.harmonicMinor, project.extension, project.keySpelling)[4]
        chords[chords.length - 1] = major ? diatonic[4] : harmonicDominant ? { ...harmonicDominant, borrowed: true } : diatonic[6] ?? chords[chords.length - 1]
      }
    }
    if (role === 'chorus' && chords.length) {
      const allowedStarts = major ? [1, 4] : [1, 6]
      if (attempt < 8 && !allowedStarts.includes(chords[0].degree)) continue
      if (!allowedStarts.includes(chords[0].degree)) chords[0] = diatonic[choose(allowedStarts, rng) - 1] ?? chords[0]
    }

    let beats = slots.map((slot) => slot.beats)
    if (
      role === 'chorus' &&
      slots[slots.length - 1]?.beats === 4 &&
      !slots[slots.length - 1]?.locked &&
      rng() < 0.4
    ) {
      const harmonic = diatonicChords(project.key, SCALES.harmonicMinor, project.extension, project.keySpelling)
      const split = major
        ? choose([[4, 5], [2, 5]], rng).map((degree) => diatonic[degree - 1])
        : [
            diatonic[3],
            choose([
            harmonic[4] ? { ...harmonic[4], borrowed: true } : undefined,
            diatonic[6],
          ], rng),
          ]
      const validSplit = split.filter((chord): chord is Chord => Boolean(chord))
      if (validSplit.length === 2) {
        chords.splice(chords.length - 1, 1, ...validSplit)
        beats = [...beats.slice(0, -1), 2, 2]
      }
    }
    for (let index = 1; index < chords.length; index++) {
      if (chords[index - 1].root !== chords[index].root) continue
      const replaceIndex = index === chords.length - 1 && ['chorus', 'bridge'].includes(role) ? index - 1 : index
      if (slots[replaceIndex]?.locked || slots[index]?.locked) continue
      const previousRoot = chords[replaceIndex - 1]?.root
      const nextRoot = chords[replaceIndex + 1]?.root
      const alternatives = [2, 4, 6]
        .map((degree) => diatonic[degree - 1])
        .filter((chord): chord is Chord => Boolean(chord) && chord.root !== previousRoot && chord.root !== nextRoot)
      if (alternatives.length) chords[replaceIndex] = choose(alternatives, rng)
    }
    const scalePitchClasses = new Set(SCALES[project.scaleId].intervals.map((interval) => (project.key + interval) % 12))
    chords.forEach((chord, index) => {
      if (chord.borrowed || chord.secondaryOf !== undefined || chord.pitchClasses.every((pitchClass) => scalePitchClasses.has(pitchClass))) return
      const replacement = diatonic[chord.degree - 1] ?? diatonic.find((candidate) =>
        candidate.root !== chords[index - 1]?.root && candidate.root !== chords[index + 1]?.root
      )
      if (replacement) chords[index] = replacement
    })
    latest = { chords, beats, templateIdx: progression.templateIdx ?? -1 }
    const startsWell = role !== 'chorus' || (major ? [1, 4] : [1, 6]).includes(chords[0]?.degree ?? 0)
    if (startsWell && !forbidden.has(chordSequenceKey(chords))) return latest
  }

  if (latest.chords.length) {
    for (let index = 0; index < latest.chords.length; index++) {
      if (role === 'bridge' && (index === 0 || index === latest.chords.length - 1)) continue
      if (role === 'chorus' && index === 0) continue
      if (slots[index]?.locked) continue
      const alternatives = diatonic.filter((chord) =>
        chord.symbol !== latest.chords[index].symbol &&
        chord.root !== latest.chords[index - 1]?.root &&
        chord.root !== latest.chords[index + 1]?.root
      )
      for (const alternate of alternatives) {
        const chords = latest.chords.map((chord, chordIndex) => chordIndex === index ? alternate : chord)
        if (!forbidden.has(chordSequenceKey(chords))) return { ...latest, chords }
      }
    }
  }
  return latest
}

export function generateChords(project: Project, section: Section, rng = freshRng(), options: ChordGenerationOptions = {}): Section {
  const otherSections = project.sections.filter((item) => item.id !== section.id)
  const forbiddenSequences = options.forbiddenSequences ?? new Set(otherSections.map((item) => chordSequenceKey(item.chords.map((slot) => slot.chord))))
  const verseTemplate = (section.role ?? sectionRoleForName(section.name)) === 'chorus'
    ? project.sections.find((item) => (item.role ?? sectionRoleForName(item.name)) === 'verse')?.templateIdx
    : undefined
  const sequence = sequenceForRole(project, section, rng, {
    ...options,
    avoidTemplateIdx: options.avoidTemplateIdx ?? verseTemplate,
    forbiddenSequences,
  })
  return {
    ...section,
    templateIdx: sequence.templateIdx,
    chords: sequence.chords.map((chord, index) => {
      const slot = section.chords[index] ?? section.chords[section.chords.length - 1]
      if (slot?.locked) return slot
      return {
        ...(slot ?? { beats: sequence.beats[index] ?? 4, inversion: 0, octave: 0, locked: false }),
        chord,
        beats: sequence.beats[index] ?? slot?.beats ?? 4,
        inversion: 0,
      }
    }),
  }
}

type RhythmNote = [number, number]
export interface MelodyHook {
  steps: number[]
  rhythm: RhythmNote[]
}
const MELODY_RHYTHMS: Record<MelodyStyle, RhythmNote[][]> = {
  flowing: [
    [[0, 1], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 1.5]],
    [[0, 0.75], [0.75, 0.25], [1, 1], [2, 1], [3, 1]],
    [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
    [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 1.5]],
    [[0, 1], [1, 1], [2, 0.75], [2.75, 0.25], [3, 1]],
    [[0, 0.5], [0.5, 1.5], [2, 0.5], [2.5, 0.5], [3, 1]],
  ],
  rhythmic: [
    [[0, 0.5], [0.75, 0.25], [1.5, 0.5], [2, 0.5], [2.75, 0.75]],
    [[0, 0.75], [1, 0.25], [1.75, 0.25], [2, 0.5], [3, 0.75]],
    [[0, 0.5], [1, 0.5], [1.25, 0.25], [2, 0.75], [3.25, 0.5]],
    [[0.25, 0.5], [1, 0.25], [1.5, 0.5], [2.5, 0.5], [3, 0.75]],
    [[0, 0.5], [0.5, 0.5], [1.5, 0.25], [2, 0.5], [2.75, 0.25], [3.25, 0.5]],
    [[0, 0.75], [1.25, 0.5], [2, 0.5], [2.75, 0.25], [3, 0.75]],
  ],
  sparse: [
    [[0, 1.5], [2, 2]],
    [[0, 2], [2.5, 1.5]],
    [[0.5, 1], [2, 2]],
    [[0, 1], [1.5, 2.5]],
    [[0, 2.5], [3, 1]],
    [[0, 1.5], [2.5, 1.5]],
  ],
  arp: [
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5]],
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
    [[0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
    [[0, 0.5], [0.5, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3.5, 0.5]],
  ],
}

function contourMotif(length: number, rng: () => number): number[] {
  const motif: number[] = []
  const leapAt = length > 4 && rng() < 0.45 ? 1 + Math.floor(rng() * (length - 2)) : -1
  for (let index = 1; index < length; index++) {
    if (index === leapAt) motif.push(choose([-4, -3, 3, 4], rng))
    else if (index === leapAt + 1) motif.push(motif[index - 1] > 0 ? -1 : 1)
    else motif.push(choose([-2, -1, -1, 1, 1, 2], rng))
  }
  return motif
}

function rhythmApostrophe(rhythm: RhythmNote[], rng: () => number): RhythmNote[] {
  const result = rhythm.map(([start, duration]) => [start, duration] as RhythmNote)
  if (result.length > 3 && rng() < 0.5) result.splice(Math.floor(1 + rng() * (result.length - 2)), 1)
  else if (result.length > 1) {
    const last = result[result.length - 1]
    last[0] = Math.max(result[result.length - 2][0] + 0.25, Math.min(3.5, last[0] + (rng() < 0.5 ? -0.25 : 0.25)))
  }
  return result.sort((a, b) => a[0] - b[0])
}

function chordAt(section: Section, beat: number): Chord {
  let offset = 0
  for (const slot of section.chords) {
    if (beat < offset + slot.beats) return slot.chord
    offset += slot.beats
  }
  return section.chords[section.chords.length - 1]?.chord ?? diatonicChords(0, SCALES.major, 'triad')[0]
}

function nearestMidi(target: number, pitchClasses: number[], low: number, high: number): number {
  const choices = Array.from({ length: high - low + 1 }, (_, index) => low + index)
    .filter((midi) => pitchClasses.includes(midi % 12))
  return choices.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0] ?? Math.max(low, Math.min(high, target))
}

function scaleMidiList(key: PitchClass, scaleId: ScaleId, low: number, high: number): number[] {
  const pcs = new Set(SCALES[scaleId].intervals.map((interval) => (key + interval) % 12))
  return Array.from({ length: high - low + 1 }, (_, index) => low + index).filter((midi) => pcs.has(midi % 12))
}

function fitStep(note: number, previous: number, direction: number, low: number, high: number): number {
  let next = note
  if (next < low || next > high) next = previous - direction
  return Math.max(low, Math.min(high, next))
}

export function generateMelody(
  section: Section,
  key: PitchClass,
  scaleId: ScaleId,
  style: MelodyStyle = 'flowing',
  rng = freshRng(),
  hook?: MelodyHook,
): NoteEvent[] {
  const role = section.role ?? sectionRoleForName(section.name)
  const center = role === 'chorus' ? 72 : role === 'bridge' ? 69 : 67
  const registerLow = center - 7
  const registerHigh = center + 9
  const scaleNotes = scaleMidiList(key, scaleId, center - 24, center + 24)
  const total = sectionBeats(section)
  const baseRhythm = hook?.rhythm ?? choose(MELODY_RHYTHMS[style] ?? MELODY_RHYTHMS.flowing, rng)
  const baseMotif = hook?.steps.length ? hook.steps : contourMotif(baseRhythm.length, rng)
  let previousMidi = center
  let previousDirection = 1
  const notes: NoteEvent[] = []
  const barCount = Math.ceil(total / 4)

  for (let bar = 0; bar < barCount; bar++) {
    const phrasePosition = bar % 4
    const rhythm = phrasePosition === 1
      ? rhythmApostrophe(baseRhythm, rng)
      : phrasePosition === 3
        ? (bar + 1) * 4 >= total
          ? [[0, 0.75], [2.5, 1.5]] as RhythmNote[]
          : [[0, 0.75], [2.5, 1.5]] as RhythmNote[]
        : baseRhythm.map(([start, duration]) => [start, duration] as RhythmNote)
    const starts = rhythm.filter(([start]) => bar * 4 + start < total)
    const steps = baseMotif.slice(0, starts.length)

    starts.forEach(([startInBar, duration], noteIndex) => {
      const start = bar * 4 + startInBar
      const chord = chordAt(section, start)
      const strong = Math.abs(startInBar % 2) < 0.001
      const motifStep = steps[noteIndex - 1] ?? 0
      const previousScale = scaleNotes.reduce((best, midi, index) =>
        Math.abs(midi - previousMidi) < Math.abs(scaleNotes[best] - previousMidi) ? index : best, 0)
      let predicted = scaleNotes[Math.max(0, Math.min(scaleNotes.length - 1, previousScale + motifStep))] ?? previousMidi
      predicted = fitStep(predicted, previousMidi, motifStep || previousDirection, registerLow, registerHigh)
      let midi = strong
        ? nearestMidi(predicted, chord.pitchClasses, registerLow, registerHigh)
        : nearestMidi(predicted, SCALES[scaleId].intervals.map((interval) => (key + interval) % 12), registerLow, registerHigh)
      if (Math.abs(midi - previousMidi) > 12) {
        const candidates = strong ? chord.pitchClasses : SCALES[scaleId].intervals.map((interval) => (key + interval) % 12)
        midi = nearestMidi(previousMidi, candidates, registerLow, registerHigh)
      }
      if (midi === previousMidi && noteIndex > 0 && notes[notes.length - 1]?.midi === previousMidi) {
        const alternatives = Array.from({ length: registerHigh - registerLow + 1 }, (_, index) => registerLow + index)
          .filter((candidate) => candidate !== midi && Math.abs(candidate - midi) <= 4 && Math.abs(candidate - previousMidi) <= 12)
          .filter((candidate) => strong ? chord.pitchClasses.includes(candidate % 12) : scaleNotes.includes(candidate))
        if (alternatives.length) midi = alternatives.sort((a, b) => Math.abs(a - predicted) - Math.abs(b - predicted))[0]
      }
      if (midi !== previousMidi) previousDirection = Math.sign(midi - previousMidi)
      const nextStart = starts[noteIndex + 1]?.[0]
      const barRemaining = Math.min(4, total - bar * 4)
      const maxDuration = Math.max(0.125, (nextStart ?? barRemaining) - startInBar)
      const velocity = (Math.abs(startInBar % 1) < 0.001
        ? startInBar % 4 === 0 ? 0.8 : 0.7
        : 0.6) + (rng() * 0.1 - 0.05)
      notes.push({ start, dur: Math.min(duration, maxDuration, total - start), midi, vel: Math.max(0.1, Math.min(1, velocity)) })
      previousMidi = midi
    })

    if (phrasePosition === 1 && starts.length) {
      const note = notes[notes.length - 1]!
      const chord = chordAt(section, note.start)
      const nonRoot = chord.pitchClasses.filter((pitch) => pitch !== chord.root)
      note.midi = nearestMidi(note.midi, nonRoot.length ? nonRoot : chord.pitchClasses, registerLow, registerHigh)
      previousMidi = note.midi
    }
  }

  if (notes.length) {
    const last = notes[notes.length - 1]!
    const minimumStart = notes.length > 1 ? notes[notes.length - 2].start + 0.125 : 0
    const lastChordStart = Math.max(0, total - (section.chords[section.chords.length - 1]?.beats ?? total))
    last.start = Math.max(minimumStart, lastChordStart, Math.min(last.start, Math.max(lastChordStart, total - 1.5)))
    const endingChord = chordAt(section, last.start)
    const tonicOrThird = [endingChord.root, (endingChord.root + (endingChord.intervals[1] ?? 3)) % 12]
    last.midi = nearestMidi(last.midi, tonicOrThird, registerLow, registerHigh)
    last.dur = Math.max(0.125, total - last.start)
  }

  notes.sort((a, b) => a.start - b.start)
  notes.forEach((note, index) => {
    const nextStart = notes[index + 1]?.start ?? total
    note.dur = Math.max(0.125, Math.min(note.dur, nextStart - note.start, total - note.start))
  })
  return notes
}

function nearestBassMidi(rootPc: number, previous: number): number {
  return nearestMidi(previous, [rootPc], 28, 52)
}

export function generateBass(section: Section, style: BassStyle = 'groove', rng = freshRng(), key: PitchClass = 0, scaleId: ScaleId = 'major'): NoteEvent[] {
  const slots: { slot: Section['chords'][number]; start: number; end: number }[] = []
  let offset = 0
  section.chords.forEach((slot) => {
    slots.push({ slot, start: offset, end: offset + slot.beats })
    offset += slot.beats
  })
  const total = sectionBeats(section)
  const slotAt = (beat: number) => slots.find((item) => beat < item.end) ?? slots[slots.length - 1]
  const events: NoteEvent[] = []
  let previous = 40

  if (style === 'groove') {
    const onsetSet = new Set<number>()
    section.drums?.steps.kick?.forEach((hit, step) => { if (hit && step / 4 < total) onsetSet.add(step / 4) })
    slots.forEach((item) => onsetSet.add(item.start))
    const chordChanges = slots.slice(1).map((item) => item.start)
    chordChanges.forEach((change) => {
      if (change >= 0.5 && rng() < 0.5 && !onsetSet.has(change - 0.5)) onsetSet.add(change - 0.5)
    })
    const onsets = [...onsetSet].filter((beat) => beat < total).sort((a, b) => a - b)
    onsets.forEach((start, index) => {
      const current = slotAt(start)
      if (!current) return
      const isChordStart = Math.abs(start - current.start) < 0.001
      const isKick = section.drums?.steps.kick?.[Math.round(start * 4)] ?? false
      let pitchClass = bassPitchClass(current.slot.chord, current.slot.inversion)
      if (!isChordStart && !isKick) {
        const nextRoot = slots.find((item) => item.start > start)?.slot.chord.root
        const scalePcs = SCALES[scaleId].intervals.map((interval) => (key + interval) % 12)
        const approach = nextRoot === undefined ? pitchClass : ((nextRoot + (rng() < 0.5 ? 11 : 1)) % 12)
        pitchClass = scalePcs.includes(approach) || rng() < 0.5 ? approach : pitchClass
      }
      const midi = nearestBassMidi(pitchClass, previous)
      const nextStart = onsets[index + 1] ?? total
      events.push({ start, dur: Math.max(0.125, Math.min(1, nextStart - start, total - start)), midi, vel: isChordStart ? 0.82 : isKick ? 0.78 : 0.62 })
      previous = midi
    })
    return events
  }

  slots.forEach(({ slot, start, end }, index) => {
    const rootPc = bassPitchClass(slot.chord, slot.inversion)
    const root = nearestBassMidi(rootPc, previous)
    const nextPc = slots[index + 1]?.slot.chord.root
    const step = style === 'pulse' ? 0.5 : style === 'rootFifth' || style === 'octave' || style === 'walking' ? 1 : end - start
    for (let beat = 0; beat < slot.beats - 0.001; beat += step) {
      let midi = root
      if (style === 'octave' && Math.floor(beat) % 2) midi = nearestBassMidi(rootPc, root + 12)
      else if (style === 'rootFifth' && Math.floor(beat) % 2) midi = nearestBassMidi((rootPc + 7) % 12, previous)
      else if (style === 'walking' && beat > 0) {
        const scalePcs = SCALES[scaleId].intervals.map((interval) => (key + interval) % 12)
        const target = root + choose([-5, -2, 2, 3, 5], rng)
        midi = nearestMidi(target, scalePcs, 28, 52)
        if (beat >= slot.beats - 1 && nextPc !== undefined) midi = nearestBassMidi((nextPc + 11) % 12, midi)
      }
      const duration = style === 'root' ? slot.beats : Math.min(step * 0.88, slot.beats - beat)
      events.push({ start: start + beat, dur: duration, midi, vel: beat === 0 ? 0.82 : 0.7 })
      previous = midi
    }
  })
  return events.sort((a, b) => a.start - b.start).map((event, index, all) => ({
    ...event,
    dur: Math.min(event.dur, (all[index + 1]?.start ?? total) - event.start, total - event.start),
  }))
}

export function generateDrums(section: Section, styleId: string, rng = freshRng()): DrumGrid {
  const totalSteps = Math.max(1, Math.ceil(sectionBeats(section) * 4))
  const style = DRUM_STYLES.find((item) => item.id === styleId) ?? DRUM_STYLES[0]
  const pieces: DrumPiece[] = ['kick', 'snare', 'hihat', 'openhat', 'ride', 'rim']
  const steps: DrumGrid['steps'] = {}
  pieces.forEach((piece) => {
    const line = new Array(totalSteps).fill(false) as boolean[]
    for (let index = 0; index < totalSteps; index++) {
      const pattern = style.patterns[Math.floor(index / 16) % style.patterns.length]
      const stepInBar = index % 16
      line[index] = Boolean(pattern?.steps[piece]?.includes(stepInBar))
    }
    steps[piece] = line
  })
  const role = section.role ?? sectionRoleForName(section.name)
  const barCount = Math.ceil(totalSteps / 16)
  if (role === 'verse') {
    steps.openhat = new Array(totalSteps).fill(false)
    steps.hihat = steps.hihat?.map((hit, index) => hit && index % 4 !== 0 && rng() < 0.25 ? false : hit)
  } else if (role === 'chorus') {
    for (let bar = 0; bar < barCount; bar++) {
      const first = bar * 16
      const andOfFour = first + 14
      if (first < totalSteps) steps.kick![first] = true
      if (andOfFour < totalSteps) steps.openhat![andOfFour] = true
    }
  } else if (role === 'bridge') {
    steps.snare = new Array(totalSteps).fill(false)
    steps.hihat = new Array(totalSteps).fill(false)
    for (let bar = 0; bar < barCount; bar++) {
      const first = bar * 16
      if (first + 8 < totalSteps) steps.snare![first + 8] = true
      for (let beat = 0; beat < 4; beat++) if (first + beat * 4 < totalSteps) steps.hihat![first + beat * 4] = true
    }
  }
  const lastBar = Math.max(0, barCount - 1)
  const kickFillBeat = lastBar * 16 + 8
  const snareFillStart = lastBar * 16 + 12
  if (kickFillBeat < totalSteps) steps.kick![kickFillBeat] = true
  for (let step = snareFillStart; step < Math.min(totalSteps, snareFillStart + 4); step++) steps.snare![step] = true
  return { steps }
}

export interface VibeSelection {
  moodId: MoodId
  scaleId: ScaleId
  bpm: number
  extension: Extension
  drumStyle: string
  instrument: string
  melodyInstrument?: string
  melodyStyle?: MelodyStyle
  bassStyle?: BassStyle
  playMode?: TrackConfig['playMode']
  key?: PitchClass
  keySpelling?: Project['keySpelling']
  description: string
}

interface VibeRule {
  pattern: RegExp
  description: string
  patch: Partial<VibeSelection>
  overlayOnly?: boolean
}

const VIBE_RULES: VibeRule[] = [
  { pattern: /\b(sad|rain|melancholy|heartbreak)\b/i, description: 'sad minor, slow and spacious', patch: { moodId: 'sad', scaleId: 'minor', bpm: 75, drumStyle: 'boom', melodyStyle: 'sparse' } },
  { pattern: /\b(lofi|lo-fi|chill|study|coffee)\b/i, description: 'lo-fi keys and a laid-back groove', patch: { moodId: 'lofi', scaleId: 'minor', bpm: 80, drumStyle: 'boom', instrument: 'epiano', melodyInstrument: 'epiano', melodyStyle: 'flowing' }, overlayOnly: true },
  { pattern: /\b(trap|drill)\b/i, description: 'minor trap with a halftime pocket', patch: { moodId: 'sad', scaleId: 'minor', bpm: 140, drumStyle: 'halftime', instrument: 'pluck', melodyInstrument: 'lead', melodyStyle: 'rhythmic', bassStyle: 'groove' } },
  { pattern: /\b(house|edm|dance)\b/i, description: 'four-on-the-floor dance energy', patch: { moodId: 'happy', scaleId: 'major', bpm: 124, drumStyle: 'four', instrument: 'pad', melodyInstrument: 'pluck', melodyStyle: 'arp', bassStyle: 'groove' } },
  { pattern: /\b(funk|disco)\b/i, description: 'modal funk with a tight groove', patch: { moodId: 'rnb', scaleId: 'mixolydian', bpm: 112, drumStyle: 'four', instrument: 'epiano', melodyInstrument: 'guitar', melodyStyle: 'rhythmic', bassStyle: 'groove' } },
  { pattern: /\b(rock|punk)\b/i, description: 'bright rock with a driving backbeat', patch: { moodId: 'happy', scaleId: 'major', bpm: 128, drumStyle: 'four', instrument: 'guitar', melodyInstrument: 'lead', melodyStyle: 'rhythmic' } },
  { pattern: /\b(gospel|church)\b/i, description: 'gospel color with seventh chords', patch: { moodId: 'happy', scaleId: 'major', bpm: 96, extension: 'seventh', instrument: 'piano', melodyInstrument: 'epiano', melodyStyle: 'flowing' } },
  { pattern: /\b(country|folk)\b/i, description: 'open country-folk guitar', patch: { moodId: 'happy', scaleId: 'major', bpm: 100, instrument: 'guitar', melodyInstrument: 'guitar', melodyStyle: 'sparse' } },
  { pattern: /\b(game|8.?bit|chiptune)\b/i, description: 'bright chiptune with a nimble lead', patch: { moodId: 'happy', scaleId: 'major', bpm: 140, instrument: 'pluck', melodyInstrument: 'lead', melodyStyle: 'arp' } },
  { pattern: /\b(romantic|love)\b/i, description: 'warm romantic pop', patch: { moodId: 'pop', scaleId: 'major', bpm: 84, instrument: 'epiano', melodyInstrument: 'piano', melodyStyle: 'flowing' } },
  { pattern: /\b(anxious|tense)\b/i, description: 'tense harmonic minor', patch: { moodId: 'epic', scaleId: 'harmonicMinor', bpm: 100, instrument: 'pad', melodyInstrument: 'lead', melodyStyle: 'rhythmic' } },
  { pattern: /\b(epic|trailer|cinematic)\b/i, description: 'cinematic minor with a wide pad', patch: { moodId: 'cinematic', scaleId: 'minor', bpm: 100, instrument: 'pad', melodyInstrument: 'lead' } },
  { pattern: /\b(jazz|smooth|brush)\b/i, description: 'smooth jazz with extended chords and brushes', patch: { moodId: 'jazz', scaleId: 'major', bpm: 110, extension: 'ninth', drumStyle: 'jazz', instrument: 'epiano', melodyInstrument: 'guitar' } },
  { pattern: /\b(happy|sunny|bright)\b/i, description: 'bright major pop', patch: { moodId: 'happy', scaleId: 'major', bpm: 110 } },
  { pattern: /\b(dreamy|ambient|float)\b/i, description: 'dreamy Lydian ambience', patch: { moodId: 'dreamy', scaleId: 'lydian', bpm: 82, instrument: 'pad', melodyInstrument: 'epiano' } },
  { pattern: /\b(rnb|r&b|soul)\b/i, description: 'warm R&B with ninth chords', patch: { moodId: 'rnb', scaleId: 'major', bpm: 92, extension: 'ninth', instrument: 'epiano', melodyInstrument: 'guitar' } },
  { pattern: /\b(dark|phrygian|ominous)\b/i, description: 'dark Phrygian tension', patch: { moodId: 'epic', scaleId: 'phrygian', bpm: 92, instrument: 'pad', melodyInstrument: 'lead' } },
]

const KEY_TO_PC: Record<string, PitchClass> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
}

export function matchVibe(text: string, project: Project, rng = freshRng()): VibeSelection {
  const vibe = text.trim()
  const selection: VibeSelection = {
    moodId: project.moodId,
    scaleId: project.scaleId,
    bpm: project.bpm,
    extension: project.extension,
    drumStyle: project.tracks.find((track) => track.kind === 'drums')?.style ?? 'boom',
    instrument: project.tracks.find((track) => track.kind === 'chords')?.instrument ?? 'piano',
    description: 'your current settings',
  }
  const matches = VIBE_RULES.flatMap((rule) => {
    const match = rule.pattern.exec(vibe)
    return match ? [{ rule, index: match.index }] : []
  }).sort((a, b) => a.index - b.index)
  let themeMatched = false
  const descriptions: string[] = []
  matches.forEach(({ rule }) => {
    const patch = { ...rule.patch }
    const lofiOverlay = rule.overlayOnly && themeMatched
    if (lofiOverlay) {
      delete patch.moodId
      delete patch.scaleId
      delete patch.bpm
    }
    if (patch.scaleId === 'mixolydian' && rule.pattern.test(vibe)) patch.scaleId = rng() < 0.5 ? 'mixolydian' : 'dorian'
    Object.assign(selection, patch)
    if (patch.moodId || patch.scaleId || patch.bpm) themeMatched = true
    descriptions.push(rule.description)
  })

  const bpmMatch = vibe.match(/\b(\d{2,3})\s*bpm\b/i)
  if (bpmMatch) selection.bpm = Math.max(50, Math.min(200, Number(bpmMatch[1])))
  const keyMatch = vibe.match(/\b(?:in|key(?:\s+of)?)\s+(C#|Db|D#|Eb|F#|Gb|G#|Ab|A#|Bb|Cb|Fb|E#|B#|[A-G])(?:\s+(major|minor|maj|min))?(?![a-z])/i)
    ?? vibe.match(/\b(C#|Db|D#|Eb|F#|Gb|G#|Ab|A#|Bb|[A-G])\s+(major|minor)\b/i)
  if (keyMatch) {
    selection.key = KEY_TO_PC[keyMatch[1]]
    selection.keySpelling = keyMatch[1].toLowerCase().includes('b') ? 'flat' : keyMatch[1].includes('#') ? 'sharp' : undefined
    if (/minor|min/i.test(keyMatch[2] ?? '')) selection.scaleId = 'minor'
    else if (/major|maj/i.test(keyMatch[2] ?? '')) selection.scaleId = 'major'
    descriptions.push(`in ${keyMatch[1]}${keyMatch[2] ? ` ${keyMatch[2]}` : ''}`)
  }
  if (selection.moodId === 'jazz' || selection.moodId === 'rnb') selection.extension = selection.extension === 'triad' ? 'ninth' : selection.extension
  if (descriptions.length) selection.description = descriptions.join(' · ')
  return selection
}

export interface SectionGenerationOptions extends ChordGenerationOptions {
  hook?: MelodyHook
}

export function generateSectionTracks(
  project: Project,
  section: Section,
  rng = freshRng(),
  options: SectionGenerationOptions = {},
): Section {
  const chordTrack = project.tracks.find((track) => track.kind === 'chords')
  const next = chordTrack?.locked ? section : generateChords(project, section, rng, options)
  const tracks: TrackConfig[] = project.tracks
  const melodyTrack = tracks.find((track) => track.kind === 'melody')
  const bassTrack = tracks.find((track) => track.kind === 'bass')
  const drumsTrack = tracks.find((track) => track.kind === 'drums')
  return {
    ...next,
    melody: melodyTrack && !melodyTrack.locked ? generateMelody(next, project.key, project.scaleId, (melodyTrack.style as MelodyStyle) ?? 'flowing', rng, options.hook) : next.melody,
    bass: bassTrack && !bassTrack.locked ? generateBass(next, (bassTrack.style as BassStyle) ?? 'groove', rng, project.key, project.scaleId) : next.bass,
    drums: drumsTrack && !drumsTrack.locked ? generateDrums(next, drumsTrack.style ?? 'boom', rng) : next.drums,
  }
}

function vibeStructure(text: string): { name: string; role: SectionRole }[] {
  if (/\b(short|loop)\b/i.test(text)) return [{ name: 'Verse', role: 'verse' }]
  const roles: SectionRole[] = ['intro', 'verse', 'chorus', 'bridge', 'outro']
  const matched = roles.filter((role) => new RegExp(`\\b${role}\\b`, 'i').test(text))
  const structure = matched.length ? matched : ['verse', 'chorus', 'bridge'] as SectionRole[]
  return structure.map((role) => ({ name: role[0].toUpperCase() + role.slice(1), role }))
}

export function generateVibeProject(project: Project, text: string, rng = freshRng()): { project: Project; description: string } {
  const vibe = matchVibe(text, project, rng)
  const key = vibe.key ?? Math.floor(rng() * 12) as PitchClass
  const bpmJitter = /\b\d{2,3}\s*bpm\b/i.test(text) ? 0 : Math.floor(rng() * 9) - 4
  const defaultKeySpelling = vibe.key !== undefined
    ? vibe.keySpelling
    : keySignaturePrefersFlats(key, SCALES[vibe.scaleId]) ? 'flat' : undefined
  const tracksByKind = new Map(project.tracks.map((track) => [track.kind, track]))
  const defaults: TrackConfig[] = [
    { kind: 'chords', instrument: vibe.instrument, volume: 0.85, mute: false, solo: false, playMode: vibe.playMode ?? 'block' },
    { kind: 'melody', instrument: vibe.melodyInstrument ?? 'lead', volume: 0.8, mute: false, solo: false, style: vibe.melodyStyle ?? 'flowing' },
    { kind: 'bass', instrument: 'bass-electric', volume: 0.8, mute: false, solo: false, style: vibe.bassStyle ?? 'groove' },
    { kind: 'drums', instrument: 'drums', volume: 0.8, mute: false, solo: false, style: vibe.drumStyle },
  ]
  const tracks = defaults.map((fallback) => {
    const current = tracksByKind.get(fallback.kind)
    if (!current) return fallback
    if (current.locked) return current
    return {
      ...fallback,
      ...current,
      instrument: fallback.kind === 'chords' ? vibe.instrument : fallback.kind === 'melody' ? vibe.melodyInstrument ?? current.instrument : current.instrument,
      style: fallback.kind === 'melody' ? vibe.melodyStyle ?? current.style : fallback.kind === 'bass' ? vibe.bassStyle ?? 'groove' : fallback.kind === 'drums' ? vibe.drumStyle : current.style,
      playMode: fallback.kind === 'chords' ? vibe.playMode ?? current.playMode : current.playMode,
    }
  })
  const generated: Project = {
    ...project,
    moodId: vibe.moodId,
    scaleId: vibe.scaleId,
    key,
    keySpelling: defaultKeySpelling,
    bpm: Math.max(50, Math.min(200, vibe.bpm + bpmJitter)),
    extension: vibe.extension,
    tracks,
    sections: [],
    activeSectionId: '',
    loopSection: false,
  }

  const structure = vibeStructure(text)
  const melodyStyle = (tracks.find((track) => track.kind === 'melody')?.style as MelodyStyle) ?? 'flowing'
  const hookRhythm = choose(MELODY_RHYTHMS[melodyStyle] ?? MELODY_RHYTHMS.flowing, rng)
  const hook: MelodyHook = { rhythm: hookRhythm, steps: contourMotif(hookRhythm.length, rng) }
  const sections: Section[] = []
  let verseTemplateIdx: number | undefined
  structure.forEach(({ name, role }) => {
    const seedChords = generateProgression({
      key,
      keySpelling: defaultKeySpelling,
      scaleId: vibe.scaleId,
      moodId: vibe.moodId,
      length: 4,
      extension: vibe.extension,
      rng,
    }).chords
    const base = { ...makeSection(name, seedChords), role }
    const sectionProject = { ...generated, sections }
    const next = generateSectionTracks(sectionProject, base, rng, {
      avoidTemplateIdx: role === 'chorus' ? verseTemplateIdx : undefined,
      forbiddenSequences: new Set(sections.map((item) => chordSequenceKey(item.chords.map((slot) => slot.chord)))),
      hook: role === 'chorus' ? hook : undefined,
    })
    if (role === 'verse' && verseTemplateIdx === undefined) verseTemplateIdx = next.templateIdx
    sections.push(next)
  })
  const finalProject = {
    ...generated,
    sections,
    activeSectionId: sections[0]?.id ?? generated.activeSectionId,
  }
  return { project: finalProject, description: vibe.description }
}

export function diatonicChordSet(key: PitchClass, scaleId: ScaleId, extension: Extension, spelling?: Project['keySpelling']): Chord[] {
  return diatonicChords(key, SCALES[scaleId], extension, spelling)
}

export { regenerateChordInProgression, ALL_KEYS }
