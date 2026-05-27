import type { InstrumentId } from '../lib/audio'
import { INSTRUMENTS } from '../lib/audio'
import { DRUM_STYLES } from '../lib/drums'
import { Select } from './Select'
import { Slider } from './Slider'

interface TransportProps {
  isPlaying: boolean
  isLoading: boolean
  isRendering: boolean
  onPlayToggle: () => void
  onExport: () => void
  onRenderWav: () => void
  onSave: () => void
  onShare: () => void
  visualizerOpen: boolean
  onToggleVisualizer: () => void
  bpm: number
  onBpmChange: (v: number) => void
  beatsPerChord: number
  onBeatsChange: (v: number) => void
  instrument: InstrumentId
  onInstrumentChange: (v: InstrumentId) => void
  drumStyleId: string
  onDrumStyleChange: (v: string) => void
}

export function Transport({
  isPlaying,
  isLoading,
  isRendering,
  onPlayToggle,
  onExport,
  onRenderWav,
  onSave,
  onShare,
  visualizerOpen,
  onToggleVisualizer,
  bpm,
  onBpmChange,
  beatsPerChord,
  onBeatsChange,
  instrument,
  onInstrumentChange,
  drumStyleId,
  onDrumStyleChange,
}: TransportProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onPlayToggle}
          className="pill pill-primary min-w-[148px] py-2.5"
          disabled={isLoading}
        >
          {isLoading ? (
            <Spinner />
          ) : isPlaying ? (
            <>
              <Icon name="pause" /> pause
            </>
          ) : (
            <>
              <Icon name="play" /> play loop
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onToggleVisualizer}
          className={`pill py-2.5 ${visualizerOpen ? 'border-accent/60 text-accent' : ''}`}
          aria-pressed={visualizerOpen}
        >
          <Icon name="visualizer" /> {visualizerOpen ? 'hide' : 'show'} visualizer
        </button>
        <button type="button" onClick={onSave} className="pill py-2.5">
          <Icon name="save" /> save
        </button>
        <button type="button" onClick={onShare} className="pill py-2.5">
          <Icon name="share" /> share
        </button>
        <button type="button" onClick={onExport} className="pill py-2.5">
          <Icon name="midi" /> midi
        </button>
        <button
          type="button"
          onClick={onRenderWav}
          disabled={isRendering}
          className="pill py-2.5"
          title="Bounce the loop to a 16-bit WAV file"
        >
          {isRendering ? <Spinner /> : <Icon name="wav" />}{' '}
          {isRendering ? 'rendering…' : 'wav'}
        </button>
        <div className="ml-auto hidden md:flex items-center gap-2 text-[11px] text-ink-mute font-mono uppercase tracking-widest">
          <span className="kbd">space</span> play
          <span className="kbd ml-2">v</span> visualizer
          <span className="kbd ml-2">g</span> regen
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
        <Slider label="tempo" suffix=" bpm" min={50} max={200} value={bpm} onChange={onBpmChange} />
        <Slider
          label="beats per chord"
          min={1}
          max={8}
          value={beatsPerChord}
          onChange={onBeatsChange}
        />
        <Select
          label="instrument"
          value={instrument}
          onChange={onInstrumentChange}
          options={INSTRUMENTS.map((i) => ({ value: i.id, label: i.label }))}
        />
        <Select
          label="drums"
          value={drumStyleId}
          onChange={onDrumStyleChange}
          options={DRUM_STYLES.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function Icon({ name }: { name: 'play' | 'pause' | 'midi' | 'save' | 'visualizer' | 'share' | 'wav' }) {
  switch (name) {
    case 'play':
      return (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M6 4.5v11a1 1 0 0 0 1.55.83l8-5.5a1 1 0 0 0 0-1.66l-8-5.5A1 1 0 0 0 6 4.5z" />
        </svg>
      )
    case 'pause':
      return (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
          <rect x="5" y="4" width="4" height="12" rx="1" />
          <rect x="11" y="4" width="4" height="12" rx="1" />
        </svg>
      )
    case 'visualizer':
      return (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
          <rect x="3" y="10" width="2.4" height="7" rx="0.6" />
          <rect x="6.5" y="6" width="2.4" height="11" rx="0.6" />
          <rect x="10" y="3" width="2.4" height="14" rx="0.6" />
          <rect x="13.5" y="8" width="2.4" height="9" rx="0.6" />
        </svg>
      )
    case 'midi':
      return (
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M4 4v12M8 4v12M12 4v12M16 4v12" strokeLinecap="round" />
        </svg>
      )
    case 'save':
      return (
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M5 4h10l2 2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
          <path d="M7 4v4h6V4M7 17v-5h6v5" strokeLinejoin="round" />
        </svg>
      )
    case 'share':
      return (
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="5.5" cy="10" r="2.2" />
          <circle cx="14.5" cy="5.5" r="2.2" />
          <circle cx="14.5" cy="14.5" r="2.2" />
          <path d="M7.3 8.9 12.7 6.6M7.3 11.1l5.4 2.3" strokeLinecap="round" />
        </svg>
      )
    case 'wav':
      return (
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M3 10 L5 7 L7 13 L9 5 L11 15 L13 7 L15 12 L17 10" />
        </svg>
      )
  }
}
