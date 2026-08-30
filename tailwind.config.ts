import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fff4ee',
          100: '#ffe4cc',
          200: '#ffc499',
          300: '#ff9d5c',
          400: '#ff7a2a',
          500: '#F05A00', // laranja S&I principal
          600: '#cc4a00',
          700: '#a33b00',
          800: '#7a2c00',
          900: '#521e00',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted:   '#fafafa',
          border:  '#e8e8e8',
        },
        ink: {
          DEFAULT: '#1a1714',
          muted:   '#6b6560',
          light:   '#a09b96',
        },
        status: {
          vago:       '#22c55e',
          ocupado:    '#ef4444',
          limpeza:    '#f59e0b',
          manutencao: '#6366f1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
        xl: '16px',
      },
    },
  },
  plugins: [],
}

export default config
