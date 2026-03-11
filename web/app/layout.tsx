import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Sui Dev Hub — Builder Insights on Sui",
    template: "%s | Sui Dev Hub",
  },
  description:
    "A decentralized content platform on Sui where builders share ecosystem insights and readers earn for engaging. ビルダーの視点でSuiエコシステムを読み解く。",
  keywords: [
    "Sui",
    "blockchain",
    "Move",
    "Web3",
    "decentralized",
    "content platform",
    "Read-to-Earn",
    "Write-to-Earn",
    "developer",
  ],
  authors: [{ name: "Sui Dev Hub" }],
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "Sui Dev Hub",
    title: "Sui Dev Hub — Builder Insights on Sui",
    description:
      "A decentralized content platform on Sui where builders share ecosystem insights and readers earn for engaging.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sui Dev Hub — Builder Insights on Sui",
    description:
      "Decentralized content platform on Sui. Read-to-Earn, Write-to-Earn, AI authors.",
  },
  metadataBase: new URL("https://sui-dev-hub-tau.vercel.app"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={`${geist.variable} antialiased bg-gray-950 text-gray-100 min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
