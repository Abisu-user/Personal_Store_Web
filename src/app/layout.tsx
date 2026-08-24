import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { AppearanceProvider } from "@/components/appearance/appearance-provider";

export const metadata: Metadata = {
  title: "Personal Digital Vault",
  description: "Secure personal information storage.",
  applicationName: "Personal Vault",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Personal Vault",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#6572df",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body><Script id="restore-appearance" strategy="beforeInteractive">{`try { const raw = localStorage.getItem("personal-vault:appearance:v2") || localStorage.getItem("personal-vault:appearance:v1"); const value = raw ? JSON.parse(raw) : null; if (value && ["blue","violet","emerald","rose","custom"].includes(value.accent) && ["mist","aurora","paper","midnight"].includes(value.background) && ["comfortable","compact"].includes(value.density)) { const theme = value.theme === "dark" || value.theme === "light" ? value.theme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; const root = document.documentElement; root.dataset.theme = theme; root.dataset.accent = value.accent; root.dataset.background = value.background; root.dataset.density = value.density; if (typeof value.customColor === "string" && /^#[0-9a-f]{6}$/i.test(value.customColor)) root.style.setProperty("--custom-brand", value.customColor); } } catch {}`}</Script><AppearanceProvider />{children}</body>
    </html>
  );
}
