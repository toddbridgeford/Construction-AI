import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        }
      },
      boxShadow: {
        panel: '0 14px 28px rgba(2, 6, 23, 0.52)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.045), inset 0 -1px 0 rgba(0,0,0,0.52)',
        glow: '0 0 0 1px rgba(245,158,11,0.3), 0 8px 22px rgba(245,158,11,0.14)'
      }
    }
  },
  plugins: []
}

export default config
