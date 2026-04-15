/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f7ff",
          100: "#dce9ff",
          200: "#bfd7ff",
          300: "#93bcff",
          400: "#6298ff",
          500: "#3f74f5",
          600: "#2f57db",
          700: "#2746b7",
          800: "#243d93",
          900: "#223777",
        },
      },
    },
  },
  plugins: [],
};
