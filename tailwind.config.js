/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        carbon: {
          950: '#040508',
          DEFAULT: '#080a0f',
          900: '#0c0f17',
        },
        tactical: {
          dark: '#12151e',
          surface: '#181c28',
          elevated: '#1f2536',
          border: '#2a3245',
        },
        volt: {
          DEFAULT: '#ccff00',
          hover: '#b8e600',
          active: '#a6d100',
          muted: '#8ba60e',
          dark: '#212900',
        },
        cyan: {
          DEFAULT: '#00f0ff',
          hover: '#00d6e6',
          muted: '#0e7490',
          dark: '#083344',
        },
        gold: {
          DEFAULT: '#fbbf24',
          hover: '#f59e0b',
          muted: '#b45309',
          dark: '#451a03',
        },
        pitch: {
          amber: '#fbbf24',
          cyan: '#00f0ff',
          volt: '#ccff00',
          line: '#1e2535',
        },
      },
      fontFamily: {
        athletic: ['"Barlow Condensed"', 'Impact', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.05em',
        condensed: '-0.025em',
        tracked: '0.12em',
        mega: '0.2em',
      },
      boxShadow: {
        hairline: '0 0 0 1px rgba(255, 255, 255, 0.1)',
        'hairline-dark': '0 0 0 1px rgba(255, 255, 255, 0.06)',
        volt: '0 0 0 1px #ccff00',
        tactile: '0 3px 0 0 #000000',
      },
    },
  },
  plugins: [],
}

