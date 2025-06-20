/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'aviation-blue': '#1E40AF',
        'sunset-orange': '#F59E0B',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      gradientColorStops: {
        'sky-start': '#0EA5E9',
        'sky-end': '#0284C7',
      }
    },
  },
  plugins: [],
} 