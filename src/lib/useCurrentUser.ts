"use client";

import { useSyncExternalStore } from "react";

// Client half of src/lib/currentUser.ts: the name lives in localStorage and is
// sent on per-user requests as the x-dbexplorer-user header.
const STORAGE_KEY = "dbexplorer:user";
const CHANGE_EVENT = "dbexplorer:user-change";

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setCurrentUser(name: string) {
  try {
    if (name.trim()) localStorage.setItem(STORAGE_KEY, name.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked — the name just won't persist past this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useCurrentUser(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}

export function userFetch(user: string, input: string, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers, "x-dbexplorer-user": user },
  });
}
