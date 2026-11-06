"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="btn-ghost !px-2.5"
      title="라이트 / 다크 모드"
      aria-label="라이트 / 다크 모드 전환"
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        // 모바일 상태 표시줄 색도 함께
        document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", dark ? "#101827" : "#f6f7fb"));
        try {
          localStorage.setItem("ees:theme", dark ? "dark" : "light");
        } catch {}
      }}
    >
      <Moon className="h-[18px] w-[18px] dark:hidden" aria-hidden />
      <Sun className="hidden h-[18px] w-[18px] dark:block" aria-hidden />
    </button>
  );
}
