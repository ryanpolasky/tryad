import type { DrumPiece } from './drums'
import type { PlayMode } from './audio'
import { generateProgression, diatonicChords, SCALES } from './theory'
import { respellChord } from './theory'
import type { Chord, Extension, KeySpelling, MoodId, PitchClass, ScaleId } from './theory'
import { storage } from './storage'

export interface ChordSlot {
  chord: Chord
  beats: number
  inversion: number
  octave: number
  locked: boolean
}

export interface NoteEvent {
  start: number
  dur: number
  midi: number
  vel: number
}

export interface DrumGrid {
  steps: Partial<Record<DrumPiece, boolean[]>>
}

export type SectionRole = 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro'

export interface Section {
  id: string
  name: string
  role?: SectionRole
  templateIdx?: number
  chords: ChordSlot[]
  melody: NoteEvent[]
  bass: NoteEvent[]
  drums: DrumGrid | null
}

export type TrackKind = 'chords' | 'melody' | 'bass' | 'drums'

export interface TrackConfig {
  kind: TrackKind
  instrument: string
  volume: number
  mute: boolean
  solo: boolean
  locked?: boolean
  playMode?: PlayMode
  style?: string
}

export interface Project {
  v: 2
  id: string
  title: string
  key: PitchClass
  keySpelling?: KeySpelling
  scaleId: ScaleId
  moodId: MoodId
  extension: Extension
  bpm: number
  masterVolume: number
  metronome: boolean
  loopSection: boolean
  tracks: TrackConfig[]
  sections: Section[]
  activeSectionId: string
}

export interface ProjectStore {
  project: Project
  past: Project[]
  future: Project[]
  lastLabel: string | null
  lastTime: number
}

export type ProjectAction =
  | { type: 'update'; project: Project; label?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; project: Project }

const PROJECTS_KEY = 'tryad:studio:projects:v2'
const CURRENT_KEY = 'tryad:studio:current:v2'
const SECTION_NAMES = ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro']

export function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function sectionBeats(section: Section): number {
  return section.chords.reduce((total, slot) => total + slot.beats, 0)
}

export function sectionLengthLabel(beats: number): string {
  const length = Number(beats.toFixed(2))
  return Number.isInteger(length / 4) ? `${length / 4} bars` : `${length} beats`
}

export function sectionRoleForName(name: string): SectionRole {
  const normalized = name.toLowerCase()
  if (/\bchorus\b|\brefrain\b/.test(normalized)) return 'chorus'
  if (/\bbridge\b/.test(normalized)) return 'bridge'
  if (/\bintro\b|\bintroduction\b/.test(normalized)) return 'intro'
  if (/\boutro\b|\bcoda\b/.test(normalized)) return 'outro'
  return 'verse'
}

export function normalizeProject(project: Project): Project {
  const roles: SectionRole[] = ['verse', 'chorus', 'bridge', 'intro', 'outro']
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      locked: track.locked ?? false,
      ...(track.kind === 'bass' && !track.style ? { style: 'groove' } : {}),
    })),
    sections: project.sections.map((section) => ({
      ...section,
      role: roles.includes(section.role as SectionRole) ? section.role : sectionRoleForName(section.name),
    })),
  }
}

export function makeSection(name: string, chords: Chord[], beats = 4): Section {
  return {
    id: createId(),
    name,
    role: sectionRoleForName(name),
    chords: chords.map((chord) => ({ chord, beats, inversion: 0, octave: 0, locked: false })),
    melody: [],
    bass: [],
    drums: null,
  }
}

export function createDefaultProject(): Project {
  const progression = generateProgression({
    key: 0,
    scaleId: 'major',
    moodId: 'pop',
    length: 4,
    extension: 'triad',
  })
  const section = makeSection('Verse', progression.chords)
  return {
    v: 2,
    id: createId(),
    title: 'untitled',
    key: 0,
    scaleId: 'major',
    moodId: 'pop',
    extension: 'triad',
    bpm: 96,
    masterVolume: 0.85,
    metronome: false,
    loopSection: false,
    tracks: [{ kind: 'chords', instrument: 'piano', volume: 0.85, mute: false, solo: false, playMode: 'block' }],
    sections: [section],
    activeSectionId: section.id,
  }
}

export function createProjectStore(project = createDefaultProject()): ProjectStore {
  return { project, past: [], future: [], lastLabel: null, lastTime: 0 }
}

export function projectReducer(state: ProjectStore, action: ProjectAction): ProjectStore {
  if (action.type === 'replace') return createProjectStore(action.project)
  if (action.type === 'undo') {
    const previous = state.past[state.past.length - 1]
    if (!previous) return state
    return {
      ...state,
      project: previous,
      past: state.past.slice(0, -1),
      future: [state.project, ...state.future],
      lastLabel: null,
    }
  }
  if (action.type === 'redo') {
    const next = state.future[0]
    if (!next) return state
    return {
      ...state,
      project: next,
      past: [...state.past, state.project].slice(-50),
      future: state.future.slice(1),
      lastLabel: null,
    }
  }
  const now = Date.now()
  const coalesced = Boolean(action.label && action.label === state.lastLabel && now - state.lastTime < 700)
  return {
    project: action.project,
    past: coalesced ? state.past : [...state.past, state.project].slice(-50),
    future: [],
    lastLabel: action.label ?? null,
    lastTime: now,
  }
}

export function projectStorageKey(): string {
  return CURRENT_KEY
}

export function saveProjectList(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  } catch {
    return
  }
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY)
    if (raw) {
      const projects = JSON.parse(raw) as Project[]
      if (Array.isArray(projects) && projects.length) return projects.map(normalizeProject)
    }
    const migrated = storage.list().map((item) => {
      const chords =
        item.chords?.length
          ? item.chords
          : item.degrees.map((degree) => diatonicChords(item.key, SCALES[item.scaleId], item.extension)[degree - 1])
      const slots = chords.map((chord, index) => ({
        chord,
        beats: item.chordBeats?.[index] ?? item.beatsPerChord,
        inversion: item.inversions?.[index] ?? 0,
        octave: 0,
        locked: item.locked?.[index] ?? false,
      }))
      const section = {
        id: createId(),
        name: 'Verse',
        chords: slots,
        melody: [],
        bass: [],
        drums: null,
      }
      return {
        ...createDefaultProject(),
        id: item.id,
        title: item.name || 'untitled',
        key: item.key,
        scaleId: item.scaleId,
        moodId: item.moodId,
        extension: item.extension,
        bpm: item.bpm,
        tracks: [
          {
            kind: 'chords' as const,
            instrument: item.instrument || 'piano',
            volume: 0.85,
            mute: false,
            solo: false,
            playMode: 'block' as const,
          },
        ],
        sections: [section],
        activeSectionId: section.id,
      }
    })
    saveProjectList(migrated)
    return migrated
  } catch {
    return []
  }
}

export function loadCurrentProject(): Project | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY)
    if (!raw) return null
    const project = JSON.parse(raw) as Project
    return project?.v === 2 && Array.isArray(project.sections) && project.sections.length > 0 ? normalizeProject(project) : null
  } catch {
    return null
  }
}

export function saveCurrentProject(project: Project): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(project))
  } catch {
    return
  }
}

export function nextSectionName(sections: Section[]): string {
  const index = (sections.length + 1) % SECTION_NAMES.length
  return SECTION_NAMES[index]
}

export function transposeProject(
  project: Project,
  key: PitchClass,
  scaleId = project.scaleId,
  keySpelling = project.keySpelling,
): Project {
  const delta = key - project.key
  const sections = project.sections.map((section) => ({
    ...section,
    chords: section.chords.map((slot) => {
      const root = ((slot.chord.root + delta + 12) % 12) as PitchClass
      const replacement = diatonicChords(key, SCALES[scaleId], project.extension, keySpelling).find((chord) => chord.degree === slot.chord.degree)
      const chord = replacement ?? respellChord(slot.chord, root, key, SCALES[scaleId], keySpelling)
      return { ...slot, chord }
    }),
    melody: section.melody.map((note) => ({ ...note, midi: note.midi + delta })),
    bass: section.bass.map((note) => ({ ...note, midi: note.midi + delta })),
  }))
  return { ...project, key, keySpelling, scaleId, sections }
}
