import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DRUM_STYLES } from '../../lib/drums'
import { INSTRUMENTS, PLAY_MODE_GROUPS } from '../../lib/audio'
import { chordFunction, MOODS, SCALE_LIST } from '../../lib/theory'
import type { MoodId } from '../../lib/theory'
import { sectionLengthLabel } from '../../lib/project'
import type { ChordSlot, Project, Section, TrackConfig, TrackKind } from '../../lib/project'
import { useStudioMenu } from './useStudioMenu'

const TRACK_LABELS: Record<TrackKind, string> = { chords: 'Chords', melody: 'Melody', bass: 'Bass', drums: 'Drums' }
const BEAT_WIDTH = 68

interface StudioTimelineProps {
  project: Project
  section: Section
  selectedChord: number
  playheadBeat: number
  zoom: number
  roman: boolean
  onZoom: (zoom: number) => void
  onSelectSection: (id: string) => void
  onSectionAction: (action: 'duplicate' | 'regenerate' | 'regenerate-all' | 'delete' | 'rename', section: Section) => void
  onAddSection: () => void
  onUpdateTrack: (track: TrackConfig) => void
  onUpdateGeneratorProject: (patch: Partial<Pick<Project, 'moodId' | 'scaleId'>>) => void
  onRemoveTrack: (kind: TrackKind) => void
  onAddTrack: (kind: Exclude<TrackKind, 'chords'>) => void
  onSelectChord: (index: number) => void
  onPreviewChord: (index: number) => void
  onOpenPalette: (index: number) => void
  onUpdateChord: (index: number, slot: ChordSlot) => void
  onDeleteChord: (index: number) => void
  onRerollChord: (index: number) => void
  onMoveChord: (from: number, to: number) => void
  onAddChord: () => void
  onSeek: (beat: number) => void
  onOpenClip: (kind: Exclude<TrackKind, 'chords'>) => void
  onOpenGenerator: (kind: TrackKind) => void
}

export function StudioTimeline(props: StudioTimelineProps) {
  const {
    project, section, selectedChord, playheadBeat, zoom, roman, onZoom, onSelectSection,
    onSectionAction, onAddSection, onUpdateTrack, onUpdateGeneratorProject, onRemoveTrack,
    onAddTrack, onSelectChord, onPreviewChord, onOpenPalette, onUpdateChord, onDeleteChord,
    onRerollChord, onMoveChord, onAddChord, onSeek, onOpenClip, onOpenGenerator,
  } = props
  const { openMenu, setOpenMenu } = useStudioMenu()
  const sectionMenu = openMenu?.startsWith('section:') ? openMenu.slice(8) : null
  const trackMenu = openMenu?.startsWith('track:') ? openMenu.slice(6) as TrackKind : null
  const settings = openMenu?.startsWith('settings:') ? openMenu.slice(9) as TrackKind : null
  const addTrackOpen = openMenu === 'add-track'
  const setSectionMenu = (id: string | null) => setOpenMenu(id ? `section:${id}` : null)
  const setTrackMenu = (kind: TrackKind | null) => setOpenMenu(kind ? `track:${kind}` : null)
  const [dragChord, setDragChord] = useState<number | null>(null)
  const [draftResize, setDraftResize] = useState<{ index: number; beats: number } | null>(null)
  const tileRefs = useRef(new Map<TrackKind, HTMLDivElement>())
  const tracks = project.tracks
  const totalBeats = section.chords.reduce((sum, slot) => sum + slot.beats, 0)
  const pxPerBeat = BEAT_WIDTH * zoom
  const sectionWidth = totalBeats * pxPerBeat
  const timelineWidth = Math.max(560, sectionWidth + 90)

  const beginResize = (event: React.PointerEvent, index: number, beats: number, edge: 'left' | 'right') => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startBeats = beats
    const move = (moveEvent: PointerEvent) => {
      const direction = edge === 'left' ? -1 : 1
      const delta = ((moveEvent.clientX - startX) / pxPerBeat) * direction
      const snap = moveEvent.shiftKey ? 0.5 : 1
      setDraftResize({ index, beats: Math.max(1, Math.min(16, Math.round((startBeats + delta) / snap) * snap)) })
    }
    const end = (endEvent: PointerEvent) => {
      const direction = edge === 'left' ? -1 : 1
      const delta = ((endEvent.clientX - startX) / pxPerBeat) * direction
      const snap = endEvent.shiftKey ? 0.5 : 1
      const next = Math.max(1, Math.min(16, Math.round((startBeats + delta) / snap) * snap))
      setDraftResize(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      if (next !== startBeats) onUpdateChord(index, { ...section.chords[index], beats: next })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
  }

  const rulerSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(totalBeats, (event.clientX - bounds.left) / pxPerBeat)))
  }

  const positionBar = Math.floor(playheadBeat / 4) + 1
  const positionBeat = Math.floor((playheadBeat % 4) + 1)
  const missingTracks = (['melody', 'bass', 'drums'] as const).filter((kind) => !tracks.some((track) => track.kind === kind))

  return (
    <>
      <div className="studio-section-tabs">
        {project.sections.map((item, index) => (
          <div className={`studio-section-tab ${item.id === section.id ? 'active' : ''}`} key={item.id} data-studio-menu-root>
            <button type="button" onClick={() => onSelectSection(item.id)}>{index + 1} <span>{item.name}</span></button>
            <button
              type="button"
              aria-label={`Options for ${item.name}`}
              onClick={() => setSectionMenu(sectionMenu === item.id ? null : item.id)}
              onContextMenu={(event) => { event.preventDefault(); setSectionMenu(item.id) }}
            >⋯</button>
            {sectionMenu === item.id ? (
              <div className="studio-popover studio-section-menu">
                {(['rename', 'duplicate', 'regenerate', 'regenerate-all', 'delete'] as const).map((action) => (
                  <button type="button" key={action} onClick={() => {
                    onSectionAction(action, item)
                    setSectionMenu(null)
                  }}>{action === 'regenerate' ? 'Regenerate section' : action === 'regenerate-all' ? 'Regenerate all sections' : action[0].toUpperCase() + action.slice(1)}</button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button type="button" className="studio-add-section" aria-label="Add section" onClick={onAddSection}>+</button>
        {missingTracks.length ? <div className="studio-mobile-add-track" data-studio-menu-root>
          <button type="button" onClick={() => setOpenMenu(addTrackOpen ? null : 'add-track')}>+ Track</button>
          {addTrackOpen ? <div className="studio-popover studio-add-track-menu">{missingTracks.map((kind) => <button type="button" key={kind} onClick={() => { onAddTrack(kind); setOpenMenu(null) }}>{TRACK_LABELS[kind]}</button>)}</div> : null}
        </div> : null}
        <div className="studio-tabs-spacer" />
        <span className="studio-position-readout">{positionBar}.{positionBeat} · {sectionLengthLabel(totalBeats)}</span>
      </div>
      <div className="studio-workspace">
      <div className="studio-grid">
        <div className="studio-ruler-label">
          <span>TRACKS</span>
          <div className="studio-zoom">
            <button type="button" aria-label="Zoom out" onClick={() => onZoom(Math.max(0.5, zoom - 0.1))}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => onZoom(Math.min(1.8, zoom + 0.1))}>+</button>
          </div>
        </div>
        <div className="studio-ruler-scroll">
          <div className="studio-ruler" style={{ width: timelineWidth }} onClick={rulerSeek}>
            {Array.from({ length: Math.ceil(timelineWidth / pxPerBeat) + 1 }, (_, beat) => <span className={`studio-ruler-gridline ${beat % 4 === 0 ? 'bar' : ''}`} style={{ left: beat * pxPerBeat }} key={beat} />)}
            {Array.from({ length: Math.ceil(totalBeats / 4) + 1 }, (_, bar) => (
              <span className="studio-bar-marker" style={{ left: bar * 4 * pxPerBeat }} key={bar}>{bar + 1}</span>
            ))}
            <span className="studio-ruler-playhead" style={{ left: playheadBeat * pxPerBeat }} />
          </div>
        </div>
        {tracks.map((track) => (
          <div className="studio-track-row" key={track.kind}>
            <div className="studio-track-head" data-studio-menu-root>
              <div className="studio-track-main">
                <div className="studio-track-title">
                  <TrackIcon kind={track.kind} />
                  <div>
                    <strong>{TRACK_LABELS[track.kind]}</strong>
                    <small>{trackInstrumentLabel(track)}</small>
                  </div>
                </div>
                <input
                  aria-label={`${TRACK_LABELS[track.kind]} volume`}
                  title={`${Math.round(track.volume * 100)}%`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={track.volume}
                  onChange={(event) => onUpdateTrack({ ...track, volume: Number(event.target.value) })}
                />
                <div className="studio-track-actions">
                  <button className={`studio-track-lock ${track.locked ? 'on' : ''}`} type="button" aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.kind} track`} title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => onUpdateTrack({ ...track, locked: !track.locked })}><Icon name={track.locked ? 'lock' : 'unlock'} /></button>
                  <button className={`studio-ms ${track.mute ? 'on' : ''}`} type="button" aria-label={`Mute ${track.kind}`} onClick={() => onUpdateTrack({ ...track, mute: !track.mute })}>M</button>
                  <button className={`studio-ms ${track.solo ? 'on' : ''}`} type="button" aria-label={`Solo ${track.kind}`} onClick={() => onUpdateTrack({ ...track, solo: !track.solo })}>S</button>
                  <button className="studio-track-more" type="button" aria-label={`${track.kind} track menu`} onClick={() => setTrackMenu(trackMenu === track.kind ? null : track.kind)}><Icon name="more" /></button>
                </div>
              </div>
              {trackMenu === track.kind ? (
                <div className="studio-popover studio-track-menu">
                  <span className="studio-popover-title">{track.kind === 'drums' ? 'Drum style' : 'Instrument'}</span>
                  {(track.kind === 'drums' ? DRUM_STYLES.map((style) => ({ id: style.id, label: style.label })) : INSTRUMENTS
                    .filter((instrument) => track.kind === 'bass' ? instrument.id.includes('bass') : !instrument.id.includes('bass'))
                    .map(({ id, label }) => ({ id, label }))).map((item) => (
                    <button type="button" key={item.id} onClick={() => {
                      onUpdateTrack(track.kind === 'drums' ? { ...track, style: item.id } : { ...track, instrument: item.id })
                      setTrackMenu(null)
                    }}>{item.label}</button>
                  ))}
                  {track.kind !== 'chords' ? <button type="button" className="danger" onClick={() => { onRemoveTrack(track.kind); setTrackMenu(null) }}>Remove track</button> : null}
                </div>
              ) : null}
              <div className="studio-generator-tile" ref={(node) => {
                if (node) tileRefs.current.set(track.kind, node)
                else tileRefs.current.delete(track.kind)
              }} data-studio-menu-root>
                <button type="button" aria-label={`Regenerate ${track.kind}`} onClick={() => onOpenGenerator(track.kind)}><Icon name="refresh" /></button>
                <button type="button" aria-label={`${track.kind} generator settings`} onClick={() => setOpenMenu(settings === track.kind ? null : `settings:${track.kind}`)}><Icon name="settings" /></button>
              </div>
            </div>
            <div className="studio-lane-wrap">
              <div
                className="studio-lane"
                style={{ width: timelineWidth }}
              >
                {Array.from({ length: Math.ceil(totalBeats / 4) }, (_, bar) => <span className={`studio-lane-bar ${bar % 2 ? 'alt' : ''}`} style={{ left: bar * 4 * pxPerBeat, width: 4 * pxPerBeat }} key={`bar-${bar}`} />)}
                {Array.from({ length: Math.ceil(timelineWidth / pxPerBeat) + 1 }, (_, beat) => <span className={`studio-lane-gridline ${beat % 4 === 0 ? 'bar' : ''}`} style={{ left: beat * pxPerBeat }} key={beat} />)}
                {track.kind === 'chords' ? (
                  <div className="studio-chord-lane" style={{ width: sectionWidth }}>
                    {section.chords.map((slot, index) => {
                      const beats = draftResize?.index === index ? draftResize.beats : slot.beats
                      const chordMenuId = `chord:${section.id}:${index}`
                      return (
                        <div
                          className={`studio-chord-block ${selectedChord === index ? 'selected' : ''} ${slot.locked ? 'locked' : ''} ${beats * pxPerBeat < 110 ? 'compact' : ''}`}
                          style={{ width: beats * pxPerBeat }}
                          data-function={chordFunction(slot.chord, project.key, project.scaleId)}
                          key={`${section.id}-${index}-${slot.chord.symbol}`}
                          data-studio-menu-root
                          draggable
                          onDragStart={(event) => { setDragChord(index); event.dataTransfer.setData('text/plain', String(index)) }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => { event.preventDefault(); const from = dragChord ?? Number(event.dataTransfer.getData('text/plain')); if (from !== index) onMoveChord(from, index); setDragChord(null) }}
                          onClick={() => { onSelectChord(index); onPreviewChord(index) }}
                          onDoubleClick={() => onOpenPalette(index)}
                        >
                          <span className={`studio-chord-title ${roman ? 'roman' : ''}`}><small>{slot.chord.roman}</small><small>{chordFunction(slot.chord, project.key, project.scaleId)}</small></span>
                          <strong>{slot.chord.symbol}</strong>
                            <div className={`studio-chord-actions ${beats * pxPerBeat < 110 ? 'compact' : ''}`}>
                            <button type="button" aria-label={`Regenerate chord ${index + 1}`} title="Regenerate" onClick={(event) => { event.stopPropagation(); onRerollChord(index) }}><Icon name="refresh" /></button>
                            <button type="button" aria-label={`${slot.locked ? 'Unlock' : 'Lock'} chord ${index + 1}`} title={slot.locked ? 'Unlock' : 'Lock'} onClick={(event) => { event.stopPropagation(); onUpdateChord(index, { ...slot, locked: !slot.locked }) }}><Icon name={slot.locked ? 'unlock' : 'lock'} /></button>
                            {section.chords.length > 1 ? <button type="button" aria-label={`Delete chord ${index + 1}`} title="Delete" onClick={(event) => { event.stopPropagation(); onDeleteChord(index) }}><Icon name="trash" /></button> : null}
                            <button type="button" className="studio-chord-more" aria-label={`More actions for chord ${index + 1}`} onClick={(event) => { event.stopPropagation(); setOpenMenu(openMenu === chordMenuId ? null : chordMenuId) }}>⋯</button>
                          </div>
                          {openMenu === chordMenuId ? (
                            <div className="studio-popover studio-chord-menu">
                              <button type="button" onClick={(event) => { event.stopPropagation(); onRerollChord(index); setOpenMenu(null) }}>Regenerate chord</button>
                              <button type="button" onClick={(event) => { event.stopPropagation(); onUpdateChord(index, { ...slot, locked: !slot.locked }); setOpenMenu(null) }}>{slot.locked ? 'Unlock chord' : 'Lock chord'}</button>
                              {section.chords.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteChord(index); setOpenMenu(null) }}>Delete chord</button> : null}
                            </div>
                          ) : null}
                          {selectedChord === index ? (
                            <>
                              <button type="button" className="studio-chord-edit" onClick={(event) => { event.stopPropagation(); onOpenPalette(index) }}>Edit</button>
                              <button type="button" className="studio-resize-handle left" aria-label="Resize chord start" onPointerDown={(event) => beginResize(event, index, slot.beats, 'left')} />
                              <button type="button" className="studio-resize-handle right" aria-label="Resize chord end" onPointerDown={(event) => beginResize(event, index, slot.beats, 'right')} />
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                    <button type="button" className="studio-chord-add" style={{ left: sectionWidth + 10 }} aria-label="Add chord" onClick={onAddChord}>+</button>
                  </div>
                ) : track.kind === 'melody' || track.kind === 'bass' ? (
                  <div
                    className={`studio-note-clip ${track.kind}`}
                    style={{ width: sectionWidth }}
                    role="button"
                    tabIndex={0}
                    onDoubleClick={() => onOpenClip(track.kind === 'melody' ? 'melody' : 'bass')}
                    onKeyDown={(event) => event.key === 'Enter' && onOpenClip(track.kind === 'melody' ? 'melody' : 'bass')}
                  >
                    {section[track.kind].map((note, index) => {
                      const low = track.kind === 'bass' ? 28 : 48
                      const high = track.kind === 'bass' ? 52 : 88
                      const pitchStep = track.kind === 'bass' ? 2 : 1.2
                      const pitch = Math.max(0, Math.min(high - low, note.midi - low))
                      return (
                        <span key={`${note.start}-${index}`} style={{
                          left: `${note.start / Math.max(1, totalBeats) * 100}%`,
                          width: `${Math.max(0.6, note.dur / Math.max(1, totalBeats) * 100)}%`,
                          bottom: `${3 + pitch * pitchStep}px`,
                        }} />
                      )
                    })}
                    {!section[track.kind].length ? <span className="studio-clip-placeholder">Double-click to open {track.kind} editor</span> : null}
                  </div>
                ) : (
                  <div
                    className="studio-drum-clip"
                    style={{ width: sectionWidth }}
                    role="button"
                    tabIndex={0}
                    onDoubleClick={() => onOpenClip('drums')}
                    onKeyDown={(event) => event.key === 'Enter' && onOpenClip('drums')}
                  >
                    {(section.drums?.steps.kick ?? []).map((hit, i) => hit ? <i key={`k${i}`} style={{ left: `${i / Math.max(1, totalBeats * 4) * 100}%` }} /> : null)}
                    {(section.drums?.steps.snare ?? []).map((hit, i) => hit ? <b key={`s${i}`} style={{ left: `${i / Math.max(1, totalBeats * 4) * 100}%` }} /> : null)}
                    {(section.drums?.steps.hihat ?? []).map((hit, i) => hit ? <em key={`h${i}`} style={{ left: `${i / Math.max(1, totalBeats * 4) * 100}%` }} /> : null)}
                    {!section.drums ? <span className="studio-clip-placeholder">Double-click to open drum editor</span> : null}
                  </div>
                )}
                {playheadBeat > 0 ? <span className="studio-playhead-line" style={{ left: playheadBeat * pxPerBeat }} /> : null}
              </div>
            </div>
          </div>
        ))}
        {missingTracks.length ? (
          <div className="studio-track-row studio-add-track-row">
            <div className="studio-track-head studio-add-track-head">
              {missingTracks.map((kind) => (
                <button type="button" key={kind} onClick={() => onAddTrack(kind)}><span>+</span><TrackIcon kind={kind} /> Add {TRACK_LABELS[kind]}</button>
              ))}
            </div>
            <div className="studio-lane-wrap"><div className="studio-lane empty" style={{ width: timelineWidth }}>{Array.from({ length: Math.ceil(timelineWidth / pxPerBeat) + 1 }, (_, beat) => <span className={`studio-lane-gridline ${beat % 4 === 0 ? 'bar' : ''}`} style={{ left: beat * pxPerBeat }} key={beat} />)}</div></div>
          </div>
        ) : null}
        <div className="studio-track-row studio-empty-row" aria-hidden="true">
          <div className="studio-track-head" />
          <div className="studio-lane-wrap">
            <div className="studio-lane studio-empty-lane" style={{ width: timelineWidth }}>
              {Array.from({ length: Math.ceil(totalBeats / 4) }, (_, bar) => <span className={`studio-lane-bar ${bar % 2 ? 'alt' : ''}`} style={{ left: bar * 4 * pxPerBeat, width: 4 * pxPerBeat }} key={`bar-${bar}`} />)}
              {Array.from({ length: Math.ceil(timelineWidth / pxPerBeat) + 1 }, (_, beat) => <span className={`studio-lane-gridline ${beat % 4 === 0 ? 'bar' : ''}`} style={{ left: beat * pxPerBeat }} key={beat} />)}
            </div>
          </div>
        </div>
      </div>
      {settings ? (
        <GeneratorSettingsPopover
          key={settings}
          track={tracks.find((item) => item.kind === settings)!}
          project={project}
          anchor={tileRefs.current.get(settings) ?? null}
          onClose={() => setOpenMenu(null)}
          onUpdateTrack={onUpdateTrack}
          onUpdateProject={onUpdateGeneratorProject}
          onRegenerate={() => { onOpenGenerator(settings); setOpenMenu(null) }}
        />
      ) : null}
      </div>
    </>
  )
}

function trackInstrumentLabel(track: TrackConfig): string {
  if (track.kind === 'drums') return DRUM_STYLES.find((item) => item.id === track.style)?.label ?? 'drums'
  return INSTRUMENTS.find((item) => item.id === track.instrument)?.label ?? track.instrument
}

function TrackIcon({ kind }: { kind: TrackKind }) {
  return <span className={`studio-track-icon ${kind}`}><Icon name={kind} /></span>
}

function Icon({ name }: { name: string }) {
  const shared = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...shared}>
      {name === 'chords' ? <><path d="M9 18V5l12-2v13" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="18" cy="16" rx="3" ry="2" /></>
        : name === 'melody' ? <path d="M3 13h3l2-7 4 13 3-9 2 4h4" />
          : name === 'bass' ? <><path d="M4 18V6" /><path d="M8 16V8" /><path d="M12 19V5" /><path d="M16 15V9" /><path d="M20 17V7" /></>
            : name === 'drums' ? <><circle cx="12" cy="12" r="8" /><path d="m6.4 6.4 11.2 11.2M17.6 6.4 6.4 17.6" /></>
              : name === 'refresh' ? <><path d="M20 7v5h-5" /><path d="M4.5 10a7.5 7.5 0 0 1 13-3L20 10M4 17v-5h5" /><path d="M19.5 14a7.5 7.5 0 0 1-13 3L4 14" /></>
                      : name === 'settings' ? <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="var(--hot)" /><circle cx="15" cy="12" r="2" fill="var(--hot)" /><circle cx="11" cy="18" r="2" fill="var(--hot)" /></>
                  : name === 'more' ? <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>
                    : name === 'lock' || name === 'unlock' ? <><rect x="5" y="10" width="14" height="11" rx="2" /><path d={name === 'lock' ? 'M8 10V7a4 4 0 1 1 8 0v3' : 'M8 10V7a4 4 0 0 1 7-2'} /></>
                      : name === 'trash' ? <><path d="M4 7h16M10 11v6M14 11v6" /><path d="m6 7 1 14h10l1-14M9 7V4h6v3" /></>
                        : null}
    </svg>
  )
}

function GeneratorSettingsPopover({
  track,
  project,
  anchor,
  onClose,
  onUpdateTrack,
  onUpdateProject,
  onRegenerate,
}: {
  track: TrackConfig
  project: Project
  anchor: HTMLElement | null
  onClose: () => void
  onUpdateTrack: (track: TrackConfig) => void
  onUpdateProject: (patch: Partial<Pick<Project, 'moodId' | 'scaleId'>>) => void
  onRegenerate: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  useLayoutEffect(() => {
    const updatePosition = () => {
      if (!anchor) return
      const bounds = anchor.getBoundingClientRect()
      const width = 230
      const left = bounds.right + width + 12 < window.innerWidth ? bounds.right + 8 : Math.max(8, bounds.left - width - 8)
      setPosition({ top: Math.max(8, Math.min(bounds.top, window.innerHeight - 410)), left })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchor])
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onClose()
    }
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [anchor, onClose])
  if (!anchor) return null

  const instrumentOptions = INSTRUMENTS.filter((item) => track.kind === 'bass' ? item.id.includes('bass') : !item.id.includes('bass'))
  const styleOptions = track.kind === 'melody'
    ? ['flowing', 'rhythmic', 'sparse', 'arp']
    : track.kind === 'bass'
      ? ['root', 'pulse', 'rootFifth', 'octave', 'walking']
      : DRUM_STYLES.map((item) => item.id)
  const styleValue = track.style ?? (track.kind === 'bass' ? 'root' : track.kind === 'drums' ? 'boom' : 'flowing')
  const content = (
    <div ref={popoverRef} className="studio-popover studio-generator-popover" style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 10000 }}>
      <strong>{TRACK_LABELS[track.kind]} generator</strong>
      {track.kind === 'chords' ? (
        <>
          <label>Instrument<select aria-label="Chords generator instrument" value={track.instrument} onChange={(event) => onUpdateTrack({ ...track, instrument: event.target.value })}>{instrumentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>Play mode<select aria-label="Chord play mode" value={track.playMode ?? 'block'} onChange={(event) => onUpdateTrack({ ...track, playMode: event.target.value as TrackConfig['playMode'] })}>{PLAY_MODE_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</optgroup>)}</select></label>
          <label>Mood<select aria-label="Chord mood" value={project.moodId} onChange={(event) => onUpdateProject({ moodId: event.target.value as MoodId })}>{MOODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>Scale<select aria-label="Chord scale" value={project.scaleId} onChange={(event) => onUpdateProject({ scaleId: event.target.value as Project['scaleId'] })}>{SCALE_LIST.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </>
      ) : track.kind === 'drums' ? (
        <label>Style preset<select aria-label="Drum style preset" value={styleValue} onChange={(event) => onUpdateTrack({ ...track, style: event.target.value })}>{DRUM_STYLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      ) : (
        <>
          <label>Instrument<select aria-label={`${TRACK_LABELS[track.kind]} instrument`} value={track.instrument} onChange={(event) => onUpdateTrack({ ...track, instrument: event.target.value })}>{instrumentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>Style<select aria-label={`${TRACK_LABELS[track.kind]} style`} value={styleValue} onChange={(event) => onUpdateTrack({ ...track, style: event.target.value })}>{styleOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </>
      )}
      <button type="button" className="studio-settings-apply" onClick={onRegenerate}>Regenerate track</button>
    </div>
  )
  return createPortal(content, document.body)
}
