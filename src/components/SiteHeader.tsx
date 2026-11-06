"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpenText,
  ChartLine,
  Ellipsis,
  GitCompare,
  House,
  Library,
  Lightbulb,
  LogIn,
  NotebookPen,
  ScrollText,
  Search,
  Shield,
  Sparkles,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./brand/Logo";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** 데스크톱 상단 메뉴 */
const NAV: NavItem[] = [
  { href: "/", label: "홈", icon: House },
  { href: "/exams", label: "기출문제", icon: BookOpenText },
  { href: "/philosophers", label: "사상가", icon: Users },
  { href: "/quiz", label: "윤리 퀴즈", icon: Sparkles },
  { href: "/trends", label: "출제분석", icon: ChartLine },
  { href: "/concepts", label: "개념", icon: Lightbulb },
  { href: "/sources", label: "원전", icon: ScrollText },
];

/** 모바일 하단 탭 (4개 + 더보기) */
const TABS: NavItem[] = [
  { href: "/", label: "홈", icon: House },
  { href: "/exams", label: "기출", icon: BookOpenText },
  { href: "/philosophers", label: "사상가", icon: Users },
  { href: "/quiz", label: "퀴즈", icon: Sparkles },
];

/** 더보기 시트 */
const MORE: (NavItem & { desc: string })[] = [
  { href: "/trends", label: "출제분석", icon: ChartLine, desc: "연도별 출제 경향 · 예측" },
  { href: "/concepts", label: "개념", icon: Lightbulb, desc: "핵심 개념별 기출" },
  { href: "/sources", label: "원전", icon: ScrollText, desc: "원전 인용과 해설" },
  { href: "/philosophers/compare", label: "사상가 비교", icon: GitCompare, desc: "두 사상가 나란히 보기" },
  { href: "/search", label: "통합검색", icon: Search, desc: "사상가·개념·원전·문제" },
  { href: "/my", label: "내 학습 기록", icon: NotebookPen, desc: "메모 · 표시한 문제" },
];

const activeFor = (pathname: string) => (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

export function SiteHeader({ member }: { member: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const isActive = activeFor(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-surface/85 pt-[var(--safe-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40" aria-label="ETHOS 홈">
          <Logo />
        </Link>
        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="주 메뉴">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                isActive(n.href) ? "bg-navy-soft font-semibold text-navy" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <form
          className="ml-auto hidden xl:block"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="사상가·개념·원전·문제 검색" className="input w-64 !py-1.5 pl-8" aria-label="통합 검색" />
          </label>
        </form>
        <div className="ml-auto flex items-center gap-0.5 xl:ml-0">
          <Link href="/search" className="btn-ghost !px-2.5 xl:hidden" aria-label="통합 검색">
            <Search className="h-[18px] w-[18px]" aria-hidden />
          </Link>
          <Link href="/my" className={`btn-ghost hidden lg:inline-flex ${isActive("/my") ? "text-navy" : ""}`}>
            내 학습
          </Link>
          {member ? (
            <Link href="/account" className={`btn-ghost max-w-[8rem] !px-2.5 ${isActive("/account") ? "text-navy" : ""}`} title="내 계정" aria-label={`내 계정 (${member})`}>
              <User className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="hidden truncate sm:inline">{member}</span>
            </Link>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn-ghost !px-2.5">
              <LogIn className="h-[18px] w-[18px]" aria-hidden />
              <span className="hidden sm:inline">로그인</span>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** 모바일 하단 탭 + 더보기 시트. 문제 풀이 화면에서는 숨김 (집중 모드, 화면 아래 답안 버튼과 겹치지 않게) */
export function BottomNav({ member }: { member: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = activeFor(pathname);
  const moreActive = MORE.some((m) => isActive(m.href)) || isActive("/account") || isActive("/admin");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/quiz/play")) return null;

  return (
    <>
      <nav
        aria-label="하단 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface/90 pb-[var(--safe-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-md grid-cols-5">
          {TABS.map((t) => {
            const on = isActive(t.href) && !(t.href === "/philosophers" && pathname.startsWith("/philosophers/compare"));
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${on ? "font-semibold text-navy" : "text-faint active:text-ink"}`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? "bg-navy-soft" : ""}`}>
                    <Icon className="h-[20px] w-[20px]" strokeWidth={on ? 2.3 : 1.9} aria-hidden />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] ${moreActive ? "font-semibold text-navy" : "text-faint"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${moreActive ? "bg-navy-soft" : ""}`}>
                <Ellipsis className="h-[20px] w-[20px]" aria-hidden />
              </span>
              더보기
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="더보기 메뉴">
          <button type="button" className="sheet-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label="닫기" onClick={() => setOpen(false)} />
          <div className="sheet-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-4 pb-[calc(1rem+var(--safe-bottom))] pt-2 shadow-pop">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">더보기</span>
              <button type="button" className="btn-ghost !px-2" onClick={() => setOpen(false)} aria-label="닫기">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {MORE.map((m) => {
                const Icon = m.icon;
                return (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      onClick={() => setOpen(false)}
                      className={`flex h-full items-start gap-2.5 rounded-xl border p-3 transition-colors ${isActive(m.href) ? "border-navy/40 bg-navy-soft" : "border-line bg-surface-2/50 active:bg-surface-2"}`}
                    >
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-navy" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{m.label}</span>
                        <span className="block text-[12px] leading-snug text-muted">{m.desc}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <Link href={member ? "/account" : `/login?next=${encodeURIComponent(pathname)}`} onClick={() => setOpen(false)} className="btn flex-1">
                {member ? <User className="h-4 w-4" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
                {member ? `${member} · 내 계정` : "로그인"}
              </Link>
              <Link href="/admin" onClick={() => setOpen(false)} className="btn-ghost text-xs" aria-label="관리자">
                <Shield className="h-4 w-4" aria-hidden />
                관리자
              </Link>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
              <Library className="h-3.5 w-3.5" aria-hidden /> ETHOS 에토스 · 도덕·윤리 학습 플랫폼
            </p>
          </div>
        </div>
      )}
    </>
  );
}
