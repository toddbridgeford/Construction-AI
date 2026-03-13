import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0A0F1A',
        panel: '#111A2D',
        panelSoft: '#16243A',
        ink: '#E6ECF8',
        muted: '#8EA0BF',
        positive: '#34D399',
        caution: '#FBBF24',
        negative: '#F87171',
        accent: '#60A5FA'
      },
      boxShadow: {
        panel: '0 8px 30px rgba(3,8,20,0.35)'
      }
    }
  },
  plugins: []
};

export default config;
