import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        "fg-muted": "rgb(var(--fg-muted) / <alpha-value>)",
        "fg-subtle": "rgb(var(--fg-subtle) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        "border-strong": "rgb(var(--border-strong) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-hover": "rgb(var(--accent-hover) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        "danger-bg": "rgb(var(--danger-bg) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        "success-bg": "rgb(var(--success-bg) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        "warning-bg": "rgb(var(--warning-bg) / <alpha-value>)",
      },
      fontFamily: {
        sans: ['var(--font-sans)', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        display: ['var(--font-display)', "Georgia", "Times New Roman", "serif"],
        mono: ['var(--font-mono)', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      letterSpacing: {
        tightish: "-0.011em",
        tighter2: "-0.02em",
      },
      // Editorial sharpness: strictly rectangular. `full` survives for the
      // genuinely circular (checkbox accents, pills, spinners).
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        "3xl": "0",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px 0 rgb(0 0 0 / 0.03)",
        "card-lg": "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(4px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "slide-in": "slide-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        "pop-in": "pop-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
