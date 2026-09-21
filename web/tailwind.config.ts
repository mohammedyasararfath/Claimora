import type { Config } from "tailwindcss";

// Color tokens ported directly from the approved artifact's CSS custom
// properties (light values here; dark-mode overrides live in globals.css via
// the same variable names under `.dark`), so the production UI keeps the
// prototype's exact visual identity.
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "hsl(var(--paper))",
        card: "hsl(var(--card))",
        ink: "hsl(var(--ink))",
        "ink-soft": "hsl(var(--ink-soft))",
        line: "hsl(var(--line))",
        indigo: { DEFAULT: "hsl(var(--indigo))", soft: "hsl(var(--indigo-soft))" },
        violet: { DEFAULT: "hsl(var(--violet))", soft: "hsl(var(--violet-soft))" },
        coral: { DEFAULT: "hsl(var(--coral))", soft: "hsl(var(--coral-soft))" },
        mint: { DEFAULT: "hsl(var(--mint))", soft: "hsl(var(--mint-soft))" },
        amber: { DEFAULT: "hsl(var(--amber))", soft: "hsl(var(--amber-soft))" },
        slate: { DEFAULT: "hsl(var(--slate))", soft: "hsl(var(--slate-soft))" },
        border: "hsl(var(--line))",
        background: "hsl(var(--paper))",
        foreground: "hsl(var(--ink))",
        primary: { DEFAULT: "hsl(var(--indigo))", foreground: "white" },
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "6px",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
