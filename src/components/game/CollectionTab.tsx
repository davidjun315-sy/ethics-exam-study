"use client";

import { useState } from "react";
import type { CardView, GameState, OwnedCard } from "@/lib/game/data";
import { canFuseCard, RARITIES, RARITY_NAMES, ROLE_COLOR, ROLES, type SkillEffect } from "@/lib/game/rules";
import { TRADITIONS } from "@/lib/traditions";
import { PhilosopherCard } from "./PhilosopherCard";
import { byStrength, gemStyle } from "./GameApp";

type Sort = "rarity" | "level" | "name" | "count";

/** 카드 도감: 사상가별로 묶어 가장 강한 카드를 대표로 보여 준다. 누르면 그 사상가의 보유 카드 전체 */
export function CollectionTab({ state, onOpen }: { state: GameState; onOpen: (philosopherId: string) => void }) {
  const [tradition, setTradition] = useState<string>("전체");
  const [sort, setSort] = useState<Sort>("rarity");
  const [show, setShow] = useState<"all" | "owned" | "locked">("all");
  const [role, setRole] = useState<SkillEffect | "all">("all");
  const byPh = new Map<string, OwnedCard[]>();
  for (const o of state.owned) byPh.set(o.philosopherId, [...(byPh.get(o.philosopherId) ?? []), o]);
  for (const list of byPh.values()) list.sort(byStrength);
  // 공개 사상가 + (공개가 내려갔지만) 보유한 사상가
  const all: (CardView & { copies: OwnedCard[] })[] = [
    ...state.cards.map((c) => ({ ...c, copies: byPh.get(c.philosopherId) ?? [] })),
    ...[...byPh.entries()].filter(([id]) => !state.cards.some((c) => c.philosopherId === id)).map(([, copies]) => ({ ...copies[0], copies })),
  ];
  const traditions = ["전체", ...TRADITIONS.filter((t) => all.some((c) => c.tradition === t)), ...(all.some((c) => !TRADITIONS.includes(c.tradition as never)) ? ["미분류"] : [])];
  const best = (c: { copies: OwnedCard[] }) => c.copies[0];
  const rank = (c: { copies: OwnedCard[] }) => (best(c) ? RARITIES.indexOf(best(c).rarity) : -1);
  // 합성 가능: 같은 사상가 · 같은 등급 카드가 합성 장수만큼 (대표·잠금 카드는 재료 불가)
  const canFuse = (o: OwnedCard) => canFuseCard(o, state.owned, state.featuredId, state.settings.fusionCount);
  const list = all
    .filter((c) => tradition === "전체" || c.tradition === tradition)
    .filter((c) => role === "all" || c.skillEffect === role)
    .filter((c) => (show === "owned" ? c.copies.length : show === "locked" ? !c.copies.length : true))
    .sort((a, b) => {
      if (Boolean(b.copies.length) !== Boolean(a.copies.length)) return b.copies.length ? 1 : -1;
      if (sort === "level") return (best(b)?.level ?? 0) - (best(a)?.level ?? 0) || rank(b) - rank(a) || a.name.localeCompare(b.name);
      if (sort === "count") return b.copies.length - a.copies.length || rank(b) - rank(a) || a.name.localeCompare(b.name);
      if (sort === "name") return a.name.localeCompare(b.name);
      return rank(b) - rank(a) || (best(b)?.level ?? 0) - (best(a)?.level ?? 0) || a.name.localeCompare(b.name);
    });

  return (
    <section className="space-y-3">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex flex-wrap gap-1">
          {traditions.map((t) => (
            <button key={t} type="button" onClick={() => setTradition(t)} className={`rounded-full border px-3 py-1 text-xs ${tradition === t ? "border-navy bg-navy-soft font-semibold text-navy" : "border-line text-muted hover:border-navy/40"}`}>
              {t}
            </button>
          ))}
        </div>
        {/* 성향 필터 */}
        <div className="flex flex-wrap gap-1" role="group" aria-label="성향">
          <button type="button" onClick={() => setRole("all")} className={`rounded-full border px-2.5 py-1 text-xs ${role === "all" ? "border-navy bg-navy-soft font-semibold text-navy" : "border-line text-muted"}`}>
            모든 성향
          </button>
          {(Object.keys(ROLES) as SkillEffect[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setRole(role === e ? "all" : e)}
              aria-pressed={role === e}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${role === e ? "border-navy bg-navy-soft font-semibold text-navy" : "border-line text-muted hover:border-navy/40"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: ROLE_COLOR[e] }} />
              {ROLES[e].name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <select className="input !w-auto !py-1 text-xs" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="보기">
            <option value="all">전체 철학자</option>
            <option value="owned">보유</option>
            <option value="locked">미획득</option>
          </select>
          <select className="input !w-auto !py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="rarity">등급순</option>
            <option value="level">레벨순</option>
            <option value="count">보유 수량순</option>
            <option value="name">이름순</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted">
        보유 카드 {state.owned.length}장 · 철학자 {byPh.size}/{state.cards.length}명 · 카드를 누르면 그 철학자의 모든 등급·보유 카드와 대표 설정이 열립니다.
      </p>
      {list.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">조건에 맞는 카드가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((c) => {
            const b = best(c);
            const featured = c.copies.some((o) => o.cardId === state.featuredId);
            const fusable = c.copies.some(canFuse);
            return (
              <div key={c.philosopherId}>
                {/* 보유 카드는 반짝임·테두리 빛까지 (화면 밖 카드는 PhilosopherCard 가 알아서 멈춤), 미획득은 가볍게 */}
                <PhilosopherCard fx={b ? "full" : "lite"}
                  card={c}
                  rarity={b?.rarity ?? "common"}
                  level={b?.level ?? 1}
                  stats={b ? { atk: b.atk, hp: b.hp } : undefined}
                  locked={!b}
                  featured={featured && b?.cardId === state.featuredId}
                  maxLevel={state.settings.maxLevel}
                  count={c.copies.length}
                  onClick={() => onOpen(c.philosopherId)}
                  badge={fusable ? <span className="rounded-full bg-ok px-2 py-0.5 text-[10px] font-bold text-white shadow">합성 가능</span> : undefined}
                />
                {c.copies.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-1" aria-label="보유 등급">
                    {RARITIES.map((r) => {
                      const n = c.copies.filter((o) => o.rarity === r).length;
                      return n ? (
                        <span key={r} className="flex items-center gap-0.5 text-[10px] text-muted" title={`${RARITY_NAMES[r]} ${n}장`}>
                          <span className="pcard-gem inline-block text-[6px]" style={gemStyle(r)} />
                          {n}
                        </span>
                      ) : null;
                    })}
                    {featured && b?.cardId !== state.featuredId && <span className="rounded bg-[#ffd36b] px-1 text-[9px] font-bold text-[#3a2600]">대표 보유</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
