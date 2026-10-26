import { DRUM_STYLES, type DrumPiece } from './drums'
import { diatonicChords, generateProgression, regenerateChordInProgression, bassPitchClass, SCALES, ALL_KEYS } from './theory'
import type { Chord, Extension, MoodId, PitchClass, ScaleId } from './theory'
import { sectionBeats, type DrumGrid, type NoteEvent, type Project, type Section, type TrackConfig } from './project'

export type MelodyStyle = 'flowing' | 'rhythmic' | 'sparse' | 'arp'
export type BassStyle = 'root' | 'pulse' | 'rootFifth' | 'octave' | 'walking'

function choose<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]
}

export function generateChords(project: Project, section: Section, rng = Math.random): Section {
  const progression = generateProgression({
    key: project.key,
    keySpelling: project.keySpelling,
    scaleId: project.scaleId,
    moodId: project.moodId,
    length: section.chords.length,
    extension: project.extension,
    rng,
  }).chords
  return {
    ...section,
    chords: section.chords.map((slot, index) => slot.locked ? slot : { ...slot, chord: progression[index] ?? slot.chord, inversion: 0 }),
  }
}

export function generateMelody(section: Section, key: PitchClass, scaleId: ScaleId, style: MelodyStyle = 'flowing', rng = Math.random): NoteEvent[] {
  const intervals = SCALES[scaleId].intervals
  const scalePcs = intervals.map((interval) => (key + interval) % 12)
  const notes: NoteEvent[] = []
  let previousMidi = 69
  let offset = 0
  section.chords.forEach((slot, chordIndex) => {
    const chordEnd = offset + slot.beats
    const step = style === 'sparse' ? 2 : style === 'arp' ? 0.5 : style === 'rhythmic' ? 0.5 : choose([0.5, 0.5, 1], rng)
    for (let beat = 0; beat < slot.beats - 0.001; beat += step) {
      const absolute = offset + beat
      const strong = Math.abs(beat % 2) < 0.01
      const chordPcs = slot.chord.pitchClasses
      const candidates = Array.from({ length: 25 }, (_, index) => 60 + index).filter((midi) =>
        (strong ? chordPcs : scalePcs).includes(midi % 12),
      )
      const close = candidates.filter((midi) => Math.abs(midi - previousMidi) <= 4)
      const pool = close.length && rng() < 0.7 ? close : candidates
      const picked = choose(pool, rng)
      const dur = Math.min(step * (style === 'sparse' ? 0.94 : 0.88), chordEnd - beat)
      notes.push({ start: absolute, dur: Math.max(0.25, dur), midi: picked, vel: strong ? 0.78 : 0.62 })
      previousMidi = picked
    }
    offset = chordEnd
    if (chordIndex === section.chords.length - 1 && notes.length) {
      const last = notes[notes.length - 1]
      const finalPitches = Array.from({ length: 25 }, (_, index) => 60 + index).filter((midi) => slot.chord.pitchClasses.includes(midi % 12))
      last.midi = finalPitches.sort((a, b) => Math.abs(a - previousMidi) - Math.abs(b - previousMidi))[0] ?? last.midi
      last.start = Math.max(last.start, sectionBeats(section) - 1)
      last.dur = Math.max(1, sectionBeats(section) - last.start)
    }
  })
  return notes.sort((a, b) => a.start - b.start)
}

export function generateBass(section: Section, style: BassStyle = 'root', rng = Math.random): NoteEvent[] {
  const events: NoteEvent[] = []
  let offset = 0
  section.chords.forEach((slot, index) => {
    const rootPc = bassPitchClass(slot.chord, slot.inversion)
    const root = Array.from({ length: 20 }, (_, n) => 33 + n).find((midi) => midi % 12 === rootPc) ?? 36 + rootPc % 12
    const nextPc = section.chords[index + 1]?.chord.root
    if (style === 'root') {
      events.push({ start: offset, dur: slot.beats, midi: root, vel: 0.8 })
    } else if (style === 'pulse' || style === 'octave') {
      const step = style === 'pulse' ? 0.5 : 1
      for (let beat = 0; beat < slot.beats; beat += step) {
        const octave = style === 'octave' && Math.floor(beat) % 2 ? 12 : 0
        events.push({ start: offset + beat, dur: Math.min(step * 0.88, slot.beats - beat), midi: Math.min(52, root + octave), vel: 0.74 })
      }
    } else if (style === 'rootFifth') {
      for (let beat = 0; beat < slot.beats; beat += 1) {
        events.push({ start: offset + beat, dur: 0.86, midi: beat % 2 ? Math.min(52, root + 7) : root, vel: 0.76 })
      }
    } else {
      for (let beat = 0; beat < slot.beats; beat += 1) {
        let midi = beat === 0 ? root : root + choose([-5, -2, 2, 3, 5], rng)
        if (beat === slot.beats - 1 && nextPc !== undefined) {
          const approach = [nextPc - 1, nextPc + 1].map((pc) => ((pc % 12) + 12) % 12)
          const chromatic = Array.from({ length: 20 }, (_, n) => 33 + n).filter((candidate) => approach.includes(candidate % 12))
          midi = chromatic.sort((a, b) => Math.abs(a - root) - Math.abs(b - root))[0] ?? midi
        }
        midi = Math.max(33, Math.min(52, midi))
        events.push({ start: offset + beat, dur: 0.88, midi, vel: 0.72 })
      }
    }
    offset += slot.beats
  })
  return events
}

export function generateDrums(section: Section, styleId: string, rng = Math.random): DrumGrid {
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
      if (rng() < 0.012 && (piece === 'hihat' || piece === 'kick')) line[index] = true
    }
    steps[piece] = line
  })
  return { steps }
}

export interface VibeSelection {
  moodId: MoodId
  scaleId: ScaleId
  bpm: number
  extension: Extension
  drumStyle: string
  instrument: string
  key?: PitchClass
  keySpelling?: Project['keySpelling']
  description: string
}

export function matchVibe(text: string, project: Project): VibeSelection {
  const vibe = text.toLowerCase()
  const selection: VibeSelection = {
    moodId: project.moodId,
    scaleId: project.scaleId,
    bpm: project.bpm,
    extension: project.extension,
    drumStyle: 'boom',
    instrument: project.tracks.find((track) => track.kind === 'chords')?.instrument ?? 'piano',
    description: 'your current settings',
  }
  const match = (words: string) => words.split('|').some((word) => vibe.includes(word))
  if (match('sad|rain|melancholy|heartbreak')) Object.assign(selection, { moodId: 'sad', scaleId: 'minor', bpm: 75, description: 'sad minor, slow and spacious' })
  else if (match('lofi|chill|study|coffee')) Object.assign(selection, { moodId: 'lofi', scaleId: 'major', bpm: 80, drumStyle: 'boom', instrument: 'epiano', description: 'lofi keys and a laid-back boom-bap groove' })
  else if (match('epic|trailer|cinematic')) Object.assign(selection, { moodId: 'cinematic', scaleId: 'minor', bpm: 100, instrument: 'pad', description: 'cinematic minor with a wide pad' })
  else if (match('jazz|smooth|brush')) Object.assign(selection, { moodId: 'jazz', scaleId: 'major', bpm: 110, extension: 'ninth', drumStyle: 'jazz', instrument: 'epiano', description: 'smooth jazz, extended chords and brushes' })
  else if (match('happy|sunny|bright')) Object.assign(selection, { moodId: 'happy', scaleId: 'major', bpm: 110, description: 'bright major pop' })
  else if (match('dreamy|ambient|float')) Object.assign(selection, { moodId: 'dreamy', scaleId: 'lydian', bpm: 82, instrument: 'pad', description: 'dreamy Lydian ambience' })
  else if (match('rnb|r&b|soul')) Object.assign(selection, { moodId: 'rnb', scaleId: 'major', bpm: 92, extension: 'ninth', instrument: 'epiano', description: 'warm R&B with ninth chords' })
  else if (match('dark|phrygian|ominous')) Object.assign(selection, { moodId: 'epic', scaleId: 'phrygian', bpm: 92, instrument: 'pad', description: 'dark Phrygian tension' })
  const bpmMatch = vibe.match(/\b(\d{2,3})\s*bpm\b/)
  if (bpmMatch) selection.bpm = Math.max(50, Math.min(200, Number(bpmMatch[1])))
  const keyMatch = vibe.match(/\b(?:in\s+)?(C#|Db|D#|Eb|F#|Gb|G#|Ab|A#|Bb|[A-G])\s*(major|minor|maj|min)?\b/i)
  if (keyMatch) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const aliases: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' }
    const note = aliases[keyMatch[1]] ?? keyMatch[1]
    selection.key = names.indexOf(note) as PitchClass
    selection.keySpelling = keyMatch[1].includes('b') ? 'flat' : keyMatch[1].includes('#') ? 'sharp' : undefined
    if (/minor|min/i.test(keyMatch[2] ?? '')) selection.scaleId = 'minor'
    else if (/major|maj/i.test(keyMatch[2] ?? '')) selection.scaleId = 'major'
  }
  if (selection.moodId === 'jazz' || selection.moodId === 'rnb') selection.extension = 'ninth'
  return selection
}

export function generateSectionTracks(project: Project, section: Section, rng = Math.random): Section {
  const next = generateChords(project, section, rng)
  const tracks: TrackConfig[] = project.tracks
  const melodyTrack = tracks.find((track) => track.kind === 'melody')
  const bassTrack = tracks.find((track) => track.kind === 'bass')
  const drumsTrack = tracks.find((track) => track.kind === 'drums')
  return {
    ...next,
    melody: melodyTrack ? generateMelody(next, project.key, project.scaleId, (melodyTrack.style as MelodyStyle) ?? 'flowing', rng) : next.melody,
    bass: bassTrack ? generateBass(next, (bassTrack.style as BassStyle) ?? 'root', rng) : next.bass,
    drums: drumsTrack ? generateDrums(next, drumsTrack.style ?? 'boom', rng) : next.drums,
  }
}

export function generateVibeProject(project: Project, text: string, rng = Math.random): { project: Project; description: string } {
  const vibe = matchVibe(text, project)
  const key = vibe.key ?? project.key
  const generated: Project = {
    ...project,
    moodId: vibe.moodId,
    scaleId: vibe.scaleId,
    key,
    keySpelling: vibe.key !== undefined ? vibe.keySpelling : project.keySpelling,
    bpm: vibe.bpm,
    extension: vibe.extension,
    tracks: project.tracks.map((track) => track.kind === 'chords' ? { ...track, instrument: vibe.instrument } : track.kind === 'drums' ? { ...track, style: vibe.drumStyle } : track),
  }
  const active = generated.sections.find((section) => section.id === generated.activeSectionId) ?? generated.sections[0]
  const next = generateSectionTracks(generated, active, rng)
  const sections = generated.sections.map((section) => section.id === active.id ? next : section)
  if (generated.tracks.some((track) => track.kind === 'drums')) {
    const withDrums = sections.map((section) => section.id === active.id ? { ...section, drums: generateDrums(section, vibe.drumStyle, rng) } : section)
    return { project: { ...generated, sections: withDrums }, description: vibe.description }
  }
  return { project: { ...generated, sections }, description: vibe.description }
}

export function diatonicChordSet(key: PitchClass, scaleId: ScaleId, extension: Extension, spelling?: Project['keySpelling']): Chord[] {
  return diatonicChords(key, SCALES[scaleId], extension, spelling)
}

export { regenerateChordInProgression, ALL_KEYS }
