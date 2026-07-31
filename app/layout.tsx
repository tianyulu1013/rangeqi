import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "阵衡｜静态布阵棋",
  description: "轮流布阵，在攻击与支援的连锁清算中守住更多棋子。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
