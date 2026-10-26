import { useEffect, useRef, useState } from 'react'
import { DRUM_STYLES, type DrumPiece } from '../../lib/drums'
import { generateDrums } from '../../lib/generate'
import type { DrumGrid, Section } from '../../lib/project'
import { sectionBeats, sectionLengthLabel } from '../../lib/project'

interface DrumStepEditorProps {
  section: Section
  style: string
  playing: boolean
  playheadBeat: number
  onGridChange: (grid: DrumGrid) => void
  onPresetChange: (style: string, grid: DrumGrid) => void
}

const PIECES: { id: DrumPiece; label: string }[] = [
  { id: 'kick', label: 'Kick' },
  { id: 'snare', label: 'Snare' },
  { id: 'hihat', label: 'Hi-hat' },
  { id: 'openhat', label: 'Open hat' },
  { id: 'ride', label: 'Ride' },
  { id: 'rim', label: 'Rim' },
]

export function DrumStepEditor({ section, style, playing, playheadBeat, onGridChange, onPresetChange }: DrumStepEditorProps) {
  const [grid, setGrid] = useState<DrumGrid>(() => section.drums ?? generateDrums(section, style))
  const gridRef = useRef(grid)
  const paintRef = useRef<{ piece: DrumPiece; value: boolean } | null>(null)
  const stepCount = Math.max(1, Math.ceil(sectionBeats(section) * 4))
  const activeStep = Math.floor(playheadBeat * 4)
  const sectionDrums = section.drums

  useEffect(() => {
    const next = sectionDrums ?? generateDrums(section, style)
    setGrid(next)
    gridRef.current = next
  }, [section, sectionDrums, style])

  const setCell = (piece: DrumPiece, index: number, value: boolean) => {
    const next: DrumGrid = {
      steps: {
        ...gridRef.current.steps,
        [piece]: Array.from({ length: stepCount }, (_, step) => step === index ? value : (gridRef.current.steps[piece]?.[step] ?? false)),
      },
    }
    gridRef.current = next
    setGrid(next)
  }

  const beginPaint = (event: React.PointerEvent<HTMLButtonElement>, piece: DrumPiece, index: number) => {
    event.preventDefault()
    const value = !(gridRef.current.steps[piece]?.[index] ?? false)
    paintRef.current = { piece, value }
    setCell(piece, index, value)
    const finish = () => {
      paintRef.current = null
      window.removeEventListener('pointerup', finish)
      onGridChange(gridRef.current)
    }
    window.addEventListener('pointerup', finish, { once: true })
  }

  const paint = (piece: DrumPiece, index: number) => {
    if (paintRef.current?.piece === piece) setCell(piece, index, paintRef.current.value)
  }

  const changePreset = (nextStyle: string) => {
    const next = generateDrums(section, nextStyle)
    gridRef.current = next
    setGrid(next)
    onPresetChange(nextStyle, next)
  }

  return (
    <div className="studio-drum-editor">
      <div className="studio-drum-toolbar">
        <label>Pattern<select aria-label="Drum style preset" value={style} onChange={(event) => changePreset(event.target.value)}>{DRUM_STYLES.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        <span>{sectionLengthLabel(sectionBeats(section))} · 16 steps per bar</span>
      </div>
      <div className="studio-drum-scroll">
        <div className="studio-drum-grid" style={{ width: 92 + stepCount * 22 }}>
          <div className="studio-drum-corner">DRUMS</div>
          <div className="studio-drum-ruler">
            {Array.from({ length: stepCount }, (_, index) => <span key={index} className={`${index % 16 === 0 ? 'bar' : ''} ${index % 4 === 0 ? 'beat' : ''}`} style={{ left: 92 + index * 22 }}>{index % 16 === 0 ? `Bar ${Math.floor(index / 16) + 1}` : index % 4 === 0 ? `${(index % 16) / 4 + 1}` : ''}</span>)}
          </div>
          {PIECES.map((piece) => (
            <div className={`studio-drum-row ${piece.id}`} key={piece.id}>
              <strong>{piece.label}</strong>
              <div className="studio-drum-cells">
                {Array.from({ length: stepCount }, (_, index) => {
                  const active = Boolean(grid.steps[piece.id]?.[index])
                  return <button
                    type="button"
                    key={index}
                    data-step={index}
                    data-piece={piece.id}
                    aria-label={`${piece.label} step ${index + 1}${active ? ' active' : ''}`}
                    className={`${active ? 'active' : ''} ${index % 16 === 0 ? 'bar' : ''} ${index % 4 === 0 ? 'beat' : ''} ${playing && activeStep === index ? 'playhead' : ''}`}
                    onPointerDown={(event) => beginPaint(event, piece.id, index)}
                    onPointerEnter={() => paint(piece.id, index)}
                  />
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
