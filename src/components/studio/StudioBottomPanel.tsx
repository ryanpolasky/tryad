import { useEffect, useMemo, useRef, useState } from 'react'
import { ChordVisualizer, type VisualizerMode } from '../ChordVisualizer'
import { diatonicChords, keyName, keySignaturePrefersFlats, KEY_OPTIONS, SCALES, SCALE_LIST } from '../../lib/theory'
import type { Chord, Extension, KeySpelling, PitchClass, ScaleId } from '../../lib/theory'
import type { Project, Section } from '../../lib/project'
import { suggestSubstitutes } from '../../lib/substitutes'
import { midiToNoteName, voiceChord } from '../../lib/theory'
import { PianoRollEditor } from './PianoRollEditor'
import { DrumStepEditor } from './DrumStepEditor'
import type { DrumGrid, NoteEvent } from '../../lib/project'

type PaletteTab = 'In Key' | 'Search' | 'Suggestions' | 'Other Key' | 'Voicings' | 'Visualizer'
type EditorKind = 'melody' | 'bass' | 'drums' | null
const EDITOR_PANEL_HEIGHT_KEY = 'tryad:studio:editor-panel-height'

function clampEditorPanelHeight(height: number): number {
  const max = typeof window === 'undefined' ? height : Math.max(180, window.innerHeight * 0.7)
  return Math.round(Math.max(180, Math.min(max, height)))
}

function savedEditorPanelHeight(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(EDITOR_PANEL_HEIGHT_KEY)
    if (saved === null) return null
    const height = Number(saved)
    return Number.isFinite(height) && height > 0 ? clampEditorPanelHeight(height) : null
  } catch {
    return null
  }
}

interface StudioBottomPanelProps {
  project: Project
  section: Section
  chordIndex: number
  open: boolean
  editor: EditorKind
  requestedTab: 'In Key' | 'Voicings' | 'Visualizer'
  previousChord: Chord | null
  roman: boolean
  onRoman: (value: boolean) => void
  onClose: () => void
  onTabChange: (tab: 'In Key' | 'Voicings' | 'Visualizer') => void
  onAssign: (chord: Chord, inversion?: number) => void
  onInversion: (inversion: number) => void
  onOctave: (octave: number) => void
  onPreview: (chord: Chord) => void
  onVisualMode: (mode: VisualizerMode) => void
  visualMode: VisualizerMode
  playing: boolean
  playheadBeat: number
  playingChord: Chord | null
  playingInversion: number
  onNotesChange: (kind: 'melody' | 'bass', notes: NoteEvent[]) => void
  onDrumsChange: (grid: DrumGrid) => void
  onPreviewNote: (midi: number) => void
  onRegenerate: (kind: 'melody' | 'bass' | 'drums') => void
  onEditorStyleChange: (kind: 'melody' | 'bass' | 'drums', style: string, drums?: DrumGrid) => void
}

function parseChordSymbol(input: string, project: Project): { chord: Chord; inversion?: number } | null {
  const text = input.trim().replace(/♭/g, 'b').replace(/♯/g, '#')
  const match = text.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/i)
  if (!match) return null
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const aliases: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' }
  const normalize = (name: string) => name[0].toUpperCase() + name.slice(1)
  const rootName = aliases[normalize(match[1])] ?? normalize(match[1])
  const root = names.indexOf(rootName)
  if (root < 0) return null
  const suffix = match[2].toLowerCase()
  const quality = /dim|°|ø|m7b5/.test(suffix) ? 'dim' : /aug|\+/.test(suffix) ? 'aug' : /(^m|^min)/.test(suffix) && !/maj/.test(suffix) ? 'min' : 'maj'
  const intervals = /sus2/.test(suffix) ? [0, 2, 7]
    : /sus4|sus/.test(suffix) ? [0, 5, 7]
      : /m7b5|ø|dim7/.test(suffix) ? [0, 3, 6, /dim7/.test(suffix) ? 9 : 10]
        : quality === 'dim' ? [0, 3, 6]
          : quality === 'aug' ? [0, 4, 8]
            : quality === 'min' ? [0, 3, 7] : [0, 4, 7]
  if (/maj9/.test(suffix)) intervals.push(11, 14)
  else if (/maj7/.test(suffix)) intervals.push(11)
  else if (/9/.test(suffix) || /7#9/.test(suffix)) intervals.push(10, /#9/.test(suffix) ? 15 : 14)
  else if (/7/.test(suffix)) intervals.push(10)
  else if (/add9/.test(suffix)) intervals.push(14)
  const pitchClasses = intervals.map((interval) => (root + interval) % 12) as PitchClass[]
  const degree = diatonicChords(project.key, SCALES[project.scaleId], project.extension).find((chord) => chord.root === root)?.degree ?? 0
  const chord: Chord = {
    root: root as PitchClass,
    quality,
    degree,
    roman: degree ? ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree - 1] : 'chromatic',
    symbol: text,
    pitchClasses,
    intervals,
    extension: /sus2/.test(suffix) ? 'sus2' : /sus4|sus/.test(suffix) ? 'sus4' : /add9/.test(suffix) ? 'add9' : /9/.test(suffix) ? 'ninth' : /7/.test(suffix) ? 'seventh' : 'triad',
  }
  const bassRoot = match[3] ? aliases[normalize(match[3])] ?? normalize(match[3]) : null
  const inversion = bassRoot ? chord.pitchClasses.indexOf(names.indexOf(bassRoot) as PitchClass) : undefined
  return { chord, inversion: inversion !== undefined && inversion >= 0 ? inversion : undefined }
}

export function StudioBottomPanel({
  project, section, chordIndex, open, editor, requestedTab, previousChord, roman, onRoman, onClose, onTabChange,
  onAssign, onInversion, onOctave, onPreview, onVisualMode, visualMode, playing, playheadBeat, playingChord,
  playingInversion, onNotesChange, onDrumsChange, onPreviewNote, onRegenerate, onEditorStyleChange,
}: StudioBottomPanelProps) {
  const [tab, setTab] = useState<PaletteTab>('In Key')
  const [search, setSearch] = useState('')
  const [otherKey, setOtherKey] = useState<PitchClass>(project.key)
  const [otherSpelling, setOtherSpelling] = useState<KeySpelling | undefined>(project.keySpelling)
  const [otherScale, setOtherScale] = useState<ScaleId>(project.scaleId)
  const [extensions, setExtensions] = useState<Extension>(project.extension)
  const [editorPanelHeight, setEditorPanelHeight] = useState<number | null>(savedEditorPanelHeight)
  const panelRef = useRef<HTMLElement | null>(null)
  useEffect(() => setTab(requestedTab), [requestedTab])
  const persistEditorPanelHeight = (height: number) => {
    const next = clampEditorPanelHeight(height)
    setEditorPanelHeight(next)
    try {
      window.localStorage.setItem(EDITOR_PANEL_HEIGHT_KEY, String(next))
    } catch {
      return
    }
  }
  const beginPanelResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = panelRef.current?.getBoundingClientRect().height ?? editorPanelHeight ?? 300
    const move = (moveEvent: PointerEvent) => {
      setEditorPanelHeight(clampEditorPanelHeight(startHeight + startY - moveEvent.clientY))
    }
    const end = (endEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      persistEditorPanelHeight(startHeight + startY - endEvent.clientY)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }
  const resizePanelWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const current = panelRef.current?.getBoundingClientRect().height ?? editorPanelHeight ?? 300
    persistEditorPanelHeight(current + (event.key === 'ArrowUp' ? 20 : -20))
  }
  const slot = section.chords[chordIndex]
  const chord = slot?.chord
  const visualChord = playing && playingChord ? playingChord : chord
  const visualInversion = playing && playingChord ? playingInversion : (slot?.inversion ?? 0)
  const scale = SCALES[project.scaleId]
  const palette = useMemo(() => diatonicChords(project.key, scale, extensions, project.keySpelling), [project.key, project.keySpelling, scale, extensions])
  const suggestions = useMemo(() => chord ? suggestSubstitutes({
    chord,
    index: chordIndex,
    progression: section.chords.map((item) => item.chord),
    key: project.key,
    scale,
    extension: project.extension,
    keySpelling: project.keySpelling,
  }) : [], [chord, chordIndex, section, project, scale])
  const otherPalette = useMemo(() => diatonicChords(otherKey, SCALES[otherScale], extensions, otherSpelling), [otherKey, otherSpelling, otherScale, extensions])
  const preferFlat = keySignaturePrefersFlats(project.key, scale, project.keySpelling)
  const parsed = search ? parseChordSymbol(search, project) : null
  const inversion = slot?.inversion ?? 0
  const voiced = chord ? voiceChord(chord, 4 + (slot?.octave ?? 0), { forcedInversion: inversion }) : []

  if (!open) return null
  return (
    <section
      ref={panelRef}
      className={`studio-bottom-panel ${editor ? 'editor-resizable' : ''}`}
      style={editor && editorPanelHeight !== null ? { height: `${editorPanelHeight}px`, flex: `0 0 ${editorPanelHeight}px` } : undefined}
      aria-label="Studio editor panel"
    >
      {editor ? <button
        type="button"
        className="studio-editor-resize-handle"
        aria-label="Resize editor panel"
        title="Drag to resize editor panel"
        onPointerDown={beginPanelResize}
        onKeyDown={resizePanelWithKeyboard}
      ><span /></button> : null}
      <div className="studio-panel-header">
        <div className="studio-panel-tabs">
          {editor ? <span>{editor === 'drums' ? 'Drum editor' : `${editor[0].toUpperCase()}${editor.slice(1)} editor`}</span> : null}
          {!editor ? (['In Key', 'Search', 'Suggestions', 'Other Key', 'Voicings', 'Visualizer'] as PaletteTab[]).map((item) => (
            <button type="button" className={tab === item ? 'active' : ''} key={item} onClick={() => {
              setTab(item)
              if (item === 'In Key' || item === 'Voicings' || item === 'Visualizer') onTabChange(item)
            }}>{item}</button>
          )) : null}
        </div>
        <div className="studio-panel-tools">
          {!editor && (tab === 'In Key' || tab === 'Search' || tab === 'Suggestions' || tab === 'Other Key') ? (
            <button type="button" role="switch" aria-checked={roman} aria-label="Roman numerals" className={`studio-roman-toggle ${roman ? 'active' : ''}`} onClick={() => onRoman(!roman)}><span>Roman numerals</span><i /></button>
          ) : null}
          <span className="studio-panel-selected">{chord?.symbol ?? 'Select a chord'}</span>
          <button type="button" aria-label="Close editor panel" onClick={onClose}>×</button>
        </div>
      </div>
      {editor ? (
        editor === 'drums' ? (
          <DrumStepEditor
            section={section}
            style={project.tracks.find((track) => track.kind === 'drums')?.style ?? 'boom'}
            playing={playing}
            playheadBeat={playheadBeat}
            onGridChange={onDrumsChange}
            onPresetChange={(style, grid) => onEditorStyleChange('drums', style, grid)}
          />
        ) : (
          <PianoRollEditor
            key={`${editor}-${section.id}`}
            section={section}
            kind={editor}
            scaleId={project.scaleId}
            projectKey={project.key}
            style={project.tracks.find((track) => track.kind === editor)?.style ?? (editor === 'bass' ? 'root' : 'flowing')}
            playing={playing}
            playheadBeat={playheadBeat}
            onNotesChange={(notes) => onNotesChange(editor, notes)}
            onPreviewNote={onPreviewNote}
            onRegenerate={() => onRegenerate(editor)}
            onStyleChange={(style) => onEditorStyleChange(editor, style)}
          />
        )
      ) : tab === 'Voicings' ? (
        <div className="studio-voicings-content">
          <div className="studio-voicing-controls">
            <label>Inversion
              <select aria-label="Chord inversion" value={inversion} onChange={(event) => onInversion(Number(event.target.value))}>
                {['Auto', 'Root', '1st', '2nd', '3rd'].map((label, value) => <option key={label} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="studio-octave-control"><span>Octave</span><button type="button" onClick={() => onOctave(Math.max(-1, (slot?.octave ?? 0) - 1))}>−</button><b>{slot?.octave ?? 0}</b><button type="button" onClick={() => onOctave(Math.min(1, (slot?.octave ?? 0) + 1))}>+</button></div>
            <span className="studio-note-list">{voiced.map(midiToNoteName).join(' · ')}</span>
          </div>
          {visualChord ? <ChordVisualizer chord={visualChord} inversion={visualInversion} preferFlat={preferFlat} mode={visualMode} onModeChange={onVisualMode} onCycleInversion={() => onInversion((visualInversion + 1) % visualChord.intervals.length)} /> : null}
        </div>
      ) : tab === 'Visualizer' ? (
        <div className="studio-visualizer-content">{visualChord ? <ChordVisualizer chord={visualChord} inversion={visualInversion} preferFlat={preferFlat} mode={visualMode} onModeChange={onVisualMode} /> : <p className="studio-muted">Select a chord to see its voicing.</p>}</div>
      ) : (
        <div className="studio-palette-content">
          <div className="studio-palette-sidebar">
            <span>Chord palette</span>
            <small>{keyName(project.key, SCALES[project.scaleId], project.keySpelling)} {SCALES[project.scaleId].name}</small>
            <div className="studio-extension-row">
              {(['triad', 'seventh', 'ninth', 'sus2', 'sus4', 'add9'] as Extension[]).map((extension) => (
                <button type="button" className={extensions === extension ? 'active' : ''} key={extension} onClick={() => setExtensions(extension)}>{extension === 'triad' ? 'Triads' : extension === 'seventh' ? '7th' : extension === 'ninth' ? '9th' : extension}</button>
              ))}
            </div>
            <button type="button" className="studio-previous-button" disabled={!previousChord} onClick={() => previousChord && onAssign(previousChord)}>↶ Previous</button>
          </div>
          <div className="studio-palette-main">
            {tab === 'Search' ? (
              <div className="studio-search-row">
                <input aria-label="Search chord symbol" placeholder="Search chord symbol · e.g. F#m7b5, Bbmaj9, G/B" value={search} onChange={(event) => setSearch(event.target.value)} />
                {parsed ? <button type="button" className="studio-chord-chip highlighted" onClick={() => { onPreview(parsed.chord); onAssign(parsed.chord, parsed.inversion); setSearch('') }}>{parsed.chord.symbol}{parsed.inversion ? ` / ${parsed.inversion}` : ''}</button> : search ? <span className="studio-muted">Try a root, quality, extension, or slash bass</span> : null}
              </div>
            ) : null}
            {tab === 'Other Key' ? (
              <div className="studio-other-key-selects">
                <select aria-label="Other key" value={`${otherKey}:${otherSpelling ?? 'natural'}`} onChange={(event) => {
                  const [keyText, spellingText] = event.target.value.split(':')
                  const option = KEY_OPTIONS.find((item) => item.key === Number(keyText) && (item.spelling ?? 'natural') === spellingText)
                  if (option) { setOtherKey(option.key); setOtherSpelling(option.spelling) }
                }}>{KEY_OPTIONS.map((item) => <option key={`${item.key}:${item.spelling ?? 'natural'}`} value={`${item.key}:${item.spelling ?? 'natural'}`}>{item.name}</option>)}</select>
                <select aria-label="Other scale" value={otherScale} onChange={(event) => setOtherScale(event.target.value as ScaleId)}>{SCALE_LIST.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </div>
            ) : null}
            {tab === 'Suggestions' ? (
              <div className="studio-suggestion-groups">
                {(['function', 'tritone', 'secondary', 'borrowed', 'modal'] as const).map((category) => {
                  const items = suggestions.filter((item) => item.category === category)
                  return items.length ? <div key={category}><small>{category}</small>{items.map((item) => <ChordButton key={`${item.chord.symbol}-${item.label}`} chord={item.chord} roman={roman} note={item.label} onClick={() => { onPreview(item.chord); onAssign(item.chord) }} />)}</div> : null
                })}
                {!suggestions.length ? <span className="studio-muted">No suggestions for this chord.</span> : null}
              </div>
            ) : null}
            {tab === 'In Key' ? (
              <div className="studio-palette-sections">
                <div className="studio-palette-row">
                  <strong>In Key</strong>
                  <div className="studio-chord-palette">{palette.map((item) => <ChordButton key={item.symbol} chord={item} roman={roman} note={chordFunction(item)} onClick={() => { onPreview(item); onAssign(item) }} />)}</div>
                </div>
                {suggestions.some((item) => item.category === 'borrowed' || item.category === 'secondary') ? (
                  <div className="studio-palette-row">
                    <strong>Borrowed / secondary</strong>
                    <div className="studio-chord-palette">{suggestions.filter((item) => item.category === 'borrowed' || item.category === 'secondary').map((item) => <ChordButton key={`${item.chord.symbol}-${item.label}`} chord={item.chord} roman={roman} note={item.label} onClick={() => { onPreview(item.chord); onAssign(item.chord) }} />)}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {tab === 'Other Key' ? <div className="studio-chord-palette">{otherPalette.map((item) => <ChordButton key={item.symbol} chord={item} roman={roman} onClick={() => { onPreview(item); onAssign(item) }} />)}</div> : null}
            {tab === 'Search' && !search ? <div className="studio-chord-palette">{palette.map((item) => <ChordButton key={item.symbol} chord={item} roman={roman} onClick={() => { onPreview(item); onAssign(item) }} />)}</div> : null}
            {tab === 'Search' && parsed ? <div className="studio-search-hint">Click the chord chip to assign it to the selected slot.</div> : null}
          </div>
        </div>
      )}
    </section>
  )
}

function ChordButton({ chord, roman, note, onClick }: { chord: Chord; roman: boolean; note?: string; onClick: () => void }) {
  return <button type="button" className="studio-chord-chip" onClick={onClick}><strong>{roman ? chord.roman : chord.symbol}</strong>{!roman ? <small>{chord.roman}</small> : null}<small className="studio-chord-function">{note ?? chordFunction(chord)}</small></button>
}

function chordFunction(chord: Chord): string {
  const degree = chord.roman.replace(/[^ivIV]/g, '')
  if (degree === 'I' || degree === 'i' || degree === 'vi' || degree === 'VI') return 'tonic'
  if (degree === 'V' || degree === 'v' || degree === 'vii' || degree === 'vii°' || degree === 'VII') return 'dominant'
  if (degree === 'ii' || degree === 'II' || degree === 'IV' || degree === 'iv') return 'predominant'
  return 'mediant'
}
