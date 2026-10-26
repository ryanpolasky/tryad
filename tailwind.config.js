/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: {
          DEFAULT: 'rgb(var(--bg-rgb) / <alpha-value>)',
          soft: 'rgb(var(--chrome-rgb) / <alpha-value>)',
          card: 'rgb(var(--field-rgb) / <alpha-value>)',
          line: 'rgb(var(--line-rgb) / <alpha-value>)',
          hover: 'rgb(var(--btn-rgb) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink-rgb) / <alpha-value>)',
          mute: 'rgb(var(--dim-rgb) / <alpha-value>)',
          dim: 'rgb(var(--dim-rgb) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--hot-rgb) / <alpha-value>)',
          soft: 'rgb(var(--hot-rgb) / <alpha-value>)',
          dim: 'rgb(var(--hot-d-rgb) / <alpha-value>)',
        },
        warn: 'rgb(var(--away-rgb) / <alpha-value>)',
        bad: 'rgb(var(--tension-rgb) / <alpha-value>)',
      },
      letterSpacing: {
        widest: '0.18em',
      },
    },
  },
  plugins: [],
}
