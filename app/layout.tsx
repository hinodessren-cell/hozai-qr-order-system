import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "補材 QR 発注管理",
    description: "QR看板から発注・入荷・完了までを一元管理する補材発注システム",
    openGraph: { title: "補材 QR 発注管理", description: "気づいた、その場で発注。", images: [`${origin}/og.png`] },
    twitter: { card: "summary_large_image", title: "補材 QR 発注管理", description: "気づいた、その場で発注。", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
