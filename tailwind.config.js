/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'rosa-aurora': '#E9A8C9',
        'rose-marmore': '#F2DDE4',
        'champagne-nuvem': '#F7F3EF',
        'dourado-neblina': '#D9C6A5',
        'grafite-rosado': '#3C2F33',
        primary: {
          DEFAULT: '#E9A8C9',
          hover: '#E293BB',
          light: '#F2DDE4',
        },
        background: {
          DEFAULT: '#F7F3EF',
          card: '#F2DDE4',
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
        'soft': '0 2px 8px rgba(233, 168, 201, 0.1)',
        'soft-lg': '0 4px 16px rgba(233, 168, 201, 0.15)',
        'card': '0 1px 3px rgba(60, 47, 51, 0.08)',
      },
    },
  },
  plugins: [],
};
