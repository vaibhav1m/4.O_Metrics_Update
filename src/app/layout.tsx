import type { Metadata } from "next";
import "./globals.css";
import { Database } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "4.OMetrics Admin",
  description: "Dynamic Database Table Administration",
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
              <Database className="text-accent" style={{ color: "var(--accent-color)" }} />
              <span>4.OMetrics Admin</span>
            </div>
          </Link>
          <div style={{ display: "flex", gap: "1rem" }}>
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>v1.0</span>
          </div>
        </nav>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
