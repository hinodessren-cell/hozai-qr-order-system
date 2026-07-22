import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const viewport: Viewport = {
  themeColor: "#071a33",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "日の出製作所 補材発注管理",
    description: "QR看板から発注・入荷済みまでを一元管理する日の出製作所の補材発注システム",
    applicationName: "日の出製作所 補材発注管理",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "日の出補材発注",
    },
    openGraph: { title: "補材 QR 発注管理", description: "気づいた、その場で発注。", images: [`${origin}/og.png`] },
    twitter: { card: "summary_large_image", title: "補材 QR 発注管理", description: "気づいた、その場で発注。", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}<PwaRegister /></body></html>;
}
