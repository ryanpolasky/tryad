import { useMemo } from 'react'
import type { Chord, PitchClass } from '../lib/theory'
import { bassPitchClass, pcName, voiceChord } from '../lib/theory'

export type VisualizerMode = 'piano' | 'guitar'

interface ChordVisualizerProps {
  chord: Chord
  inversion: number
  preferFlat?: boolean
  mode: VisualizerMode
  onModeChange: (m: VisualizerMode) => void
  onCycleInversion?: () => void
}

export function ChordVisualizer({
  chord,
  inversion,
  preferFlat,
  mode,
  onModeChange,
  onCycleInversion,
}: ChordVisualizerProps) {
  const bassPc = bassPitchClass(chord, inversion)
  // the exact midi voicing being played.
  const voicedMidis = useMemo(
    () => voiceChord(chord, 4, { forcedInversion: inversion }),
    [chord, inversion],
  )
  const voicedSet = useMemo(() => new Set<number>(voicedMidis), [voicedMidis])
  const slash =
    inversion > 0
      ? `${chord.symbol} / ${pcName(bassPc, preferFlat)}`
      : chord.symbol
  const invLabel =
    inversion === 0
      ? 'root pos'
      : inversion === 1
        ? '1st inv'
        : inversion === 2
          ? '2nd inv'
          : inversion === 3
            ? '3rd inv'
            : `${inversion}th inv`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-display text-2xl sm:text-3xl tracking-tight text-ink truncate">
            <span className={chord.quality === 'min' ? 'italic' : ''}>{slash}</span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-accent/80 shrink-0">
            {chord.roman}
          </span>
          {onCycleInversion ? (
            <button
              type="button"
              onClick={onCycleInversion}
              className={`shrink-0 font-mono text-[10px] uppercase tracking-widest rounded-full border px-2 py-[2px] transition-colors ${
                inversion > 0
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-bg-line text-ink-dim hover:text-ink hover:border-ink-mute'
              }`}
            >
              {invLabel}
            </button>
          ) : null}
        </div>
        <div className="flex gap-1 self-end">
          <ModeBtn active={mode === 'piano'} onClick={() => onModeChange('piano')}>
            piano
          </ModeBtn>
          <ModeBtn active={mode === 'guitar'} onClick={() => onModeChange('guitar')}>
            guitar
          </ModeBtn>
        </div>
      </div>

      <div className="overflow-x-auto">
        {mode === 'piano' ? (
          <PianoView
            voicedSet={voicedSet}
            bassMidi={voicedMidis[0]}
            rootPc={chord.root}
            preferFlat={preferFlat}
          />
        ) : (
          <GuitarView
            voicedMidis={voicedMidis}
            bassPc={bassPc}
            rootPc={chord.root}
            preferFlat={preferFlat}
          />
        )}
      </div>
    </div>
  )
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-widest rounded-full border transition-colors ${
        active
          ? 'border-accent/60 bg-accent/10 text-accent'
          : 'border-bg-line text-ink-mute hover:text-ink hover:border-ink-mute'
      }`}
    >
      {children}
    </button>
  )
}

/* ---------------- piano ---------------- */

// two octaves from C4 (midi 60). 7 white, 5 black per octave.
const WHITE_PCS: PitchClass[] = [0, 2, 4, 5, 7, 9, 11]
// black keys sit to the right of these white indices within an octave.
const BLACK_LAYOUT: { pc: PitchClass; afterWhiteIdx: number }[] = [
  { pc: 1, afterWhiteIdx: 0 }, // C#
  { pc: 3, afterWhiteIdx: 1 }, // D#
  { pc: 6, afterWhiteIdx: 3 }, // F#
  { pc: 8, afterWhiteIdx: 4 }, // G#
  { pc: 10, afterWhiteIdx: 5 }, // A#
]
const PIANO_OCTAVES = 2
const PIANO_START_MIDI = 60 // C4
const WHITE_W = 28
const WHITE_H = 110
const BLACK_W = 18
const BLACK_H = 70

function PianoView({
  voicedSet,
  bassMidi,
  rootPc,
  preferFlat,
}: {
  voicedSet: Set<number>
  bassMidi: number
  rootPc: PitchClass
  preferFlat?: boolean
}) {
  const whiteCount = WHITE_PCS.length * PIANO_OCTAVES
  const totalW = whiteCount * WHITE_W

  type Key = { pc: PitchClass; midi: number; x: number }
  const whites: Key[] = []
  const blacks: Key[] = []
  for (let o = 0; o < PIANO_OCTAVES; o++) {
    const baseMidi = PIANO_START_MIDI + o * 12
    WHITE_PCS.forEach((pc, i) => {
      whites.push({
        pc,
        midi: baseMidi + pc,
        x: (o * WHITE_PCS.length + i) * WHITE_W,
      })
    })
    BLACK_LAYOUT.forEach(({ pc, afterWhiteIdx }) => {
      const xCenter = (o * WHITE_PCS.length + afterWhiteIdx) * WHITE_W + WHITE_W
      blacks.push({
        pc,
        midi: baseMidi + pc,
        x: xCenter - BLACK_W / 2,
      })
    })
  }

  return (
    <svg
      viewBox={`-1 -1 ${totalW + 2} ${WHITE_H + 2}`}
      width="100%"
      style={{ maxWidth: totalW + 2, minWidth: 360 }}
      role="img"
      aria-label="Piano keyboard with played voicing highlighted"
    >
      {/* white keys */}
      {whites.map((w, i) => {
        const isOn = voicedSet.has(w.midi)
        const isBass = isOn && w.midi === bassMidi
        const isRoot = isOn && w.pc === rootPc
        return (
          <g key={`w-${i}`}>
            <rect
              x={w.x}
              y={0}
              width={WHITE_W}
              height={WHITE_H}
              rx={2}
              fill={isOn ? (isBass ? 'var(--accent)' : 'var(--accent-soft)') : 'var(--bg-card)'}
              stroke="var(--bg-line)"
              strokeWidth={1}
            />
            {isOn && (
              <text
                x={w.x + WHITE_W / 2}
                y={WHITE_H - 10}
                textAnchor="middle"
                className="font-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: 1.5,
                  fill: 'var(--bg-base)',
                  fontWeight: isRoot ? 700 : 400,
                }}
              >
                {pcName(w.pc, preferFlat)}
              </text>
            )}
          </g>
        )
      })}
      {/* black keys */}
      {blacks.map((b, i) => {
        const isOn = voicedSet.has(b.midi)
        const isBass = isOn && b.midi === bassMidi
        const isRoot = isOn && b.pc === rootPc
        return (
          <g key={`b-${i}`}>
            <rect
              x={b.x}
              y={0}
              width={BLACK_W}
              height={BLACK_H}
              rx={1.5}
              fill={isOn ? (isBass ? 'var(--accent)' : 'var(--accent-soft)') : 'var(--bg-base)'}
              stroke="var(--bg-line)"
              strokeWidth={1}
            />
            {isOn && (
              <text
                x={b.x + BLACK_W / 2}
                y={BLACK_H - 6}
                textAnchor="middle"
                className="font-mono"
                style={{
                  fontSize: 8,
                  letterSpacing: 1,
                  fill: 'var(--bg-base)',
                  fontWeight: isRoot ? 700 : 400,
                }}
              >
                {pcName(b.pc, preferFlat)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ---------------- guitar ---------------- */

// standard tuning low->high: E2 A2 D3 G3 B3 E4. shown thinnest-on-top.
const STRING_PCS: PitchClass[] = [4, 9, 2, 7, 11, 4] // E A D G B E
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'] // low to high
const MAX_FRET = 14

type Dot = {
  stringIdx: number
  fret: number
  pc: PitchClass
  isBass: boolean
  isRoot: boolean
}

function fretFor(stringIdx: number, pc: PitchClass): number {
  const openPc = STRING_PCS[stringIdx]
  return (((pc - openPc) % 12) + 12) % 12
}

// build a fingering from the voicing's pcs.
// bass goes on E or A (whichever lower), remaining tones placed to minimise stretch.
// one note per string. octave-displaced; we want a chord shape, not literal tab.
function buildShape(voicedPcs: PitchClass[], bassPc: PitchClass, rootPc: PitchClass): Dot[] {
  const assigned: (Dot | null)[] = [null, null, null, null, null, null]

  // bass: prefer E or A, lowest fret first.
  let bassDot: Dot | null = null
  for (const s of [0, 1]) {
    const fret = fretFor(s, bassPc)
    if (fret > MAX_FRET) continue
    if (!bassDot || fret < bassDot.fret) {
      bassDot = { stringIdx: s, fret, pc: bassPc, isBass: true, isRoot: bassPc === rootPc }
    }
  }
  if (!bassDot) {
    for (let s = 2; s < 6; s++) {
      const fret = fretFor(s, bassPc)
      if (fret <= MAX_FRET) {
        bassDot = { stringIdx: s, fret, pc: bassPc, isBass: true, isRoot: bassPc === rootPc }
        break
      }
    }
  }
  if (bassDot) assigned[bassDot.stringIdx] = bassDot
  const bassFret = bassDot?.fret ?? 0

  // remaining pcs, scored by proximity to bass fret + slight low-fret bias.
  const seen = new Set<PitchClass>([bassPc])
  for (const pc of voicedPcs) {
    if (seen.has(pc)) continue
    seen.add(pc)
    let best: Dot | null = null
    let bestScore = Infinity
    for (let s = 0; s < 6; s++) {
      if (assigned[s]) continue
      const fret = fretFor(s, pc)
      if (fret > MAX_FRET) continue
      // primary: fret distance from bass. secondary: prefer lower frets.
      const score = Math.abs(fret - bassFret) * 10 + fret
      if (score < bestScore) {
        bestScore = score
        best = { stringIdx: s, fret, pc, isBass: false, isRoot: pc === rootPc }
      }
    }
    if (best) assigned[best.stringIdx] = best
  }

  return assigned.filter((d): d is Dot => d !== null)
}

function GuitarView({
  voicedMidis,
  bassPc,
  rootPc,
  preferFlat,
}: {
  voicedMidis: number[]
  bassPc: PitchClass
  rootPc: PitchClass
  preferFlat?: boolean
}) {
  const dots = useMemo(() => {
    const pcs = voicedMidis.map((m) => (((m % 12) + 12) % 12) as PitchClass)
    return buildShape(pcs, bassPc, rootPc)
  }, [voicedMidis, bassPc, rootPc])

  // shift the fret window up if the shape sits high on the neck.
  const fretted = dots.filter((d) => d.fret > 0).map((d) => d.fret)
  const hasOpen = dots.some((d) => d.fret === 0)
  const minUsed = fretted.length ? Math.min(...fretted) : 0
  const maxUsed = fretted.length ? Math.max(...fretted) : 0
  let startFret = 0
  let lastFret = 5
  if (fretted.length && !hasOpen && minUsed >= 4) {
    startFret = Math.max(0, minUsed - 1)
    lastFret = Math.max(startFret + 5, maxUsed + 1)
  } else {
    lastFret = Math.max(5, maxUsed + 1)
  }

  // horizontal fretboard, strings = horizontal lines.
  const fretW = 46
  const fretsShown = lastFret - startFret + 1
  const fretboardW = fretsShown * fretW
  const stringGap = 22
  const stringsH = (6 - 1) * stringGap
  const padX = 36
  const padY = 18
  const totalW = padX + fretboardW + 10
  const totalH = padY * 2 + stringsH + 14

  // inlay markers
  const markerFrets = [3, 5, 7, 9, 12, 15].filter((f) => f >= Math.max(startFret + 1, 1) && f <= lastFret)

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      width="100%"
      style={{ maxWidth: totalW + 2, minWidth: 360 }}
      role="img"
      aria-label="Guitar fretboard with played voicing fingering"
    >
      {/* nut (only if window starts at fret 0) */}
      {startFret === 0 ? (
        <rect x={padX - 4} y={padY - 6} width={6} height={stringsH + 12} fill="var(--ink-mute)" />
      ) : null}
      {/* strings (top = high E) */}
      {Array.from({ length: 6 }).map((_, i) => {
        const y = padY + i * stringGap
        const weight = 1 + (5 - i) * 0.25
        return (
          <g key={`s-${i}`}>
            <line
              x1={padX}
              y1={y}
              x2={padX + fretboardW}
              y2={y}
              stroke="var(--ink-mute)"
              strokeWidth={weight}
            />
            <text
              x={padX - 12}
              y={y + 4}
              textAnchor="end"
              className="font-mono"
              style={{ fontSize: 10, letterSpacing: 1, fill: 'var(--ink-dim)' }}
            >
              {STRING_LABELS[5 - i]}
            </text>
          </g>
        )
      })}
      {/* fret lines */}
      {Array.from({ length: fretsShown + 1 }).map((_, i) => {
        const x = padX + i * fretW
        return (
          <line
            key={`f-${i}`}
            x1={x}
            y1={padY - 4}
            x2={x}
            y2={padY + stringsH + 4}
            stroke="var(--bg-line)"
            strokeWidth={1}
          />
        )
      })}
      {/* inlay-style marker dots between strings 3 and 4 */}
      {markerFrets.map((f) => {
        const cx = padX + (f - startFret) * fretW - fretW / 2
        const cy = padY + 2.5 * stringGap
        return (
          <circle
            key={`fm-${f}`}
            cx={cx}
            cy={cy}
            r={f === 12 ? 3.2 : 2.5}
            fill="var(--ink-dim)"
            opacity={0.4}
          />
        )
      })}
      {/* fret number labels below board (plus the starting fret if window
          starts past the nut, so the player knows where they are). */}
      {startFret > 0 ? (
        <text
          x={padX + fretW / 2}
          y={padY + stringsH + 16}
          textAnchor="middle"
          className="font-mono"
          style={{ fontSize: 9, letterSpacing: 1, fill: 'var(--accent)' }}
        >
          {startFret + 1}fr
        </text>
      ) : null}
      {markerFrets
        .filter((f) => startFret === 0 || f !== startFret + 1)
        .map((f) => {
          const cx = padX + (f - startFret) * fretW - fretW / 2
          return (
            <text
              key={`fl-${f}`}
              x={cx}
              y={padY + stringsH + 16}
              textAnchor="middle"
              className="font-mono"
              style={{ fontSize: 9, letterSpacing: 1, fill: 'var(--ink-dim)' }}
            >
              {f}
            </text>
          )
        })}
      {/* mute markers (×) for strings the shape doesn't use - placed to the
          LEFT of the string label so they never overlap. */}
      {Array.from({ length: 6 }).map((_, s) => {
        const used = dots.some((d) => d.stringIdx === s)
        if (used) return null
        const y = padY + (5 - s) * stringGap
        return (
          <text
            key={`x-${s}`}
            x={padX - 26}
            y={y + 4}
            className="font-mono"
            style={{ fontSize: 11, fill: 'var(--ink-dim)', letterSpacing: 1 }}
          >
            ×
          </text>
        )
      })}
      {/* dots */}
      {dots.map((d, i) => {
        const y = padY + (5 - d.stringIdx) * stringGap
        // open-string dot sits at the nut. if window is shifted up, clamp.
        const xFret = d.fret === 0 ? startFret : d.fret
        const x =
          d.fret === 0 && startFret === 0
            ? padX - 14
            : padX + (xFret - startFret + 0.5) * fretW
        const r = 10
        return (
          <g key={`d-${i}`}>
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={d.isBass ? 'var(--accent)' : 'var(--accent-soft)'}
              stroke={d.isRoot ? 'var(--ink)' : 'transparent'}
              strokeWidth={d.isRoot ? 1.5 : 0}
            />
            <text
              x={x}
              y={y + 3}
              textAnchor="middle"
              className="font-mono"
              style={{
                fontSize: 8.5,
                letterSpacing: 0.5,
                fill: 'var(--bg-base)',
                fontWeight: d.isRoot ? 700 : 400,
              }}
            >
              {pcName(d.pc, preferFlat)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
