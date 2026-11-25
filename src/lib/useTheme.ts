"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

export type Theme = "light" | "dark";

function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// The source of truth is the data-theme attribute on <html>; watching it keeps
// every consumer (toggle, AG Grid class) in sync without a context provider.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked — the choice just won't survive a reload.
  }
}
