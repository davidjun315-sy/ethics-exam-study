import type { Metadata, Viewport } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { BottomNav, SiteHeader } from "@/components/SiteHeader";
import { getCurrentMemberName } from "@/lib/members";
import "./globals.css";

// 관리자가 수시로 데이터를 수정하므로 모든 페이지를 요청 시점에 렌더링한다.
export const dynamic = "force-dynamic";

// 아이폰 홈 화면 아이콘: public/apple-touch-icon.png (180×180) 이 있을 때만 연결
const appleIcon = existsSync(path.join(process.cwd(), "public", "apple-touch-icon.png"));

export const metadata: Metadata = {
  title: { default: "ETHOS 에토스", template: "%s · ETHOS" },
  description: "도덕·윤리 임용 학습 플랫폼 — 기출을 사상가·개념·원전 단위로 분석하고, 대표 사상가 카드와 함께 매일 공부합니다.",
  applicationName: "ETHOS",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "ETHOS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  ...(appleIcon ? { icons: { apple: "/apple-touch-icon.png" } } : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#101827" },
  ],
};

// 다크모드 깜빡임 방지: hydration 전에 class 를 적용
// 저장된 테마가 시스템 설정과 다르면 상태 표시줄 색(theme-color)도 맞춘다
const themeScript = `(function(){try{var t=localStorage.getItem('ees:theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');if(t)document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',d?'#101827':'#f6f7fb')})});}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 로그인한 회원 이름 (회원 테이블이 없거나 DB 설정 전이면 로그인 안 한 것으로)
  const memberName = await getCurrentMemberName().catch(() => null);
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Pretendard (가변 · 한글 동적 서브셋) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="min-h-dvh pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <SiteHeader member={memberName} />
        <div className="pb-tabbar">
          <main className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
          <footer className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-4 pt-2 text-xs text-faint sm:px-6">
            <span className="font-semibold tracking-[0.14em] text-muted">ETHOS</span>
            <span>개인 학습용 · AI 분석 결과는 틀릴 수 있으니 원전과 공식 자료로 확인하세요.</span>
            <a href="/admin" className="hover:text-navy">관리자</a>
          </footer>
        </div>
        <BottomNav member={memberName} />
      </body>
    </html>
  );
}
