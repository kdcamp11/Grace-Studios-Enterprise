import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand tokens — resolved at runtime via CSS variables
        "brand-primary":   "var(--brand-primary)",
        "brand-secondary": "var(--brand-secondary)",
        "brand-bg":        "var(--brand-bg)",
        "brand-surface":   "var(--brand-surface)",
        "brand-border":    "var(--brand-border)",
        "brand-text":      "var(--brand-text)",
        "brand-muted":     "var(--brand-muted)",
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease both",
        "fade-in": "fadeIn 0.4s ease both",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      fontFamily: {
        display: ["var(--font-barlow-condensed)", "sans-serif"],
        barlow: ["var(--font-barlow)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
