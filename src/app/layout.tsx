import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Digital Vault",
  description: "Secure personal information storage.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
