import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘한걸음",
  description: "AI가 붙잡지 않고, 사람에게 돌려보내는 매일의 회복 루틴 (시연용)",
};

// 한글 폰트는 next/font 빌드 시 다운로드가 실패해 Google Fonts 스타일시트로 불러온다.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
