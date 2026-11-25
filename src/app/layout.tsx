import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import BrandIcon from "@/components/BrandIcon";
import UserBadge from "@/components/UserBadge";
import ThemeToggle from "@/components/ThemeToggle";
import { MeProvider } from "@/lib/useMe";
import { THEME_INIT_SCRIPT } from "@/lib/themeScript";

export const metadata: Metadata = {
  title: "Database Explorer",
  description: "Browse and manage tables across multiple database connections",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT sets data-theme on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <MeProvider>
        <nav className="nav-bar">
          <Link href="/">
            <div className="nav-brand">
              <BrandIcon />
              <span>Database Explorer</span>
            </div>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <ThemeToggle />
            <UserBadge />
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>v2.0</span>
          </div>
        </nav>
        <main>
          {children}
        </main>
        </MeProvider>
      </body>
    </html>
  );
}
