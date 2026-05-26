// 16-step drum patterns (one bar = 16 sixteenths).
// each pattern lists the step indices each voice fires on.

export type DrumPiece = 'kick' | 'snare' | 'hihat' | 'openhat' | 'ride' | 'rim'

export interface DrumPattern {
  /** per-bar step indices (0-15) keyed by drum piece */
  steps: Partial<Record<DrumPiece, number[]>>
  /** per-piece velocity scaling (0-1) */
  vel?: Partial<Record<DrumPiece, number[]>>
}

export interface DrumStyle {
  id: string
  label: string
  /** bars in the loop */
  bars: number
  patterns: DrumPattern[]
}

export const DRUM_STYLES: DrumStyle[] = [
  {
    id: 'off',
    label: 'off',
    bars: 1,
    patterns: [{ steps: {} }],
  },
  {
    id: 'four',
    label: 'four-on-floor',
    bars: 1,
    patterns: [
      {
        steps: {
          kick: [0, 4, 8, 12],
          snare: [4, 12],
          hihat: [2, 6, 10, 14],
          openhat: [],
        },
      },
    ],
  },
  {
    id: 'boom',
    label: 'boom-bap',
    bars: 1,
    patterns: [
      {
        steps: {
          kick: [0, 10],
          snare: [4, 12],
          hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        },
        vel: {
          hihat: [0.85, 0.55, 0.7, 0.55, 0.85, 0.55, 0.7, 0.55],
        },
      },
    ],
  },
  {
    id: 'halftime',
    label: 'halftime',
    bars: 1,
    patterns: [
      {
        steps: {
          kick: [0, 6],
          snare: [8],
          hihat: [0, 2, 4, 6, 8, 10, 12, 14],
        },
        vel: {
          hihat: [0.8, 0.5, 0.7, 0.5, 0.8, 0.5, 0.7, 0.5],
        },
      },
    ],
  },
  {
    id: 'ballad',
    label: 'ballad',
    bars: 2,
    patterns: [
      {
        steps: {
          kick: [0],
          hihat: [0, 4, 8, 12],
          snare: [8],
        },
        vel: { hihat: [0.75, 0.55, 0.65, 0.55] },
      },
      {
        steps: {
          kick: [0],
          hihat: [0, 4, 8, 12],
          snare: [8, 14],
        },
        vel: { hihat: [0.75, 0.55, 0.65, 0.55], snare: [1, 0.55] },
      },
    ],
  },
  {
    id: 'jazz',
    label: 'jazz brushes',
    bars: 1,
    patterns: [
      {
        // approximated swing: ride on every beat + 'and', velocity-weighted.
        steps: {
          ride: [0, 3, 4, 7, 8, 11, 12, 15],
          rim: [4, 12],
          kick: [0],
        },
        vel: {
          ride: [0.9, 0.55, 0.85, 0.55, 0.9, 0.55, 0.85, 0.55],
          kick: [0.55],
          rim: [0.6, 0.6],
        },
      },
    ],
  },
]

export function getDrumStyle(id: string): DrumStyle {
  return DRUM_STYLES.find((s) => s.id === id) ?? DRUM_STYLES[0]
}

// GM percussion key per piece (MIDI ch 10).
export const GM_PERCUSSION: Record<DrumPiece, number> = {
  kick: 36, // Bass Drum 1
  snare: 38, // Acoustic Snare
  hihat: 42, // Closed Hi-Hat
  openhat: 46, // Open Hi-Hat
  ride: 51, // Ride Cymbal 1
  rim: 37, // Side Stick / Rimshot
}
