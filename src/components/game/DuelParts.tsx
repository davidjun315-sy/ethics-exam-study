"use client";

import { Zap } from "lucide-react";
import type { OwnedCard } from "@/lib/game/data";
import { EFFECT_TEXT, effectPower, RESONANCE, toDuelCard, type DuelCardDef, type DuelRules } from "@/lib/game/duel";
import { RARITY_NAMES, type Rarity } from "@/lib/game/rules";

export const FRAME: Record<Rarity, string> = {
  common: "ring-[#9aa4b5]",
  rare: "ring-[#5aa2ff]",
  epic: "ring-[#b07cff]",
  legendary: "ring-[#ffc94a]",
};

/** 보유 카드 → 대전 카드 (서버 startDuel 과 같은 변환) */
export const duelCardOf = (o: OwnedCard, rules: DuelRules, uid: string): DuelCardDef =>
  toDuelCard(
    { uid, cardId: o.cardId, philosopherId: o.philosopherId, name: o.name, tradition: o.tradition, rarity: o.rarity, level: o.level, effect: o.skillEffect, skillName: o.skillName, artUrl: o.artUrl, statAtk: o.atk, statHp: o.hp },
    rules,
  );

export const shortTradition = (t: string) => t.replace("윤리", "");

export function HandCard({ c, playable, compact = false, full = false }: { c: DuelCardDef; playable: boolean; compact?: boolean; full?: boolean }) {
  const power = effectPower(c);
  return (
    <div className={`relative flex flex-col overflow-hidden rounded-xl bg-[#1a2234] text-white ring-2 ${FRAME[c.rarity]} ${compact || full ? "w-full" : "w-[5.5rem] sm:w-[6.25rem]"} ${playable ? "" : "opacity-55"}`}>
      <div className={`relative ${compact ? "h-12" : full ? "h-16" : "h-11 sm:h-16"} bg-[#24304a]`}>
        {c.artUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.artUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        )}
        <span className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#3b6fd8] text-[13px] font-black shadow ring-2 ring-white/70">{c.cost}</span>
        <span className="absolute right-1 top-1 rounded bg-black/55 px-1 text-[9px]">{RARITY_NAMES[c.rarity]}</span>
      </div>
      <div className="flex flex-1 flex-col px-1.5 pb-1.5 pt-1">
        <span className="truncate text-[11px] font-bold">{c.name}</span>
        {!compact && (
          <span className="mt-0.5 line-clamp-2 min-h-[1.9rem] text-[9.5px] leading-[1.15rem] text-white/70">
            <Zap className="mr-0.5 inline h-2.5 w-2.5 text-[#ffd36b]" aria-hidden />
            {EFFECT_TEXT[c.effect](power).replace("등장 시: ", "")}
          </span>
        )}
        <span className="mt-auto flex justify-between text-[12px] font-black tabular-nums">
          <span className="text-[#ffb0a0]">{c.atk}</span>
          <span className="text-[#9ff0bf]">{c.hp}</span>
        </span>
      </div>
    </div>
  );
}

/** 덱 요약: 비용 분포 막대 + 분야(공명) 분포 */
export function DeckSummary({ deck, rules }: { deck: DuelCardDef[]; rules: DuelRules }) {
  const costs = [...new Set(Object.values(rules.cost))].sort((a, b) => a - b);
  const byCost = costs.map((c) => deck.filter((x) => x.cost === c).length);
  const top = Math.max(1, ...byCost);
  const trads = Object.keys(RESONANCE).map((t) => ({ t, n: deck.filter((c) => c.tradition === t).length }));
  const other = deck.filter((c) => !RESONANCE[c.tradition]).length;
  const avg = deck.length ? deck.reduce((s, c) => s + c.cost, 0) / deck.length : 0;
  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
      <div>
        <div className="mb-1 text-[11px] font-semibold text-muted">비용 분포 · 평균 {avg.toFixed(1)}</div>
        <div className="flex h-[4.75rem] items-end gap-1.5" aria-label="비용 분포">
          {costs.map((c, i) => (
            <div key={c} className="flex w-9 flex-col items-center gap-0.5">
              <span className="text-[10px] font-bold tabular-nums text-muted">{byCost[i]}</span>
              <div className="w-full rounded-t bg-navy/80" style={{ height: `${(byCost[i] / top) * 40}px`, minHeight: byCost[i] ? 3 : 0 }} />
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#3b6fd8] text-[9px] font-black text-white">{c}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-semibold text-muted">분야 · 공명 (필드에 같은 분야 2명 이상)</div>
        <div className="flex flex-wrap gap-1.5">
          {trads.map(({ t, n }) => (
            <span key={t} className={`rounded-lg border px-2 py-1 text-[11px] leading-4 ${n >= 3 ? "border-ok/40 bg-ok/10 text-ink" : n >= 2 ? "border-line bg-surface-2 text-ink" : "border-line text-faint"}`} title={RESONANCE[t]}>
              <b>{shortTradition(t)} {n}</b> · {RESONANCE[t]}
            </span>
          ))}
          {other > 0 && <span className="rounded-lg border border-line px-2 py-1 text-[11px] text-faint">기타 {other}</span>}
        </div>
      </div>
    </div>
  );
}
