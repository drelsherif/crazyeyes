/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

// === postcss.config.js ===
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}