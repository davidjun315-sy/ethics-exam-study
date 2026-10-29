import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentMember } from "@/lib/members";
import "./globals.css";

// 관리자가 수시로 데이터를 수정하므로 모든 페이지를 요청 시점에 렌더링한다.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "윤리 기출", template: "%s · 윤리 기출" },
  description: "기출을 사상가, 개념, 원전 단위로 연결해서 공부하는 개인 학습 사이트",
  robots: { index: false, follow: false },
};

// 다크모드 깜빡임 방지: hydration 전에 class 를 적용
const themeScript = `(function(){try{var t=localStorage.getItem('ees:theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 로그인한 회원 이름 (회원 테이블이 없거나 DB 설정 전이면 로그인 안 한 것으로)
  const member = await getCurrentMember().catch(() => null);
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <SiteHeader member={member?.display_name ?? null} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
        <footer className="mx-auto max-w-[1400px] px-6 pb-10 pt-4 text-xs text-faint">
          개인 학습용 사이트 · AI 분석 결과는 틀릴 수 있으니 원전과 공식 자료로 확인하세요. ·{" "}
          <a href="/admin" className="hover:text-navy">관리자</a>
        </footer>
      </body>
    </html>
  );
}
