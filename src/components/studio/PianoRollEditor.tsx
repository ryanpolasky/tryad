import { useEffect, useMemo, useRef, useState } from 'react'
import type { NoteEvent, Section } from '../../lib/project'
import { sectionBeats } from '../../lib/project'
import { midiToNoteName, SCALES } from '../../lib/theory'
import type { PitchClass, ScaleId } from '../../lib/theory'

type EditorKind = 'melody' | 'bass'
type ToolMode = 'select' | 'draw' | 'erase'

interface PianoRollEditorProps {
  section: Section
  kind: EditorKind
  scaleId: ScaleId
  projectKey: PitchClass
  style: string
  playing: boolean
  playheadBeat: number
  onNotesChange: (notes: NoteEvent[]) => void
  onPreviewNote: (midi: number) => void
  onRegenerate: () => void
  onStyleChange: (style: string) => void
}

const ROW_HEIGHT = 16
const PIXELS_PER_BEAT = 68
const MIN_LENGTH = 0.25

export function PianoRollEditor({
  section, kind, scaleId, projectKey, style, playing, playheadBeat, onNotesChange, onPreviewNote, onRegenerate, onStyleChange,
}: PianoRollEditorProps) {
  const [tool, setTool] = useState<ToolMode>('select')
  const [length, setLength] = useState(1)
  const [notes, setNotes] = useState<NoteEvent[]>(section[kind])
  const [selected, setSelected] = useState<number | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef(notes)
  const pendingCommitRef = useRef<NoteEvent[] | null>(null)
  const contextRef = useRef({ sectionId: section.id, kind })
  const sectionNotes = section[kind]
  const totalBeats = sectionBeats(section)
  const low = kind === 'bass' ? 28 : 48
  const high = kind === 'bass' ? 60 : 88
  const pitches = useMemo(() => Array.from({ length: high - low + 1 }, (_, index) => high - index), [high, low])
  const scalePitches = useMemo(() => new Set(SCALES[scaleId].intervals.map((step) => (step + 0) % 12)), [scaleId])
  const inScale = (midi: number) => scalePitches.has((midi - projectKey + 120) % 12)
  const styleOptions = kind === 'melody'
    ? [['flowing', 'Flowing'], ['rhythmic', 'Rhythmic'], ['sparse', 'Sparse'], ['arp', 'Arpeggio']]
    : [['root', 'Roots'], ['pulse', 'Pulse'], ['rootFifth', 'Root + fifth'], ['octave', 'Octaves'], ['walking', 'Walking']]

  useEffect(() => {
    const contextChanged = contextRef.current.sectionId !== section.id || contextRef.current.kind !== kind
    contextRef.current = { sectionId: section.id, kind }
    if (!contextChanged && pendingCommitRef.current === sectionNotes) {
      pendingCommitRef.current = null
      return
    }
    pendingCommitRef.current = null
    setNotes(sectionNotes)
    draftRef.current = sectionNotes
    setSelected(null)
  }, [kind, section.id, sectionNotes])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const resize = () => setViewportWidth(scroller.clientWidth)
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const values = sectionNotes
    const sorted = values.map((note) => note.midi).sort((a, b) => a - b)
    const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : (kind === 'bass' ? 48 : 72)
    const row = Math.max(low, Math.min(high, median))
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current
      if (scroller) scroller.scrollTop = Math.max(0, (high - row) * ROW_HEIGHT - (scroller.clientHeight - ROW_HEIGHT) / 2)
    })
  }, [kind, section.id, sectionNotes, high, low])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== null) {
        event.preventDefault()
        const next = notes.filter((_, index) => index !== selected)
        setNotes(next)
        draftRef.current = next
        pendingCommitRef.current = next
        onNotesChange(next)
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notes, onNotesChange, selected])

  const addNote = (event: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'draw' || !areaRef.current) return
    const rect = areaRef.current.getBoundingClientRect()
    const rawStart = Math.max(0, (event.clientX - rect.left) / PIXELS_PER_BEAT)
    const start = Math.min(Math.max(0, totalBeats - length), Math.round(rawStart / length) * length)
    const row = Math.max(0, Math.floor((event.clientY - rect.top) / ROW_HEIGHT))
    const midi = Math.max(low, Math.min(high, high - row))
    const newNote: NoteEvent = { start, dur: Math.min(length, totalBeats - start), midi, vel: 0.78 }
    const next = kind === 'melody' ? makeMonophonic(notes, newNote) : [...notes, newNote]
    setNotes(next)
    draftRef.current = next
    setSelected(next.findIndex((note) => note === newNote || (note.start === newNote.start && note.midi === newNote.midi)))
    const finish = () => {
      window.removeEventListener('pointerup', finish)
      pendingCommitRef.current = draftRef.current
      onNotesChange(draftRef.current)
    }
    window.addEventListener('pointerup', finish, { once: true })
  }

  const beginGesture = (event: React.PointerEvent, index: number, resize: boolean) => {
    event.preventDefault()
    event.stopPropagation()
    if (tool === 'erase') {
      const next = notes.filter((_, noteIndex) => noteIndex !== index)
      setNotes(next)
      draftRef.current = next
      setSelected(null)
      const finish = () => {
        window.removeEventListener('pointerup', finish)
        pendingCommitRef.current = draftRef.current
        onNotesChange(draftRef.current)
      }
      window.addEventListener('pointerup', finish, { once: true })
      return
    }
    if (tool === 'draw') return
    const original = notes[index]
    if (!original) return
    setSelected(index)
    const startX = event.clientX
    let changed = false
    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / PIXELS_PER_BEAT
      const snap = moveEvent.shiftKey ? MIN_LENGTH : length
      const step = Math.round(delta / snap) * snap
      const nextNote = resize
        ? { ...original, dur: Math.max(MIN_LENGTH, Math.min(totalBeats - original.start, Math.round((original.dur + delta) / snap) * snap)) }
        : { ...original, start: Math.max(0, Math.min(totalBeats - original.dur, Math.round((original.start + step) / snap) * snap)) }
      if (nextNote.start === original.start && nextNote.dur === original.dur) return
      changed = true
      let next = notes.map((note, noteIndex) => noteIndex === index ? nextNote : note)
      if (kind === 'melody') {
        next = makeMonophonic(next.filter((_, noteIndex) => noteIndex !== index), nextNote)
        setSelected(next.findIndex((note) => note === nextNote))
      }
      setNotes(next)
      draftRef.current = next
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      if (changed) {
        pendingCommitRef.current = draftRef.current
        onNotesChange(draftRef.current)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }

  const sectionWidth = totalBeats * PIXELS_PER_BEAT
  const canvasWidth = Math.max(sectionWidth, viewportWidth - 48)
  const playheadX = playheadBeat * PIXELS_PER_BEAT
  return (
    <div className="studio-piano-editor">
      <div className="studio-piano-toolbar">
        <div className="studio-editor-tools">
          {(['select', 'draw', 'erase'] as ToolMode[]).map((mode) => <button type="button" key={mode} data-tool={mode} aria-label={`${mode} tool`} className={tool === mode ? 'active' : ''} onClick={() => setTool(mode)}>{mode === 'select' ? 'Select' : mode === 'draw' ? 'Draw' : 'Erase'}</button>)}
        </div>
        <label>Length<select aria-label="Note length" value={length} onChange={(event) => setLength(Number(event.target.value))}><option value={0.25}>1/16</option><option value={0.5}>1/8</option><option value={1}>1/4</option><option value={2}>1/2</option><option value={4}>1 bar</option></select></label>
        <label>Style<select aria-label={`${kind} style`} value={style} onChange={(event) => onStyleChange(event.target.value)}>{styleOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <button type="button" className="studio-editor-regenerate" onClick={onRegenerate}>Regenerate</button>
      </div>
      <div className="studio-piano-scroll" ref={scrollerRef}>
        <div className="studio-piano-canvas" style={{ width: canvasWidth + 48 }}>
          <div className="studio-piano-corner" />
          <div className="studio-piano-chords" style={{ width: canvasWidth }}>
            {section.chords.map((slot, index) => <div key={`${slot.chord.symbol}-${index}`} style={{ width: slot.beats * PIXELS_PER_BEAT }}><strong>{slot.chord.symbol}</strong><small>{slot.beats} beats</small></div>)}
          </div>
          <div className="studio-piano-keys">
            {pitches.map((midi) => <button type="button" key={midi} className={`${midi % 12 === 0 ? 'octave' : ''} ${[1,3,6,8,10].includes(midi % 12) ? 'black' : ''}`} onClick={() => onPreviewNote(midi)} aria-label={`Preview ${midiToNoteName(midi)}`}>{midiToNoteName(midi)}</button>)}
          </div>
          <div
            className="studio-piano-note-area"
            ref={areaRef}
            style={{ width: canvasWidth, height: pitches.length * ROW_HEIGHT, backgroundSize: `${PIXELS_PER_BEAT}px 100%, 100% ${ROW_HEIGHT}px` }}
            onPointerDown={addNote}
          >
            {canvasWidth > sectionWidth ? <div className="studio-piano-past-end" style={{ left: sectionWidth, width: canvasWidth - sectionWidth }} /> : null}
            {pitches.map((midi, index) => <div key={midi} className={`studio-piano-row ${inScale(midi) ? 'in-scale' : ''} ${midi % 12 === 0 ? 'octave' : ''}`} style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }} />)}
            {Array.from({ length: Math.ceil(totalBeats) + 1 }, (_, index) => <span key={index} className={`studio-piano-beat ${index % 4 === 0 ? 'bar' : ''}`} style={{ left: index * PIXELS_PER_BEAT }} />)}
            {playing ? <span className="studio-piano-playhead" style={{ left: playheadX }} /> : null}
            {notes.map((note, index) => ({ note, index })).filter(({ note }) => note.start < totalBeats && note.midi >= low && note.midi <= high).map(({ note, index }) => (
              <button
                type="button"
                key={`${note.start}-${note.midi}-${index}`}
                data-note-index={index}
                aria-label={`${midiToNoteName(note.midi)} note at beat ${note.start + 1}`}
                className={`studio-piano-note ${kind} ${selected === index ? 'selected' : ''}`}
                style={{ left: note.start * PIXELS_PER_BEAT, top: (high - note.midi) * ROW_HEIGHT + 2, width: Math.max(7, Math.min(note.dur, totalBeats - note.start) * PIXELS_PER_BEAT), height: ROW_HEIGHT - 4 }}
                onPointerDown={(event) => beginGesture(event, index, false)}
                onClick={() => setSelected(index)}
              >
                <span>{midiToNoteName(note.midi)}</span>
                <i className="studio-note-resize-handle" aria-label="Resize note" onPointerDown={(event) => { event.stopPropagation(); beginGesture(event, index, true) }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function makeMonophonic(notes: NoteEvent[], incoming: NoteEvent): NoteEvent[] {
  const start = incoming.start
  const end = start + incoming.dur
  const kept = notes.flatMap((note) => {
    const noteEnd = note.start + note.dur
    if (noteEnd <= start || note.start >= end) return [note]
    if (note.start < start && noteEnd > end) return [{ ...note, dur: start - note.start }, { ...note, start: end, dur: noteEnd - end }]
    if (note.start < start) return [{ ...note, dur: start - note.start }]
    if (noteEnd > end) return [{ ...note, start: end, dur: noteEnd - end }]
    return []
  })
  return [...kept, incoming].sort((a, b) => a.start - b.start)
}
