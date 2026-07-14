/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:   "#1F2D2B",
        paper: "#F2F4F3",
        evergreen: { DEFAULT: "#2E6E5E", dark: "#245548", light: "#EAF2EF" },
        dusk:      { DEFAULT: "#3D5A80", light: "#EBF0F6" },
        copper:    { DEFAULT: "#B4642D", light: "#F7EEE5" },
        sage:  "#6FA287",
        haze:  "#7C8A85",
        danger: { DEFAULT: "#B3402F", light: "#F9ECE9" },
        amber2: { DEFAULT: "#A16207", light: "#FBF3E4" },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
}
