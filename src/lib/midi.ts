import { Midi } from '@tonejs/midi'
import type { Progression } from './theory'
import { voiceChord, midiToNoteName } from './theory'
import { GM_PERCUSSION, getDrumStyle } from './drums'
import type { DrumPiece } from './drums'
import type { Project, TrackKind } from './project'
import { sectionBeats } from './project'
import { pickInversion } from './theory'

export interface MidiExportOptions {
  bpm: number
  beatsPerChord: number
  /** per-chord beat counts; falls back to beatsPerChord */
  chordBeats?: number[]
  /** per-chord inversion (0 = root, 1 = first, ...) */
  inversions?: number[]
  octave?: number
  drumStyleId?: string
}

export function progressionToMidi(prog: Progression, opts: MidiExportOptions): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(opts.bpm)
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4], measures: 0 }]

  const chordTrack = midi.addTrack()
  chordTrack.name = `${noteName(prog.key)} ${prog.scaleId} - ${prog.moodId}`

  const secondsPerBeat = 60 / opts.bpm
  const octave = opts.octave ?? 4

  let prevTop: number | undefined
  let prevBass: number | undefined
  let time = 0
  for (let i = 0; i < prog.chords.length; i++) {
    const chord = prog.chords[i]
    const chordBeats = opts.chordBeats?.[i] ?? opts.beatsPerChord
    const duration = chordBeats * secondsPerBeat
    const forcedInversion = opts.inversions?.[i]
    const midiNotes = voiceChord(chord, octave, {
      prevTopMidi: prevTop,
      prevBassMidi: prevBass,
      forcedInversion,
    })
    prevTop = midiNotes[midiNotes.length - 1]
    prevBass = midiNotes[0]
    for (const m of midiNotes) {
      chordTrack.addNote({
        midi: m,
        time,
        duration: duration * 0.95,
        velocity: 0.78,
      })
    }
    time += duration
  }
  const progressionSeconds = time

  if (opts.drumStyleId && opts.drumStyleId !== 'off') {
    const style = getDrumStyle(opts.drumStyleId)
    const drumTrack = midi.addTrack()
    drumTrack.name = `drums - ${style.label}`
    // GM percussion = MIDI ch 10 (zero-indexed 9).
    drumTrack.channel = 9
    const sixteenthSeconds = secondsPerBeat / 4
    const barSeconds = 4 * secondsPerBeat
    const loopSeconds = style.bars * barSeconds
    // repeat the drum pattern enough to cover the progression.
    const repeats = Math.max(1, Math.ceil(progressionSeconds / loopSeconds))
    for (let r = 0; r < repeats; r++) {
      style.patterns.forEach((bar, barIdx) => {
        const barOffset = r * loopSeconds + barIdx * barSeconds
        ;(Object.keys(bar.steps) as DrumPiece[]).forEach((piece) => {
          const steps = bar.steps[piece] ?? []
          const vels = bar.vel?.[piece] ?? []
          steps.forEach((step, i) => {
            const start = barOffset + step * sixteenthSeconds
            if (start >= progressionSeconds) return
            drumTrack.addNote({
              midi: GM_PERCUSSION[piece],
              time: start,
              duration: sixteenthSeconds * 0.9,
              velocity: vels[i] ?? 0.9,
            })
          })
        })
      })
    }
  }

  return midi.toArray()
}

export function songToMidi(project: Project, chordsOnly = false): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(project.bpm)
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [4, 4], measures: 0 }]
  const kinds: TrackKind[] = chordsOnly
    ? ['chords']
    : project.tracks.map((track) => track.kind)
  const uniqueKinds = Array.from(new Set(kinds))
  const tracks = new Map<TrackKind, ReturnType<Midi['addTrack']>>()
  uniqueKinds.forEach((kind) => {
    const track = midi.addTrack()
    track.name = kind === 'chords' ? `${project.title} · chords` : kind
    if (kind === 'drums') track.channel = 9
    tracks.set(kind, track)
  })
  const secondsPerBeat = 60 / project.bpm
  let sectionStart = 0
  project.sections.forEach((section) => {
    const chordTrack = tracks.get('chords')
    let chordStart = sectionStart
    let previousTop: number | undefined
    let previousBass: number | undefined
    section.chords.forEach((slot) => {
      if (chordTrack) {
        const inversion = slot.inversion > 0
          ? slot.inversion
          : pickInversion(slot.chord, 4 + slot.octave, { prevTopMidi: previousTop, prevBassMidi: previousBass })
        const notes = voiceChord(slot.chord, 4 + slot.octave, { forcedInversion: inversion })
        previousTop = notes[notes.length - 1]
        previousBass = notes[0]
        notes.forEach((note) => chordTrack.addNote({
          midi: note,
          time: chordStart * secondsPerBeat,
          duration: slot.beats * secondsPerBeat * 0.95,
          velocity: 0.78,
        }))
      }
      chordStart += slot.beats
    })
    ;(['melody', 'bass'] as const).forEach((kind) => {
      const track = tracks.get(kind)
      const notes = section[kind]
      if (!track) return
      notes.forEach((note) => {
        track.addNote({
          midi: note.midi,
          time: (sectionStart + note.start) * secondsPerBeat,
          duration: note.dur * secondsPerBeat,
          velocity: note.vel,
        })
      })
    })
    const drumTrack = tracks.get('drums')
    if (drumTrack && section.drums) {
      ;(Object.keys(section.drums.steps) as DrumPiece[]).forEach((piece) => {
        section.drums?.steps[piece]?.forEach((hit, step) => {
          if (!hit) return
          drumTrack.addNote({
            midi: GM_PERCUSSION[piece],
            time: (sectionStart + step / 4) * secondsPerBeat,
            duration: secondsPerBeat / 4 * 0.9,
            velocity: step % 4 === 0 ? 0.9 : 0.66,
          })
        })
      })
    }
    sectionStart += sectionBeats(section)
  })
  return midi.toArray()
}

function noteName(pc: number): string {
  return midiToNoteName(pc + 60).replace(/\d+$/, '')
}

export function downloadMidi(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.mid') ? filename : `${filename}.mid`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
