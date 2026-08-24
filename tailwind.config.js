/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0c10',
          900: '#0f131a',
          850: '#131822',
          800: '#181f2b',
          700: '#232b3a',
          600: '#2f3a4d',
          500: '#4a5875',
        },
        accent: {
          500: '#5b7fff',
          400: '#7d9bff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
