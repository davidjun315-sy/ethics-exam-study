"use client";

import { useState } from "react";
import { DEFAULT_DUEL_RULES, DUEL_RULE_LIMITS, duelRulesError, type DuelRules } from "@/lib/game/duel";
import { simulateBalance, type BalanceReport } from "@/lib/game/duelSim";
import { RARITIES, RARITY_NAMES, type Rarity } from "@/lib/game/rules";
import { quizApi as api } from "@/lib/quiz/client";

type Scalar = Exclude<keyof DuelRules, "cost" | "rarityBoost">;
const FIELDS: { k: Scalar; label: string; step?: number; hint?: string }[] = [
  { k: "heroHp", label: "논자 신념 (시작 체력)" },
  { k: "maxMana", label: "최대 사유력" },
  { k: "fieldSize", label: "필드 칸 수", hint: "휴대폰 화면 폭" },
  { k: "handSize", label: "손패 최대" },
  { k: "deckSize", label: "덱 크기" },
  { k: "turnLimit", label: "제한 턴 (양쪽 합, 짝수)", step: 2 },
  { k: "atkDiv", label: "공격 변환 계수 (카드 공격 ÷)", step: 0.5, hint: "작을수록 대전 공격력이 큼" },
  { k: "hpDiv", label: "체력 변환 계수 (카드 체력 ÷)", step: 1, hint: "작을수록 대전 체력이 큼" },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 관리자: 논쟁 대전 조정값 + 저장 전 균형 시뮬레이션 (브라우저에서 컴퓨터끼리) */
export function DuelRulesForm({ initial, ready }: { initial: DuelRules; ready: boolean }) {
  const [r, setR] = useState<DuelRules>(initial);
  const [saved, setSaved] = useState<DuelRules>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState<BalanceReport | null>(null);
  const [simming, setSimming] = useState(false);
  const problem = duelRulesError(r);
  const changed = JSON.stringify(r) !== JSON.stringify(saved);

  const set = (next: DuelRules) => {
    setR(next);
    setSim(null);
    setMsg(null);
  };
  const num = (v: string) => (v === "" ? NaN : Number(v));
  const per = (key: "cost" | "rarityBoost", rarity: Rarity, v: number) => set({ ...r, [key]: { ...r[key], [rarity]: v } });

  function runSim() {
    setSimming(true);
    setSim(null);
    // 화면이 '계산 중'을 그린 다음 계산 (1~2초 동안 화면이 멈춤)
    setTimeout(() => {
      try {
        setSim(simulateBalance(r, 100));
      } finally {
        setSimming(false);
      }
    }, 30);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/game/duel-rules", "PUT", r);
      setSaved(r);
      setMsg({ ok: true, text: "논쟁 대전 조정값을 저장했습니다. 새로 시작하는 대전부터 적용됩니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const tone = (ok: boolean) => (ok ? "text-ok" : "text-warn");
  return (
    <section className="card space-y-4 p-4" aria-labelledby="duel-rules-h">
      <div>
        <h2 id="duel-rules-h" className="text-[15px] font-bold">논쟁 대전 조정값</h2>
        <p className="mt-0.5 text-xs text-muted">대전 능력치 = 카드 능력치 × 등급 보정 ÷ 변환 계수. 진행 중인 대전은 시작할 때의 규칙으로 끝납니다.</p>
      </div>
      {!ready && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          저장하려면 Supabase SQL Editor 에서 <code>supabase/migrations/013_game_duel_rules.sql</code> 을 먼저 실행하세요. 지금은 기본값으로 대전합니다 (시뮬레이션은 바로 해 볼 수 있습니다).
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-4">
        {FIELDS.map(({ k, label, step, hint }) => {
          const [lo, hi] = DUEL_RULE_LIMITS[k];
          return (
            <label key={k} className="block">
              <span className="label">{label}</span>
              <input type="number" min={lo} max={hi} step={step ?? 1} className="input" value={Number.isNaN(r[k]) ? "" : r[k]} onChange={(e) => set({ ...r, [k]: num(e.target.value) })} />
              <span className="mt-0.5 block text-[10px] text-faint">
                {lo}~{hi}
                {hint ? ` · ${hint}` : ""}
              </span>
            </label>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["cost", "rarityBoost"] as const).map((key) => (
          <div key={key}>
            <div className="label">{key === "cost" ? "등급별 비용 (사유력)" : "등급별 대전 보정 (×)"}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {RARITIES.map((x) => (
                <label key={x} className="block">
                  <span className="text-xs text-muted">{RARITY_NAMES[x]}</span>
                  <input
                    type="number"
                    step={key === "cost" ? 1 : 0.05}
                    min={DUEL_RULE_LIMITS[key][0]}
                    max={DUEL_RULE_LIMITS[key][1]}
                    className="input"
                    value={Number.isNaN(r[key][x]) ? "" : r[key][x]}
                    onChange={(e) => per(key, x, num(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">균형 시뮬레이션</h3>
          <span className="text-[11px] text-faint">표준 사상가 덱으로 컴퓨터끼리 대진마다 100판</span>
          <button type="button" className="btn ml-auto px-3 py-1.5 text-sm" disabled={simming || Boolean(problem)} onClick={runSim}>
            {simming ? "계산 중…" : "시뮬레이션"}
          </button>
        </div>
        {sim && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5" aria-label="시뮬레이션 결과">
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] text-muted">선공 승률 (40~60% 권장)</dt>
              <dd className={`text-lg font-black tabular-nums ${tone(sim.firstWin >= 0.4 && sim.firstWin <= 0.6)}`}>{pct(sim.firstWin)}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] text-muted">전설 덱 vs 일반 덱 (65% 이상)</dt>
              <dd className={`text-lg font-black tabular-nums ${tone(sim.legendVsCommon >= 0.65)}`}>{pct(sim.legendVsCommon)}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] text-muted">어려움 vs 쉬움 (60% 이상)</dt>
              <dd className={`text-lg font-black tabular-nums ${tone(sim.hardVsEasy >= 0.6)}`}>{pct(sim.hardVsEasy)}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] text-muted">평균 길이 (양쪽 합)</dt>
              <dd className={`text-lg font-black tabular-nums ${tone(sim.avgTurns >= 12 && sim.avgTurns <= 32)}`}>{sim.avgTurns.toFixed(1)}턴</dd>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <dt className="text-[11px] text-muted">제한 턴 종료</dt>
              <dd className={`text-lg font-black tabular-nums ${tone(sim.timeout <= 0.05 && sim.stuck === 0)}`}>{pct(sim.timeout)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary px-5" disabled={busy || !changed || Boolean(problem) || !ready} onClick={save}>
          {busy ? "저장 중…" : "조정값 저장"}
        </button>
        <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => set(DEFAULT_DUEL_RULES)}>
          기본값으로
        </button>
        {problem && <span className="text-sm text-danger">{problem}</span>}
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
