/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        'rosa-aurora': '#E9A8C9',
        'rose-marmore': '#F2DDE4',
        'champagne-nuvem': '#F5F1ED',
        'dourado-neblina': '#D9C6A5',
        'grafite-rosado': '#3C2F33',
        primary: {
          DEFAULT: '#E9A8C9',
          hover: '#E293BB',
          light: '#F2DDE4',
        },
        background: {
          DEFAULT: '#FAF7F5',
          card: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#D9C6A5',
          light: '#E8DBC4',
        },
        text: {
          DEFAULT: '#3C2F33',
          light: '#5A4D51',
          muted: '#8A7D81',
        },
      },
      boxShadow: {
        'soft': '0 1px 3px rgba(60,47,51,0.06), 0 4px 12px rgba(233,168,201,0.08)',
        'soft-lg': '0 4px 12px rgba(60,47,51,0.06), 0 12px 32px rgba(233,168,201,0.12)',
        'card': '0 1px 2px rgba(60,47,51,0.04), 0 2px 8px rgba(60,47,51,0.04)',
        'card-hover': '0 2px 8px rgba(60,47,51,0.06), 0 8px 24px rgba(233,168,201,0.10)',
      },
    },
  },
  plugins: [],
};
