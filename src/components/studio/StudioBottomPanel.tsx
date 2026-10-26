import { useEffect, useMemo, useState } from 'react'
import { ChordVisualizer, type VisualizerMode } from '../ChordVisualizer'
import { ALL_KEYS, diatonicChords, pcName, SCALES, SCALE_LIST } from '../../lib/theory'
import type { Chord, Extension, PitchClass, ScaleId } from '../../lib/theory'
import type { Project, Section } from '../../lib/project'
import { suggestSubstitutes } from '../../lib/substitutes'
import { midiToNoteName, voiceChord } from '../../lib/theory'

type PaletteTab = 'In Key' | 'Search' | 'Suggestions' | 'Other Key' | 'Voicings' | 'Visualizer'
type EditorKind = 'melody' | 'bass' | 'drums' | null

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
  onAssign, onInversion, onOctave, onPreview, onVisualMode, visualMode,
}: StudioBottomPanelProps) {
  const [tab, setTab] = useState<PaletteTab>('In Key')
  const [search, setSearch] = useState('')
  const [otherKey, setOtherKey] = useState<PitchClass>(project.key)
  const [otherScale, setOtherScale] = useState<ScaleId>(project.scaleId)
  const [extensions, setExtensions] = useState<Extension>(project.extension)
  useEffect(() => setTab(requestedTab), [requestedTab])
  const slot = section.chords[chordIndex]
  const chord = slot?.chord
  const scale = SCALES[project.scaleId]
  const palette = useMemo(() => diatonicChords(project.key, scale, extensions), [project.key, scale, extensions])
  const suggestions = useMemo(() => chord ? suggestSubstitutes({
    chord,
    index: chordIndex,
    progression: section.chords.map((item) => item.chord),
    key: project.key,
    scale,
    extension: project.extension,
  }) : [], [chord, chordIndex, section, project, scale])
  const otherPalette = useMemo(() => diatonicChords(otherKey, SCALES[otherScale], extensions), [otherKey, otherScale, extensions])
  const parsed = search ? parseChordSymbol(search, project) : null
  const inversion = slot?.inversion ?? 0
  const voiced = chord ? voiceChord(chord, 4 + (slot?.octave ?? 0), { forcedInversion: inversion }) : []

  if (!open) return null
  return (
    <section className="studio-bottom-panel" aria-label="Studio editor panel">
      <div className="studio-panel-header">
        <div className="studio-panel-tabs">
          {(editor ? [editor === 'drums' ? 'Drum editor' : `${editor[0].toUpperCase()}${editor.slice(1)} editor`] : [tab]).map((label) => <span key={label}>{label}</span>)}
          {!editor ? (['In Key', 'Search', 'Suggestions', 'Other Key', 'Voicings', 'Visualizer'] as PaletteTab[]).map((item) => (
            <button type="button" className={tab === item ? 'active' : ''} key={item} onClick={() => {
              setTab(item)
              if (item === 'In Key' || item === 'Voicings' || item === 'Visualizer') onTabChange(item)
            }}>{item}</button>
          )) : null}
        </div>
        <div className="studio-panel-tools">
          {!editor && (tab === 'In Key' || tab === 'Search' || tab === 'Suggestions' || tab === 'Other Key') ? (
            <button type="button" className={`studio-roman-toggle ${roman ? 'active' : ''}`} onClick={() => onRoman(!roman)}>Roman</button>
          ) : null}
          <span className="studio-panel-selected">{chord?.symbol ?? 'Select a chord'}</span>
          <button type="button" aria-label="Close editor panel" onClick={onClose}>×</button>
        </div>
      </div>
      {editor ? (
        <div className="studio-placeholder-editor">
          <div className="studio-placeholder-icon">{editor === 'drums' ? '▦' : '♫'}</div>
          <div><strong>{editor === 'drums' ? 'Drum step editor' : `${editor} piano roll`}</strong><p>This clip editor arrives in phase 2. Your generated clip is ready to play and export.</p></div>
        </div>
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
          {chord ? <ChordVisualizer chord={chord} inversion={inversion} mode={visualMode} onModeChange={onVisualMode} onCycleInversion={() => onInversion((inversion + 1) % chord.intervals.length)} /> : null}
        </div>
      ) : tab === 'Visualizer' ? (
        <div className="studio-visualizer-content">{chord ? <ChordVisualizer chord={chord} inversion={inversion} mode={visualMode} onModeChange={onVisualMode} /> : <p className="studio-muted">Select a chord to see its voicing.</p>}</div>
      ) : (
        <div className="studio-palette-content">
          <div className="studio-palette-sidebar">
            <span>Chord palette</span>
            <small>{pcName(project.key)} {SCALES[project.scaleId].name}</small>
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
                <select aria-label="Other key" value={otherKey} onChange={(event) => setOtherKey(Number(event.target.value) as PitchClass)}>{ALL_KEYS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select>
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
            {tab === 'In Key' ? <div className="studio-chord-palette">{palette.map((item) => <ChordButton key={item.symbol} chord={item} roman={roman} onClick={() => { onPreview(item); onAssign(item) }} />)}</div> : null}
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
  return <button type="button" className="studio-chord-chip" onClick={onClick}><strong>{roman ? chord.roman : chord.symbol}</strong>{note ? <small>{note}</small> : null}</button>
}
