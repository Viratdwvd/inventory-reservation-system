// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockReserve — Inventory Management",
  description: "Race-condition-safe inventory reservation system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          {/* Nav */}
          <header
            style={{
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border)",
            }}
            className="sticky top-0 z-50"
          >
            <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2.5 group">
                <div
                  className="w-7 h-7 rounded flex items-center justify-center"
                  style={{ background: "var(--amber)" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M7 1L13 4V10L7 13L1 10V4L7 1Z"
                      fill="black"
                      fillOpacity="0.9"
                    />
                  </svg>
                </div>
                <span
                  className="font-semibold text-sm tracking-wide"
                  style={{ color: "var(--text-primary)" }}
                >
                  StockReserve
                </span>
              </a>
              <nav className="flex items-center gap-1">
                <a
                  href="/"
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Products
                </a>
                <a
                  href="/api/warehouses"
                  target="_blank"
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  API
                </a>
              </nav>
            </div>
          </header>

          {/* Main */}
          <main className="flex-1">{children}</main>

          {/* Footer */}
          <footer
            className="py-6 text-center text-xs mono"
            style={{
              color: "var(--text-muted)",
              borderTop: "1px solid var(--border)",
            }}
          >
            StockReserve · Concurrency-safe reservation engine · PostgreSQL
            SELECT FOR UPDATE
          </footer>
        </div>
      </body>
    </html>
  );
}
