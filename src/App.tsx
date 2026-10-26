import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { StudioBottomPanel } from './components/studio/StudioBottomPanel'
import { StudioTimeline } from './components/studio/StudioTimeline'
import { StudioTopBar } from './components/studio/StudioTopBar'
import { StudioTransport } from './components/studio/StudioTransport'
import { StudioMenuProvider } from './components/studio/StudioMenuContext'
import type { StudioTool } from './components/studio/StudioTransport'
import type { VisualizerMode } from './components/ChordVisualizer'
import { songAudio, renderSong } from './lib/audio'
import {
  createDefaultProject, createId, createProjectStore, loadCurrentProject, loadProjects,
  makeSection, nextSectionName, projectReducer, saveCurrentProject, saveProjectList,
  sectionRoleForName, transposeProject,
} from './lib/project'
import type { ChordSlot, Project, Section, TrackConfig, TrackKind } from './lib/project'
import { generateBass, generateChords, generateDrums, generateMelody, generateSectionTracks, generateVibeProject, regenerateChordInProgression } from './lib/generate'
import { midiToNoteName, voiceChord } from './lib/theory'
import type { Chord, KeySpelling, PitchClass, ScaleId } from './lib/theory'
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
  const [zoom, setZoom] = useState(() => window.matchMedia('(max-width: 640px)').matches ? 0.65 : 1)
  const [playheadBeat, setPlayheadBeat] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playingChord, setPlayingChord] = useState<{ sectionId: string; index: number } | null>(null)
  const [visualMode, setVisualMode] = useState<VisualizerMode>('piano')
  const [previousChord, setPreviousChord] = useState<Chord | null>(null)
  const [toast, setToast] = useState('')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const toastTimer = useRef<number | null>(null)
  const animationRef = useRef<number | null>(null)
  const playingRef = useRef(false)
  const previousHashRef = useRef('')
  const previousLiveProjectRef = useRef(project)

  const notify = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1800)
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
      }
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    }
  }, [playing])

  const onChordPlayback = useCallback((id: string, index: number) => {
    setPlayingChord({ sectionId: id, index })
    if (id === viewSectionId) setSelectedChord(index)
  }, [viewSectionId])

  useEffect(() => {
    const previous = previousLiveProjectRef.current
    previousLiveProjectRef.current = project
    if (!playing || previous === project) return
    const sectionIds = project.loopSection ? [project.activeSectionId] : project.sections.map((item) => item.id)
    if (project.loopSection && previous.activeSectionId !== project.activeSectionId) {
      songAudio.switchSectionAtNextBar({ project, sectionId: project.activeSectionId, onChord: onChordPlayback })
    } else {
      songAudio.scheduleLiveUpdate({ project, sectionIds, onChord: onChordPlayback })
    }
  }, [onChordPlayback, playing, project])

  const updateProject = useCallback((next: Project, label?: string) => {
    dispatch({ type: 'update', project: next, label })
  }, [])

  const updateSection = useCallback((updated: Section, label?: string) => {
    updateProject({ ...project, sections: project.sections.map((item) => item.id === updated.id ? updated : item) }, label)
  }, [project, updateProject])

  const regenerateSection = useCallback((target: Section) => {
    const generated = generateSectionTracks(project, target)
    updateSection(generated, 'regenerate-section')
  }, [project, updateSection])

  const regenerateAllSections = useCallback(() => {
    const sections: Section[] = []
    project.sections.forEach((item, index) => {
      const workingProject = { ...project, sections: [...sections, ...project.sections.slice(index + 1)] }
      sections.push(generateSectionTracks(workingProject, item))
    })
    updateProject({ ...project, sections }, 'regenerate-song')
    notify('Song regenerated')
  }, [notify, project, updateProject])

  const activeSlot = section.chords[selectedChord]
  const playbackSlot = playingChord
    ? project.sections.find((item) => item.id === playingChord.sectionId)?.chords[playingChord.index]
    : undefined
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

  const previewNote = async (midi: number) => {
    await songAudio.start()
    await songAudio.setTracks(project.tracks, project.masterVolume)
    songAudio.playNotes([midiToNoteName(midi)])
  }

  const sectionAction = (action: 'duplicate' | 'regenerate' | 'regenerate-all' | 'delete' | 'rename', item: Section) => {
    if (action === 'regenerate-all') {
      regenerateAllSections()
      return
    }
    if (action === 'delete') {
      if (project.sections.length === 1) return notify('A project needs at least one section')
      const sections = project.sections.filter((candidate) => candidate.id !== item.id)
      updateProject({ ...project, sections, activeSectionId: sections[0].id })
      setViewSectionId(sections[0].id)
      return
    }
    if (action === 'rename') {
      const name = window.prompt('Section name', item.name)?.trim()
      if (name) updateSection({ ...item, name, role: sectionRoleForName(name) })
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
    regenerateSection(item)
    notify(`${item.name} regenerated`)
  }

  const addSection = () => {
    const next = generateSectionTracks(project, makeSection(nextSectionName(project.sections), section.chords.map((slot) => slot.chord)))
    const sections = [...project.sections, next]
    updateProject({ ...project, sections, activeSectionId: next.id })
    setViewSectionId(next.id)
    setSelectedChord(0)
  }

  const updateChord = useCallback((index: number, slot: ChordSlot) => {
    updateSection({ ...section, chords: section.chords.map((item, i) => i === index ? slot : item) }, 'chord')
  }, [section, updateSection])

  const addChord = () => {
    const last = section.chords[section.chords.length - 1]
    updateSection({ ...section, chords: [...section.chords, { ...last, locked: false }] })
    setSelectedChord(section.chords.length)
  }

  const deleteChord = useCallback((index: number) => {
    if (section.chords.length <= 1) return
    updateSection({ ...section, chords: section.chords.filter((_, item) => item !== index) })
    setSelectedChord(Math.max(0, Math.min(index, section.chords.length - 2)))
  }, [section, updateSection])

  const moveChord = useCallback((from: number, to: number) => {
    const chords = [...section.chords]
    const [moved] = chords.splice(from, 1)
    chords.splice(to, 0, moved)
    updateSection({ ...section, chords })
    setSelectedChord(to)
  }, [section, updateSection])

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
      style: kind === 'bass' ? 'groove' : kind === 'drums' ? 'boom' : 'flowing',
    }
    const next = { ...project, tracks: [...project.tracks, track] }
    const updatedSection = kind === 'melody'
      ? { ...section, melody: generateMelody(section, project.key, project.scaleId, 'flowing') }
      : kind === 'bass'
        ? { ...section, bass: generateBass(section, 'groove', undefined, project.key, project.scaleId) }
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

  const generateTrack = useCallback((kind: TrackKind) => {
    const track = project.tracks.find((item) => item.kind === kind)
    if (track?.locked) {
      notify(`${kind[0].toUpperCase()}${kind.slice(1)} track is locked`)
      return
    }
    const updated = kind === 'chords'
      ? generateChords(project, section)
      : kind === 'melody'
        ? { ...section, melody: generateMelody(section, project.key, project.scaleId, (project.tracks.find((track) => track.kind === kind)?.style as 'flowing' | 'rhythmic' | 'sparse' | 'arp') ?? 'flowing') }
        : kind === 'bass'
          ? { ...section, bass: generateBass(section, (track?.style as 'groove' | 'root' | 'pulse' | 'rootFifth' | 'octave' | 'walking') ?? 'groove', undefined, project.key, project.scaleId) }
          : { ...section, drums: generateDrums(section, project.tracks.find((track) => track.kind === kind)?.style ?? 'boom') }
    updateSection(updated)
    notify(`${kind[0].toUpperCase()}${kind.slice(1)} regenerated`)
  }, [notify, project, section, updateSection])

  const rerollChord = useCallback((index: number) => {
    const slot = section.chords[index]
    if (!slot) return
    const chord = regenerateChordInProgression({
      key: project.key,
      keySpelling: project.keySpelling,
      scaleId: project.scaleId,
      moodId: project.moodId,
      extension: project.extension,
      chords: section.chords.map((item) => item.chord),
      index,
    })
    updateChord(index, { ...slot, chord, inversion: 0 })
  }, [project, section, updateChord])

  const generateVibe = (vibe: string) => {
    if (!vibe.trim()) {
      regenerateSection(section)
      notify(`${section.name} regenerated`)
      return
    }
    const result = generateVibeProject(project, vibe)
    updateProject(result.project)
    setViewSectionId(result.project.activeSectionId)
    notify(`Generated ${result.description}`)
  }

  const play = useCallback(async () => {
    if (playing) {
      songAudio.stop()
      setPlaying(false)
      setPlayingChord(null)
      return
    }
    await songAudio.start()
    await songAudio.setTracks(project.tracks, project.masterVolume)
    const sectionIds = project.loopSection ? [section.id] : project.sections.map((item) => item.id)
    songAudio.scheduleSong({
      project,
      startBeat: playheadBeat,
      sectionIds,
      onChord: onChordPlayback,
    })
    setPlaying(true)
  }, [playing, project, section, playheadBeat, onChordPlayback])

  const seek = async (beat: number) => {
    setPlayheadBeat(beat)
    if (playing) {
      const sectionIds = project.loopSection ? [section.id] : project.sections.map((item) => item.id)
      songAudio.scheduleLiveUpdate({ project, startBeat: beat, sectionIds, onChord: onChordPlayback })
      return
    }
    await songAudio.start()
    await songAudio.setTracks(project.tracks, project.masterVolume)
    songAudio.scheduleSong({
      project,
      startBeat: beat,
      sectionIds: [section.id],
      onChord: onChordPlayback,
    })
    setPlaying(true)
  }

  const exportProject = useCallback(async (format: 'midi' | 'chords-midi' | 'wav') => {
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
  }, [notify, project])

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

  const updateKey = (key: PitchClass, scaleId: ScaleId, spelling?: KeySpelling) => {
    updateProject(transposeProject(project, key, scaleId, spelling))
  }

  const setMaster = (value: number) => updateProject({ ...project, masterVolume: value }, 'master-volume')

  const updateGeneratorProject = (patch: Partial<Pick<Project, 'moodId' | 'scaleId'>>) => {
    updateProject({ ...project, ...patch }, 'generator-settings')
  }

  const openTool = (tool: StudioTool) => {
    if (tool === 'shortcuts') {
      setShortcutsOpen(true)
      return
    }
    if (tool === 'piano' || tool === 'guitar') {
      setVisualMode(tool)
      setPanelTab('Visualizer')
      setEditor(null)
      setPaletteOpen(true)
      return
    }
    if (tool === 'voicings') {
      setPanelTab('Voicings')
      setEditor(null)
    } else if (tool === 'chords') {
      setPanelTab('In Key')
      setEditor(null)
    } else {
      setEditor(tool)
    }
    setPaletteOpen(true)
  }

  const openVisualizer = (mode: VisualizerMode) => {
    setVisualMode(mode)
    setPanelTab('Visualizer')
    setEditor(null)
    setPaletteOpen(true)
  }

  const skipToStart = useCallback(() => {
    if (playing) {
      const sectionIds = project.loopSection ? [section.id] : project.sections.map((item) => item.id)
      songAudio.scheduleLiveUpdate({ project, startBeat: 0, sectionIds, onChord: onChordPlayback })
    } else {
      songAudio.stop()
    }
    setPlayheadBeat(0)
    setPlayingChord(null)
  }, [onChordPlayback, playing, project, section])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable
      if (typing) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveCurrentProject(project)
        notify('Saved locally')
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        void exportProject('midi')
      } else if (event.code === 'Space') {
        event.preventDefault()
        void play()
      } else if (event.key === 'Escape') {
        setPaletteOpen(false)
        setEditor(null)
      } else if (event.key === 'Home') {
        event.preventDefault()
        skipToStart()
      } else if (event.key === '?') {
        setShortcutsOpen((open) => !open)
      } else if (event.key.toLowerCase() === 'p') {
        setPaletteOpen((open) => !open)
      } else if (!editor && event.key.toLowerCase() === 'g') {
        if (event.shiftKey) regenerateAllSections()
        else {
          regenerateSection(section)
          notify(`${section.name} regenerated`)
        }
      } else if (!editor && event.key === 'Enter' && activeSlot) {
        void previewChord(activeSlot.chord, activeSlot)
      } else if (!editor && (event.key === 'Delete' || event.key === 'Backspace')) {
        deleteChord(selectedChord)
      } else if (!editor && event.key.toLowerCase() === 'r') {
        rerollChord(selectedChord)
      } else if (!editor && event.key.toLowerCase() === 'l' && activeSlot) {
        updateChord(selectedChord, { ...activeSlot, locked: !activeSlot.locked })
      } else if (!editor && event.key.toLowerCase() === 'i' && activeSlot) {
        updateChord(selectedChord, { ...activeSlot, inversion: (activeSlot.inversion + 1) % activeSlot.chord.intervals.length })
      } else if (!editor && event.key === 'ArrowRight') {
        if (event.shiftKey) moveChord(selectedChord, Math.min(section.chords.length - 1, selectedChord + 1))
        else setSelectedChord((index) => Math.min(section.chords.length - 1, index + 1))
      } else if (!editor && event.key === 'ArrowLeft') {
        if (event.shiftKey) moveChord(selectedChord, Math.max(0, selectedChord - 1))
        else setSelectedChord((index) => Math.max(0, index - 1))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [play, project, notify, exportProject, activeSlot, previewChord, deleteChord, selectedChord, rerollChord, updateChord, section, section.chords.length, moveChord, generateTrack, regenerateAllSections, regenerateSection, skipToStart, editor])

  const savedProjects = useMemo(() => projects.filter((item) => item.id !== project.id).map((item) => ({ id: item.id, title: item.title, project: item })), [projects, project.id])
  return (
    <StudioMenuProvider>
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
        onUpdateGeneratorProject={updateGeneratorProject}
        onRemoveTrack={removeTrack}
        onAddTrack={addTrack}
        onSelectChord={setSelectedChord}
        onPreviewChord={(index) => void previewChord(section.chords[index]?.chord, section.chords[index])}
        onOpenPalette={(index) => { setSelectedChord(index); setPaletteOpen(true); setEditor(null) }}
        onUpdateChord={updateChord}
        onDeleteChord={deleteChord}
        onRerollChord={rerollChord}
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
        onVisualMode={openVisualizer}
        visualMode={visualMode}
        playing={playing}
        playheadBeat={playheadBeat}
        playingChord={playbackSlot?.chord ?? null}
        playingInversion={playbackSlot?.inversion ?? 0}
        onNotesChange={(kind, notes) => updateSection({ ...section, [kind]: notes }, `edit-${kind}`)}
        onDrumsChange={(drums) => updateSection({ ...section, drums }, 'edit-drums')}
        onPreviewNote={(midi) => void previewNote(midi)}
        onRegenerate={generateTrack}
        onEditorStyleChange={(kind, style, drums) => {
          const track = project.tracks.find((item) => item.kind === kind)
          if (!track) return
          const next: Project = {
            ...project,
            tracks: project.tracks.map((item) => item.kind === kind ? { ...item, style } : item),
            sections: drums ? project.sections.map((item) => item.id === section.id ? { ...item, drums } : item) : project.sections,
          }
          updateProject(next, `style-${kind}`)
        }}
      />
      <StudioTransport
        project={project}
        playing={playing}
        visualMode={visualMode}
        isRendering={isRendering}
        onMasterVolume={setMaster}
        onMetronome={() => updateProject({ ...project, metronome: !project.metronome })}
        onBpm={(bpm) => updateProject({ ...project, bpm }, 'bpm')}
        onKey={updateKey}
        onExtension={(extension) => updateProject({ ...project, extension })}
        onPlay={() => void play()}
        onStart={skipToStart}
        onLoop={() => updateProject({ ...project, loopSection: !project.loopSection })}
        onVisualMode={openVisualizer}
        onTool={openTool}
      />
      {shortcutsOpen ? <div className="studio-modal-backdrop" onClick={() => setShortcutsOpen(false)}>
        <section className="studio-shortcuts-modal" onClick={(event) => event.stopPropagation()}>
          <button className="studio-modal-close" type="button" aria-label="Close shortcuts" onClick={() => setShortcutsOpen(false)}>×</button>
          <span className="studio-eyebrow">QUICK REFERENCE</span><h2>Keyboard shortcuts</h2>
          {[['Space', 'Play / stop'], ['G', 'Regenerate section'], ['Shift + G', 'Regenerate song'], ['Home', 'Skip to start'], ['Enter', 'Preview selected chord'], ['← / →', 'Select chord'], ['Shift + ← / →', 'Move chord'], ['Delete', 'Remove chord'], ['I', 'Cycle inversion'], ['L', 'Lock chord'], ['R', 'Reroll chord'], ['⌘ / Ctrl + Z', 'Undo'], ['⌘ / Ctrl + Shift + Z', 'Redo'], ['⌘ / Ctrl + S', 'Save locally'], ['⌘ / Ctrl + E', 'Export MIDI'], ['Esc', 'Close editor'], ['?', 'Show shortcuts']].map(([key, action]) => <div className="studio-shortcut-row" key={key}><kbd>{key}</kbd><span>{action}</span></div>)}
        </section>
      </div> : null}
      {toast ? <div className="studio-toast" role="status">{toast}</div> : null}
    </main>
    </StudioMenuProvider>
  )
}

export default App
