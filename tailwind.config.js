/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bespoke Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: {
          DEFAULT: '#08090b',
          soft: '#0d0f12',
          card: '#101317',
          line: '#1a1d23',
          hover: '#161a20',
        },
        ink: {
          DEFAULT: '#e8e6e3',
          mute: '#8a8d93',
          dim: '#5a5e66',
        },
        accent: {
          DEFAULT: '#d99550',
          soft: '#e8b06b',
          dim: '#9c6a36',
        },
        warn: '#f5a524',
        bad: '#ff5d6e',
      },
      letterSpacing: {
        widest: '0.18em',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(217,149,80,0.35), 0 8px 32px -10px rgba(217,149,80,0.35)',
      },
    },
  },
  plugins: [],
}
