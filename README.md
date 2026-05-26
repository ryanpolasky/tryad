# tryad

a free chord progression generator. lives at [tryad.net](https://tryad.net/).

i wanted to mess around with chord ideas for a song. the alternatives wanted my email, or $19/month, or both. so i spent a weekend building this instead of, you know, getting better at writing chord progressions on my own.

## what it does

picks a key, a scale, a mood, a voicing. spits out a progression. plays it back. exports MIDI. nothing leaves your browser.

under the hood it's actual music theory:

- 9 scales, 12 keys, correct diatonic qualities per scale
- 10 mood templates (pop, sad, happy, epic, jazz, r&b, dreamy, lofi, cinematic, random)
- 6 voicings (triad, 7th, 9th, sus2, sus4, add9)
- secondary dominants (V/V, V/vi, V/iv) at mood-specific rates
- modal interchange (borrowed iv, ♭III, ♭VI, ♭VII)
- cadence-aware endings (authentic / plagal / deceptive)
- voice leading with manual inversion override
- 11 play modes (block, pulse, syncopated, strum, rolled, four arps, alberti, ballad bass+chord)
- piano + guitar visualizer with the literal played voicing
- 5 drum styles synced to tempo
- MIDI export with separate chord + drum tracks
- save to `localStorage`, never uploaded

## stack

vite + react + typescript + tailwind + [tone.js](https://tonejs.github.io/) + [@tonejs/midi](https://github.com/Tonejs/Midi). pure static build. no backend.

## run it

```bash
pnpm install
pnpm dev
```

then [http://localhost:5173](http://localhost:5173). build with `pnpm build`, output lands in `dist/`.

## keyboard

| key                         | action          |
|-----------------------------|-----------------|
| `space`                     | play / pause    |
| `g`                         | regenerate      |
| `cmd/ctrl + s`              | save            |
| `cmd/ctrl + e`              | export MIDI     |
| `tab`                       | focus chord     |
| `enter` / `space` (focused) | preview         |
| `i` (focused)               | cycle inversion |
| `shift + ←/→` (focused)     | move chord      |
| `del` (focused)             | remove chord    |

## license

MIT. samples are CC from [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) and [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments).

## why "tryad"

triad (the basic 3-note chord) + try (give it a try) + the ry prefix shared with [my other ry* sites](https://ryanpolasky.com). the wordmark renders `t` `ry` `ad` with the `ry` in copper.
