"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AttemptResult, Filters, ItemView, Session, Solution } from "@/lib/quiz/learn";
import { quizApi } from "@/lib/quiz/client";
import type { QuizResult } from "@/lib/quiz/srs";
import { SolutionView } from "./SolutionView";

type Mode = Session["mode"];
const RESULT_LABEL: Record<QuizResult, string> = { correct: "정답", partial: "일부만 맞힘", wrong: "오답" };
const SELF: { value: QuizResult; title: string; help: string; tone: string }[] = [
  { value: "correct", title: "완벽하게 맞힘", help: "핵심 채점 요소를 모두 알고 있었음", tone: "border-ok/50 hover:bg-ok-soft" },
  { value: "partial", title: "일부만 맞힘", help: "일부 개념이나 핵심 요소가 부족했음", tone: "border-warn/50 hover:bg-warn-soft" },
  { value: "wrong", title: "틀림 / 모르겠음", help: "제대로 답하지 못했음", tone: "border-danger/50 hover:bg-danger-soft" },
];

/** 원문에서 이번 문제의 기호(㉠, 묶인 문제는 ㉢·㉣ 모두)를 강조 */
function Passage({ text, label }: { text: string; label: string }) {
  const marks = [...new Set(label.match(/[㉠-㉻①-⑳ⓐ-ⓩ]|\([가-힣]\)/g) ?? [])];
  if (!marks.length) return <>{text}</>;
  const re = new RegExp(`(${marks.map((m) => m.replace(/[()]/g, "\\$&")).join("|")})`);
  return (
    <>
      {text.split(re).map((part, i) =>
        marks.includes(part) ? (
          <mark key={i} className="rounded bg-warn-soft px-0.5 font-bold text-warn">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function QuizPlayer({ mode, filters }: { mode: Mode; filters: Filters }) {
  const [session, setSession] = useState<Session | null>(null);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<ItemView | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [outcome, setOutcome] = useState<AttemptResult | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [tally, setTally] = useState({ correct: 0, partial: 0, wrong: 0, xp: 0 });
  const [finish, setFinish] = useState<AttemptResult | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // 세션 시작 (오늘의 미션은 이어 풀기)
  useEffect(() => {
    quizApi<Session>("/api/quiz/session", "POST", { mode, filters })
      .then((s) => {
        setSession(s);
        const first = s.itemIds.findIndex((id) => !s.results[id]);
        setIndex(first < 0 ? s.itemIds.length : first);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemId = session?.itemIds[index];
  // 문제 불러오기 (화면 초기화는 next() 에서)
  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    quizApi<ItemView>(`/api/quiz/items/${itemId}`)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setShowImage(!v.passage && Boolean(v.imageUrl));
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [itemId]);

  const total = session?.itemIds.length ?? 0;
  const done = useMemo(() => (session ? session.itemIds.filter((id) => session.results[id]).length : 0), [session]);

  async function fetchSolution(id: string) {
    const s = await quizApi<Solution>(`/api/quiz/items/${id}/solution`);
    setSolution(s);
    return s;
  }

  function applyOutcome(r: AttemptResult) {
    setOutcome(r);
    setTally((t) => ({ ...t, [r.result]: t[r.result] + 1, xp: t.xp + r.xp + r.missionXp }));
    setSession((s) => (s ? { ...s, results: { ...s.results, [itemId!]: r.result } } : s));
    if (r.missionCompleted) setFinish(r);
  }

  // 기입형: 서버 채점 + 해설
  async function submitFill() {
    if (!view || !itemId) return;
    setBusy(true);
    setError(null);
    try {
      const [r] = await Promise.all([quizApi<AttemptResult>("/api/quiz/attempt", "POST", { itemId, mode, answer }), fetchSolution(itemId)]);
      applyOutcome(r);
      setRevealed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // 서술형 / 자기평가: 먼저 정답·해설 공개
  async function reveal() {
    if (!itemId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchSolution(itemId);
      setRevealed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function selfRate(result: QuizResult) {
    if (!itemId) return;
    setBusy(true);
    setError(null);
    try {
      applyOutcome(await quizApi<AttemptResult>("/api/quiz/attempt", "POST", { itemId, mode, self: result, answer: answer || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setView(null);
    setSolution(null);
    setAnswer("");
    setRevealed(false);
    setOutcome(null);
    setReported(false);
    setError(null);
    setIndex((i) => i + 1);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------- 화면 ----------------
  if (error && !session) return <ErrorBox message={error} />;
  if (!session) return <p className="py-16 text-center text-muted">문제를 준비하는 중…</p>;
  if (session.itemIds.length === 0)
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <p className="text-muted">{mode === "review" ? "다시 볼 오답이 없습니다." : "조건에 맞는 공개 문제가 없습니다."}</p>
        <Link href="/quiz" className="btn mt-4 inline-block">퀴즈 홈</Link>
      </div>
    );
  if (index >= total) return <Finished mode={mode} session={session} tally={tally} finish={finish} />;

  const isFill = view?.format === "fill";
  const auto = view?.grading === "auto";
  const lastStep = index === total - 1;

  return (
    <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-16 pb-24">
      {/* 진행률 */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/quiz" className="text-xl leading-none text-faint hover:text-ink" aria-label="그만 풀기">×</Link>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-navy transition-[width] duration-300" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="text-sm tabular-nums text-muted">{index + 1}/{total}</span>
          {tally.xp > 0 && <span className="text-sm font-semibold text-warn">+{tally.xp} XP</span>}
        </div>
      </div>

      {!view ? (
        error ? <ErrorBox message={error} /> : <p className="py-16 text-center text-muted">불러오는 중…</p>
      ) : (
        <article className="space-y-4">
          <header className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`rounded px-2 py-0.5 font-semibold ${view.kind === "exam" ? "bg-navy text-white dark:text-[#0f141c]" : "bg-warn-soft text-warn"}`}>
              {view.kind === "exam" ? "실제 기출" : "AI 예상 문제"}
            </span>
            {view.kind === "exam" && view.ref && <span className="text-muted">{view.ref}{view.score ? ` · ${view.score}점` : ""}</span>}
            <span className="rounded border border-line px-1.5 py-0.5 text-muted">{isFill ? "기입형" : "서술형"}</span>
            {view.area && <span className="rounded border border-line px-1.5 py-0.5 text-muted">{view.area}</span>}
            {session.slots[index] === "review" && <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger">복습</span>}
          </header>

          {/* 원문 제시문 */}
          <section className="card p-4 sm:p-5">
            {view.passage && view.imageUrl && (
              <div className="mb-3 flex justify-end">
                <button type="button" className="text-xs text-navy underline" onClick={() => setShowImage((v) => !v)}>
                  {showImage ? "이 문제만 보기" : "원본 이미지 (전체 문항)"}
                </button>
              </div>
            )}
            {showImage && view.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.imageUrl} alt="원본 문제" className="w-full rounded border border-line bg-white" />
            ) : (
              <div className="whitespace-pre-wrap break-keep text-[17px] leading-[1.9] text-ink sm:text-[16px]">
                <Passage text={view.passage ?? ""} label={view.label} />
              </div>
            )}
          </section>

          {/* 이번 문제 (세부 발문) */}
          {/* 원문의 <작성 방법>에 이 문제의 조건만 남겨 두었으므로, 원문에서 조건을 찾지 못한 경우에만 따로 안내 */}
          {view.kind === "exam" && view.label && !(view.prompt && view.passage?.includes(view.prompt)) && (
            <section className="rounded-lg border-2 border-navy/40 bg-navy-soft/40 p-4">
              <div className="mb-1 text-xs font-bold text-navy">이번 문제{view.label ? ` · ${view.label}` : ""}</div>
              <p className="whitespace-pre-wrap text-[16px] font-medium leading-7">
                {view.prompt ?? `원문의 ${view.label} 요구 사항에 답하세요.`}
              </p>
            </section>
          )}

          {/* 답 */}
          {!revealed ? (
            isFill && auto ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (answer.trim()) submitFill();
                }}
              >
                <input
                  className="input py-3 text-[17px]"
                  placeholder="정답을 입력하세요"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoComplete="off"
                  enterKeyHint="done"
                  autoFocus
                />
                <button className="btn-primary w-full py-3 text-base font-semibold" disabled={busy || !answer.trim()}>
                  {busy ? "채점 중…" : "정답 확인"}
                </button>
              </form>
            ) : (
              <div className="space-y-2">
                <p className="text-center text-sm text-muted">{isFill ? "답을 떠올린 뒤 확인하세요." : "머릿속으로 답안을 구성한 뒤 확인하세요."}</p>
                <button className="btn-primary w-full py-3 text-base font-semibold" disabled={busy} onClick={reveal}>
                  {busy ? "불러오는 중…" : "정답 및 해설 확인"}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {/* 채점 결과 (자동 채점) */}
              {auto && outcome && (
                <section className={`rounded-lg p-4 ${outcome.result === "correct" ? "bg-ok-soft" : "bg-danger-soft"}`}>
                  <div className={`text-lg font-bold ${outcome.result === "correct" ? "text-ok" : "text-danger"}`}>
                    {outcome.result === "correct" ? "정답입니다" : "오답입니다"}
                    {outcome.xp > 0 && <span className="ml-2 text-sm font-semibold text-warn">+{outcome.xp} XP</span>}
                  </div>
                  <p className="mt-1 text-sm">
                    내 답: <b>{answer}</b>
                  </p>
                  {outcome.result === "wrong" && !reported && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-muted underline"
                      onClick={async () => {
                        await quizApi("/api/quiz/report", "POST", { itemId, answer }).catch(() => {});
                        setReported(true);
                      }}
                    >
                      내 답도 맞다고 생각해요 (검수 요청)
                    </button>
                  )}
                  {reported && <p className="mt-2 text-xs text-muted">검수 요청을 보냈습니다. 관리자가 확인하면 다음부터 정답으로 인정됩니다.</p>}
                </section>
              )}

              {solution && <SolutionView s={solution} kind={view.kind} />}

              {/* 자기평가 */}
              {!auto && !outcome && (
                <section className="sticky bottom-3 z-10 rounded-xl border border-line bg-surface p-3 shadow-lg">
                  <div className="mb-2 text-center text-sm font-semibold">내 답안을 평가해 주세요</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {SELF.map((o) => (
                      <button key={o.value} type="button" disabled={busy} onClick={() => selfRate(o.value)} className={`rounded-lg border-2 p-2.5 text-left transition-colors ${o.tone}`}>
                        <div className="font-bold">{o.title}</div>
                        <div className="text-[11px] text-muted">{o.help}</div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {!auto && outcome && (
                <p className="text-center text-sm text-muted">
                  자기평가: <b>{RESULT_LABEL[outcome.result]}</b>
                  {outcome.xp > 0 && <span className="ml-1 font-semibold text-warn">+{outcome.xp} XP</span>}
                </p>
              )}

              {outcome && (
                <div className="sticky bottom-3 z-10">
                  <button className="btn-primary w-full py-3 text-base font-semibold shadow-lg" onClick={next}>
                    {lastStep ? "결과 보기" : "다음 문제"}
                  </button>
                </div>
              )}
            </div>
          )}
          {error && <ErrorBox message={error} />}
        </article>
      )}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <p className="rounded bg-danger-soft p-3 text-sm text-danger">{message}</p>;
}

function Finished({ mode, session, tally, finish }: { mode: Mode; session: Session; tally: { correct: number; partial: number; wrong: number; xp: number }; finish: AttemptResult | null }) {
  const results = Object.values(session.results);
  const count = (r: QuizResult) => results.filter((x) => x === r).length;
  return (
    <div className="mx-auto max-w-md space-y-4 py-8 text-center">
      <div className="text-5xl font-bold text-navy">{mode === "daily" ? "미션 완료" : "학습 완료"}</div>
      {mode === "daily" && finish && (
        <p className="text-muted">
          연속 학습 <b className="text-warn">{finish.streak}일</b> · 미션 보너스 <b className="text-warn">+{finish.missionXp} XP</b>
        </p>
      )}
      {finish?.newBadges.map((b) => (
        <p key={b} className="rounded-lg bg-warn-soft p-3 font-semibold text-warn">
          새 배지: {b.replace("streak-", "")}일 연속 학습
        </p>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3"><div className="text-2xl font-bold text-ok">{count("correct")}</div><div className="text-xs text-muted">정답</div></div>
        <div className="card p-3"><div className="text-2xl font-bold text-warn">{count("partial")}</div><div className="text-xs text-muted">일부만</div></div>
        <div className="card p-3"><div className="text-2xl font-bold text-danger">{count("wrong")}</div><div className="text-xs text-muted">오답</div></div>
      </div>
      {tally.xp > 0 && <p className="text-lg font-semibold text-warn">이번에 +{tally.xp} XP</p>}
      {mode === "daily" && !finish && results.length === session.itemIds.length && <p className="text-sm text-muted">오늘 미션은 이미 완료했습니다.</p>}
      <div className="flex flex-col gap-2">
        <Link href="/quiz" className="btn-primary py-3">퀴즈 홈</Link>
        <Link href="/quiz/free" className="btn py-3">자유 학습 더 하기</Link>
        {count("wrong") + count("partial") > 0 && <Link href="/quiz/play?mode=review" className="btn py-3">틀린 문제 다시 풀기</Link>}
      </div>
    </div>
  );
}
