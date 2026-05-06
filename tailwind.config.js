/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Outfit",
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        night: {
          950: "#070a12",
          900: "#0a1020",
          850: "#0e1628",
          800: "#111c31",
        },
        lumo: {
          violet: "var(--lumo-violet)",
          teal: "var(--lumo-teal)",
          blue: "var(--lumo-blue)",
        },
      },
      boxShadow: {
        glass: "inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 60px -40px rgba(89,213,202,0.45)",
      },
    },
  },
  plugins: [],
};
