import { Link } from 'react-router-dom'
import { Header, Footer, Wordmark } from '../components/Chrome'

// landing at /. honest voice, dry features, short philosophy.
export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header variant="landing" />

      <main className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-16 sm:py-24 flex flex-col gap-24">
        {/* hi */}
        <section className="flex flex-col gap-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-ink-mute">
            00 / hi
          </p>
          <h1 className="font-display font-medium leading-[0.98] tracking-tight text-ink text-5xl sm:text-7xl">
            chord progressions.{' '}
            <span className="italic text-accent accent-underline">free.</span>
            <br />
            no signup. no paywall.
          </h1>
          <p className="font-sans text-lg sm:text-xl text-ink-mute max-w-3xl leading-relaxed">
            hi, i'm ryan.{' '}
            <Wordmark /> is a free chord progression generator that runs
            entirely in your browser. there's no signup screen, no "pro" tier,
            no upload. it's the chord tool i wanted to exist, which is why i
            built it.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <Link to="/app" className="pill pill-primary text-sm">
              open the generator →
            </Link>
            <a href="#why" className="pill text-sm">
              why i built it
            </a>
          </div>
        </section>

        {/* why */}
        <section className="flex flex-col gap-6" id="why">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-ink-mute">
            01 / why
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight leading-tight">
            i wanted to mess around with chord ideas for a song.
            <br />
            the alternatives wanted my email.
          </h2>
          <div className="font-sans text-lg text-ink-mute max-w-3xl leading-relaxed flex flex-col gap-4">
            <p>
              one tool wanted $19/month to unlock anything past four chords.
              another forced a google signin before it'd even render a key
              picker. a third was an "AI-powered" chord generator (markov
              chain in a trench coat) that locked output behind a credit-card
              wall.
            </p>
            <p>
              that annoyed me enough that i spent a weekend writing this
              instead of, you know, getting better at writing chord
              progressions on my own.
            </p>
            <p className="text-ink-dim text-base">
              the trade is: tryad isn't going to learn from your playing or
              hold your hand through a tutorial. it just spits out
              theory-grounded progressions, lets you tweak them, plays them
              back, and exports MIDI. that's it. hope that's useful.
            </p>
          </div>
        </section>

        {/* what it does */}
        <section className="flex flex-col gap-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-ink-mute">
            02 / what it does
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
            it's actually music theory under the hood.
          </h2>
          <p className="font-sans text-lg text-ink-mute max-w-3xl leading-relaxed">
            you don't need to know any of this for it to work. but if you do,
            you can see exactly what the engine is doing through the roman
            numerals on each chord card.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8 mt-2">
            <Feature
              title="9 scales, 12 keys"
              body="major (ionian), natural minor (aeolian), harmonic minor, melodic minor, dorian, mixolydian, phrygian, lydian, locrian. diatonic chord qualities are computed per scale, so a vi chord in C major is Am with the right scale tones, not just a random minor."
            />
            <Feature
              title="10 moods"
              body="pop, sad, happy, epic, jazz, r&b, dreamy, lofi, cinematic, random. each mood has its own pool of curated progression templates plus weighted markov substitution for some variety inside the genre."
            />
            <Feature
              title="secondary dominants"
              body="V/V, V/vi, V/iv injected at mood-specific rates (jazz around 35%, cinematic 28%, pop 18%, sad 10%). the jazz progressions chain them into ii-V-I cadences when the template allows."
            />
            <Feature
              title="modal interchange"
              body="major scales can borrow iv, ♭III, ♭VI, ♭VII from parallel minor, and vice versa. the chord card shows the source key so you can tell what was borrowed."
            />
            <Feature
              title="cadence-aware endings"
              body="the last chord biases toward I. 60% authentic (V→I), 25% plagal (IV→I), 15% deceptive (V→vi). progressions actually resolve instead of just running out of bar."
            />
            <Feature
              title="voice leading"
              body="every chord auto-inverted to minimize bass and top-voice motion. you can override any chord's inversion manually; the slash notation, audio, and MIDI export all stay in sync."
            />
            <Feature
              title="6 voicings, 11 play modes"
              body="triad, 7th, 9th, sus2, sus4, add9. block, strum, rolled (harp gliss), four arp modes (up, down, up-down, random), pulse, syncopated rhythm, classical alberti, and a bass + chord ballad comp. swap between them while the loop is running."
            />
            <Feature
              title="visualizer + drums + MIDI"
              body="click any chord to see the literal voicing on a piano keyboard or guitar fretboard. 5 drum styles synced to your tempo. export the whole thing as a standard .mid with separate chord and drum tracks."
            />
          </div>
        </section>

        {/* receipts */}
        <section className="flex flex-col gap-6" id="source">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-ink-mute">
            03 / receipts
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
            don't believe me?
          </h2>
          <div className="font-sans text-lg text-ink-mute max-w-3xl leading-relaxed flex flex-col gap-3">
            <p>
              here's literally all of the code.
            </p>
            <p className="text-ink-dim text-base">
              clone it, claim you wrote it, say it's yours, i genuinely
              couldn't care less.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <a
              href="https://github.com/ryanpolasky/tryad"
              target="_blank"
              rel="noreferrer"
              className="pill text-sm"
            >
              github.com/ryanpolasky/tryad ↗
            </a>
          </div>
        </section>

        {/* examples */}
        <section className="flex flex-col gap-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-ink-mute">
            04 / what it generates
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
            here's what comes out.
          </h2>
          <p className="font-sans text-base text-ink-mute max-w-2xl">
            real examples from the engine. nothing static. hit generate in
            the actual app and you'll get something different each time.
          </p>
          <div className="flex flex-col gap-4 mt-2">
            <ExampleRow
              label="C major / pop / triad"
              roman={['I', 'V', 'vi', 'IV']}
              chords={['C', 'G', 'Am', 'F']}
            />
            <ExampleRow
              label="C major / jazz / 7th"
              roman={['ii7', 'V7/iii', 'V7/vi', 'V7/ii', 'ii7', 'IVmaj7', 'V7', 'Imaj7']}
              chords={['Dm7', 'B7', 'E7', 'A7', 'Dm7', 'Fmaj7', 'G7', 'Cmaj7']}
              note="three secondary dominants chained into a ii-V-I cadence"
            />
            <ExampleRow
              label="C natural minor / cinematic / triad"
              roman={['i', 'VI', 'IV', 'v', 'i', 'VI', 'v', 'i']}
              chords={['Cm', 'A♭', 'F', 'Gm', 'Cm', 'A♭', 'Gm', 'Cm']}
              note="modal interchange. IV (F major) borrowed from parallel major"
            />
            <ExampleRow
              label="C major / dreamy / 9th"
              roman={['Imaj9', 'iii9', 'IVmaj9', 'V9']}
              chords={['Cmaj9', 'Em9', 'Fmaj9', 'G9']}
            />
          </div>
        </section>

        {/* the point */}
        <section className="flex flex-col gap-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.25em] text-ink-mute">
            05 / the point
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-ink tracking-tight">
            no signup. no upload. no "pro" tier.
          </h2>
          <div className="font-sans text-lg text-ink-mute max-w-3xl leading-relaxed flex flex-col gap-4">
            <p>
              the theory engine, the audio sampler, the MIDI export, the drum
              synth, all of it runs in your browser. your saved progressions
              live in <code className="font-mono text-ink">localStorage</code>{' '}
              on your device. nothing gets uploaded. there's nothing for me
              to track, because i don't want to track you anyway.
            </p>
            <p>
              the source is on github. the audio samples are CC. the
              underlying theory is just music theory. there is genuinely
              nothing proprietary here. take it, fork it, run it offline,
              embed it in your DAW preprocessor, idc.
            </p>
            <p className="text-ink-dim text-base">
              if you like it, cool. if you don't, no hard feelings. either
              way, it at least didn't cost you $19/month.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <Link to="/app" className="pill pill-primary text-sm">
              open the generator →
            </Link>
            <a
              href="https://github.com/ryanpolasky/tryad"
              target="_blank"
              rel="noreferrer"
              className="pill text-sm"
            >
              source on github ↗
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-display text-xl text-ink tracking-tight">{title}</h3>
      <p className="font-sans text-[15px] leading-relaxed text-ink-mute">{body}</p>
    </div>
  )
}

function ExampleRow({
  label,
  roman,
  chords,
  note,
}: {
  label: string
  roman: string[]
  chords: string[]
  note?: string
}) {
  return (
    <div className="flex flex-col gap-2 border border-bg-line/60 rounded-xl px-5 py-4 bg-bg-soft/30">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-mute">
        {label}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${chords.length}, minmax(0, 1fr))` }}
      >
        {chords.map((c, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-md border border-bg-line/40"
          >
            <span
              className={`font-mono text-[9.5px] uppercase tracking-widest ${
                /[a-z]/.test(roman[i][0]) ? 'italic text-accent' : 'text-ink-mute'
              }`}
            >
              {roman[i]}
            </span>
            <span className="font-display text-lg text-ink leading-none">{c}</span>
          </div>
        ))}
      </div>
      {note ? (
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim mt-1">
          → {note}
        </div>
      ) : null}
    </div>
  )
}
