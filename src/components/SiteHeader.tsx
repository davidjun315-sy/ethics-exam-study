"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "홈" },
  { href: "/exams", label: "기출문제" },
  { href: "/quiz", label: "윤리 퀴즈" },
  { href: "/philosophers", label: "사상가" },
  { href: "/concepts", label: "개념" },
  { href: "/sources", label: "원전" },
  { href: "/trends", label: "출제분석" },
  { href: "/search", label: "통합검색" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0 text-[15px] font-bold tracking-tight text-navy">
          윤리 기출
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-md px-3 py-1.5 text-sm ${
                isActive(n.href) ? "bg-navy-soft font-semibold text-navy" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <form
          className="ml-auto hidden md:block"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="사상가·개념·원전·문제 검색"
            className="input w-64"
            aria-label="통합 검색"
          />
        </form>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link href="/my" className={`rounded-md px-2.5 py-1.5 text-sm ${isActive("/my") ? "text-navy" : "text-muted hover:text-ink"}`}>
            내 학습
          </Link>
          <ThemeToggle />
          <button className="btn lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="메뉴">
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 py-2 lg:hidden">
          <div className="grid grid-cols-4 gap-1 sm:grid-cols-7">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-2 py-2 text-center text-sm ${isActive(n.href) ? "bg-navy-soft font-semibold text-navy" : "text-muted"}`}
              >
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
