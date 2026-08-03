import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // PrimeSocial Brand — Cyan #88deec + Green Accent #00ff88
        brand: {
          50:  "#f0fbfd",
          100: "#d6f4f9",
          200: "#aee9f3",
          300: "#88deec",   // Primärfarbe Website
          400: "#5ccfe3",
          500: "#88deec",   // Default brand
          600: "#44a08d",   // Sekundär Teal
          700: "#2d7a6a",
          800: "#1a5449",
          900: "#0d2e28",
        },
        accent: {
          500: "#00ff88",   // Grüner Akzent
          400: "#33ff9f",
          600: "#00cc6e",
        },
        dark: {
          700: "#333333",
          800: "#1a1a1a",
          900: "#0f0f0f",
          950: "#000000",
        },
      },
      fontFamily: {
        heading: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        body:    ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      borderRadius: {
        xl:  "15px",
        "2xl": "20px",
        "3xl": "25px",
        full: "9999px",
      },
      boxShadow: {
        card:  "0 15px 50px rgba(0,0,0,0.4)",
        brand: "0 25px 80px rgba(136,222,236,0.25)",
        glow:  "0 0 20px rgba(136,222,236,0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
