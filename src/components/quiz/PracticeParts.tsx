"use client";

import { Check, X } from "lucide-react";
import type { PracticeSolution } from "@/lib/quiz/learn";

export interface PublicPractice {
  type: string;
  mode: "choice" | "multi" | "classify" | "fill";
  stem?: string;
  options?: string[];
  groups?: string[];
  statements?: string[];
  hint?: string;
}

const LETTERS = ["①", "②", "③", "④", "⑤", "⑥"];

/** 연습문제 답 고르기: choice(하나) · multi(모두) · classify(진술마다 사상가 고르기) */
export function PracticeInput({
  p,
  picks,
  onPicks,
  assign,
  onAssign,
  disabled,
}: {
  p: PublicPractice;
  picks: number[];
  onPicks: (v: number[]) => void;
  assign: (number | null)[];
  onAssign: (v: (number | null)[]) => void;
  disabled?: boolean;
}) {
  if (p.mode === "choice" || p.mode === "multi") {
    const multi = p.mode === "multi";
    return (
      <div className="space-y-2" role={multi ? "group" : "radiogroup"} aria-label="보기">
        {multi && <p className="text-xs text-muted">해당하는 것을 모두 고르세요.</p>}
        {(p.options ?? []).map((o, i) => {
          const on = picks.includes(i);
          return (
            <button
              key={i}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              disabled={disabled}
              onClick={() => onPicks(multi ? (on ? picks.filter((x) => x !== i) : [...picks, i]) : [i])}
              className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-[16px] leading-7 transition-colors ${
                on ? "border-navy bg-navy-soft/60" : "border-line bg-surface hover:border-navy/40"
              }`}
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center ${multi ? "rounded-md" : "rounded-full"} border-2 text-xs font-bold ${on ? "border-navy bg-navy text-on-accent" : "border-line-strong text-faint"}`}>
                {on ? <Check className="h-3.5 w-3.5" aria-hidden /> : LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1">{o}</span>
            </button>
          );
        })}
      </div>
    );
  }
  if (p.mode === "classify") {
    const groups = p.groups ?? [];
    return (
      <ol className="space-y-2.5">
        {(p.statements ?? []).map((st, i) => (
          <li key={i} className="rounded-xl border border-line bg-surface p-3">
            <p className="text-[15px] leading-7">
              <span className="mr-1.5 font-bold text-navy">{i + 1}.</span>
              {st}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${i + 1}번 진술의 사상가`}>
              {groups.map((g, gi) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={assign[i] === gi}
                  disabled={disabled}
                  onClick={() => onAssign(assign.map((x, k) => (k === i ? gi : x)))}
                  className={`min-h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${assign[i] === gi ? "border-navy bg-navy text-on-accent" : "border-line-strong text-muted hover:border-navy/50"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    );
  }
  return null;
}

/** 연습문제 결과: 보기·진술마다 정답 여부와 이유, 근거 */
export function PracticeReview({ s, picks, assign }: { s: PracticeSolution; picks: number[]; assign: (number | null)[] }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-bold text-navy">보기 해설</div>
      {s.options.length > 0 && (
        <ul className="space-y-2">
          {s.options.map((o, i) => {
            const picked = picks.includes(i);
            return (
              <li key={i} className={`rounded-lg border px-3 py-2 ${o.correct ? "border-ok/50 bg-ok-soft/50" : picked ? "border-danger/40 bg-danger-soft/40" : "border-line"}`}>
                <div className="flex items-start gap-2 text-[15px] leading-7">
                  <span className={`mt-1 shrink-0 ${o.correct ? "text-ok" : picked ? "text-danger" : "text-faint"}`}>
                    {o.correct ? <Check className="h-4 w-4" aria-label="정답" /> : picked ? <X className="h-4 w-4" aria-label="고른 오답" /> : <span className="inline-block w-4 text-center text-xs">{LETTERS[i]}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    {o.text}
                    {picked && <span className="ml-1.5 rounded bg-surface-2 px-1.5 text-[11px] font-semibold text-muted">내 선택</span>}
                  </span>
                </div>
                {o.note && <p className="ml-6 text-[13px] leading-6 text-muted">{o.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {s.statements.length > 0 && (
        <ol className="space-y-2">
          {s.statements.map((st, i) => {
            const mine = assign[i];
            const ok = mine === st.groupIndex;
            return (
              <li key={i} className={`rounded-lg border px-3 py-2 ${ok ? "border-ok/50 bg-ok-soft/40" : "border-danger/40 bg-danger-soft/30"}`}>
                <p className="text-[15px] leading-7">
                  <span className="mr-1 font-bold">{i + 1}.</span>
                  {st.text}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  정답 <b className="text-ok">{st.group}</b>
                  {!ok && <> · 내 선택 {mine === null || mine === undefined ? "없음" : s.groups[mine]}</>}
                  {st.note && <> — {st.note}</>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      {s.explanation && <p className="whitespace-pre-wrap text-[15px] leading-7">{s.explanation}</p>}
      <p className="text-[11px] text-faint">출처: {s.grounds} (이 기출의 저장된 분석)</p>
    </section>
  );
}

