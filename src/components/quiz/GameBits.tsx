"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { checkpoints, comboTier, type Checkpoint } from "@/lib/quiz/game";

/** 오늘의 미션 진행: 막대 위에 체크포인트(1 · 3 · 5 · 10) 표시 */
export function CheckpointTrack({ done, total, labels = true, size = "md" }: { done: number; total: number; labels?: boolean; size?: "sm" | "md" }) {
  const cps = checkpoints(total);
  const pct = total ? Math.min(1, done / total) : 0;
  const complete = total > 0 && done >= total;
  const h = size === "sm" ? "h-2" : "h-3";
  const dot = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <div className={labels ? "pb-6" : ""}>
      <div className={`relative ${h} rounded-full bg-surface-2`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`오늘의 미션 ${done}/${total}`}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${complete ? "bg-ok" : "bg-navy"}`} style={{ width: `${pct * 100}%` }} />
        {cps.map((c) => {
          const got = done >= c.at;
          return (
            <span
              key={c.at}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(c.at / total) * 100}%`, ...(c.at === total ? { left: "calc(100% - 2px)" } : {}) }}
              title={`${c.at}문제 · ${c.title}`}
            >
              <span
                className={`flex ${dot} items-center justify-center rounded-full border-2 text-[9px] font-bold ${
                  got ? `${complete ? "border-ok bg-ok" : "border-navy bg-navy"} text-on-accent` : "border-line-strong bg-surface text-faint"
                }`}
              >
                {got ? "✓" : ""}
              </span>
              {labels && (
                <span className={`absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums ${got ? "font-semibold text-navy" : "text-faint"}`}>
                  {c.at}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** 현재 콤보 (2연속부터) */
export function ComboChip({ count, animate = false }: { count: number; animate?: boolean }) {
  const t = comboTier(count);
  if (!t) return null;
  const tone =
    t.level >= 3
      ? "border-warn/60 bg-warn-soft text-warn"
      : t.level === 2
        ? "border-navy/50 bg-navy-soft text-navy"
        : "border-line-strong bg-surface-2 text-ink";
  return (
    <span
      key={animate ? count : undefined}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tracking-wide ${tone} ${animate ? "quiz-pop" : ""} ${t.level === 4 && animate ? "quiz-shimmer" : ""}`}
      title={`최종 판정 기준 ${count}연속 정답`}
    >
      {t.label}
      {t.level > 1 && <span className="tabular-nums opacity-80">×{count}</span>}
    </span>
  );
}

/** 체크포인트 달성 리본 */
export function CheckpointRibbon({ cp }: { cp: Checkpoint }) {
  return (
    <div className="quiz-rise flex items-center gap-2 rounded-lg border border-navy/30 bg-navy-soft px-3 py-2 text-sm">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[10px] font-bold text-on-accent">✓</span>
      <span className="font-semibold text-navy">{cp.at === 3 ? "첫 번째 체크포인트 돌파!" : `${cp.title}!`}</span>
      <span className="ml-auto text-xs text-muted">{cp.at}문제 달성</span>
    </div>
  );
}

/**
 * 레벨업 · 새 배지 축하 화면 (짧게 보여 주고 버튼 하나로 닫는다).
 * 원문을 읽는 흐름을 끊지 않도록 문제를 끝낸 뒤에만 띄운다.
 */
export function Celebration({ title, lines, onClose }: { title: string; lines: ReactNode[]; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="celebrate-title" onClick={onClose}>
      <div className="quiz-pop w-full max-w-sm rounded-2xl border border-warn/40 bg-surface p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-warn-soft text-2xl font-bold text-warn quiz-ring">★</div>
        <h2 id="celebrate-title" className="text-2xl font-bold text-ink">{title}</h2>
        <div className="mt-2 space-y-1 text-sm text-muted">
          {lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
        <button ref={btn} type="button" className="btn-primary mt-5 w-full py-2.5 text-base font-semibold" onClick={onClose}>
          계속하기
        </button>
      </div>
    </div>
  );
}

/** 막대 (기존 화면과 같은 모양) */
export function Bar({ value, tone = "navy" }: { value: number; tone?: "navy" | "ok" | "warn" }) {
  const color = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-navy";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}
