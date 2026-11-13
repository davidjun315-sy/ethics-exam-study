"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AttemptResult, Filters, ItemView, Session, Solution } from "@/lib/quiz/learn";
import { quizApi } from "@/lib/quiz/client";
import type { QuizResult } from "@/lib/quiz/srs";
import type { EssayGrading } from "@/lib/quiz/essay";
import { ChatGrader, EssayFeedback } from "./EssayFeedback";
import { CHALLENGES, checkpointReached, missionStatus, type ChallengeType, type Checkpoint } from "@/lib/quiz/game";
import { Celebration, CheckpointRibbon, CheckpointTrack, ComboChip } from "./GameBits";
import { SolutionView } from "./SolutionView";
import { PracticeInput, PracticeReview, type PublicPractice } from "./PracticeParts";

type Mode = Session["mode"];
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

/** back: 다 풀거나 나갈 때 돌아갈 곳 (예: 정복 지도의 사상가 기출문제 목록) */
export function QuizPlayer({ mode, filters, challenge, back }: { mode: Mode; filters: Filters; challenge?: ChallengeType; back?: { href: string; label: string } }) {
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
  const [grading, setGrading] = useState<EssayGrading | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [tally, setTally] = useState({ correct: 0, partial: 0, wrong: 0, xp: 0 });
  const [finish, setFinish] = useState<AttemptResult | null>(null);
  // 이번 세션의 풀이 결과 (완료 화면의 성과 요약용)
  const [log, setLog] = useState<AttemptResult[]>([]);
  const [combo, setCombo] = useState(0);
  const [cpNow, setCpNow] = useState<Checkpoint | null>(null);
  const [celebrate, setCelebrate] = useState<{ title: string; lines: string[] } | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  // 연습문제: 고른 보기 / 진술별 사상가
  const [picks, setPicks] = useState<number[]>([]);
  const [assign, setAssign] = useState<(number | null)[]>([]);
  const topRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // 세션 시작 (오늘의 미션은 이어 풀기)
  useEffect(() => {
    quizApi<Session>("/api/quiz/session", "POST", { mode, filters, challenge })
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
    setLog((l) => [...l, r]);
    setCombo(r.combo);
    // 오늘의 미션: 체크포인트 달성 (10문제 완료 보상은 기존 규칙 그대로)
    if (mode === "daily" && session) {
      const before = session.itemIds.filter((id) => session.results[id]).length;
      setCpNow(checkpointReached(before, before + 1, session.itemIds.length));
    }
    setSession((s) => (s ? { ...s, results: { ...s.results, [itemId!]: r.result } } : s));
    if (r.missionCompleted) setFinish(r);
    // 레벨업 · 새 배지: 문제를 끝낸 뒤에만 축하 화면
    const lines: string[] = [];
    if (r.levelUp) lines.push(`레벨 ${r.levelUp}에 올랐습니다. 누적 ${r.profile.xp} XP`);
    for (const b of r.newBadges) lines.push(`새 배지: ${b.replace("streak-", "")}일 연속 학습`);
    if (lines.length) setCelebrate({ title: r.levelUp ? `Lv.${r.levelUp} 달성!` : "새 배지 획득!", lines });
  }

  // 한 문제를 끝내면 '다음 문제' 버튼에 초점 (Enter 로 바로 넘어가기). 축하·나가기 창이 열려 있으면 그 창이 먼저
  useEffect(() => {
    if (outcome && !celebrate && !exitOpen) nextRef.current?.focus({ preventScroll: true });
  }, [outcome, celebrate, exitOpen]);

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

  // 연습문제(고르기·분류): 서버 채점 + 보기 해설
  async function submitPractice() {
    if (!view || !itemId || !view.practice) return;
    const p = view.practice as unknown as PublicPractice;
    const payload = p.mode === "classify" ? JSON.stringify(assign.map((x) => x ?? -1)) : p.mode === "choice" ? String(picks[0]) : JSON.stringify(picks);
    setBusy(true);
    setError(null);
    try {
      const [r] = await Promise.all([quizApi<AttemptResult>("/api/quiz/attempt", "POST", { itemId, mode, answer: payload }), fetchSolution(itemId)]);
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

  // 서술형: 쓴 답안을 AI 가 첨삭한 뒤 정답·해설과 함께 보여 준다 (판정은 제안, 최종은 자기평가)
  async function showGraded(g: EssayGrading) {
    if (!itemId) return;
    await fetchSolution(itemId);
    setGrading(g);
    setChatOpen(false);
    setRevealed(true);
  }

  async function gradeWithAi() {
    if (!itemId) return;
    setBusy(true);
    setError(null);
    try {
      const { grading: g } = await quizApi<{ grading: EssayGrading }>(`/api/quiz/items/${itemId}/grade`, "POST", { action: "ai", answer });
      await showGraded(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setChatOpen(true); // 무료 한도 초과 등 → 채팅 AI 로 이어서
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

  /**
   * 문제를 불러오지 못함 (풀던 중 관리자가 비공개·동기화로 바꾼 경우 등).
   * 오늘의 미션은 서버가 그 문제를 다른 공개 문제로 바꿔 주므로 세션을 다시 받고, 나머지는 건너뛴다.
   */
  async function skipBroken() {
    if (mode !== "daily") return next();
    setBusy(true);
    try {
      const s = await quizApi<Session>("/api/quiz/session", "POST", { mode, filters });
      setView(null);
      setError(null);
      setSession(s);
      const first = s.itemIds.findIndex((id) => !s.results[id]);
      setIndex(first < 0 ? s.itemIds.length : first);
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
    setGrading(null);
    setChatOpen(false);
    setCpNow(null);
    setError(null);
    setPicks([]);
    setAssign([]);
    setIndex((i) => i + 1);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------------- 화면 ----------------
  if (error && !session) return <ErrorBox message={error} />;
  if (!session) return <p className="py-16 text-center text-muted">문제를 준비하는 중…</p>;
  if (session.itemIds.length === 0)
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <p className="text-muted">
          {challenge === "revenge" || mode === "review"
            ? "다시 도전할 오답이 없습니다. 지금까지 틀린 문제를 모두 정복했어요."
            : challenge
              ? "출제 범위 안에 이 도전에 맞는 공개 문제가 아직 없습니다. 퀴즈 홈에서 출제 범위를 바꾸거나 관리자 화면에서 문제를 승인해 주세요."
              : "조건에 맞는 공개 문제가 없습니다."}
        </p>
        <Link href={back?.href ?? "/quiz"} className="btn mt-4 inline-block">{back?.label ?? "퀴즈 홈"}</Link>
      </div>
    );
  if (index >= total) return <Finished mode={mode} challenge={challenge} session={session} tally={tally} finish={finish} log={log} back={back} />;

  const isFill = view?.format === "fill";
  const auto = view?.grading === "auto";
  const practice = view?.kind === "practice" && view.practice ? (view.practice as unknown as PublicPractice) : null;
  const picking = practice && practice.mode !== "fill" ? practice : null;
  const ready = picking ? (picking.mode === "classify" ? (picking.statements ?? []).every((_, i) => assign[i] !== null && assign[i] !== undefined) : picks.length > 0) : false;
  const lastStep = index === total - 1;
  const status = mode === "daily" ? missionStatus(done, total) : null;
  const prevCombo = log.length >= 2 ? log[log.length - 2].combo : 0;

  return (
    <div ref={topRef} className="mx-auto max-w-2xl scroll-mt-16 pb-24">
      {/* 진행률 · 콤보 · 경험치 */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 bg-bg/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setExitOpen(true)} className="text-xl leading-none text-faint hover:text-ink" aria-label="그만 풀기">×</button>
          <div className="flex-1">
            {mode === "daily" ? (
              <CheckpointTrack done={done} total={total} labels={false} size="sm" />
            ) : (
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-navy transition-[width] duration-300" style={{ width: `${(done / total) * 100}%` }} />
              </div>
            )}
          </div>
          <span className="text-sm tabular-nums text-muted">{Math.min(index + 1, total)}/{total}</span>
          {tally.xp > 0 && <span className="text-sm font-semibold tabular-nums text-warn">+{tally.xp} XP</span>}
        </div>
        <div className="mt-1.5 flex min-h-5 items-center gap-2 pl-7 text-[11px] text-muted">
          {challenge ? <span className="font-semibold text-navy">{CHALLENGES[challenge].title}</span> : status && !status.completed && status.next ? <span>다음 목표 &apos;{status.next.title}&apos;까지 {status.remaining}문제</span> : null}
          <span className="ml-auto">
            <ComboChip count={combo} animate />
          </span>
        </div>
      </div>
      {session.notice && index === 0 && !outcome && <p className="mb-3 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">{session.notice}</p>}

      {!view ? (
        error ? (
          <div className="space-y-3">
            <ErrorBox message={error} />
            <button className="btn-primary w-full py-3" disabled={busy} onClick={skipBroken}>
              {mode === "daily" ? "다른 문제로 바꿔서 계속" : "건너뛰기"}
            </button>
          </div>
        ) : (
          <p className="py-16 text-center text-muted">불러오는 중…</p>
        )
      ) : (
        <article className="space-y-4">
          <header className="flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className={`rounded px-2 py-0.5 font-semibold ${view.kind === "exam" ? "bg-navy text-on-accent" : view.kind === "practice" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}
            >
              {view.full ? "완전 기출 · 문항 전체" : view.kind === "exam" ? "실제 기출" : view.kind === "practice" ? "기출 기반 연습" : "AI 예상 문제"}
            </span>
            {view.kind === "exam" && view.ref && <span className="text-muted">{view.ref}{view.score ? ` · ${view.score}점` : ""}</span>}
            {view.kind === "practice" && view.ref && <span className="text-muted">{view.ref} 원문</span>}
            <span className="rounded border border-line px-1.5 py-0.5 text-muted">{view.practiceType ?? (isFill ? "기입형" : "서술형")}</span>
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

          {/* 연습문제 발문 */}
          {view.kind === "practice" && (
            <section className="rounded-xl border-2 border-ok/40 bg-ok-soft/40 p-4">
              <div className="mb-1 text-xs font-bold text-ok">연습 · {view.practiceType}</div>
              <p className="whitespace-pre-wrap text-[16px] font-medium leading-7">{picking?.stem ?? view.prompt}</p>
            </section>
          )}

          {/* 답 */}
          {!revealed ? (
            picking ? (
              <div className="space-y-3">
                <PracticeInput p={picking} picks={picks} onPicks={setPicks} assign={assign.length ? assign : (picking.statements ?? []).map(() => null)} onAssign={setAssign} disabled={busy} />
                <button className="btn-primary w-full py-3 text-base font-semibold" disabled={busy || !ready} onClick={submitPractice}>
                  {busy ? "채점 중…" : ready ? "정답 확인" : picking.mode === "classify" ? "모든 진술을 분류하세요" : "보기를 고르세요"}
                </button>
              </div>
            ) : isFill && auto ? (
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
              <div className="space-y-3">
                <section className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="essay-answer" className="text-sm font-semibold">
                      내 답안 <span className="font-normal text-faint">(선택)</span>
                    </label>
                    <span className="text-xs tabular-nums text-faint">{answer.length}/3000</span>
                  </div>
                  <textarea
                    id="essay-answer"
                    className="input min-h-36 text-[16px] leading-7"
                    placeholder={isFill ? "답을 적어 보세요." : "답안을 써 보세요. 쓰고 나면 AI 첨삭을 받을 수 있습니다."}
                    value={answer}
                    maxLength={3000}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                </section>
                {view.aiGrading && (
                  <button className="btn-primary w-full py-3 text-base font-semibold" disabled={busy || answer.trim().length < 5} onClick={gradeWithAi}>
                    {busy ? "AI가 첨삭하는 중… (길면 1~2분)" : "AI 채점 받기 (무료)"}
                  </button>
                )}
                {chatOpen ? (
                  <ChatGrader itemId={view.id} answer={answer} onGraded={showGraded} />
                ) : (
                  <button
                    type="button"
                    className={`${view.aiGrading ? "btn" : "btn-primary font-semibold"} w-full py-2.5`}
                    disabled={busy || answer.trim().length < 5}
                    onClick={() => setChatOpen(true)}
                  >
                    채팅 AI로 채점받기 (Claude · ChatGPT · Gemini)
                  </button>
                )}
                {answer.trim().length > 0 && answer.trim().length < 5 && <p className="text-center text-xs text-faint">AI 첨삭은 5자 이상 쓰면 받을 수 있습니다.</p>}
                <button className="btn w-full py-3" disabled={busy} onClick={reveal}>
                  {answer.trim() ? "채점 없이 정답 보기 (자기평가)" : "건너뛰고 정답 보기 (자기평가)"}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {/* 채점 결과 (자동 채점) */}
              {auto && outcome && (
                <OutcomePanel r={outcome} auto prevCombo={prevCombo} cp={cpNow}>
                  {!picking && (
                    <p className="mt-1 text-sm">
                      내 답: <b>{answer}</b>
                    </p>
                  )}
                  {outcome.result === "wrong" && !reported && !picking && (
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
                </OutcomePanel>
              )}

              {/* 서술형: 내가 쓴 답안 + AI 첨삭 */}
              {!auto && answer.trim() && (
                <section className="rounded-lg border border-line bg-surface-2/60 p-4">
                  <div className="mb-1 text-xs font-bold text-muted">내 답안</div>
                  <p className="whitespace-pre-wrap text-[15px] leading-7">{answer}</p>
                </section>
              )}
              {grading && <EssayFeedback g={grading} />}

              {solution?.practice && picking && <PracticeReview s={solution.practice} picks={picks} assign={assign} />}
              {solution && <SolutionView s={solution} kind={view.kind} showAnswerBox={!picking} />}

              {/* 자기평가 */}
              {!auto && !outcome && (
                <section className="sticky bottom-3 z-10 rounded-xl border border-line bg-surface p-3 shadow-lg">
                  <div className="mb-2 text-center text-sm font-semibold">
                    {grading ? "AI 제안을 참고해 최종 평가를 골라 주세요" : "내 답안을 평가해 주세요"}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {SELF.map((o) => {
                      const suggested = grading?.verdict === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          disabled={busy}
                          onClick={() => selfRate(o.value)}
                          className={`rounded-lg border-2 p-2.5 text-left transition-colors ${o.tone} ${suggested ? "ring-2 ring-navy ring-offset-1 ring-offset-surface" : ""}`}
                        >
                          <div className="flex items-center gap-1.5 font-bold">
                            {o.title}
                            {suggested && <span className="rounded bg-navy px-1 text-[10px] font-semibold text-on-accent">AI 제안</span>}
                          </div>
                          <div className="text-[11px] text-muted">{o.help}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
              {!auto && outcome && <OutcomePanel r={outcome} auto={false} prevCombo={prevCombo} cp={cpNow} />}

              {outcome && (
                <div className="quiz-rise sticky bottom-3 z-10">
                  <button ref={nextRef} className="btn-primary quiz-nudge w-full py-3.5 text-base font-semibold shadow-lg focus-visible:ring-4 focus-visible:ring-navy/30" onClick={next}>
                    {lastStep ? "결과 보기" : "다음 문제 →"}
                  </button>
                </div>
              )}
            </div>
          )}
          {error && <ErrorBox message={error} />}
        </article>
      )}
      {celebrate && <Celebration title={celebrate.title} lines={celebrate.lines} onClose={() => setCelebrate(null)} />}
      {exitOpen && <ExitDialog mode={mode} done={done} total={total} solved={log.length} onStay={() => setExitOpen(false)} back={back} />}
    </div>
  );
}

/** 그만 풀기: 진행이 저장되었음을 분명히 알려 준다 */
function ExitDialog({ mode, done, total, solved, onStay, back }: { mode: Mode; done: number; total: number; solved: number; onStay: () => void; back?: { href: string; label: string } }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="exit-title" onClick={onStay}>
      <div className="quiz-rise w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="exit-title" className="text-lg font-bold">
          {mode === "daily" ? "진행 상황이 저장되었습니다" : "푼 문제는 저장되었습니다"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "daily"
            ? `오늘의 미션 ${done}/${total} — 퀴즈 홈에서 언제든 이어 풀 수 있어요. 한국 시간 자정까지 끝내면 연속 학습이 이어집니다.`
            : `이번에 푼 ${solved}문제의 결과와 경험치는 기록되었습니다. 남은 문제는 다음에 새로 골라 드립니다.`}
        </p>
        {mode === "daily" && <div className="mt-4"><CheckpointTrack done={done} total={total} /></div>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn py-2.5" onClick={onStay}>계속 풀기</button>
          <Link href={back?.href ?? "/quiz"} className="btn-primary py-2.5">나가기</Link>
        </div>
      </div>
    </div>
  );
}

/**
 * 판정 결과: 정답은 짧은 성공 연출, 오답·부분 정답은 과장 없이 다음 행동(해설 확인·복습)으로 안내.
 * 서술형은 학습자의 최종 자기평가가 판정이다 (AI 제안과 구분).
 */
function OutcomePanel({ r, auto, prevCombo, cp, children }: { r: AttemptResult; auto: boolean; prevCombo: number; cp: Checkpoint | null; children?: React.ReactNode }) {
  const tone = r.result === "correct" ? "border-ok/40 bg-ok-soft" : r.result === "partial" ? "border-warn/40 bg-warn-soft/60" : "border-line bg-surface-2";
  const title =
    r.result === "correct"
      ? auto
        ? "정답입니다"
        : "정답으로 확정했습니다"
      : r.result === "partial"
        ? "일부만 맞힘으로 기록했습니다"
        : auto
          ? "이번엔 놓쳤어요"
          : "다시 볼 문제로 기록했습니다";
  const hint =
    r.result === "correct"
      ? r.reconquered
        ? "지난번에 놓친 문제를 이번엔 정확히 맞혔습니다."
        : null
      : r.result === "partial"
        ? "해설에서 빠진 채점 요소를 확인하세요. 이틀 뒤 복습에 다시 나옵니다."
        : "해설을 읽어 두면 다음 학습에서 다시 만날 때 맞힐 수 있어요.";
  // 연속 정답 이정표: 3 · 5 · 10 · 그 뒤 10 마다
  const milestone = r.result === "correct" && (r.combo === 3 || r.combo === 5 || (r.combo >= 10 && r.combo % 10 === 0)) ? r.combo : 0;
  return (
    <section className={`quiz-rise relative rounded-lg border p-4 ${tone} ${milestone ? "streak-glow" : ""}`} aria-live="polite">
      {milestone > 0 && (
        <div className="streak-pop pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2" aria-hidden>
          <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-black shadow-md ${milestone >= 10 ? "bg-gradient-to-r from-[#ffcf5a] to-[#ff9b4a] text-[#3a1a00]" : milestone >= 5 ? "bg-[#ffd36b] text-[#3a2600]" : "bg-ok text-on-accent"}`}>
            <span className="streak-flame">🔥</span> {milestone}연속 정답!
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {r.result === "correct" && (
          <span className="quiz-pop quiz-ring flex h-7 w-7 items-center justify-center rounded-full bg-ok text-sm font-bold text-on-accent" aria-hidden>
            ✓
          </span>
        )}
        <span className={`text-lg font-bold ${r.result === "correct" ? "text-ok" : r.result === "partial" ? "text-warn" : "text-ink"}`}>{title}</span>
        {r.reconquered && <span className="quiz-pop rounded-full bg-ok px-2 py-0.5 text-xs font-bold text-on-accent">재정복 성공</span>}
        <span className="ml-auto flex items-center gap-2">
          {r.result === "correct" && <ComboChip count={r.combo} animate />}
          {r.xp > 0 && <span className="text-sm font-semibold tabular-nums text-warn">+{r.xp} XP</span>}
          {r.coins > 0 && (
            <span className="quiz-pop inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-xs font-bold tabular-nums text-warn" title="철학자 대난투 코인">
              +{r.coins} 코인
            </span>
          )}
        </span>
      </div>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {/* 정답 직후 그 사상가의 한마디 (게임 캐릭터) */}
      {r.cheer && (
        <div className="cheer-in mt-2.5 flex items-end gap-2">
          {r.cheer.artUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.cheer.artUrl} alt="" className="h-12 w-12 shrink-0 rounded-full bg-surface-2 object-cover object-top ring-2 ring-ok/40" loading="lazy" draggable={false} />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg font-black text-ok ring-2 ring-ok/40">{r.cheer.name[0]}</span>
          )}
          <div className="relative min-w-0 rounded-2xl rounded-bl-sm border border-line bg-surface px-3 py-2 text-sm shadow-sm">
            <span className="mr-1.5 text-xs font-bold text-ok">{r.cheer.name}</span>
            <span className="text-ink">“{r.cheer.line}”</span>
            <span className="block text-[10px] text-faint">게임을 위한 창작 대사</span>
          </div>
        </div>
      )}
      <p className="mt-1 text-xs text-faint">
        {r.hardBonus > 0 && `난이도 '상' 보너스 +${r.hardBonus} 포함. `}
        {r.xp === 0 && "오늘 이미 경험치를 받은 문제라 기록만 남깁니다. "}
        {r.result !== "correct" && prevCombo >= 2 && `콤보 ×${prevCombo}는 여기서 멈추지만 경험치와 학습 기록은 그대로입니다. `}
        {r.coinNote && `코인: ${r.coinNote}.`}
      </p>
      {children}
      {cp && <div className="mt-3"><CheckpointRibbon cp={cp} /></div>}
    </section>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <p className="rounded bg-danger-soft p-3 text-sm text-danger">{message}</p>;
}

function Finished({
  mode,
  challenge,
  session,
  tally,
  finish,
  log,
  back,
}: {
  mode: Mode;
  challenge?: ChallengeType;
  session: Session;
  tally: { correct: number; partial: number; wrong: number; xp: number };
  finish: AttemptResult | null;
  log: AttemptResult[];
  back?: { href: string; label: string };
}) {
  const results = Object.values(session.results);
  const count = (r: QuizResult) => results.filter((x) => x === r).length;
  // 이번 세션 성과 (게임 지표와 실제 학습 지표를 나눠서)
  const reconquered = log.filter((r) => r.reconquered).length;
  const hardCorrect = log.filter((r) => r.result === "correct" && r.difficulty === 3).length;
  const hardXp = log.reduce((n, r) => n + r.hardBonus, 0);
  let best = 0;
  let cur = 0;
  for (const r of log) {
    cur = r.result === "correct" ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  const growth = new Map<string, number>();
  for (const r of log) if (r.area && r.masteryAfter > r.masteryBefore) growth.set(r.area, (growth.get(r.area) ?? 0) + (r.masteryAfter - r.masteryBefore));
  const levelUp = log.reduce<number | null>((m, r) => (r.levelUp ? Math.max(m ?? 0, r.levelUp) : m), null);
  const coins = log.reduce((n, r) => n + (r.coins ?? 0), 0);
  const title = challenge ? `${CHALLENGES[challenge].title} 완료` : mode === "daily" ? (finish ? "오늘의 미션 완수" : "미션 완료") : "학습 완료";
  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <div className="quiz-rise text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ok-soft text-2xl font-bold text-ok quiz-pop">✓</div>
        <h1 className="text-3xl font-bold text-navy">{title}</h1>
        {mode === "daily" && finish && (
          <p className="mt-1 text-muted">
            연속 학습 <b className="text-warn">{finish.streak}일</b> · 미션 보너스 <b className="text-warn">+{finish.missionXp} XP</b>
          </p>
        )}
        {mode === "daily" && !finish && results.length === session.itemIds.length && <p className="mt-1 text-sm text-muted">오늘 미션은 이미 완료했습니다.</p>}
      </div>

      {(levelUp !== null || (finish?.newBadges.length ?? 0) > 0) && (
        <div className="space-y-2">
          {levelUp && <p className="quiz-rise rounded-lg border border-warn/40 bg-warn-soft p-3 text-center font-semibold text-warn">레벨 업! 이제 Lv.{levelUp}입니다</p>}
          {finish?.newBadges.map((b) => (
            <p key={b} className="quiz-rise rounded-lg border border-warn/40 bg-warn-soft p-3 text-center font-semibold text-warn">
              새 배지: {b.replace("streak-", "")}일 연속 학습
            </p>
          ))}
        </div>
      )}

      {/* 학습 결과 */}
      <section className="card p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-2xl font-bold text-ok">{count("correct")}</div><div className="text-xs text-muted">정답</div></div>
          <div><div className="text-2xl font-bold text-warn">{count("partial")}</div><div className="text-xs text-muted">일부만</div></div>
          <div><div className="text-2xl font-bold text-danger">{count("wrong")}</div><div className="text-xs text-muted">오답</div></div>
        </div>
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <li className="flex justify-between"><span className="text-muted">획득 경험치</span><b className="tabular-nums text-warn">+{tally.xp} XP</b></li>
          {hardXp > 0 && <li className="flex justify-between text-xs"><span className="text-faint">└ 난이도 &apos;상&apos; 보너스</span><span className="tabular-nums text-faint">+{hardXp}</span></li>}
          {coins > 0 && (
            <li className="flex justify-between">
              <span className="text-muted">철학자 대난투 코인</span>
              <Link href="/quiz/game" className="font-bold tabular-nums text-warn hover:underline">+{coins} 코인 →</Link>
            </li>
          )}
          {hardCorrect > 0 && <li className="flex justify-between"><span className="text-muted">난이도 &apos;상&apos; 정답</span><b className="tabular-nums">{hardCorrect}문제</b></li>}
          {reconquered > 0 && <li className="flex justify-between"><span className="text-muted">재정복 (틀렸던 문제를 맞힘)</span><b className="tabular-nums text-ok">{reconquered}문제</b></li>}
          {best >= 2 && <li className="flex justify-between"><span className="text-muted">최고 콤보</span><span className="flex items-center gap-2"><ComboChip count={best} /></span></li>}
        </ul>
      </section>

      {growth.size > 0 && (
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-bold">성장한 영역</h2>
          <ul className="space-y-0.5 text-sm">
            {[...growth.entries()].sort((a, b) => b[1] - a[1]).map(([area, n]) => (
              <li key={area}>
                <b>{area}</b> <span className="text-muted">숙련도 단계 +{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2">
        {back && <Link href={back.href} className="btn-primary py-3">{back.label}</Link>}
        <Link href="/quiz" className={back ? "btn py-3" : "btn-primary py-3"}>퀴즈 홈</Link>
        {count("wrong") + count("partial") > 0 && challenge !== "revenge" && <Link href="/quiz/play?challenge=revenge" className="btn py-3">오답 복수전으로 바로 재도전</Link>}
        <Link href="/quiz/free" className="btn py-3">자유 학습 더 하기</Link>
      </div>
    </div>
  );
}
