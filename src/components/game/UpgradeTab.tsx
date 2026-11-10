"use client";

import { useState } from "react";
import type { GameState, OwnedCard } from "@/lib/game/data";
import { canUpgrade, RARITY_NAMES, SHARDS_FOR_CARD, statsFor } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { PhilosopherCard } from "./PhilosopherCard";
import { byStrength, Coins } from "./GameApp";

/** 레벨업: 카드마다 레벨이 따로. 같은 사상가의 강화 조각 + 코인 (확정 성공). 등급 진화는 '카드 합성' 탭 */
export function UpgradeTab({ state, reload, initialCard }: { state: GameState; reload: () => Promise<GameState>; initialCard?: string | null }) {
  const bank = (o: OwnedCard) => state.shards[o.philosopherId] ?? 0;
  const ok = (o: OwnedCard) => canUpgrade({ level: o.level, shards: bank(o) }, state.coins, state.settings.maxLevel).ok;
  const sorted = [...state.owned].sort((a, b) => Number(ok(b)) - Number(ok(a)) || byStrength(a, b));
  const [selected, setSelected] = useState<string | null>(initialCard ?? sorted[0]?.cardId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [anim, setAnim] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const card = state.owned.find((o) => o.cardId === selected) ?? null;

  if (!state.owned.length) return <p className="card p-8 text-center text-sm text-muted">보유한 카드가 없습니다. 카드 뽑기로 첫 철학자를 영입하세요.</p>;

  const check = card ? canUpgrade({ level: card.level, shards: bank(card) }, state.coins, state.settings.maxLevel) : null;
  const next = card && card.level < state.settings.maxLevel ? statsFor({ atk: card.baseAtk, hp: card.baseHp }, card.rarity, card.level + 1, state.settings.rarityMult) : null;
  // 같은 사상가의 다른 카드 → 조각 (대표·잠금·이 카드 제외)
  const spare = card ? state.owned.filter((o) => o.philosopherId === card.philosopherId && o.cardId !== card.cardId && o.cardId !== state.featuredId && !o.locked).sort((a, b) => -byStrength(a, b)) : [];

  async function levelUp() {
    if (!card || busy) return;
    setBusy("up");
    setMsg(null);
    const requestId = crypto.randomUUID();
    const body = { cardId: card.cardId, requestId };
    try {
      const r = await quizApi<{ level: number }>("/api/game/upgrade", "POST", body).catch((e) => {
        if (e instanceof TypeError) return quizApi<{ level: number }>("/api/game/upgrade", "POST", body);
        throw e;
      });
      await reload();
      setAnim((n) => n + 1);
      setMsg({ ok: true, text: `${RARITY_NAMES[card.rarity]} ${card.name} Lv.${r.level} 달성!` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function toShards(o: OwnedCard) {
    setBusy(o.cardId);
    setMsg(null);
    try {
      const r = await quizApi<{ shardsGained: number; shards: number }>("/api/game/shards", "POST", { cardId: o.cardId });
      await reload();
      setMsg({ ok: true, text: `${RARITY_NAMES[o.rarity]} ${o.name} 카드를 조각 ${r.shardsGained}개로 바꿨습니다 (보유 ${r.shards}개)` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">보유 카드 <span className="font-normal text-muted">레벨업할 카드를 고르세요</span></h2>
          <Coins value={state.coins} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {sorted.map((o) => (
            <div key={o.cardId} className={`rounded-[16px] p-0.5 ${selected === o.cardId ? "ring-2 ring-navy" : ""}`}>
              <PhilosopherCard fx="lite"
                card={o}
                rarity={o.rarity}
                level={o.level}
                stats={{ atk: o.atk, hp: o.hp }}
                maxLevel={state.settings.maxLevel}
                shards={bank(o)}
                shardsNeeded={o.upgrade?.shards ?? null}
                featured={o.cardId === state.featuredId}
                locked2={o.locked}
                tilt={false}
                onClick={() => {
                  setSelected(o.cardId);
                  setMsg(null);
                  setConfirm(null);
                }}
                badge={ok(o) ? <span className="rounded-full bg-ok px-1.5 py-0.5 text-[9px] font-bold text-white">UP</span> : undefined}
              />
            </div>
          ))}
        </div>
      </section>

      {card && (
        <section className="card space-y-4 p-4 lg:sticky lg:top-20 lg:self-start">
          <div className="mx-auto w-44">
            <div key={anim} className={anim ? "rounded-[14px] upgrade-glow" : ""}>
              <PhilosopherCard card={card} rarity={card.rarity} level={card.level} stats={{ atk: card.atk, hp: card.hp }} maxLevel={state.settings.maxLevel} shards={bank(card)} shardsNeeded={card.upgrade?.shards ?? null} tilt={false} />
            </div>
          </div>
          <div className="text-center">
            <div className="text-lg font-black">{RARITY_NAMES[card.rarity]} {card.name}</div>
            <div className="text-sm text-muted">
              Lv.<span key={`lv-${anim}`} className={anim ? "level-pop font-bold text-ink" : "font-bold text-ink"}>{card.level}</span>
              {next && <span> → Lv.{card.level + 1}</span>} / 최대 {state.settings.maxLevel}
            </div>
          </div>
          {next ? (
            <>
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="py-1 text-muted">공격력</td><td className="text-right tabular-nums">{card.atk}</td><td className="w-8 text-center text-faint">→</td><td className="text-right font-bold tabular-nums text-ok">{next.atk}</td></tr>
                  <tr><td className="py-1 text-muted">체력</td><td className="text-right tabular-nums">{card.hp}</td><td className="text-center text-faint">→</td><td className="text-right font-bold tabular-nums text-ok">{next.hp}</td></tr>
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-2 text-center text-sm">
                <div className={`rounded-lg p-2 ${bank(card) >= card.upgrade!.shards ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
                  {card.name} 조각 <b className="tabular-nums">{bank(card)}/{card.upgrade!.shards}</b>
                </div>
                <div className={`rounded-lg p-2 ${state.coins >= card.upgrade!.coins ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
                  코인 <b className="tabular-nums">{card.upgrade!.coins}</b>
                </div>
              </div>
              <button type="button" className="btn-primary w-full py-3 text-base font-bold" disabled={!check?.ok || busy !== null} onClick={levelUp}>
                {busy === "up" ? "레벨업 중…" : check?.ok ? "레벨업 (확정 성공)" : `레벨업 불가 · ${check?.reason}`}
              </button>
            </>
          ) : (
            <p className="rounded-lg bg-warn-soft p-3 text-center text-sm font-semibold text-warn">최대 레벨입니다. 등급은 &apos;카드 합성&apos;으로 올릴 수 있어요.</p>
          )}
          <div className="border-t border-line pt-3">
            <h3 className="text-sm font-bold">조각 만들기</h3>
            <p className="mb-2 text-[11px] text-faint">{card.name}의 다른 카드를 강화 조각으로 바꿉니다 (일반 1 · 희귀 2 · 영웅 4 · 전설 8). 바꾼 카드는 사라져 합성에 쓸 수 없습니다.</p>
            {spare.length === 0 ? (
              <p className="text-xs text-muted">바꿀 수 있는 {card.name} 카드가 없습니다 (대표·잠금 카드는 제외).</p>
            ) : (
              <ul className="space-y-1">
                {spare.map((o) => (
                  <li key={o.cardId} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>{RARITY_NAMES[o.rarity]} Lv.{o.level}</span>
                    {state.deck.includes(o.cardId) && <span className="rounded bg-navy-soft px-1 text-[10px] text-navy">덱</span>}
                    {confirm === o.cardId ? (
                      <span className="ml-auto flex items-center gap-1">
                        <button type="button" className="btn-danger !px-2 !py-0.5 text-xs" disabled={busy !== null} onClick={() => toShards(o)}>조각 {SHARDS_FOR_CARD[o.rarity]}개로 바꾸기</button>
                        <button type="button" className="btn !px-2 !py-0.5 text-xs" onClick={() => setConfirm(null)}>취소</button>
                      </span>
                    ) : (
                      <button type="button" className="btn ml-auto !px-2 !py-0.5 text-xs" onClick={() => setConfirm(o.cardId)}>+{SHARDS_FOR_CARD[o.rarity]} 조각</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {msg && <p className={`text-center text-sm font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
        </section>
      )}
    </div>
  );
}
