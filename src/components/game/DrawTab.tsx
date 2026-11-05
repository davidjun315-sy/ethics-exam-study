"use client";

import { useState } from "react";
import type { DrawResult, GameState } from "@/lib/game/data";
import { RARITIES, RARITY_NAMES, type Rarity } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
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

export function DrawTab({ state, reload, onOpen }: { state: GameState; reload: () => Promise<GameState>; onOpen: (id: string) => void }) {
  const [phase, setPhase] = useState<"idle" | "drawing" | "reveal">("idle");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cost = state.settings.drawCost;
  const enough = state.coins >= cost;

  async function draw() {
    if (phase === "drawing") return;
    setError(null);
    setResult(null);
    setFlipped(false);
    setPhase("drawing");
    const requestId = crypto.randomUUID();
    try {
      const [r] = await Promise.all([postWithRetry<DrawResult>("/api/game/draw", { requestId }), new Promise((ok) => setTimeout(ok, 700))]);
      setResult(r);
      setPhase("reveal");
      setTimeout(() => setFlipped(true), 150);
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
        <div className="relative flex min-h-[26rem] flex-col items-center justify-center gap-4">
          {phase === "idle" && !result ? (
            <div className="card-enter flex flex-col items-center">
              <CardBack className="card-float w-44 sm:w-52" />
              <p className="mt-4 text-sm text-muted">퀴즈로 모은 코인으로 철학자를 영입하세요</p>
            </div>
          ) : (
            <div className="flip-scene relative w-52 sm:w-60">
              {result && flipped && <span className="card-burst" style={{ ["--burst" as string]: BURST[result.card.rarity] }} />}
              <div className={`flip-card ${flipped ? "is-flipped" : ""} ${phase === "drawing" ? "card-enter" : ""}`} style={{ aspectRatio: "3 / 4" }}>
                <div className="flip-face">
                  <CardBack />
                </div>
                <div className="flip-face front">
                  {result && <PhilosopherCard card={result.card} level={result.level} tilt={false} maxLevel={state.settings.maxLevel} />}
                </div>
              </div>
            </div>
          )}

          <div className="min-h-[4.5rem] text-center" aria-live="polite">
            {phase === "drawing" && <p className="text-sm font-semibold text-muted">철학자를 부르는 중…</p>}
            {result && flipped && (
              <div className="quiz-rise space-y-1">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{RARITY_NAMES[result.card.rarity]}</div>
                <div className="text-xl font-black">{result.card.name}</div>
                <p className={`text-sm font-semibold ${result.isNew ? "text-ok" : "text-navy"}`}>
                  {result.isNew
                    ? "NEW! 도감에 추가되었습니다"
                    : result.refund > 0
                      ? `이미 최대 레벨 · 코인 ${result.refund} 환급`
                      : `중복 획득 · 강화 조각 +1 (보유 ${result.shards}개)`}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary px-6 py-3 text-base font-bold" disabled={!enough || phase === "drawing"} onClick={draw}>
              {phase === "drawing" ? "뽑는 중…" : result ? "한 번 더 뽑기" : "카드 뽑기"} · {cost}코인
            </button>
            {result && flipped && (
              <button type="button" className="btn px-4 py-3" onClick={() => onOpen(result.card.philosopherId)}>
                카드 보기
              </button>
            )}
          </div>
          {!enough && <p className="text-sm text-muted">코인이 {cost - state.coins} 부족합니다. 윤리 퀴즈 한 세트를 풀면 모을 수 있어요.</p>}
          {error && <p className="rounded bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </section>

      <aside className="space-y-3">
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">보유 코인</span>
            <Coins value={state.coins} />
          </div>
          <p className="mt-2 text-xs text-muted">코인은 윤리 퀴즈 풀이로만 얻습니다. 같은 문제는 하루 한 번, 하루 학습 코인 상한 {state.settings.coinRules.daily_cap}.</p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            <li className="flex justify-between"><span>기입형 정답</span><b>{state.settings.coinRules.fill_correct}</b></li>
            <li className="flex justify-between"><span>서술형 완벽 / 부분</span><b>{state.settings.coinRules.essay_correct} / {state.settings.coinRules.essay_partial}</b></li>
            <li className="flex justify-between"><span>오답 후 해설 확인</span><b>{state.settings.coinRules.wrong}</b></li>
            <li className="flex justify-between"><span>재정복 추가</span><b>+{state.settings.coinRules.reconquer}</b></li>
            <li className="flex justify-between"><span>오늘의 미션 완료</span><b>+{state.settings.coinRules.mission}</b></li>
          </ul>
          <p className="mt-2 text-[11px] text-faint">자기평가 문제는 답안을 써야(서술형 {state.settings.coinRules.essay_min_chars}자 이상) 정답 코인을 받습니다.</p>
        </section>
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">등급별 확률</h3>
          <ul className="space-y-1.5">
            {RARITIES.map((r) => (
              <li key={r} className="flex items-center gap-2 text-sm">
                <span className="pcard-gem inline-block text-[9px]" style={{ ["--r1" as string]: r === "common" ? "#a7b0bd" : r === "rare" ? "#8fd0ff" : r === "epic" ? "#d8b4ff" : "#ffe39a", ["--r2" as string]: r === "common" ? "#5d6673" : r === "rare" ? "#2a6fd6" : r === "epic" ? "#7b3fe4" : "#b9780f" }} />
                <span className="w-10">{RARITY_NAMES[r]}</span>
                <span className="ml-auto tabular-nums text-muted">{(state.settings.effectiveRates[r] * 100).toFixed(state.settings.effectiveRates[r] < 0.1 ? 1 : 0)}%</span>
                <span className="w-12 text-right text-[11px] text-faint">{state.cards.filter((c) => c.rarity === r).length}종</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-faint">공개된 카드가 있는 등급만으로 나눈 실제 확률입니다. 결과는 서버에서 정해집니다.</p>
          <p className="mt-1 text-[11px] text-faint">중복 카드는 강화 조각이 되고, 최대 레벨 카드의 중복은 코인 {state.settings.dupRefund}을 돌려받습니다.</p>
        </section>
      </aside>
    </div>
  );
}
