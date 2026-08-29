/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#070b10',
        panel: '#0e141a',
        panelAlt: '#141c23',
        border: '#262f39',
        text: '#edf3fa',
        muted: '#8d98a4',
        accent: '#7fc3ff',
        success: '#8ad7d7',
        warning: '#d1b06e',
        danger: '#ff8a8a',
      },
      boxShadow: {
        subtle: '0 1px 0 rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,0.16)',
      },
      letterSpacing: {
        display: '0.22em',
      },
    },
  },
  plugins: [],
};
