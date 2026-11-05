"use client";

import { useState } from "react";
import type { GameState } from "@/lib/game/data";
import { canUpgrade, statsAt } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { PhilosopherCard } from "./PhilosopherCard";
import { Coins } from "./GameApp";

export function UpgradeTab({ state, reload }: { state: GameState; reload: () => Promise<GameState> }) {
  const sorted = [...state.owned].sort((a, b) => {
    const ua = canUpgrade(a, state.coins, state.settings.maxLevel).ok ? 1 : 0;
    const ub = canUpgrade(b, state.coins, state.settings.maxLevel).ok ? 1 : 0;
    return ub - ua || b.shards - a.shards || b.level - a.level;
  });
  const [selected, setSelected] = useState<string | null>(sorted[0]?.philosopherId ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [anim, setAnim] = useState(0);
  const card = state.owned.find((o) => o.philosopherId === selected) ?? null;

  if (!state.owned.length) return <p className="card p-8 text-center text-sm text-muted">보유한 카드가 없습니다. 카드 뽑기로 첫 철학자를 영입하세요.</p>;

  const check = card ? canUpgrade(card, state.coins, state.settings.maxLevel) : null;
  const now = card ? statsAt({ atk: card.baseAtk, hp: card.baseHp }, card.level) : null;
  const next = card && card.level < state.settings.maxLevel ? statsAt({ atk: card.baseAtk, hp: card.baseHp }, card.level + 1) : null;

  async function upgrade() {
    if (!card || busy) return;
    setBusy(true);
    setMsg(null);
    const requestId = crypto.randomUUID();
    try {
      const r = await quizApi<{ level: number }>("/api/game/upgrade", "POST", { philosopherId: card.philosopherId, requestId }).catch((e) => {
        if (e instanceof TypeError) return quizApi<{ level: number }>("/api/game/upgrade", "POST", { philosopherId: card.philosopherId, requestId });
        throw e;
      });
      await reload();
      setAnim((n) => n + 1);
      setMsg({ ok: true, text: `${card.name} Lv.${r.level} 달성!` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">보유 카드</h2>
          <Coins value={state.coins} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {sorted.map((o) => {
            const ok = canUpgrade(o, state.coins, state.settings.maxLevel).ok;
            return (
              <div key={o.philosopherId} className={`rounded-[16px] p-0.5 ${selected === o.philosopherId ? "ring-2 ring-navy" : ""}`}>
                <PhilosopherCard
                  card={o}
                  level={o.level}
                  maxLevel={state.settings.maxLevel}
                  shards={o.shards}
                  shardsNeeded={o.upgrade?.shards ?? null}
                  tilt={false}
                  onClick={() => {
                    setSelected(o.philosopherId);
                    setMsg(null);
                  }}
                  badge={ok ? <span className="rounded-full bg-ok px-1.5 py-0.5 text-[9px] font-bold text-white">UP</span> : undefined}
                />
              </div>
            );
          })}
        </div>
      </section>

      {card && (
        <section className="card space-y-4 p-4 lg:sticky lg:top-20 lg:self-start">
          <div className="mx-auto w-48">
            <div key={anim} className={anim ? "rounded-[14px] upgrade-glow" : ""}>
              <PhilosopherCard card={card} level={card.level} maxLevel={state.settings.maxLevel} shards={card.shards} shardsNeeded={card.upgrade?.shards ?? null} tilt={false} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-black">{card.name}</div>
            <div className="text-sm text-muted">
              Lv.<span key={`lv-${anim}`} className={anim ? "level-pop font-bold text-ink" : "font-bold text-ink"}>{card.level}</span>
              {next && <span> → Lv.{card.level + 1}</span>} / 최대 {state.settings.maxLevel}
            </div>
          </div>
          {next && now ? (
            <>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1 text-muted">공격력</td><td className="text-right tabular-nums">{now.atk}</td><td className="w-8 text-center text-faint">→</td><td className="text-right font-bold tabular-nums text-ok">{next.atk}</td></tr>
                  <tr><td className="py-1 text-muted">체력</td><td className="text-right tabular-nums">{now.hp}</td><td className="text-center text-faint">→</td><td className="text-right font-bold tabular-nums text-ok">{next.hp}</td></tr>
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className={`rounded-lg p-2 ${card.shards >= card.upgrade!.shards ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
                  강화 조각 <b className="tabular-nums">{card.shards}/{card.upgrade!.shards}</b>
                </div>
                <div className={`rounded-lg p-2 ${state.coins >= card.upgrade!.coins ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
                  코인 <b className="tabular-nums">{card.upgrade!.coins}</b>
                </div>
              </div>
              <button type="button" className="btn-primary w-full py-3 text-base font-bold" disabled={!check?.ok || busy} onClick={upgrade}>
                {busy ? "강화 중…" : check?.ok ? `강화 (확정 성공)` : `강화 불가 · ${check?.reason}`}
              </button>
              <p className="text-center text-[11px] text-faint">중복 카드를 뽑으면 강화 조각이 쌓입니다. 강화는 실패하지 않습니다.</p>
            </>
          ) : (
            <p className="rounded-lg bg-warn-soft p-3 text-center text-sm font-semibold text-warn">최대 레벨에 도달한 카드입니다</p>
          )}
          {msg && <p className={`text-center text-sm font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
        </section>
      )}
    </div>
  );
}
