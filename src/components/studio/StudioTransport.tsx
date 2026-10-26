import { useEffect, useRef, useState } from 'react'
import { EXTENSIONS, KEY_OPTIONS, keyName, SCALE_LIST, SCALES } from '../../lib/theory'
import type { KeySpelling, PitchClass, ScaleId } from '../../lib/theory'
import type { Project } from '../../lib/project'
import type { VisualizerMode } from '../ChordVisualizer'
import { useStudioMenu } from './useStudioMenu'

export type StudioTool = 'chords' | 'voicings' | 'melody' | 'bass' | 'drums' | 'piano' | 'guitar' | 'shortcuts'

interface StudioTransportProps {
  project: Project
  playing: boolean
  visualMode: VisualizerMode
  isRendering: boolean
  onMasterVolume: (value: number) => void
  onMetronome: () => void
  onBpm: (value: number) => void
  onKey: (key: PitchClass, scaleId: ScaleId, spelling?: KeySpelling) => void
  onExtension: (extension: Project['extension']) => void
  onPlay: () => void
  onStart: () => void
  onLoop: () => void
  onVisualMode: (mode: VisualizerMode) => void
  onTool: (tool: StudioTool) => void
}

const TOOL_ITEMS: { id: StudioTool; icon: string; title: string; description: string }[] = [
  { id: 'chords', icon: 'chords', title: 'Chord Editor', description: 'Browse and assign chords' },
  { id: 'voicings', icon: 'voicing', title: 'Voicings', description: 'Choose inversion and octave' },
  { id: 'melody', icon: 'melody', title: 'Piano Roll (melody)', description: 'Edit melody notes' },
  { id: 'bass', icon: 'bass', title: 'Bass Editor', description: 'Edit bass notes' },
  { id: 'drums', icon: 'drums', title: 'Drum Editor', description: 'Build a step pattern' },
  { id: 'piano', icon: 'piano', title: 'Piano Visualizer', description: 'Show the chord on keys' },
  { id: 'guitar', icon: 'guitar', title: 'Guitar Fret', description: 'Show the chord on frets' },
  { id: 'shortcuts', icon: 'keyboard', title: 'Keyboard Shortcuts', description: 'See the key commands' },
]

export function StudioTransport({
  project, playing, visualMode, isRendering, onMasterVolume, onMetronome, onBpm, onKey,
  onExtension, onPlay, onStart, onLoop, onVisualMode, onTool,
}: StudioTransportProps) {
  const { openMenu, setOpenMenu } = useStudioMenu()
  const keyOpen = openMenu === 'transport:key'
  const toolsOpen = openMenu === 'transport:tools'
  const scaleLabel = project.scaleId === 'major' ? 'major' : project.scaleId === 'minor' ? 'minor' : SCALES[project.scaleId].name.toLowerCase()
  const preferredKeyName = keyName(project.key, SCALES[project.scaleId], project.keySpelling)
  const preferredOption = KEY_OPTIONS.find((item) => item.key === project.key && item.name === preferredKeyName)
    ?? KEY_OPTIONS.find((item) => item.key === project.key)
  const selectedKey = preferredOption ? `${preferredOption.key}:${preferredOption.spelling ?? 'natural'}` : `${project.key}:natural`

  return (
    <footer className="studio-transport">
      <div className="studio-master-volume">
        <span>MASTER</span>
        <input aria-label="Master volume" type="range" min="0" max="1" step="0.01" value={project.masterVolume} onChange={(event) => onMasterVolume(Number(event.target.value))} />
        <output>{Math.round(project.masterVolume * 100)}%</output>
      </div>
      <div className="studio-transport-center">
        <button type="button" className={`studio-transport-icon ${project.metronome ? 'active' : ''}`} aria-label="Toggle metronome" title="Metronome" onClick={onMetronome}><Icon name="metronome" /></button>
        <BpmControl value={project.bpm} onCommit={onBpm} />
        <div className="studio-key-wrap" data-studio-menu-root>
          <button type="button" className="studio-key-button" aria-label={`Key ${keyName(project.key, SCALES[project.scaleId], project.keySpelling)} ${scaleLabel}`} onClick={() => setOpenMenu(keyOpen ? null : 'transport:key')}>
            <strong>{keyName(project.key, SCALES[project.scaleId], project.keySpelling)}</strong>
            <small>{scaleLabel}</small>
          </button>
          {keyOpen ? (
            <div className="studio-popover studio-key-popover">
              <strong>Key &amp; scale</strong>
              <label>Key<select aria-label="Project key" value={selectedKey} onChange={(event) => {
                const [keyText, spellingText] = event.target.value.split(':')
                const option = KEY_OPTIONS.find((item) => item.key === Number(keyText) && (item.spelling ?? 'natural') === spellingText)
                if (option) { onKey(option.key, project.scaleId, option.spelling); setOpenMenu(null) }
              }}>{KEY_OPTIONS.map((item) => <option key={`${item.key}:${item.spelling ?? 'natural'}`} value={`${item.key}:${item.spelling ?? 'natural'}`}>{item.name}</option>)}</select></label>
              <label>Scale<select aria-label="Project scale" value={project.scaleId} onChange={(event) => { onKey(project.key, event.target.value as ScaleId, project.keySpelling); setOpenMenu(null) }}>{SCALE_LIST.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Chord extension<select aria-label="Chord extension" value={project.extension} onChange={(event) => { onExtension(event.target.value as Project['extension']); setOpenMenu(null) }}>{EXTENSIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div>
          ) : null}
        </div>
        <button type="button" className="studio-transport-icon" aria-label="Skip to start" title="Skip to start" onClick={onStart}><Icon name="start" /></button>
        <button type="button" className="studio-play-button" aria-label={playing ? 'Stop playback' : 'Play'} onClick={onPlay}><Icon name={playing ? 'stop' : 'play'} /></button>
        <button type="button" className={`studio-transport-icon ${project.loopSection ? 'active' : ''}`} aria-label="Toggle loop" title="Loop section" onClick={onLoop}><Icon name="loop" /></button>
        <div className="studio-visual-mode">
          <button type="button" className={visualMode === 'piano' ? 'active' : ''} aria-label="Piano view" title="Piano view" onClick={() => onVisualMode('piano')}><Icon name="piano" /></button>
          <button type="button" className={visualMode === 'guitar' ? 'active' : ''} aria-label="Guitar view" title="Guitar view" onClick={() => onVisualMode('guitar')}><Icon name="guitar" /></button>
        </div>
      </div>
      <div className="studio-transport-tools">
        <div className="studio-menu-wrap" data-studio-menu-root>
          <button type="button" className="studio-tools-button" onClick={() => setOpenMenu(toolsOpen ? null : 'transport:tools')}>Tools <span>⌄</span></button>
          {toolsOpen ? (
            <div className="studio-popover studio-tools-menu">
              <strong>Tools</strong>
              {TOOL_ITEMS.map((item) => (
                <button type="button" key={item.id} onClick={() => { onTool(item.id); setOpenMenu(null) }}>
                  <Icon name={item.icon} />
                  <span><strong>{item.title}</strong><small>{item.description}</small></span>
                </button>
              ))}
              {isRendering ? <span className="studio-muted">Rendering WAV…</span> : null}
            </div>
          ) : null}
        </div>
        <button type="button" className="studio-help-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => onTool('shortcuts')}>?</button>
      </div>
    </footer>
  )
}

function BpmControl({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const dragRef = useRef<{ y: number; value: number; moved: boolean } | null>(null)
  useEffect(() => {
    if (!editing && !dragRef.current) {
      setDraft(value)
      draftRef.current = value
    }
  }, [editing, value])

  const commit = () => {
    const next = Math.max(40, Math.min(220, Math.round(Number(draftRef.current) || value)))
    setDraft(next)
    draftRef.current = next
    onCommit(next)
  }
  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    dragRef.current = { y: event.clientY, value, moved: false }
    const move = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const delta = drag.y - moveEvent.clientY
      if (Math.abs(delta) > 3) drag.moved = true
      const next = Math.max(40, Math.min(220, drag.value + Math.round(delta / 3)))
      draftRef.current = next
      setDraft(next)
    }
    const end = () => {
      const drag = dragRef.current
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      if (drag?.moved) commit()
      else setEditing(true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }

  return (
    <div className="studio-bpm">
      {editing ? (
        <input
          aria-label="Tempo BPM"
          autoFocus
          type="number"
          min="40"
          max="220"
          value={draft}
          onChange={(event) => { const next = Number(event.target.value); setDraft(next); draftRef.current = next }}
          onBlur={() => { commit(); setEditing(false) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { commit(); setEditing(false) }
            if (event.key === 'Escape') { setDraft(value); draftRef.current = value; setEditing(false) }
          }}
        />
      ) : (
        <button type="button" aria-label={`Tempo ${value} BPM`} title="Click to type or drag vertically" onPointerDown={startDrag}>
          <strong>{draft}</strong><small>BPM</small>
        </button>
      )}
    </div>
  )
}

function Icon({ name }: { name: string }) {
  const shared = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...shared}>
      {name === 'metronome' ? <><path d="m12 3 8 18H4L12 3Z" /><path d="m12 17 4-8M8 18h8" /></>
        : name === 'start' ? <><path d="M5 5v14M19 12H8M13 7l-5 5 5 5" /></>
          : name === 'play' ? <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />
            : name === 'stop' ? <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />
              : name === 'loop' ? <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>
                : name === 'piano' ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 5v8M12 5v8M16 5v8M6 13v6M10 13v6M14 13v6M18 13v6" /></>
                  : name === 'guitar' ? <><path d="M14 5 19 10M12 7l5 5M5 19c-2-2-1-5 1-7 1-1 3-2 5-1l6-6 2 2-6 6c1 2 0 4-1 5-2 2-5 3-7 1Z" /><circle cx="8" cy="16" r="1" /></>
                    : name === 'chords' ? <><path d="M9 18V5l12-2v13" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="18" cy="16" rx="3" ry="2" /></>
                      : name === 'voicing' ? <><path d="M4 19h16M6 16V9M10 16V5M14 16v-4M18 16V7" /><circle cx="6" cy="8" r="1" /><circle cx="10" cy="4" r="1" /></>
                        : name === 'melody' ? <path d="M3 13h3l2-7 4 13 3-9 2 4h4" />
                          : name === 'bass' ? <><path d="M5 18V6M10 16V8M15 19V5M20 15V9" /></>
                            : name === 'drums' ? <><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11m0-11-11 11" /></>
                              : name === 'keyboard' ? <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 6v6M11 6v6M15 6v6M19 6v6M6 12v6M10 12v6M14 12v6M18 12v6" /></>
                                : null}
    </svg>
  )
}
