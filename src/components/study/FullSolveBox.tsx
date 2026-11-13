"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Map as MapIcon } from "lucide-react";

export interface FullSolveState {
  ready: boolean;
  correct: boolean;
  bestScore: number | null;
  attempts: number;
  newly?: boolean;
  pass: number;
}

/** AI 채점이 끝나면 AnswerWriter 가 이 이벤트로 결과를 알린다 */
export const FULL_SOLVE_EVENT = "ethos:full-solve";

/**
 * 기출문제 탭 ↔ 윤리 퀴즈 사상가 정복 지도 연동 상태.
 * AI 채점 80점 이상이면 자동으로 정복, 모범답안을 본 뒤에는 스스로 채점도 가능.
 */
export function FullSolveBox({ questionId, signedIn, revealed, philosophers }: { questionId: string; signedIn: boolean; revealed: boolean; philosophers: { id: string; name: string }[] }) {
  const [s, setS] = useState<FullSolveState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetch(`/api/quiz/full?question=${questionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ready: boolean; solve: { correct: boolean; bestScore: number | null; attempts: number } | null; pass: number } | null) => {
        if (alive && j) setS({ ready: j.ready, correct: Boolean(j.solve?.correct), bestScore: j.solve?.bestScore ?? null, attempts: j.solve?.attempts ?? 0, pass: j.pass });
      })
      .catch(() => {});
    const on = (e: Event) => setS((e as CustomEvent<FullSolveState>).detail);
    window.addEventListener(FULL_SOLVE_EVENT, on);
    return () => {
      alive = false;
      window.removeEventListener(FULL_SOLVE_EVENT, on);
    };
  }, [questionId, signedIn]);

  async function selfCheck(verdict: "correct" | "wrong") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/quiz/full", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, verdict }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "기록하지 못했습니다.");
      setS((p) => ({ ready: true, correct: j.correct, bestScore: j.bestScore, attempts: j.attempts, newly: j.newly, pass: p?.pass ?? 80 }));
      setMsg(verdict === "correct" ? null : "기록했습니다. 다시 풀어서 맞히면 정복으로 바뀝니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const names = philosophers.map((p) => p.name).join(" · ");
  const pass = s?.pass ?? 80;

  return (
    <section className={`rounded-lg border p-3.5 text-sm ${s?.correct ? "border-[#d9a520]/40 bg-[#ffd36b]/[0.07]" : "border-line bg-surface"}`} data-full-solve={s?.correct ? "done" : s?.attempts ? "tried" : "none"}>
      <div className="flex flex-wrap items-center gap-2">
        <MapIcon className="h-4 w-4 text-navy" aria-hidden />
        <h3 className="font-bold">사상가 정복 지도</h3>
        {s?.correct ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#d9a520]/40 bg-[#ffd36b]/15 px-2 py-0.5 text-[11px] font-bold text-[#8a5a00] dark:text-[#ffd36b]">
            <Check className="h-3 w-3" aria-hidden /> 완전 기출 정복
          </span>
        ) : s?.attempts ? (
          <span className="text-xs text-muted">도전 중{s.bestScore !== null && ` · 최고 ${Math.round(s.bestScore)}점`}</span>
        ) : null}
      </div>
      {!signedIn ? (
        <p className="mt-1 text-xs text-muted">로그인하면 이 문항을 맞힌 기록이 윤리 퀴즈 사상가 정복 지도에 함께 쌓입니다.</p>
      ) : s && !s.ready ? (
        <p className="mt-1 text-xs text-muted">정복 지도 기록은 관리자가 업데이트(SQL 022)를 적용하면 쓸 수 있습니다.</p>
      ) : s?.correct ? (
        <p className="mt-1 text-xs text-muted">
          {s.newly ? "방금 정복했습니다! " : ""}
          {names ? <b className="text-ink">{names}</b> : "이 문항의 사상가"}의 정복 지도에 반영됐습니다. 윤리 퀴즈의 같은 완전 기출도 맞힌 것으로 셉니다.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          AI 채점 <b className="text-ink">{pass}점 이상</b>이면 정복으로 기록됩니다{revealed ? ", 모범답안과 비교해 스스로 채점할 수도 있어요" : ""}.
          {names && (
            <>
              {" "}
              함께 세는 사상가: <b className="text-ink">{names}</b>
            </>
          )}
        </p>
      )}
      {signedIn && s?.ready !== false && !s?.correct && revealed && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">모범답안과 비교해 보니</span>
          <button type="button" className="btn !min-h-8 !py-1 text-xs font-bold" disabled={busy} onClick={() => selfCheck("correct")}>
            다 맞혔어요
          </button>
          <button type="button" className="btn !min-h-8 !py-1 text-xs" disabled={busy} onClick={() => selfCheck("wrong")}>
            아직이에요
          </button>
        </div>
      )}
      {msg && <p className="mt-1.5 text-xs text-muted">{msg}</p>}
      {signedIn && philosophers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {philosophers.map((p) => (
            <Link key={p.id} href={`/quiz/map/${p.id}`} className="text-xs font-semibold text-navy hover:underline">
              {p.name} 기출문제 목록 →
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
