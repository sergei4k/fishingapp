/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#60a5fa',
          dark: '#3b82f6',
        },
        background: '#0f172a',
        surface: {
          DEFAULT: '#071023',
          light: '#1e293b',
        },
        border: '#0b1220',
        text: {
          primary: '#e6eef8',
          secondary: '#94a3b8',
          muted: '#7ea8c9',
        },
        danger: '#ef4444',
      },
      spacing: {
        'safe-top': 'var(--safe-area-inset-top)',
        'safe-bottom': 'var(--safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
}