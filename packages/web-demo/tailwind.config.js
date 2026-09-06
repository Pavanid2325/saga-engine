/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0B0F17',
          800: '#111827',
          700: '#1F2937',
          600: '#374151',
        },
        saga: {
          blue: '#3B82F6',
          cyan: '#06B6D4',
          emerald: '#10B981',
          rose: '#F43F5E',
          amber: '#F59E0B',
          purple: '#8B5CF6',
        }
      },
      fontFamily: {
        mono: ['Fira Code', 'JetBrains Mono', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'flow-right': 'flowRight 1.5s infinite linear',
        'flow-left': 'flowLeft 1.5s infinite linear',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        flowRight: {
          '0%': { strokeDashoffset: '24' },
          '100%': { strokeDashoffset: '0' },
        },
        flowLeft: {
          '0%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '24' },
        }
      }
    },
  },
  plugins: [],
}
