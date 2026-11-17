"use client";

import { useEffect, useState } from "react";
import type { DrawResult, GameState, MultiDrawResult } from "@/lib/game/data";
import { RARITIES, RARITY_NAMES, type Rarity } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { Ticket } from "lucide-react";
import { TICKET_NAMES, TICKET_ODDS, type TicketKind } from "@/lib/game/attendance";
import { CardBack, PhilosopherCard } from "./PhilosopherCard";
import { Coins } from "./GameApp";

const BURST: Record<Rarity, string> = {
  common: "rgba(200,210,225,0.5)",
  rare: "rgba(90,170,255,0.65)",
  epic: "rgba(180,120,255,0.7)",
  legendary: "rgba(255,205,90,0.85)",
};

/** 같은 요청 id 로 한 번 더 (네트워크 오류 시). 서버가 같은 결과를 돌려주므로 중복 차감 없음 */
async function postWithRetry<T>(url: string, body: unknown): Promise<T> {
  try {
    return await quizApi<T>(url, "POST", body);
  } catch (e) {
    if (e instanceof TypeError) return quizApi<T>(url, "POST", body);
    throw e;
  }
}

/** 뒤집기 전 기다리는 시간 (등급이 높을수록 길게) */
const TEASE_MS = { common: 200, rare: 750, epic: 1050, legendary: 1500 } as const;

export function DrawTab({ state, reload, onOpen }: { state: GameState; reload: () => Promise<GameState>; onOpen: (id: string) => void }) {
  const [phase, setPhase] = useState<"idle" | "drawing" | "reveal">("idle");
  const [result, setResult] = useState<(DrawResult & { ticket?: TicketKind }) | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 10+1 뽑기 결과 · 몇 장까지 뒤집었나
  const [multi, setMulti] = useState<MultiDrawResult | null>(null);
  const [shownN, setShownN] = useState(0);
  const cost = state.settings.drawCost;
  const multiCost = cost * 10;
  const enoughMulti = state.coins >= multiCost;
  // 무료 뽑기 결과를 받으면 상태를 다시 읽기 전에도 곧바로 일반 뽑기로 전환
  const free = state.freeDraw.available && !result?.free;
  const enough = free || state.coins >= cost;

  // 11장을 차례로 뒤집기 (높은 등급은 조금 더 뜸을 들임)
  useEffect(() => {
    if (!multi || shownN >= multi.cards.length) return;
    const next = multi.cards[shownN];
    const t = setTimeout(() => setShownN((n) => n + 1), shownN === 0 ? 350 : next.rarity === "legendary" ? 700 : next.rarity === "epic" ? 450 : 170);
    return () => clearTimeout(t);
  }, [multi, shownN]);

  async function drawTen() {
    if (phase === "drawing") return;
    setError(null);
    setResult(null);
    setMulti(null);
    setShownN(0);
    setPhase("drawing");
    const requestId = crypto.randomUUID();
    try {
      const [r] = await Promise.all([postWithRetry<MultiDrawResult>("/api/game/draw", { requestId, multi: true }), new Promise((ok) => setTimeout(ok, 700))]);
      setMulti(r);
      setPhase("reveal");
      reload().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function draw(ticket?: TicketKind) {
    if (phase === "drawing") return;
    setError(null);
    setResult(null);
    setMulti(null);
    setFlipped(false);
    setPhase("drawing");
    const requestId = crypto.randomUUID();
    try {
      // 무료 여부 · 뽑기권 보유는 서버가 DB 기록으로 판단한다 (화면은 요청만 보냄)
      const req = ticket ? postWithRetry<DrawResult & { ticket: TicketKind }>("/api/game/ticket", { requestId, kind: ticket }) : postWithRetry<DrawResult>("/api/game/draw", { requestId, free });
      const [r] = await Promise.all([req, new Promise((ok) => setTimeout(ok, 700))]);
      setResult(r);
      setPhase("reveal");
      // 두근두근: 등급이 높을수록 뒤집기 전에 오래 · 강하게 (일반은 바로)
      setTimeout(() => setFlipped(true), TEASE_MS[r.card.rarity]);
      reload().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,color-mix(in_srgb,var(--navy)_14%,transparent),transparent)]" />
        <div className="relative flex min-h-[26rem] flex-col items-center justify-center gap-4 pb-2 pt-6 sm:pt-8">
          {multi ? (
            <MultiReveal r={multi} shown={shownN} maxLevel={state.settings.maxLevel} onOpen={onOpen} onSkip={() => setShownN(multi.cards.length)} />
          ) : phase === "idle" && !result ? (
            <div className="card-enter flex flex-col items-center">
              <CardBack className="card-float w-44 sm:w-52" />
              <p className="mt-4 text-sm text-muted">{free ? "첫 카드는 코인 없이 뽑을 수 있어요" : "퀴즈로 모은 코인으로 철학자를 영입하세요"}</p>
            </div>
          ) : (
            <div className={`flip-scene relative w-52 sm:w-60 ${result && phase === "reveal" && !flipped && result.card.rarity !== "common" ? `draw-tease draw-tease-${result.card.rarity}` : ""}`} style={result ? ({ ["--burst" as string]: BURST[result.card.rarity] } as React.CSSProperties) : undefined}>
              {/* 전설: 하늘에서 빛기둥 */}
              {result && phase === "reveal" && result.card.rarity === "legendary" && <span className="draw-pillar" aria-hidden />}
              {result && flipped && <span className="card-burst" style={{ ["--burst" as string]: BURST[result.card.rarity] }} />}
              <div className={`flip-card ${flipped ? "is-flipped" : ""} ${phase === "drawing" ? "card-enter" : ""}`} style={{ aspectRatio: "3 / 4" }}>
                <div className="flip-face">
                  <CardBack />
                </div>
                <div className="flip-face front">
                  {result && <PhilosopherCard card={result.card} rarity={result.card.rarity} level={result.card.level} stats={{ atk: result.card.atk, hp: result.card.hp }} tilt={false} maxLevel={state.settings.maxLevel} />}
                </div>
              </div>
            </div>
          )}

          {/* 결과 문구 자리: 대기 중엔 비워 두지 않아 카드가 위로 쏠리지 않게 */}
          <div className={`text-center ${phase === "idle" && !result ? "" : "min-h-[4.5rem]"}`} aria-live="polite">
            {phase === "drawing" && <p className="text-sm font-semibold text-muted">철학자를 부르는 중…</p>}
            {result && flipped && (
              <div className="quiz-rise space-y-1">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{RARITY_NAMES[result.card.rarity]}</div>
                <div className="text-xl font-black">{result.card.name}</div>
                <p className={`text-sm font-semibold ${result.free || result.isNewPhilosopher ? "text-ok" : "text-navy"}`}>
                  {result.ticket
                    ? `🎟 ${TICKET_NAMES[result.ticket]} 뽑기권 · ${result.isNewPhilosopher ? "NEW! 새 철학자가 도감에 추가되었습니다" : "같은 철학자의 카드를 한 장 더 얻었습니다"}`
                    : result.free
                    ? "첫 철학자 획득!"
                    : result.isNewPhilosopher
                      ? "NEW! 새 철학자가 도감에 추가되었습니다"
                      : "같은 철학자의 카드를 한 장 더 얻었습니다 · 합성 재료로 쓸 수 있어요"}
                </p>
                {result.autoFeatured && <p className="text-xs text-muted">대표 카드로 설정되어 윤리 퀴즈 메인에 표시됩니다.</p>}
              </div>
            )}
          </div>

          {free && phase !== "drawing" && (
            <div className="quiz-rise w-full max-w-sm rounded-2xl border border-ok/40 bg-ok-soft/60 p-4 text-center">
              <div className="text-lg font-black text-ok">첫 카드 뽑기 무료!</div>
              <p className="text-xs text-muted">코인이 없어도 지금 바로 철학자를 영입할 수 있어요. 일반·희귀·영웅·전설 모두 나올 수 있습니다.</p>
              <button type="button" className="btn-primary mt-3 w-full py-3.5 text-base font-bold" onClick={() => draw()}>
                무료로 첫 카드 뽑기
              </button>
              <p className="mt-1.5 text-[11px] font-semibold text-ok">계정당 1회 한정 · 남은 무료 뽑기 1회</p>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {!free && (
              <button type="button" className="btn-primary px-6 py-3 text-base font-bold" disabled={!enough || phase === "drawing"} onClick={() => draw()}>
                {phase === "drawing" ? "뽑는 중…" : result ? "한 번 더 뽑기" : "1장 뽑기"} · {cost}코인
              </button>
            )}
            {!free && (
              <button
                type="button"
                className="relative rounded-xl bg-gradient-to-r from-[#c99a2e] via-[#ffd36b] to-[#e0a43a] px-6 py-3 text-base font-black text-[#3a2600] shadow-[0_6px_18px_-6px_rgba(201,154,46,.8)] transition hover:brightness-105 disabled:opacity-50"
                disabled={!enoughMulti || phase === "drawing"}
                onClick={drawTen}
                data-draw-multi
              >
                10+1 뽑기 · {multiCost.toLocaleString()}코인
                <span className="absolute -right-2 -top-2 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-black text-white shadow">+1장 무료</span>
              </button>
            )}
            {result && flipped && (
              <button type="button" className="btn px-4 py-3" onClick={() => onOpen(result.card.philosopherId)}>
                카드 보기
              </button>
            )}
          </div>
          {/* 출석 확정 뽑기권 */}
          {state.attendance.ready && state.attendance.tickets.rare + state.attendance.tickets.epic > 0 && (
            <div className="flex flex-wrap justify-center gap-2" data-tickets>
              {(["epic", "rare"] as const)
                .filter((k) => state.attendance.tickets[k] > 0)
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={phase === "drawing"}
                    onClick={() => draw(k)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-black shadow disabled:opacity-50 ${k === "epic" ? "bg-gradient-to-r from-[#7b3fe4] to-[#b37bff] text-white" : "bg-gradient-to-r from-[#2a6fd6] to-[#6fb6ff] text-white"}`}
                    title={`확률: ${TICKET_ODDS[k].map((o) => `${o.rarity} ${o.pct}%`).join(" · ")}`}
                  >
                    <Ticket className="h-4 w-4" aria-hidden /> {TICKET_NAMES[k]} 뽑기 · {state.attendance.tickets[k]}장
                  </button>
                ))}
            </div>
          )}
          {!free && <p className="text-[11px] text-faint">무료 뽑기 사용 완료 · 남은 무료 뽑기 0회</p>}
          {!enough && <p className="text-sm text-muted">코인이 {cost - state.coins} 부족합니다. 윤리 퀴즈 한 세트를 풀면 모을 수 있어요.</p>}
          {!free && enough && !enoughMulti && <p className="text-[11px] text-faint">10+1 뽑기까지 코인 {(multiCost - state.coins).toLocaleString()} 남음 · 10장 값으로 11장</p>}
          {error && <p className="rounded bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </section>

      <aside className="space-y-3">
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">보유 코인</span>
            <Coins value={state.coins} />
          </div>
          <p className="mt-2 text-xs text-muted">코인은 윤리 퀴즈 풀이와 매일 출석(10~70)으로 얻습니다. 같은 문제는 하루 한 번, 하루 학습 코인 상한 {state.settings.coinRules.daily_cap} (출석 코인은 따로).</p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            <li className="flex justify-between"><span>기입형 정답</span><b>{state.settings.coinRules.fill_correct}</b></li>
            <li className="flex justify-between"><span>서술형 완벽 / 부분</span><b>{state.settings.coinRules.essay_correct} / {state.settings.coinRules.essay_partial}</b></li>
            <li className="flex justify-between"><span>오답 후 해설 확인</span><b>{state.settings.coinRules.wrong}</b></li>
            <li className="flex justify-between"><span>재정복 추가</span><b>+{state.settings.coinRules.reconquer}</b></li>
            <li className="flex justify-between"><span>오늘의 미션 완료</span><b>+{state.settings.coinRules.mission}</b></li>
          </ul>
          <p className="mt-2 text-[11px] text-faint">자기평가 문제는 답안을 써야(서술형 {state.settings.coinRules.essay_min_chars}자 이상) 정답 코인을 받습니다.</p>
        </section>
        {state.attendance.ready && (
          <section className="card p-4">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Ticket className="h-4 w-4 text-[#b07a00] dark:text-[#ffd36b]" aria-hidden /> 출석 확정 뽑기권
            </h3>
            <p className="text-xs text-muted">출석 7일차에 희귀 확정, 28일차에 영웅 확정 뽑기권을 받습니다 (희귀 확정은 영웅 확정을 받기 전까지 한 번만). 코인 없이 한 번 뽑습니다.</p>
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {(["rare", "epic"] as const).map((k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span>
                    {TICKET_NAMES[k]} <b className="text-ink">{state.attendance.tickets[k]}장</b>
                  </span>
                  <span className="tabular-nums">{TICKET_ODDS[k].map((o) => `${o.rarity} ${o.pct}%`).join(" · ")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">등급별 확률</h3>
          <ul className="space-y-1.5">
            {RARITIES.map((r) => (
              <li key={r} className="flex items-center gap-2 text-sm">
                <span className="pcard-gem inline-block text-[9px]" style={{ ["--r1" as string]: r === "common" ? "#a7b0bd" : r === "rare" ? "#8fd0ff" : r === "epic" ? "#d8b4ff" : "#ffe39a", ["--r2" as string]: r === "common" ? "#5d6673" : r === "rare" ? "#2a6fd6" : r === "epic" ? "#7b3fe4" : "#b9780f" }} />
                <span className="w-10">{RARITY_NAMES[r]}</span>
                <span className="ml-auto tabular-nums text-muted">{(state.settings.effectiveRates[r] * 100).toFixed(state.settings.effectiveRates[r] < 0.1 ? 1 : 0)}%</span>

              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] font-semibold text-[#8a5a00] dark:text-[#ffd36b]">10+1 뽑기: {(cost * 10).toLocaleString()}코인으로 11장 · 11장 모두 위 확률 그대로</p>
          <p className="mt-1 text-[11px] text-faint">모든 철학자({state.cards.length}명)가 네 등급 모두로 나올 수 있습니다. 등급을 먼저 정하고 철학자를 고르며, 결과는 서버에서 정해집니다.</p>
          <p className="mt-1 text-[11px] text-faint">같은 카드가 또 나와도 카드로 보관됩니다. 같은 사상가의 같은 등급 카드 {state.settings.fusionCount}장을 합성하면 한 단계 위 등급으로 진화해요 (예: 일반 콜버그 {state.settings.fusionCount}장 → 희귀 콜버그).</p>
        </section>
      </aside>
    </div>
  );
}

const RARITY_RING: Record<Rarity, string> = { common: "ring-[#b9c0cb]/50", rare: "ring-[#5aa2ff]/70", epic: "ring-[#b07cff]/80", legendary: "ring-[#ffc94a]" };

/** 10+1 뽑기 결과: 11장이 차례로 뒤집히고, 끝나면 등급별 요약 */
function MultiReveal({ r, shown, maxLevel, onOpen, onSkip }: { r: MultiDrawResult; shown: number; maxLevel: number; onOpen: (id: string) => void; onSkip: () => void }) {
  const done = shown >= r.cards.length;
  const count = (k: Rarity) => r.cards.filter((c) => c.rarity === k).length;
  const fresh = r.cards.filter((c) => c.isNewPhilosopher).length;
  return (
    <div className="w-full space-y-3" data-multi-reveal>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {r.cards.map((c, i) => {
          const up = i < shown;
          return (
            <div key={c.cardId} className="relative" style={{ ["--burst" as string]: BURST[c.rarity] } as React.CSSProperties}>
              {up && c.rarity !== "common" && <span className="card-burst" style={{ ["--burst" as string]: BURST[c.rarity] }} />}
              {up && c.rarity === "legendary" && <span className="draw-pillar" aria-hidden />}
              <button type="button" className={`flip-card block w-full rounded-[14px] ${up ? `is-flipped ring-2 ${RARITY_RING[c.rarity]}` : ""}`} style={{ aspectRatio: "3 / 4" }} onClick={() => up && onOpen(c.philosopherId)} aria-label={up ? `${RARITY_NAMES[c.rarity]} ${c.name}` : "아직 뒤집지 않은 카드"}>
                <div className="flip-face">
                  <CardBack />
                </div>
                <div className="flip-face front">
                  <PhilosopherCard fx="lite" card={c} rarity={c.rarity} level={c.level} stats={{ atk: c.atk, hp: c.hp }} tilt={false} maxLevel={maxLevel} />
                </div>
              </button>
              {up && c.isNewPhilosopher && <span className="absolute -left-1 -top-1 z-10 rounded-full bg-ok px-1.5 py-0.5 text-[9px] font-black text-white shadow">NEW</span>}
              {c.bonus && <span className="absolute -right-1 -top-1 z-10 rounded-full bg-danger px-1.5 py-0.5 text-[9px] font-black text-white shadow">+1 보너스</span>}
            </div>
          );
        })}
      </div>
      {done ? (
        <div className="quiz-rise flex flex-wrap items-center justify-center gap-1.5 text-xs font-bold" aria-live="polite">
          <span className="rounded-full bg-surface-2 px-2.5 py-1">11장 획득</span>
          {(["legendary", "epic", "rare", "common"] as Rarity[]).filter((k) => count(k) > 0).map((k) => (
            <span key={k} className={`rounded-full px-2.5 py-1 ${k === "legendary" ? "bg-[#ffd36b]/30 text-[#8a5a00] dark:text-[#ffd36b]" : k === "epic" ? "bg-[#b07cff]/20 text-[#7b3fe4] dark:text-[#d8b4ff]" : k === "rare" ? "bg-[#5aa2ff]/20 text-[#2a6fd6] dark:text-[#8fd0ff]" : "bg-surface-2 text-muted"}`}>
              {RARITY_NAMES[k]} {count(k)}
            </span>
          ))}
          {fresh > 0 && <span className="rounded-full bg-ok-soft px-2.5 py-1 text-ok">NEW {fresh}명</span>}
          {r.autoFeatured && <span className="w-full text-center text-[11px] font-normal text-muted">첫 카드가 대표 카드로 설정되었습니다.</span>}
        </div>
      ) : (
        <button type="button" className="mx-auto block text-xs text-muted underline" onClick={onSkip}>
          모두 뒤집기
        </button>
      )}
    </div>
  );
}
