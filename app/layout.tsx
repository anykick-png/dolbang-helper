import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "돌방 Helper",
  description: "현장 영업을 위한 근거리 법인 방문 보조 웹앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

