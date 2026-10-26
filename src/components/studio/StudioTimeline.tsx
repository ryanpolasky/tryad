import { useRef, useState } from 'react'
import { INSTRUMENTS } from '../../lib/audio'
import { DRUM_STYLES } from '../../lib/drums'
import type { ChordSlot, Project, Section, TrackConfig, TrackKind } from '../../lib/project'

const TRACK_LABELS: Record<TrackKind, string> = { chords: 'Chords', melody: 'Melody', bass: 'Bass', drums: 'Drums' }
const TRACK_ICONS: Record<TrackKind, string> = { chords: '♬', melody: '〽', bass: '▰', drums: '◉' }
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
  onSectionAction: (action: 'duplicate' | 'regenerate' | 'delete' | 'rename', section: Section) => void
  onAddSection: () => void
  onUpdateTrack: (track: TrackConfig) => void
  onRemoveTrack: (kind: TrackKind) => void
  onAddTrack: (kind: Exclude<TrackKind, 'chords'>) => void
  onSelectChord: (index: number) => void
  onPreviewChord: (index: number) => void
  onOpenPalette: (index: number) => void
  onUpdateChord: (index: number, slot: ChordSlot) => void
  onDeleteChord: (index: number) => void
  onMoveChord: (from: number, to: number) => void
  onAddChord: () => void
  onSeek: (beat: number) => void
  onOpenClip: (kind: Exclude<TrackKind, 'chords'>) => void
  onOpenGenerator: (kind: TrackKind) => void
}

export function StudioTimeline(props: StudioTimelineProps) {
  const {
    project, section, selectedChord, playheadBeat, zoom, roman, onZoom, onSelectSection,
    onSectionAction, onAddSection, onUpdateTrack, onRemoveTrack, onAddTrack, onSelectChord,
    onPreviewChord, onOpenPalette, onUpdateChord, onDeleteChord, onMoveChord, onAddChord,
    onSeek, onOpenClip, onOpenGenerator,
  } = props
  const [sectionMenu, setSectionMenu] = useState<string | null>(null)
  const [trackMenu, setTrackMenu] = useState<TrackKind | null>(null)
  const [settings, setSettings] = useState<TrackKind | null>(null)
  const [dragChord, setDragChord] = useState<number | null>(null)
  const [draftResize, setDraftResize] = useState<{ index: number; beats: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tracks = project.tracks
  const totalBeats = section.chords.reduce((sum, slot) => sum + slot.beats, 0)
  const pxPerBeat = BEAT_WIDTH * zoom
  const timelineWidth = Math.max(560, totalBeats * pxPerBeat + 90)

  const beginResize = (event: React.PointerEvent, index: number, beats: number) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startBeats = beats
    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / pxPerBeat
      const snap = moveEvent.shiftKey ? 0.5 : 1
      const next = Math.max(1, Math.min(16, Math.round((startBeats + delta) / snap) * snap))
      setDraftResize({ index, beats: next })
    }
    const end = (endEvent: PointerEvent) => {
      const delta = (endEvent.clientX - startX) / pxPerBeat
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
    const beat = Math.max(0, Math.min(totalBeats, (event.clientX - bounds.left + event.currentTarget.scrollLeft) / pxPerBeat))
    onSeek(beat)
  }

  return (
    <div className="studio-workspace">
      <div className="studio-section-tabs">
        {project.sections.map((item, index) => (
          <div className={`studio-section-tab ${item.id === section.id ? 'active' : ''}`} key={item.id}>
            <button type="button" onClick={() => onSelectSection(item.id)}>{index + 1} <span>{item.name}</span></button>
            <button
              type="button"
              aria-label={`Options for ${item.name}`}
              onClick={() => setSectionMenu(sectionMenu === item.id ? null : item.id)}
              onContextMenu={(event) => { event.preventDefault(); setSectionMenu(item.id) }}
            >⋯</button>
            {sectionMenu === item.id ? (
              <div className="studio-popover studio-section-menu">
                {(['rename', 'duplicate', 'regenerate', 'delete'] as const).map((action) => (
                  <button type="button" key={action} onClick={() => {
                    onSectionAction(action, item)
                    setSectionMenu(null)
                  }}>{action === 'regenerate' ? 'Regenerate chords' : action[0].toUpperCase() + action.slice(1)}</button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button type="button" className="studio-add-section" aria-label="Add section" onClick={onAddSection}>+</button>
        <div className="studio-tabs-spacer" />
        <span className="studio-key-meta">{totalBeats / 4} bars</span>
      </div>
      <div className="studio-grid">
        <div className="studio-ruler-label"><span>TRACKS</span><div className="studio-zoom"><button type="button" aria-label="Zoom out" onClick={() => onZoom(Math.max(0.65, zoom - 0.1))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => onZoom(Math.min(1.8, zoom + 0.1))}>+</button></div></div>
        <div className="studio-ruler-scroll" ref={scrollRef}>
          <div className="studio-ruler" style={{ width: timelineWidth }} onClick={rulerSeek}>
            {Array.from({ length: Math.ceil(totalBeats / 4) + 1 }, (_, bar) => (
              <span className="studio-bar-marker" style={{ left: bar * 4 * pxPerBeat }} key={bar}>{bar + 1}</span>
            ))}
            <span className="studio-ruler-playhead" style={{ left: playheadBeat * pxPerBeat }} />
          </div>
        </div>
        {tracks.map((track) => (
          <div className="studio-track-row" key={track.kind}>
            <div className="studio-track-head">
              <span className={`studio-track-icon ${track.kind}`}>{TRACK_ICONS[track.kind]}</span>
              <div className="studio-track-info">
                <strong>{TRACK_LABELS[track.kind]}</strong>
                <input
                  aria-label={`${TRACK_LABELS[track.kind]} volume`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={track.volume}
                  onChange={(event) => onUpdateTrack({ ...track, volume: Number(event.target.value) })}
                />
              </div>
              <button className={`studio-ms ${track.mute ? 'on' : ''}`} type="button" aria-label={`Mute ${track.kind}`} onClick={() => onUpdateTrack({ ...track, mute: !track.mute })}>M</button>
              <button className={`studio-ms ${track.solo ? 'on' : ''}`} type="button" aria-label={`Solo ${track.kind}`} onClick={() => onUpdateTrack({ ...track, solo: !track.solo })}>S</button>
              <button className="studio-track-more" type="button" aria-label={`${track.kind} track menu`} onClick={() => setTrackMenu(trackMenu === track.kind ? null : track.kind)}>⋮</button>
              {trackMenu === track.kind ? (
                <div className="studio-popover studio-track-menu">
                  <span className="studio-popover-title">Instrument</span>
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
              <div className="studio-generator-tile">
                <button type="button" aria-label={`Regenerate ${track.kind}`} onClick={() => onOpenGenerator(track.kind)}>↻</button>
                <button type="button" aria-label={`${track.kind} generator settings`} onClick={() => setSettings(settings === track.kind ? null : track.kind)}>☷</button>
                {settings === track.kind ? (
                  <div className="studio-popover studio-generator-popover">
                    <strong>{TRACK_LABELS[track.kind]} generator</strong>
                    <label>Style
                      <select value={track.style ?? (track.kind === 'chords' ? track.playMode ?? 'block' : track.kind === 'bass' ? 'root' : 'flowing')} onChange={(event) => {
                        onUpdateTrack(track.kind === 'chords' ? { ...track, playMode: event.target.value as TrackConfig['playMode'] } : { ...track, style: event.target.value })
                      }}>
                        {(track.kind === 'melody' ? ['flowing', 'rhythmic', 'sparse', 'arp'] : track.kind === 'bass' ? ['root', 'pulse', 'rootFifth', 'octave', 'walking'] : track.kind === 'drums' ? DRUM_STYLES.map((style) => style.id) : ['block', 'strum', 'arpUp', 'arpDown', 'pulse', 'syncopated']).map((style) => <option key={style} value={style}>{style}</option>)}
                      </select>
                    </label>
                    <button type="button" className="studio-settings-apply" onClick={() => { onOpenGenerator(track.kind); setSettings(null) }}>Regenerate track</button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="studio-lane-wrap">
              <div className="studio-lane" style={{ width: timelineWidth }}>
                {track.kind === 'chords' ? (
                  <div className="studio-chord-lane" style={{ width: timelineWidth }}>
                    <div className="studio-grid-lines" style={{ backgroundSize: `${4 * pxPerBeat}px 100%` }} />
                    {section.chords.map((slot, index) => {
                      const beats = draftResize?.index === index ? draftResize.beats : slot.beats
                      return (
                        <div
                          className={`studio-chord-block ${selectedChord === index ? 'selected' : ''} ${slot.locked ? 'locked' : ''}`}
                          style={{ width: beats * pxPerBeat }}
                          key={`${section.id}-${index}-${slot.chord.symbol}`}
                          draggable
                          onDragStart={(event) => { setDragChord(index); event.dataTransfer.setData('text/plain', String(index)) }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => { event.preventDefault(); const from = dragChord ?? Number(event.dataTransfer.getData('text/plain')); if (from !== index) onMoveChord(from, index); setDragChord(null) }}
                          onClick={() => { onSelectChord(index); onPreviewChord(index) }}
                          onDoubleClick={() => onOpenPalette(index)}
                        >
                          <span className="studio-chord-roman">{roman ? slot.chord.roman : slot.chord.symbol}</span>
                          <small>{slot.beats} beats</small>
                          {selectedChord === index ? (
                            <>
                              <button type="button" className="studio-chord-edit" onClick={(event) => { event.stopPropagation(); onOpenPalette(index) }}>Edit</button>
                              <button type="button" aria-label="Lock chord" className="studio-chord-lock" onClick={(event) => { event.stopPropagation(); onUpdateChord(index, { ...slot, locked: !slot.locked }) }}>{slot.locked ? '●' : '○'}</button>
                              {section.chords.length > 1 ? <button type="button" aria-label="Delete chord" className="studio-chord-delete" onClick={(event) => { event.stopPropagation(); onDeleteChord(index) }}>×</button> : null}
                              <button type="button" className="studio-resize-handle" aria-label="Resize chord" onPointerDown={(event) => beginResize(event, index, slot.beats)} />
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                    <button type="button" className="studio-chord-add" aria-label="Add chord" onClick={onAddChord}>+</button>
                    <span className="studio-playhead-line" style={{ left: playheadBeat * pxPerBeat }} />
                  </div>
                ) : track.kind === 'melody' || track.kind === 'bass' ? (
                  <button type="button" className={`studio-note-clip ${track.kind}`} onDoubleClick={() => onOpenClip(track.kind === 'melody' ? 'melody' : 'bass')} onClick={() => onSelectChord(selectedChord)}>
                    {(section[track.kind].length ? section[track.kind] : []).map((note, index) => (
                      <span key={`${note.start}-${index}`} style={{
                        left: `${note.start / Math.max(1, totalBeats) * 100}%`,
                        width: `${Math.max(0.6, note.dur / Math.max(1, totalBeats) * 100)}%`,
                        bottom: `${Math.max(4, Math.min(40, (note.midi - (track.kind === 'bass' ? 33 : 60)) * 2.2))}px`,
                      }} />
                    ))}
                    {!section[track.kind].length ? <span className="studio-clip-placeholder">Double-click to open {track.kind} editor</span> : null}
                  </button>
                ) : (
                  <button type="button" className="studio-drum-clip" onDoubleClick={() => onOpenClip('drums')}>
                    {(section.drums?.steps.kick ?? []).map((hit, i) => hit ? <i key={`k${i}`} style={{ left: `${i / Math.max(1, totalBeats * 4) * 100}%` }} /> : null)}
                    {(section.drums?.steps.snare ?? []).map((hit, i) => hit ? <b key={`s${i}`} style={{ left: `${i / Math.max(1, totalBeats * 4) * 100}%` }} /> : null)}
                    {(section.drums?.steps.hihat ?? []).map((hit, i) => hit ? <em key={`h${i}`} style={{ left: `${i / Math.max(1, totalBeats * 4) * 100}%` }} /> : null)}
                    {!section.drums ? <span className="studio-clip-placeholder">Double-click to open drum editor</span> : null}
                  </button>
                )}
                {playheadBeat > 0 ? <span className="studio-playhead-line" style={{ left: playheadBeat * pxPerBeat }} /> : null}
              </div>
            </div>
          </div>
        ))}
        <div className="studio-track-row studio-add-track-row">
          <div className="studio-track-head studio-add-track-head">
            {(['melody', 'bass', 'drums'] as const).filter((kind) => !tracks.some((track) => track.kind === kind)).map((kind) => (
              <button type="button" key={kind} onClick={() => onAddTrack(kind)}>＋ Add {TRACK_LABELS[kind]}</button>
            ))}
          </div>
          <div className="studio-lane-wrap"><div className="studio-lane empty" style={{ width: timelineWidth }} /></div>
        </div>
      </div>
    </div>
  )
}
