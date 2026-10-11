import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "城市漫步 · 看见更多",
  description: "基于真实街道和建筑遮挡的全球城市步行路线规划。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
