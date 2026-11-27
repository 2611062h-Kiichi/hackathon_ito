import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

export const metadata: Metadata = {
  title: "ITOGUCHI | イトグチ",
  description: "わかるが、次の一歩の力になる。「わからない」の原因を分析して、理解へ導く支援アプリ。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
