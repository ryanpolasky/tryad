import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InstrumentId, PlayMode } from './lib/audio'
import { PLAY_MODE_GROUPS, audio } from './lib/audio'
import { ChordCard } from './components/ChordCard'
import { ChordDrawer } from './components/ChordDrawer'
import { type VisualizerMode } from './components/ChordVisualizer'
import { SavedList } from './components/SavedList'
import { Select } from './components/Select'
import { Slider } from './components/Slider'
import { Transport } from './components/Transport'
import { Header, Footer } from './components/Chrome'
import { downloadMidi, progressionToMidi } from './lib/midi'
import { storage, type SavedProgression } from './lib/storage'
import {
  ALL_KEYS,
  EXTENSIONS,
  MOODS,
  SCALES,
  SCALE_LIST,
  diatonicChords,
  generateProgression,
  midiToNoteName,
  pcName,
  pickInversion,
  regenerateChordInProgression,
  voiceChord,
  type Chord,
  type Extension,
  type MoodId,
  type PitchClass,
  type ScaleId,
} from './lib/theory'

// what each chord actually plays at. 0 = auto-VL picks, >=1 = user forced.
// visualizer / playback / MIDI all read from this.
function effectiveInversions(chords: Chord[], userInversions: number[]): number[] {
  const out: number[] = []
  let prevTop: number | undefined
  let prevBass: number | undefined
  for (let i = 0; i < chords.length; i++) {
    const userInv = userInversions[i] ?? 0
    const inv =
      userInv > 0
        ? userInv
        : pickInversion(chords[i], 4, { prevTopMidi: prevTop, prevBassMidi: prevBass })
    out.push(inv)
    const midi = voiceChord(chords[i], 4, { forcedInversion: inv })
    prevTop = midi[midi.length - 1]
    prevBass = midi[0]
  }
  return out
}

function App() {
  const [key, setKey] = useState<PitchClass>(0)
  const [scaleId, setScaleId] = useState<ScaleId>('major')
  const [moodId, setMoodId] = useState<MoodId>('pop')
  const [length, setLength] = useState(4)
  const [extension, setExtension] = useState<Extension>('triad')
  const initialProgression = useMemo(
    () =>
      generateProgression({
        key: 0,
        scaleId: 'major',
        moodId: 'pop',
        length: 4,
        extension: 'triad',
      }).chords,
    [],
  )
  const [chords, setChords] = useState<Chord[]>(initialProgression)
  const [chordBeats, setChordBeats] = useState<number[]>(() => new Array(4).fill(4))
  // last template per mood, so generate doesn't pick the same one twice in a row.
  const lastTemplateRef = useRef<Record<string, number>>({})

  const [bpm, setBpm] = useState(96)
  const [beatsPerChord, setBeatsPerChord] = useState(4)
  const [instrument, setInstrument] = useState<InstrumentId>('piano')
  const [drumStyleId, setDrumStyleId] = useState<string>('off')
  const [playMode, setPlayMode] = useState<PlayMode>('block')

  // 0 = auto, >=1 = user forced.
  const [inversions, setInversions] = useState<number[]>(() => new Array(initialProgression.length).fill(0))
  const playedInversions = useMemo(
    () => effectiveInversions(chords, inversions),
    [chords, inversions],
  )
  const [selectedChordIdx, setSelectedChordIdx] = useState<number>(0)
  const [visualMode, setVisualMode] = useState<VisualizerMode>('piano')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [activePreview, setActivePreview] = useState<number | null>(null)

  const [saved, setSaved] = useState<SavedProgression[]>(() => storage.list())
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)

  const [audioStarted, setAudioStarted] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const disposerRef = useRef<(() => void) | null>(null)
  const previewTopRef = useRef<number | undefined>(undefined)

  // ---------- helpers ----------

  const preferFlat = useMemo(() => {
    const flatKeys = new Set<PitchClass>([1, 3, 5, 8, 10])
    const flatScales = new Set<ScaleId>([
      'minor',
      'phrygian',
      'dorian',
      'harmonicMinor',
      'melodicMinor',
    ])
    return flatKeys.has(key) || flatScales.has(scaleId)
  }, [key, scaleId])

  const ensureAudioStarted = useCallback(async () => {
    if (audioStarted) return
    await audio.start()
    setAudioStarted(true)
  }, [audioStarted])

  const toastTimer = useRef<number | null>(null)
  const flashToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1800)
  }, [])

  // load instrument when changed
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    audio
      .setInstrument(instrument)
      .then(() => {
        if (!cancelled) setIsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [instrument])

  // ---------- generation ----------

  const regenerate = useCallback(() => {
    const avoid = lastTemplateRef.current[moodId]
    const next = generateProgression({
      key,
      scaleId,
      moodId,
      length,
      extension,
      avoidTemplateIdx: avoid,
    })
    if (typeof next.templateIdx === 'number') {
      lastTemplateRef.current[moodId] = next.templateIdx
    }
    setChords(next.chords)
    setChordBeats(new Array(next.chords.length).fill(beatsPerChord))
    setInversions(new Array(next.chords.length).fill(0))
    setActiveSavedId(null)
    setActiveStep(null)
    setSelectedChordIdx(0)
  }, [key, scaleId, moodId, length, extension, beatsPerChord])

  const onMoodChange = useCallback(
    (m: MoodId) => {
      setMoodId(m)
      const mood = MOODS.find((x) => x.id === m)
      if (!mood) return
      if (!mood.scales.includes(scaleId)) {
        setScaleId(mood.scales[0])
      }
      if (mood.defaultExtension) setExtension(mood.defaultExtension)
    },
    [scaleId],
  )

  // remap existing degrees onto the new diatonic set when key/scale changes.
  // keeps the shape, avoids a full re-roll.
  const lastSeed = useRef({ key, scaleId, extension, length })
  useEffect(() => {
    const prev = lastSeed.current
    if (
      prev.key === key &&
      prev.scaleId === scaleId &&
      prev.extension === extension &&
      prev.length === length
    )
      return
    const newDiatonic = diatonicChords(key, SCALES[scaleId], extension)
    let nextChords: Chord[] | null = null
    setChords((curr) => {
      // can't remap non-diatonic chords by degree. just re-roll.
      const hasNonDiatonic = curr.some((c) => c.degree === 0)
      if (hasNonDiatonic) {
        nextChords = generateProgression({ key, scaleId, moodId, length, extension }).chords
        return nextChords
      }
      let mapped = curr.map((c) => newDiatonic[c.degree - 1] ?? newDiatonic[0])
      if (mapped.length < length) {
        const extra = generateProgression({
          key,
          scaleId,
          moodId,
          length: length - mapped.length,
          extension,
        }).chords
        mapped = [...mapped, ...extra]
      } else if (mapped.length > length) {
        mapped = mapped.slice(0, length)
      }
      nextChords = mapped
      return mapped
    })
    // resize chord beats to match new length (always straight now)
    setChordBeats((curr) => {
      if (curr.length === length) return curr
      return new Array(length).fill(beatsPerChord)
    })
    // resize inversions. keep user overrides, pad new slots with 0 (auto).
    setInversions((curr) => {
      if (curr.length === length) return curr
      if (curr.length < length) return [...curr, ...new Array(length - curr.length).fill(0)]
      return curr.slice(0, length)
    })
    setSelectedChordIdx((s) => Math.min(s, length - 1))
    lastSeed.current = { key, scaleId, extension, length }
  }, [key, scaleId, extension, length, moodId, beatsPerChord])

  // propagate beatsPerChord into chordBeats whenever it changes.
  useEffect(() => {
    setChordBeats((curr) => new Array(curr.length || length).fill(beatsPerChord))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatsPerChord])

  // ---------- playback ----------

  const stopPlayback = useCallback(() => {
    disposerRef.current?.()
    disposerRef.current = null
    audio.stopAll()
    setIsPlaying(false)
    setActiveStep(null)
  }, [])

  const startPlayback = useCallback(async () => {
    await ensureAudioStarted()
    if (chords.length === 0) return
    // use the resolved inversion so playback matches the visualizer
    const voiced: string[][] = chords.map((c, i) => {
      const inv = playedInversions[i] ?? 0
      const midi = voiceChord(c, 4, { forcedInversion: inv })
      return midi.map((m) => midiToNoteName(m))
    })
    disposerRef.current?.()
    disposerRef.current = audio.scheduleProgression({
      chordNotes: voiced,
      bpm,
      beatsPerChord,
      chordBeats,
      drumStyleId,
      playMode,
      onStep: (i) => setActiveStep(i),
    })
    setIsPlaying(true)
  }, [bpm, beatsPerChord, chordBeats, chords, playedInversions, ensureAudioStarted, drumStyleId, playMode])

  const togglePlay = useCallback(() => {
    if (isPlaying) stopPlayback()
    else void startPlayback()
  }, [isPlaying, startPlayback, stopPlayback])

  // restart playback when anything timing-related changes (if already playing)
  useEffect(() => {
    if (!isPlaying) return
    void startPlayback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, beatsPerChord, chordBeats, chords, playedInversions, instrument, drumStyleId, playMode])

  const previewChord = useCallback(
    async (idx: number) => {
      await ensureAudioStarted()
      const c = chords[idx]
      if (!c) return
      // preview at the same inversion the loop would use
      const inv = playedInversions[idx] ?? 0
      const midi = voiceChord(c, 4, { forcedInversion: inv })
      const names = midi.map((m) => midiToNoteName(m))
      previewTopRef.current = midi[midi.length - 1]
      audio.playNotes(names, 0.9, 0.8)
      setSelectedChordIdx(idx)
      setDrawerOpen(true)
      setActivePreview(idx)
      window.setTimeout(() => {
        setActivePreview((cur) => (cur === idx ? null : cur))
      }, 350)
    },
    [chords, playedInversions, ensureAudioStarted],
  )

  // toggle drawer from the transport bar / keyboard. when opening mid-playback,
  // jump straight to whatever's currently sounding so the visualizer is in sync.
  const toggleVisualizer = useCallback(() => {
    setDrawerOpen((open) => {
      if (!open && activeStep !== null) {
        setSelectedChordIdx(activeStep)
      }
      return !open
    })
  }, [activeStep])

  // while the loop is running with the drawer open, follow the playhead.
  // manual prev/next inside the drawer still works between chord steps.
  useEffect(() => {
    if (!drawerOpen) return
    if (activeStep === null) return
    setSelectedChordIdx(activeStep)
  }, [activeStep, drawerOpen])

  // ---------- editing ----------

  const removeChord = (idx: number) => {
    setChords((cs) => cs.filter((_, i) => i !== idx))
    setChordBeats((bs) => bs.filter((_, i) => i !== idx))
    setInversions((iv) => iv.filter((_, i) => i !== idx))
    setLength((l) => Math.max(2, l - 1))
    setSelectedChordIdx((s) => (s >= idx && s > 0 ? s - 1 : s))
  }
  const moveChord = (idx: number, dir: -1 | 1) => {
    const swap = <T,>(arr: T[]): T[] => {
      const j = idx + dir
      if (j < 0 || j >= arr.length) return arr
      const next = [...arr]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    }
    setChords(swap)
    setChordBeats(swap)
    setInversions(swap)
  }
  const cycleInversion = (idx: number) => {
    setInversions((iv) => {
      const next = [...iv]
      const chord = chords[idx]
      if (!chord) return iv
      const cycle = chord.intervals.length
      next[idx] = ((iv[idx] ?? 0) + 1) % cycle
      return next
    })
  }
  const regenerateChord = (idx: number) => {
    setChords((cs) => {
      if (!cs[idx]) return cs
      const next = [...cs]
      next[idx] = regenerateChordInProgression({
        key,
        scaleId,
        moodId,
        extension,
        chords: cs,
        index: idx,
      })
      return next
    })
    setInversions((iv) => {
      if (idx < 0 || idx >= iv.length) return iv
      const next = [...iv]
      next[idx] = 0
      return next
    })
    setActiveSavedId(null)
    setActiveStep(null)
    setSelectedChordIdx(idx)
  }

  // ---------- save / load / export ----------

  const onSave = useCallback(() => {
    const name = `${pcName(key, preferFlat)} ${SCALES[scaleId].name.split(' ')[0]} · ${moodId}`
    const item = storage.save({
      name,
      key,
      scaleId,
      moodId,
      extension,
      degrees: chords.map((c) => c.degree),
      chords,
      chordBeats,
      inversions,
      bpm,
      beatsPerChord,
      instrument,
    })
    setSaved(storage.list())
    setActiveSavedId(item.id)
    flashToast('saved to this device')
  }, [bpm, beatsPerChord, chordBeats, chords, extension, instrument, inversions, key, moodId, preferFlat, scaleId, flashToast])

  const onLoadSaved = useCallback((item: SavedProgression) => {
    setKey(item.key)
    setScaleId(item.scaleId)
    setMoodId(item.moodId)
    setExtension(item.extension)
    setLength(item.degrees.length)
    setBpm(item.bpm)
    setBeatsPerChord(item.beatsPerChord)
    setInstrument(item.instrument as InstrumentId)
    if (item.chords && item.chords.length > 0) {
      // restore the exact chord list (keeps secondary dominants / borrowed)
      setChords(item.chords)
    } else {
      const diatonic = diatonicChords(item.key, SCALES[item.scaleId], item.extension)
      setChords(item.degrees.map((d) => diatonic[d - 1] ?? diatonic[0]))
    }
    if (item.chordBeats && item.chordBeats.length === item.degrees.length) {
      setChordBeats(item.chordBeats)
    } else {
      setChordBeats(new Array(item.degrees.length).fill(item.beatsPerChord))
    }
    if (item.inversions && item.inversions.length === item.degrees.length) {
      setInversions(item.inversions)
    } else {
      setInversions(new Array(item.degrees.length).fill(0))
    }
    setSelectedChordIdx(0)
    setActiveSavedId(item.id)
    flashToast(`loaded "${item.name.toLowerCase()}"`)
  }, [flashToast])

  const onRemoveSaved = useCallback(
    (id: string) => {
      storage.remove(id)
      setSaved(storage.list())
      if (activeSavedId === id) setActiveSavedId(null)
    },
    [activeSavedId],
  )

  const onExport = useCallback(() => {
    const bytes = progressionToMidi(
      {
        key,
        scaleId,
        moodId,
        extension,
        chords,
      },
      { bpm, beatsPerChord, chordBeats, inversions: playedInversions, drumStyleId },
    )
    const filename = `tryad-${pcName(key, preferFlat).replace('#', 's')}-${scaleId}-${moodId}.mid`
    downloadMidi(filename, bytes)
    flashToast('midi downloaded')
  }, [
    bpm,
    beatsPerChord,
    chordBeats,
    chords,
    drumStyleId,
    extension,
    playedInversions,
    key,
    moodId,
    preferFlat,
    scaleId,
    flashToast,
  ])

  // ---------- keyboard shortcuts ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        regenerate()
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault()
        toggleVisualizer()
      } else if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onSave()
      } else if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onExport()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, regenerate, onSave, onExport, toggleVisualizer])

  // ---------- toast ----------



  // ---------- render ----------

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 flex flex-col gap-10">
        {/* progression first (it's the product). controls underneath. */}
        <section className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="section-tag">01 / progression</div>
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-widest text-ink-dim">
              <span className="kbd">tab</span>
              <span>focus</span>
              <span className="kbd ml-2">↵</span>
              <span>preview</span>
              <span className="kbd ml-2">i</span>
              <span>invert</span>
              <span className="kbd ml-2">r</span>
              <span>reroll</span>
              <span className="kbd ml-2">⇧ ←/→</span>
              <span>move</span>
              <span className="kbd ml-2">del</span>
              <span>remove</span>
            </div>
          </div>
          <div
            className={`progression-grid ${chords.length > 10 ? 'gap-1.5' : chords.length > 6 ? 'gap-2' : 'gap-3 sm:gap-4'}`}
            style={
              {
                // one-row on desktop; mobile wraps via auto-fill
                '--cols': `repeat(${chords.length}, minmax(0, 1fr))`,
              } as React.CSSProperties
            }
          >
            {chords.map((c, i) => {
              const density: 'full' | 'compact' | 'tight' =
                chords.length > 10 ? 'tight' : chords.length > 6 ? 'compact' : 'full'
              return (
                <ChordCard
                  key={`${i}-${c.symbol}`}
                  chord={c}
                  index={i}
                  active={activeStep === i}
                  playing={activePreview === i || activeStep === i}
                  selected={drawerOpen && selectedChordIdx === i}
                  preferFlat={preferFlat}
                  onClick={() => previewChord(i)}
                  onRemove={chords.length > 2 ? () => removeChord(i) : undefined}
                  onMoveLeft={i > 0 ? () => moveChord(i, -1) : undefined}
                  onMoveRight={i < chords.length - 1 ? () => moveChord(i, 1) : undefined}
                  onRegenerate={() => regenerateChord(i)}
                  beats={chordBeats[i]}
                  density={density}
                  inversion={inversions[i] ?? 0}
                  onCycleInversion={() => cycleInversion(i)}
                />
              )
            })}
          </div>

        </section>

        {/* one row of dials */}
        <section className="flex flex-col gap-5">
          <div className="section-tag">02 / generator</div>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3 items-end">
            <Select<string>
              label="key"
              value={String(key)}
              onChange={(v) => setKey(Number(v) as PitchClass)}
              options={ALL_KEYS.map((n, i) => ({ value: String(i), label: n }))}
            />
            <Select<ScaleId>
              label="scale"
              value={scaleId}
              onChange={setScaleId}
              options={SCALE_LIST.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Select<MoodId>
              label="mood"
              value={moodId}
              onChange={onMoodChange}
              options={MOODS.map((m) => ({ value: m.id, label: m.label }))}
            />
            <Select<Extension>
              label="voicing"
              value={extension}
              onChange={setExtension}
              options={EXTENSIONS.map((e) => ({ value: e.id, label: e.label }))}
            />
            <Select<PlayMode>
              label="play mode"
              value={playMode}
              onChange={setPlayMode}
              groups={PLAY_MODE_GROUPS}
            />
            <Slider label="chords" min={2} max={12} value={length} onChange={setLength} />
            <button
              type="button"
              onClick={regenerate}
              className="pill pill-primary justify-center"
            >
              <DiceIcon /> generate
            </button>
          </div>
        </section>

        {/* transport */}
        <section className="flex flex-col gap-5">
          <div className="section-tag">03 / playback</div>
          <Transport
            isPlaying={isPlaying}
            isLoading={isLoading}
            onPlayToggle={togglePlay}
            onExport={onExport}
            onSave={onSave}
            visualizerOpen={drawerOpen}
            onToggleVisualizer={toggleVisualizer}
            bpm={bpm}
            onBpmChange={setBpm}
            beatsPerChord={beatsPerChord}
            onBeatsChange={setBeatsPerChord}
            instrument={instrument}
            onInstrumentChange={setInstrument}
            drumStyleId={drumStyleId}
            onDrumStyleChange={setDrumStyleId}
          />
        </section>

        {/* saved */}
        <section className="flex flex-col gap-5">
          <div className="section-tag">04 / saved on this device</div>
          <SavedList
            items={saved}
            activeId={activeSavedId}
            onLoad={onLoadSaved}
            onRemove={onRemoveSaved}
          />
        </section>
      </main>

      <Footer />

      <ChordDrawer
        open={drawerOpen && chords.length > 0}
        chord={chords[selectedChordIdx] ?? null}
        index={Math.min(selectedChordIdx, Math.max(0, chords.length - 1))}
        total={chords.length}
        // show what's actually playing, not the user-set 0/auto
        inversion={playedInversions[selectedChordIdx] ?? 0}
        preferFlat={preferFlat}
        mode={visualMode}
        onModeChange={setVisualMode}
        onClose={() => setDrawerOpen(false)}
        onPrev={() =>
          setSelectedChordIdx((s) => (chords.length ? (s - 1 + chords.length) % chords.length : 0))
        }
        onNext={() =>
          setSelectedChordIdx((s) => (chords.length ? (s + 1) % chords.length : 0))
        }
        onCycleInversion={() => cycleInversion(selectedChordIdx)}
      />

      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-bg-line bg-bg-card/95 backdrop-blur px-4 py-2 text-xs font-mono uppercase tracking-widest text-ink shadow-glow pointer-events-none">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function DiceIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="14" height="14" rx="3" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="13" cy="7" r="1" fill="currentColor" />
      <circle cx="10" cy="10" r="1" fill="currentColor" />
      <circle cx="7" cy="13" r="1" fill="currentColor" />
      <circle cx="13" cy="13" r="1" fill="currentColor" />
    </svg>
  )
}

export default App
