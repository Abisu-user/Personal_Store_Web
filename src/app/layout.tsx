import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./mobile-design-system.css";
import { AppearanceProvider } from "@/components/appearance/appearance-provider";
import { PwaClient } from "@/components/pwa/pwa-client";

export const metadata: Metadata = {
  title: "Personal Digital Vault",
  description: "Secure personal information storage.",
  applicationName: "Personal Vault",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
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
      <body><Script id="restore-appearance" strategy="beforeInteractive">{`try { const root = document.documentElement; root.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; root.dataset.accent = "blue"; root.dataset.background = "default"; root.dataset.density = "comfortable"; root.style.setProperty("--workspace-image", "none"); } catch {}`}</Script><PwaClient /><AppearanceProvider />{children}</body>
    </html>
  );
}
