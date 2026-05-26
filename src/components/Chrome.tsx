import { Link } from 'react-router-dom'

// shared header / footer / wordmark for the landing and the app.
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' | 'xl' }) {
  const sizeCls =
    size === 'xl'
      ? 'text-5xl sm:text-6xl'
      : size === 'lg'
        ? 'text-3xl sm:text-4xl'
        : 'text-xl'
  return (
    <span
      className={`font-display ${sizeCls} tracking-tight leading-none text-ink`}
      aria-label="tryad"
    >
      t<span className="text-accent">ry</span>ad
    </span>
  )
}

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M5 18 L5 10" className="text-ink-mute" />
        <path d="M10 20 L10 6" className="text-accent" />
        <path d="M15 18 L15 9" className="text-ink-mute" />
        <path d="M20 21 L20 7" className="text-ink" />
      </g>
    </svg>
  )
}

export function Header({ variant = 'app' }: { variant?: 'app' | 'landing' }) {
  return (
    <header className="border-b border-bg-line/60">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-5 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-3" aria-label="tryad, home">
          <Logo />
          <Wordmark />
        </Link>
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-mute hidden sm:inline">
          chord progressions, free
        </span>
        <nav className="ml-auto flex items-center gap-4">
          {variant === 'landing' ? (
            <Link
              to="/app"
              className="pill pill-primary text-[11px] uppercase tracking-widest"
            >
              open generator ↗
            </Link>
          ) : (
            <Link
              to="/"
              className="font-mono text-[11px] uppercase tracking-widest text-ink-mute hover:text-ink transition-colors"
            >
              about
            </Link>
          )}
          <a
            href="https://github.com/ryanpolasky/tryad"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-ink-mute hover:text-ink transition-colors"
          >
            source ↗
          </a>
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-bg-line/60 mt-12">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 sm:gap-4 text-[11px] font-mono uppercase tracking-widest text-ink-mute">
        <span>no signup, ever, cuz that's lame</span>
        <span className="text-ink-dim hidden sm:inline">|</span>
        <span>
          built w/{' '}
          <span className="accent-underline text-accent normal-case lowercase font-display italic">
            {'<3'}
          </span>{' '}
          by{' '}
          <a
            href="https://ryanpolasky.com"
            target="_blank"
            rel="noreferrer"
            className="text-ink hover:text-accent transition-colors"
          >
            ryan polasky
          </a>
        </span>
        <span className="sm:ml-auto text-ink-mute normal-case lowercase tracking-normal font-sans">
          everything runs in your browser. nothing leaves this device.
        </span>
      </div>
    </footer>
  )
}
