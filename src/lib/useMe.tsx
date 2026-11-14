"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { allows, type Action, type Feature, type Features } from "@/lib/routePermissions";

// Client half of the session: /api/auth/me is fetched once and shared. This only
// drives what the UI shows — the server (src/proxy.ts) enforces access.

export interface Me {
  user: { id: string; name: string; email: string };
  role: string | null;
  orgName: string | null;
  features: Features;
}

interface MeState {
  me: Me | null;
  loading: boolean;
  can: (feature: Feature, action: Action) => boolean;
  logout: () => Promise<void>;
}

const MeContext = createContext<MeState>({ me: null, loading: true, can: () => false, logout: async () => {} });

export function MeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onLogin = pathname === "/login";
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!onLogin);

  useEffect(() => {
    if (onLogin) return;
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async res => {
        if (res.status === 401 || res.status === 403) {
          // Session ended (expired, superseded by a newer login, or access removed).
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return null;
        }
        return res.ok ? ((await res.json()) as Me) : null;
      })
      .then(data => { if (!cancelled) { setMe(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onLogin]);

  const can = useCallback((feature: Feature, action: Action) => allows(me?.features, feature, action), [me]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }, []);

  const value = useMemo(() => ({ me, loading, can, logout }), [me, loading, can, logout]);
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeState {
  return useContext(MeContext);
}

/** Signed-in user's lowercased email ("" until loaded) — the per-user key for folders. */
export function useCurrentUser(): string {
  return useContext(MeContext).me?.user.email ?? "";
}
