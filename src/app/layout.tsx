import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./mobile-design-system.css";
import { AppearanceProvider } from "@/components/appearance/appearance-provider";
import { PwaClient } from "@/components/pwa/pwa-client";
import { AppStartupProvider } from "@/components/startup/app-startup-provider";

export const metadata: Metadata = {
  title: "Personal Digital Vault",
  description: "Secure personal information storage.",
  applicationName: "Personal Store",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Personal Store",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#172137" },
  ],
};

const restoreAppearance = `try {
  const root = document.documentElement;
  const mobile = matchMedia("(max-width: 700px)").matches;
  const device = mobile ? "mobile" : "desktop";
  const key = "personal-vault:appearance:bootstrap:v1:" + device;
  let stored = localStorage.getItem(key);
  if (!stored) {
    const legacyPrefix = "personal-vault:appearance:account:v1:";
    const suffix = ":" + device;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const candidate = localStorage.key(index);
      if (candidate && candidate.startsWith(legacyPrefix) && candidate.endsWith(suffix)) {
        stored = localStorage.getItem(candidate);
        if (stored) break;
      }
    }
  }
  const saved = JSON.parse(stored || "{}");
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved.theme === "dark" || saved.theme === "light" ? saved.theme : (systemDark ? "dark" : "light");
  const canvas = theme === "dark" ? "#172137" : (typeof saved.canvasColor === "string" ? saved.canvasColor : "#f5f7fb");
  root.dataset.theme = theme;
  root.dataset.accent = saved.accent || "blue";
  root.dataset.background = saved.background || "default";
  root.dataset.density = saved.density || "comfortable";
  root.dataset.startupActive = "true";
  root.dataset.startupState = "initializing";
  root.dataset.appearanceReady = "false";
  if (sessionStorage.getItem("personal-store:post-login-handoff:v1") === "1") root.dataset.startupHandoff = "true";
  root.style.setProperty("--startup-canvas", canvas);
  root.style.setProperty("--workspace-canvas-color", saved.canvasColor || "#f4f6fb");
  root.style.setProperty("--custom-brand", saved.customColor || "#2b65bd");
  const mobileNavigation = saved.mobileNavigation && typeof saved.mobileNavigation === "object" ? saved.mobileNavigation : {};
  const mobileNavColor = typeof mobileNavigation.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(mobileNavigation.backgroundColor) ? mobileNavigation.backgroundColor : "#101117";
  const mobileNavOpacity = typeof mobileNavigation.opacity === "number" ? Math.max(40, Math.min(100, mobileNavigation.opacity)) : 92;
  root.style.setProperty("--mobile-nav-user-color", mobileNavColor);
  root.style.setProperty("--mobile-nav-user-opacity", mobileNavOpacity + "%");
  root.style.setProperty("--workspace-image", "none");
  window.__PERSONAL_STORE_STARTUP_AT__ = performance.now();
} catch {
  document.documentElement.dataset.startupActive = "true";
  document.documentElement.dataset.startupState = "initializing";
}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body><Script id="restore-appearance" strategy="beforeInteractive">{restoreAppearance}</Script><PwaClient /><AppearanceProvider /><AppStartupProvider>{children}</AppStartupProvider></body>
    </html>
  );
}
