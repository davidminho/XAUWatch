import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "../tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "XAUWatch — XAUUSD Day Trade Dashboard",
  description: "Mobile-first XAUUSD decision dashboard.",
  applicationName: "XAUWatch",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "XAUWatch" },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#090b09"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
