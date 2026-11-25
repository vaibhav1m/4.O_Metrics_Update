"use client";

import { Moon, Sun } from "lucide-react";
import { setTheme, useTheme } from "@/lib/useTheme";

export default function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
