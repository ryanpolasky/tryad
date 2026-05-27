import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InstrumentId, PlayMode } from './lib/audio'
import { PLAY_MODE_GROUPS, audio, renderProgression } from './lib/audio'
import { ChordCard } from './components/ChordCard'
import { ChordDrawer } from './components/ChordDrawer'
import { ChordSwapPopover } from './components/ChordSwapPopover'
import { type VisualizerMode } from './components/ChordVisualizer'
import { SavedList } from './components/SavedList'
import { Select } from './components/Select'
import { Slider } from './components/Slider'
import { Transport } from './components/Transport'
import { Header, Footer } from './components/Chrome'
import { downloadMidi, progressionToMidi } from './lib/midi'
import { storage, type SavedProgression } from './lib/storage'
import { buildShareUrl, readShareFromHash } from './lib/share'
import { useHistory } from './lib/history'
import { audioBufferToWav, downloadBlob } from './lib/wav'
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
  // hydrate from `#s=...` if a shared link was opened. computed once so every
  // useState lazy initializer below sees the same snapshot.
  const initialShared = useMemo(() => readShareFromHash(), [])
  const initialProgression = useMemo(
    () =>
      initialShared?.chords ??
      generateProgression({
        key: 0,
        scaleId: 'major',
        moodId: 'pop',
        length: 4,
        extension: 'triad',
      }).chords,
    [initialShared],
  )

  const [key, setKey] = useState<PitchClass>(initialShared?.key ?? 0)
  const [scaleId, setScaleId] = useState<ScaleId>(initialShared?.scaleId ?? 'major')
  const [moodId, setMoodId] = useState<MoodId>(initialShared?.moodId ?? 'pop')
  const [length, setLength] = useState(initialProgression.length)
  const [extension, setExtension] = useState<Extension>(initialShared?.extension ?? 'triad')
  const [chords, setChords] = useState<Chord[]>(initialProgression)
  const [chordBeats, setChordBeats] = useState<number[]>(
    () => initialShared?.chordBeats ?? new Array(initialProgression.length).fill(4),
  )
  // last template per mood, so generate doesn't pick the same one twice in a row.
  const lastTemplateRef = useRef<Record<string, number>>({})

  const [bpm, setBpm] = useState(initialShared?.bpm ?? 96)
  const [beatsPerChord, setBeatsPerChord] = useState(initialShared?.beatsPerChord ?? 4)
  const [instrument, setInstrument] = useState<InstrumentId>(initialShared?.instrument ?? 'piano')
  const [drumStyleId, setDrumStyleId] = useState<string>(initialShared?.drumStyleId ?? 'off')
  const [playMode, setPlayMode] = useState<PlayMode>(initialShared?.playMode ?? 'block')

  // 0 = auto, >=1 = user forced.
  const [inversions, setInversions] = useState<number[]>(
    () => initialShared?.inversions ?? new Array(initialProgression.length).fill(0),
  )
  // per-chord lock. generate/regen skip locked slots.
  const [locked, setLocked] = useState<boolean[]>(
    () => initialShared?.locked ?? new Array(initialProgression.length).fill(false),
  )
  // drag state. dragging = index being dragged; dragOver = index being hovered.
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // swap popover anchor + which chord index it's targeting.
  const [swapIdx, setSwapIdx] = useState<number | null>(null)
  const [swapAnchor, setSwapAnchor] = useState<HTMLElement | null>(null)
  const playedInversions = useMemo(
    () => effectiveInversions(chords, inversions),
    [chords, inversions],
  )
  const [selectedChordIdx, setSelectedChordIdx] = useState<number>(0)
  const [visualMode, setVisualMode] = useState<VisualizerMode>('piano')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
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

  // drop the share hash after first import so reload doesn't re-apply it and
  // future explicit shares can build a fresh URL.
  useEffect(() => {
    if (initialShared && typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      flashToast('imported shared progression')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onShare = useCallback(async () => {
    const url = buildShareUrl({
      key,
      scaleId,
      moodId,
      extension,
      playMode,
      bpm,
      beatsPerChord,
      drumStyleId,
      instrument,
      chords,
      inversions,
      chordBeats,
      locked,
    })
    try {
      await navigator.clipboard.writeText(url)
      flashToast('share link copied')
    } catch {
      // older browsers / insecure contexts: drop the user into the location bar
      // so they can copy manually.
      window.prompt('copy link:', url)
    }
  }, [
    key,
    scaleId,
    moodId,
    extension,
    playMode,
    bpm,
    beatsPerChord,
    drumStyleId,
    instrument,
    chords,
    inversions,
    chordBeats,
    locked,
    flashToast,
  ])

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
    history.push(snap(), 'regen-all')
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
    // preserve locked chords / inversions at their original positions.
    setChords((prev) => {
      const out = next.chords.slice()
      for (let i = 0; i < out.length; i++) {
        if (locked[i] && prev[i]) out[i] = prev[i]
      }
      return out
    })
    setChordBeats(new Array(next.chords.length).fill(beatsPerChord))
    setInversions((prev) => {
      const out = new Array(next.chords.length).fill(0)
      for (let i = 0; i < out.length; i++) {
        if (locked[i] && prev[i] !== undefined) out[i] = prev[i]
      }
      return out
    })
    // resize locked to match new length, preserving values in place.
    setLocked((prev) => {
      if (prev.length === next.chords.length) return prev
      const out = new Array(next.chords.length).fill(false)
      for (let i = 0; i < Math.min(prev.length, out.length); i++) out[i] = prev[i]
      return out
    })
    setActiveSavedId(null)
    setActiveStep(null)
    setSelectedChordIdx(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scaleId, moodId, length, extension, beatsPerChord, locked])

  const onMoodChange = useCallback(
    (m: MoodId) => {
      if (m === moodId) return
      history.push(snap(), 'mood')
      setMoodId(m)
      const mood = MOODS.find((x) => x.id === m)
      if (!mood) return
      if (!mood.scales.includes(scaleId)) {
        setScaleId(mood.scales[0])
      }
      if (mood.defaultExtension) setExtension(mood.defaultExtension)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scaleId, moodId],
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
    // resize locked alongside, pad with false.
    setLocked((curr) => {
      if (curr.length === length) return curr
      if (curr.length < length) return [...curr, ...new Array(length - curr.length).fill(false)]
      return curr.slice(0, length)
    })
    setSelectedChordIdx((s) => Math.min(s, length - 1))
    lastSeed.current = { key, scaleId, extension, length }
  }, [key, scaleId, extension, length, moodId, beatsPerChord])

  // propagate beatsPerChord into chordBeats whenever it changes.
  // guarded by lastBpc so undo/redo can pre-stamp the expected value and
  // restore the chordBeats array from the snapshot without this effect
  // overwriting it.
  const lastBpc = useRef(beatsPerChord)
  useEffect(() => {
    if (lastBpc.current === beatsPerChord) return
    lastBpc.current = beatsPerChord
    setChordBeats((curr) => new Array(curr.length || length).fill(beatsPerChord))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatsPerChord])

  // ---------- undo / redo ----------

  // snapshot captures the full musical state of the progression: chord content,
  // per-chord overrides (inversions / locks / beats), the generator settings
  // that shape it (key / scale / mood / extension / length), and the playback
  // settings that change how it sounds (bpm / instrument / play mode / drums).
  // anything not in here (drawer state, selection, transport flags) is treated
  // as transient and isn't part of the undo stack.
  interface Snapshot {
    chords: Chord[]
    inversions: number[]
    locked: boolean[]
    chordBeats: number[]
    key: PitchClass
    scaleId: ScaleId
    moodId: MoodId
    extension: Extension
    length: number
    bpm: number
    beatsPerChord: number
    instrument: InstrumentId
    playMode: PlayMode
    drumStyleId: string
  }
  const history = useHistory<Snapshot>({ maxSize: 30, coalesceWindowMs: 700 })
  // captureSnapshot is defined fresh each render so it always closes over the
  // latest state. callers inside useCallback closures (regenerate, onMoodChange,
  // doUndo, doRedo) capture an *older* captureSnapshot via stale deps, which
  // would push out-of-date snapshots. routing through a ref that's pointed at
  // the latest captureSnapshot every render side-steps that without needing to
  // explode every useCallback dep array.
  const captureSnapshot = (): Snapshot => ({
    chords,
    inversions,
    locked,
    chordBeats,
    key,
    scaleId,
    moodId,
    extension,
    length,
    bpm,
    beatsPerChord,
    instrument,
    playMode,
    drumStyleId,
  })
  const captureRef = useRef(captureSnapshot)
  captureRef.current = captureSnapshot
  const snap = () => captureRef.current()
  const applySnapshot = (s: Snapshot) => {
    // pre-stamp the effect guards so the broadcast effects don't overwrite
    // the snapshot values we're about to restore.
    lastSeed.current = { key: s.key, scaleId: s.scaleId, extension: s.extension, length: s.length }
    lastBpc.current = s.beatsPerChord
    setChords(s.chords)
    setInversions(s.inversions)
    setLocked(s.locked)
    setChordBeats(s.chordBeats)
    setKey(s.key)
    setScaleId(s.scaleId)
    setMoodId(s.moodId)
    setExtension(s.extension)
    setLength(s.length)
    setBpm(s.bpm)
    setBeatsPerChord(s.beatsPerChord)
    setInstrument(s.instrument)
    setPlayMode(s.playMode)
    setDrumStyleId(s.drumStyleId)
    setActiveSavedId(null)
  }
  const doUndo = useCallback(() => {
    const prev = history.undo(snap())
    if (prev) {
      applySnapshot(prev)
      flashToast('undo')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, flashToast])
  const doRedo = useCallback(() => {
    const next = history.redo(snap())
    if (next) {
      applySnapshot(next)
      flashToast('redo')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, flashToast])

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
    history.push(snap(), 'remove')
    setChords((cs) => cs.filter((_, i) => i !== idx))
    setChordBeats((bs) => bs.filter((_, i) => i !== idx))
    setInversions((iv) => iv.filter((_, i) => i !== idx))
    setLocked((lk) => lk.filter((_, i) => i !== idx))
    setLength((l) => Math.max(2, l - 1))
    setSelectedChordIdx((s) => (s >= idx && s > 0 ? s - 1 : s))
  }
  const reorderChord = (from: number, to: number) => {
    if (from === to) return
    history.push(snap(), 'reorder')
    const move = <T,>(arr: T[]): T[] => {
      if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr
      const next = [...arr]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    }
    setChords(move)
    setChordBeats(move)
    setInversions(move)
    setLocked(move)
    setSelectedChordIdx((s) => {
      if (s === from) return to
      if (from < s && to >= s) return s - 1
      if (from > s && to <= s) return s + 1
      return s
    })
  }
  const toggleLock = (idx: number) => {
    history.push(snap(), 'lock')
    setLocked((lk) => {
      if (idx < 0 || idx >= lk.length) return lk
      const next = [...lk]
      next[idx] = !next[idx]
      return next
    })
  }
  const openSwap = (idx: number, anchor: HTMLElement) => {
    setSwapIdx(idx)
    setSwapAnchor(anchor)
  }
  const closeSwap = () => {
    setSwapIdx(null)
    setSwapAnchor(null)
  }
  const applySwap = (chord: Chord) => {
    if (swapIdx === null) return
    history.push(snap(), 'swap')
    setChords((cs) => {
      if (swapIdx < 0 || swapIdx >= cs.length) return cs
      const next = [...cs]
      next[swapIdx] = chord
      return next
    })
    // chord changed entirely; reset inversion to auto so voice leading rebuilds.
    setInversions((iv) => {
      if (swapIdx < 0 || swapIdx >= iv.length) return iv
      const next = [...iv]
      next[swapIdx] = 0
      return next
    })
    setActiveSavedId(null)
    setSelectedChordIdx(swapIdx)
    closeSwap()
    flashToast(`swapped to ${chord.symbol.toLowerCase()}`)
  }
  const cycleInversion = (idx: number) => {
    history.push(snap(), `invert-${idx}`)
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
    if (locked[idx]) return
    history.push(snap(), `regen-${idx}`)
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
      locked,
      bpm,
      beatsPerChord,
      instrument,
    })
    setSaved(storage.list())
    setActiveSavedId(item.id)
    flashToast('saved to this device')
  }, [bpm, beatsPerChord, chordBeats, chords, extension, instrument, inversions, locked, key, moodId, preferFlat, scaleId, flashToast])

  const onLoadSaved = useCallback((item: SavedProgression) => {
    history.clear()
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
    if (item.locked && item.locked.length === item.degrees.length) {
      setLocked(item.locked)
    } else {
      setLocked(new Array(item.degrees.length).fill(false))
    }
    setSelectedChordIdx(0)
    setActiveSavedId(item.id)
    flashToast(`loaded "${item.name.toLowerCase()}"`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const onRenderWav = useCallback(async () => {
    if (chords.length === 0 || isRendering) return
    setIsRendering(true)
    flashToast('rendering audio…')
    try {
      // re-voice the chords the same way the live loop does, so the bounce
      // matches what you just heard.
      const voiced: string[][] = chords.map((c, i) => {
        const inv = playedInversions[i] ?? 0
        const midi = voiceChord(c, 4, { forcedInversion: inv })
        return midi.map((m) => midiToNoteName(m))
      })
      const buffer = await renderProgression({
        chordNotes: voiced,
        bpm,
        beatsPerChord,
        chordBeats,
        drumStyleId,
        playMode,
        instrument,
      })
      const wav = audioBufferToWav(buffer)
      const filename = `tryad-${pcName(key, preferFlat).replace('#', 's')}-${scaleId}-${moodId}.wav`
      downloadBlob(wav, filename, 'audio/wav')
      flashToast('wav downloaded')
    } catch {
      flashToast('render failed')
    } finally {
      setIsRendering(false)
    }
  }, [
    chords,
    playedInversions,
    bpm,
    beatsPerChord,
    chordBeats,
    drumStyleId,
    playMode,
    instrument,
    key,
    preferFlat,
    scaleId,
    moodId,
    isRendering,
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
      } else if (
        e.key.toLowerCase() === 'z' &&
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey
      ) {
        // cmd/ctrl + z = undo
        e.preventDefault()
        doUndo()
      } else if (
        // cmd/ctrl + shift + z = redo (mac), or cmd/ctrl + y = redo (windows)
        ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault()
        doRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, regenerate, onSave, onExport, toggleVisualizer, doUndo, doRedo])

  // ---------- toast ----------



  // ---------- render ----------

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 flex flex-col gap-10">
        {/* progression first (it's the product). controls underneath. */}
        <section className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="section-tag">01 / progression</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={doUndo}
                  disabled={!history.canUndo}
                  className="pill h-7 px-2 py-0 text-[11px] disabled:opacity-30 disabled:cursor-not-allowed"
                  title="undo (⌘Z)"
                  aria-label="undo"
                >
                  <UndoIcon />
                </button>
                <button
                  type="button"
                  onClick={doRedo}
                  disabled={!history.canRedo}
                  className="pill h-7 px-2 py-0 text-[11px] disabled:opacity-30 disabled:cursor-not-allowed"
                  title="redo (⇧⌘Z)"
                  aria-label="redo"
                >
                  <RedoIcon />
                </button>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-widest text-ink-dim">
              <span>drag to reorder</span>
              <span className="text-ink-dim/50 mx-1">|</span>
              <span className="kbd">↵</span>
              <span>preview</span>
              <span className="kbd ml-2">s</span>
              <span>swap</span>
              <span className="kbd ml-2">i</span>
              <span>invert</span>
              <span className="kbd ml-2">l</span>
              <span>lock</span>
              <span className="kbd ml-2">r</span>
              <span>reroll</span>
              <span className="kbd ml-2">del</span>
              <span>remove</span>
              <span className="text-ink-dim/50 mx-1">|</span>
              <span className="kbd">⌘z</span>
              <span>undo</span>
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
                  onMove={(dir) => reorderChord(i, i + dir)}
                  onRegenerate={() => regenerateChord(i)}
                  locked={locked[i] ?? false}
                  onToggleLock={() => toggleLock(i)}
                  onOpenSwap={(el) => openSwap(i, el)}
                  isDragging={draggingIdx === i}
                  isDragOver={dragOverIdx === i && draggingIdx !== null && draggingIdx !== i}
                  onDragStart={() => {
                    setDraggingIdx(i)
                    setDragOverIdx(i)
                  }}
                  onDragOver={() => {
                    if (draggingIdx === null) return
                    if (dragOverIdx !== i) setDragOverIdx(i)
                  }}
                  onDrop={() => {
                    if (draggingIdx !== null && draggingIdx !== i) reorderChord(draggingIdx, i)
                    setDraggingIdx(null)
                    setDragOverIdx(null)
                  }}
                  onDragEnd={() => {
                    setDraggingIdx(null)
                    setDragOverIdx(null)
                  }}
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
              onChange={(v) => {
                const next = Number(v) as PitchClass
                if (next === key) return
                history.push(snap(), 'key')
                setKey(next)
              }}
              options={ALL_KEYS.map((n, i) => ({ value: String(i), label: n }))}
            />
            <Select<ScaleId>
              label="scale"
              value={scaleId}
              onChange={(v) => {
                if (v === scaleId) return
                history.push(snap(), 'scale')
                setScaleId(v)
              }}
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
              onChange={(v) => {
                if (v === extension) return
                history.push(snap(), 'voicing')
                setExtension(v)
              }}
              options={EXTENSIONS.map((e) => ({ value: e.id, label: e.label }))}
            />
            <Select<PlayMode>
              label="play mode"
              value={playMode}
              onChange={(v) => {
                if (v === playMode) return
                history.push(snap(), 'playMode')
                setPlayMode(v)
              }}
              groups={PLAY_MODE_GROUPS}
            />
            <Slider
              label="chords"
              min={2}
              max={12}
              value={length}
              onChange={(v) => {
                if (v === length) return
                // 'length' label coalesces drag ticks into one entry.
                history.push(snap(), 'length')
                setLength(v)
              }}
            />
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
            isRendering={isRendering}
            onPlayToggle={togglePlay}
            onExport={onExport}
            onRenderWav={onRenderWav}
            onSave={onSave}
            onShare={onShare}
            visualizerOpen={drawerOpen}
            onToggleVisualizer={toggleVisualizer}
            bpm={bpm}
            onBpmChange={(v) => {
              if (v === bpm) return
              history.push(snap(), 'bpm')
              setBpm(v)
            }}
            beatsPerChord={beatsPerChord}
            onBeatsChange={(v) => {
              if (v === beatsPerChord) return
              history.push(snap(), 'beats')
              setBeatsPerChord(v)
            }}
            instrument={instrument}
            onInstrumentChange={(v) => {
              if (v === instrument) return
              history.push(snap(), 'instrument')
              setInstrument(v)
            }}
            drumStyleId={drumStyleId}
            onDrumStyleChange={(v) => {
              if (v === drumStyleId) return
              history.push(snap(), 'drumStyle')
              setDrumStyleId(v)
            }}
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

      {swapIdx !== null && swapAnchor && chords[swapIdx] ? (
        <ChordSwapPopover
          anchor={swapAnchor}
          current={chords[swapIdx]}
          index={swapIdx}
          progression={chords}
          songKey={key}
          scale={SCALES[scaleId]}
          extension={extension}
          preferFlat={preferFlat}
          onSelect={applySwap}
          onClose={closeSwap}
        />
      ) : null}

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

function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 8L3 8L3 4" />
      <path d="M3 8C5 5.5 8 4 11 4C14.5 4 17 6.5 17 10C17 13.5 14.5 16 11 16L8 16" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 8L17 8L17 4" />
      <path d="M17 8C15 5.5 12 4 9 4C5.5 4 3 6.5 3 10C3 13.5 5.5 16 9 16L12 16" />
    </svg>
  )
}

export default App
