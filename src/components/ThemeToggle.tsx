"use client";

export function ThemeToggle() {
  return (
    <button
      className="rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"
      title="라이트 / 다크 모드"
      aria-label="라이트 / 다크 모드 전환"
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        try {
          localStorage.setItem("ees:theme", dark ? "dark" : "light");
        } catch {}
      }}
    >
      <span className="dark:hidden">☾</span>
      <span className="hidden dark:inline">☀</span>
    </button>
  );
}
