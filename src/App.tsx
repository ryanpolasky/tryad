import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { StudioBottomPanel } from './components/studio/StudioBottomPanel'
import { StudioTimeline } from './components/studio/StudioTimeline'
import { StudioTopBar } from './components/studio/StudioTopBar'
import type { VisualizerMode } from './components/ChordVisualizer'
import { songAudio, renderSong } from './lib/audio'
import {
  createDefaultProject, createId, createProjectStore, loadCurrentProject, loadProjects,
  makeSection, nextSectionName, projectReducer, saveCurrentProject, saveProjectList,
  transposeProject,
} from './lib/project'
import type { ChordSlot, Project, Section, TrackConfig, TrackKind } from './lib/project'
import { generateBass, generateChords, generateDrums, generateMelody, generateSectionTracks, generateVibeProject } from './lib/generate'
import { ALL_KEYS, EXTENSIONS, midiToNoteName, pcName, SCALE_LIST, SCALES, voiceChord } from './lib/theory'
import type { Chord, Extension, PitchClass, ScaleId } from './lib/theory'
import { buildProjectShareUrl, readProjectFromHash } from './lib/share'
import { downloadMidi, songToMidi } from './lib/midi'
import { audioBufferToWav, downloadBlob } from './lib/wav'

function App() {
  const location = useLocation()
  const [store, dispatch] = useReducer(
    projectReducer,
    undefined,
    () => createProjectStore(loadCurrentProject() ?? createDefaultProject()),
  )
  const project = store.project
  const [projects, setProjects] = useState<Project[]>(() => loadProjects())
  const [viewSectionId, setViewSectionId] = useState(project.activeSectionId)
  const section = project.sections.find((item) => item.id === viewSectionId) ?? project.sections[0]
  const [selectedChord, setSelectedChord] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const [panelTab, setPanelTab] = useState<'In Key' | 'Voicings' | 'Visualizer'>('In Key')
  const [editor, setEditor] = useState<'melody' | 'bass' | 'drums' | null>(null)
  const [roman, setRoman] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [playheadBeat, setPlayheadBeat] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [visualMode, setVisualMode] = useState<VisualizerMode>('piano')
  const [previousChord, setPreviousChord] = useState<Chord | null>(null)
  const [toast, setToast] = useState('')
  const [keyMenu, setKeyMenu] = useState(false)
  const [toolsMenu, setToolsMenu] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [tool, setTool] = useState<'select' | 'draw' | 'erase'>('select')
  const [isRendering, setIsRendering] = useState(false)
  const toastTimer = useRef<number | null>(null)
  const animationRef = useRef<number | null>(null)
  const playingRef = useRef(false)
  const previousHashRef = useRef('')

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2400)
  }, [])

  useEffect(() => {
    saveCurrentProject(project)
    setProjects((current) => {
      const next = [...current.filter((item) => item.id !== project.id), project]
      saveProjectList(next)
      return next
    })
  }, [project])

  useEffect(() => {
    let mounted = true
    const hash = window.location.hash
    if (hash && hash !== previousHashRef.current) {
      previousHashRef.current = hash
      void readProjectFromHash(hash).then((shared) => {
        if (mounted && shared) {
          dispatch({ type: 'replace', project: shared })
          setViewSectionId(shared.activeSectionId)
          window.history.replaceState(null, '', `${location.pathname}${location.search}`)
          notify('Shared project loaded')
        }
      })
    }
    return () => { mounted = false }
  }, [location.pathname, location.search, notify])

  useEffect(() => {
    let cancelled = false
    void songAudio.setTracks(project.tracks, project.masterVolume).catch(() => undefined)
    if (cancelled) songAudio.stop()
    return () => { cancelled = true }
  }, [project.tracks, project.masterVolume])

  useEffect(() => {
    if (selectedChord >= section.chords.length) setSelectedChord(Math.max(0, section.chords.length - 1))
  }, [section, selectedChord])

  useEffect(() => {
    const tick = () => {
      if (playingRef.current) {
        const position = songAudio.getPlayheadPosition()
        if (position) {
          setPlayheadBeat(position.beat)
          setViewSectionId(position.sectionId)
        }
        animationRef.current = requestAnimationFrame(tick)
      }
    }
    if (playing) {
      playingRef.current = true
      animationRef.current = requestAnimationFrame(tick)
    } else {
      playingRef.current = false
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      setPlayheadBeat(0)
    }
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    }
  }, [playing])

  const updateProject = useCallback((next: Project, label?: string) => {
    dispatch({ type: 'update', project: next, label })
  }, [])

  const updateSection = useCallback((updated: Section, label?: string) => {
    updateProject({ ...project, sections: project.sections.map((item) => item.id === updated.id ? updated : item) }, label)
  }, [project, updateProject])

  const activeSlot = section.chords[selectedChord]
  const assignChord = useCallback((chord: Chord, inversion?: number) => {
    const current = section.chords[selectedChord]
    if (!current) return
    setPreviousChord(current.chord)
    const nextSlot = { ...current, chord, inversion: inversion ?? 0 }
    updateSection({ ...section, chords: section.chords.map((slot, index) => index === selectedChord ? nextSlot : slot) }, 'chord')
    setPaletteOpen(false)
  }, [section, selectedChord, updateSection])

  const previewChord = useCallback(async (chord: Chord, slot = activeSlot) => {
    if (!slot) return
    await songAudio.start()
    await songAudio.setTracks(project.tracks, project.masterVolume)
    const notes = voiceChord(chord, 4 + slot.octave, { forcedInversion: slot.inversion }).map((midi) => midiToNoteName(midi))
    songAudio.playNotes(notes)
  }, [activeSlot, project])

  const sectionAction = (action: 'duplicate' | 'regenerate' | 'delete' | 'rename', item: Section) => {
    if (action === 'delete') {
      if (project.sections.length === 1) return notify('A project needs at least one section')
      const sections = project.sections.filter((candidate) => candidate.id !== item.id)
      updateProject({ ...project, sections, activeSectionId: sections[0].id })
      setViewSectionId(sections[0].id)
      return
    }
    if (action === 'rename') {
      const name = window.prompt('Section name', item.name)?.trim()
      if (name) updateSection({ ...item, name })
      return
    }
    if (action === 'duplicate') {
      const copy = { ...item, id: createId(), name: `${item.name} copy`, chords: item.chords.map((slot) => ({ ...slot })) }
      const index = project.sections.findIndex((candidate) => candidate.id === item.id)
      const sections = [...project.sections]
      sections.splice(index + 1, 0, copy)
      updateProject({ ...project, sections })
      setViewSectionId(copy.id)
      return
    }
    const generated = generateChords(project, item)
    updateSection(generated)
  }

  const addSection = () => {
    const next = generateSectionTracks(project, makeSection(nextSectionName(project.sections), section.chords.map((slot) => slot.chord)))
    const sections = [...project.sections, next]
    updateProject({ ...project, sections, activeSectionId: next.id })
    setViewSectionId(next.id)
    setSelectedChord(0)
  }

  const updateChord = (index: number, slot: ChordSlot) => {
    updateSection({ ...section, chords: section.chords.map((item, i) => i === index ? slot : item) }, 'chord')
  }

  const addChord = () => {
    const last = section.chords[section.chords.length - 1]
    updateSection({ ...section, chords: [...section.chords, { ...last, locked: false }] })
    setSelectedChord(section.chords.length)
  }

  const deleteChord = (index: number) => {
    if (section.chords.length <= 1) return
    updateSection({ ...section, chords: section.chords.filter((_, item) => item !== index) })
    setSelectedChord(Math.max(0, Math.min(index, section.chords.length - 2)))
  }

  const moveChord = (from: number, to: number) => {
    const chords = [...section.chords]
    const [moved] = chords.splice(from, 1)
    chords.splice(to, 0, moved)
    updateSection({ ...section, chords })
    setSelectedChord(to)
  }

  const updateTrack = (track: TrackConfig, label?: string) => {
    updateProject({ ...project, tracks: project.tracks.map((item) => item.kind === track.kind ? track : item) }, label)
  }

  const addTrack = (kind: Exclude<TrackKind, 'chords'>) => {
    if (project.tracks.some((track) => track.kind === kind)) return
    const track: TrackConfig = {
      kind,
      instrument: kind === 'bass' ? 'synth-bass' : kind === 'melody' ? 'lead' : 'drums',
      volume: 0.78,
      mute: false,
      solo: false,
      style: kind === 'bass' ? 'root' : kind === 'drums' ? 'boom' : 'flowing',
    }
    const next = { ...project, tracks: [...project.tracks, track] }
    const updatedSection = kind === 'melody'
      ? { ...section, melody: generateMelody(section, project.key, project.scaleId, 'flowing') }
      : kind === 'bass'
        ? { ...section, bass: generateBass(section, 'root') }
        : { ...section, drums: generateDrums(section, 'boom') }
    updateProject({ ...next, sections: next.sections.map((item) => item.id === section.id ? updatedSection : item) })
  }

  const removeTrack = (kind: TrackKind) => {
    let sections = project.sections
    if (kind !== 'chords') {
      const clean = kind === 'melody' ? { ...section, melody: [] } : kind === 'bass' ? { ...section, bass: [] } : { ...section, drums: null }
      sections = sections.map((item) => item.id === section.id ? clean : item)
    }
    updateProject({ ...project, tracks: project.tracks.filter((track) => track.kind !== kind), sections })
  }

  const generateTrack = (kind: TrackKind) => {
    const updated = kind === 'chords'
      ? generateChords(project, section)
      : kind === 'melody'
        ? { ...section, melody: generateMelody(section, project.key, project.scaleId, (project.tracks.find((track) => track.kind === kind)?.style as 'flowing' | 'rhythmic' | 'sparse' | 'arp') ?? 'flowing') }
        : kind === 'bass'
          ? { ...section, bass: generateBass(section, (project.tracks.find((track) => track.kind === kind)?.style as 'root' | 'pulse' | 'rootFifth' | 'octave' | 'walking') ?? 'root') }
          : { ...section, drums: generateDrums(section, project.tracks.find((track) => track.kind === kind)?.style ?? 'boom') }
    updateSection(updated)
    notify(`${kind[0].toUpperCase()}${kind.slice(1)} regenerated`)
  }

  const generateVibe = (vibe: string) => {
    const result = generateVibeProject(project, vibe)
    updateProject(result.project)
    setViewSectionId(result.project.activeSectionId)
    notify(`Generated ${result.description}`)
  }

  const play = useCallback(async () => {
    if (playing) {
      songAudio.stop()
      setPlaying(false)
      return
    }
    await songAudio.start()
    await songAudio.setTracks(project.tracks, project.masterVolume)
    const sectionIds = project.loopSection ? [section.id] : project.sections.map((item) => item.id)
    songAudio.scheduleSong({
      project,
      startBeat: 0,
      sectionIds,
      onChord: (id, index) => {
        if (id === section.id && id === viewSectionId) setSelectedChord(index)
      },
    })
    setPlaying(true)
  }, [playing, project, section, viewSectionId])

  const seek = async (beat: number) => {
    setPlayheadBeat(beat)
    await songAudio.start()
    await songAudio.setTracks(project.tracks, project.masterVolume)
    songAudio.scheduleSong({ project, startBeat: beat, sectionIds: [section.id] })
    setPlaying(true)
  }

  const exportProject = async (format: 'midi' | 'chords-midi' | 'wav') => {
    if (format === 'midi' || format === 'chords-midi') {
      downloadMidi(project.title || 'tryad-song', songToMidi(project, format === 'chords-midi'))
      notify('MIDI export started')
      return
    }
    setIsRendering(true)
    try {
      const buffer = await renderSong(project)
      downloadBlob(audioBufferToWav(buffer), `${project.title || 'tryad-song'}.wav`, 'audio/wav')
      notify('WAV export started')
    } catch {
      notify('WAV render failed')
    } finally {
      setIsRendering(false)
    }
  }

  const shareProject = async () => {
    try {
      const url = await buildProjectShareUrl(project)
      await navigator.clipboard.writeText(url)
      notify('Share link copied')
    } catch {
      const url = await buildProjectShareUrl(project)
      window.prompt('Copy your share link', url)
    }
  }

  const saveAs = () => {
    const copy = { ...project, id: createId(), title: `${project.title || 'untitled'} copy` }
    const next = [...projects, copy]
    setProjects(next)
    saveProjectList(next)
    dispatch({ type: 'replace', project: copy })
    notify('Saved as a new project')
  }

  const openProject = (selected: Project) => {
    dispatch({ type: 'replace', project: selected })
    setViewSectionId(selected.activeSectionId)
    setSelectedChord(0)
    notify('Project opened')
  }

  const updateKey = (key: PitchClass, scaleId: ScaleId) => {
    updateProject(transposeProject(project, key, scaleId))
    setKeyMenu(false)
  }

  const setMaster = (value: number) => updateProject({ ...project, masterVolume: value }, 'master-volume')

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable
      if (typing) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if (event.code === 'Space') {
        event.preventDefault()
        void play()
      } else if (event.key === '?') {
        setShortcutsOpen((open) => !open)
      } else if (event.key.toLowerCase() === 'p') {
        setPaletteOpen((open) => !open)
      } else if (event.key.toLowerCase() === 't') {
        setToolsMenu((open) => !open)
      } else if (event.key === 'ArrowRight') {
        setSelectedChord((index) => Math.min(section.chords.length - 1, index + 1))
      } else if (event.key === 'ArrowLeft') {
        setSelectedChord((index) => Math.max(0, index - 1))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [play, section.chords.length])

  const savedProjects = useMemo(() => projects.filter((item) => item.id !== project.id).map((item) => ({ id: item.id, title: item.title, project: item })), [projects, project.id])
  return (
    <main className="studio-app">
      <StudioTopBar
        project={project}
        canUndo={store.past.length > 0}
        canRedo={store.future.length > 0}
        savedProjects={savedProjects}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onTitleChange={(title) => updateProject({ ...project, title }, 'title')}
        onGenerate={generateVibe}
        onShare={() => void shareProject()}
        onExport={(format) => void exportProject(format)}
        onSaveAs={saveAs}
        onOpenProject={openProject}
        onDeleteProject={(id) => {
          const next = projects.filter((item) => item.id !== id)
          setProjects(next)
          saveProjectList(next)
          notify('Project deleted')
        }}
      />
      <StudioTimeline
        project={project}
        section={section}
        selectedChord={selectedChord}
        playheadBeat={playheadBeat}
        zoom={zoom}
        roman={roman}
        onZoom={setZoom}
        onSelectSection={(id) => { setViewSectionId(id); updateProject({ ...project, activeSectionId: id }) }}
        onSectionAction={sectionAction}
        onAddSection={addSection}
        onUpdateTrack={(track) => updateTrack(track, 'track-controls')}
        onRemoveTrack={removeTrack}
        onAddTrack={addTrack}
        onSelectChord={setSelectedChord}
        onPreviewChord={(index) => void previewChord(section.chords[index]?.chord, section.chords[index])}
        onOpenPalette={(index) => { setSelectedChord(index); setPaletteOpen(true); setEditor(null) }}
        onUpdateChord={updateChord}
        onDeleteChord={deleteChord}
        onMoveChord={moveChord}
        onAddChord={addChord}
        onSeek={(beat) => void seek(beat)}
        onOpenClip={(kind) => { setEditor(kind); setPaletteOpen(true) }}
        onOpenGenerator={generateTrack}
      />
      <StudioBottomPanel
        project={project}
        section={section}
        chordIndex={selectedChord}
        open={paletteOpen}
        editor={editor}
        requestedTab={panelTab}
        previousChord={previousChord}
        roman={roman}
        onRoman={setRoman}
        onClose={() => { setPaletteOpen(false); setEditor(null) }}
        onTabChange={setPanelTab}
        onAssign={assignChord}
        onInversion={(inversion) => activeSlot && updateChord(selectedChord, { ...activeSlot, inversion })}
        onOctave={(octave) => activeSlot && updateChord(selectedChord, { ...activeSlot, octave })}
        onPreview={(chord) => void previewChord(chord)}
        onVisualMode={setVisualMode}
        visualMode={visualMode}
      />
      <footer className="studio-transport">
        <div className="studio-transport-playback">
          <button type="button" aria-label="Previous chord" onClick={() => { setSelectedChord(Math.max(0, selectedChord - 1)); setPlayheadBeat(0) }}>‹‹</button>
          <button type="button" className="studio-play-button" aria-label={playing ? 'Stop playback' : 'Play'} onClick={() => void play()}>{playing ? '■' : '▶'}</button>
          <button type="button" aria-label="Next chord" onClick={() => setSelectedChord(Math.min(section.chords.length - 1, selectedChord + 1))}>››</button>
          <span className="studio-transport-section">{section.name} · {String(Math.floor(playheadBeat / 4) + 1).padStart(2, '0')}:{String(Math.floor((playheadBeat % 4) * 4)).padStart(2, '0')}</span>
        </div>
        <div className="studio-transport-center">
          <label className="studio-bpm">BPM <input aria-label="Tempo BPM" type="number" min="40" max="220" value={project.bpm} onChange={(event) => updateProject({ ...project, bpm: Math.max(40, Math.min(220, Number(event.target.value))) }, 'bpm')} /></label>
          <label className="studio-master-volume">MASTER <input aria-label="Master volume" type="range" min="0" max="1" step="0.01" value={project.masterVolume} onChange={(event) => setMaster(Number(event.target.value))} /></label>
          <button type="button" className={`studio-transport-toggle ${project.metronome ? 'active' : ''}`} onClick={() => updateProject({ ...project, metronome: !project.metronome })}>♩ Metronome</button>
          <button type="button" className={`studio-transport-toggle ${project.loopSection ? 'active' : ''}`} onClick={() => updateProject({ ...project, loopSection: !project.loopSection })}>↻ Loop</button>
        </div>
        <div className="studio-transport-tools">
          <button type="button" onClick={() => { setPaletteOpen(true); setEditor(null); setPanelTab('In Key') }}>⌘ Chords</button>
          <button type="button" onClick={() => { setPaletteOpen(true); setEditor(null); setPanelTab('Visualizer') }}>▱ Visualizer</button>
          <div className="studio-menu-wrap">
            <button type="button" onClick={() => setKeyMenu((open) => !open)}>♬ {pcName(project.key)} {SCALES[project.scaleId].name.split(' ')[0]}⌄</button>
            {keyMenu ? <div className="studio-popover studio-key-popover">
              <strong>Key & scale</strong>
              <label>Key<select aria-label="Project key" value={project.key} onChange={(event) => updateKey(Number(event.target.value) as PitchClass, project.scaleId)}>{ALL_KEYS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
              <label>Scale<select aria-label="Project scale" value={project.scaleId} onChange={(event) => updateKey(project.key, event.target.value as ScaleId)}>{SCALE_LIST.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Chord extension<select aria-label="Chord extension" value={project.extension} onChange={(event) => updateProject({ ...project, extension: event.target.value as Extension })}>{EXTENSIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div> : null}
          </div>
          <div className="studio-menu-wrap">
            <button type="button" onClick={() => setToolsMenu((open) => !open)}>Tools⌄</button>
            {toolsMenu ? <div className="studio-popover studio-tools-menu">
              <strong>Tools</strong>
              {(['select', 'draw', 'erase'] as const).map((mode) => <button type="button" className={tool === mode ? 'selected' : ''} key={mode} onClick={() => setTool(mode)}>{mode === 'select' ? '↖ Select' : mode === 'draw' ? '✎ Draw' : '⌫ Erase'}</button>)}
              <button type="button" onClick={() => { setPaletteOpen(true); setEditor(null); setToolsMenu(false) }}>Chord palette</button>
              <button type="button" onClick={() => { setShortcutsOpen(true); setToolsMenu(false) }}>Keyboard shortcuts</button>
              {isRendering ? <span className="studio-muted">Rendering WAV…</span> : null}
            </div> : null}
          </div>
          <button type="button" aria-label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}>?</button>
        </div>
      </footer>
      {shortcutsOpen ? <div className="studio-modal-backdrop" onClick={() => setShortcutsOpen(false)}>
        <section className="studio-shortcuts-modal" onClick={(event) => event.stopPropagation()}>
          <button className="studio-modal-close" type="button" aria-label="Close shortcuts" onClick={() => setShortcutsOpen(false)}>×</button>
          <span className="studio-eyebrow">QUICK REFERENCE</span><h2>Keyboard shortcuts</h2>
          {[['Space', 'Play / stop'], ['← / →', 'Select previous / next chord'], ['P', 'Toggle chord palette'], ['T', 'Toggle tools'], ['⌘ Z', 'Undo'], ['⌘ ⇧ Z', 'Redo'], ['?', 'Show shortcuts']].map(([key, action]) => <div className="studio-shortcut-row" key={key}><kbd>{key}</kbd><span>{action}</span></div>)}
        </section>
      </div> : null}
      {toast ? <div className="studio-toast" role="status">{toast}</div> : null}
    </main>
  )
}

export default App
