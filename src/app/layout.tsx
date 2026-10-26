import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import BrandIcon from "@/components/BrandIcon";
import UserBadge from "@/components/UserBadge";

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
    <html lang="en">
      <body>
        <nav className="nav-bar">
          <Link href="/">
            <div className="nav-brand">
              <BrandIcon />
              <span>Database Explorer</span>
            </div>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <UserBadge />
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>v2.0</span>
          </div>
        </nav>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
