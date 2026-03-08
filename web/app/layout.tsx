import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sui Content Platform",
  description: "Sui特化テクニカルコンテンツプラットフォーム",
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
