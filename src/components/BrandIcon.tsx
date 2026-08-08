"use client";

import { DatabaseIcon } from "lucide-animated";

// lucide-animated's icons need a client boundary (they use motion/react
// hooks internally but don't ship "use client" themselves), so this wraps
// one for use from the root layout, which is a Server Component.
export default function BrandIcon() {
  return <DatabaseIcon size={24} style={{ color: "var(--accent-color)" }} />;
}
