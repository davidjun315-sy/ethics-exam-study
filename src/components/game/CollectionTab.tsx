"use client";

import { useState } from "react";
import type { CardView, GameState, OwnedCard } from "@/lib/game/data";
import { RARITIES } from "@/lib/game/rules";
import { TRADITIONS } from "@/lib/traditions";
import { PhilosopherCard } from "./PhilosopherCard";

type Sort = "rarity" | "level" | "name";

export function CollectionTab({ state, onOpen }: { state: GameState; onOpen: (id: string) => void }) {
  const [tradition, setTradition] = useState<string>("전체");
  const [sort, setSort] = useState<Sort>("rarity");
  const [show, setShow] = useState<"all" | "owned" | "locked">("all");
  const owned = new Map(state.owned.map((o) => [o.philosopherId, o]));
  // 공개 카드 + (공개가 내려갔지만) 보유한 카드
  const all: (CardView & { own?: OwnedCard })[] = [
    ...state.cards.map((c) => ({ ...c, own: owned.get(c.philosopherId) })),
    ...state.owned.filter((o) => !state.cards.some((c) => c.philosopherId === o.philosopherId)).map((o) => ({ ...o, own: o })),
  ];
  const traditions = ["전체", ...TRADITIONS.filter((t) => all.some((c) => c.tradition === t)), ...(all.some((c) => !TRADITIONS.includes(c.tradition as never)) ? ["미분류"] : [])];
  const rank = (c: CardView) => RARITIES.indexOf(c.rarity);
  const list = all
    .filter((c) => tradition === "전체" || c.tradition === tradition)
    .filter((c) => (show === "owned" ? c.own : show === "locked" ? !c.own : true))
    .sort((a, b) => {
      if (Boolean(b.own) !== Boolean(a.own)) return b.own ? 1 : -1;
      if (sort === "level") return (b.own?.level ?? 0) - (a.own?.level ?? 0) || rank(b) - rank(a) || a.name.localeCompare(b.name);
      if (sort === "name") return a.name.localeCompare(b.name);
      return rank(b) - rank(a) || (b.own?.level ?? 0) - (a.own?.level ?? 0) || a.name.localeCompare(b.name);
    });
  const canUp = (o?: OwnedCard) => Boolean(o?.upgrade && o.shards >= o.upgrade.shards && state.coins >= o.upgrade.coins);

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
        <div className="ml-auto flex gap-2">
          <select className="input !w-auto !py-1 text-xs" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="보기">
            <option value="all">전체 카드</option>
            <option value="owned">보유 카드</option>
            <option value="locked">미획득</option>
          </select>
          <select className="input !w-auto !py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
            <option value="rarity">등급순</option>
            <option value="level">레벨순</option>
            <option value="name">이름순</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted">
        보유 {state.owned.length} / 공개 {state.cards.length}장 · 카드를 누르면 상세 정보와 대표 카드 설정이 열립니다.
      </p>
      {list.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">조건에 맞는 카드가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.map((c) => (
            <PhilosopherCard
              key={c.philosopherId}
              card={c}
              level={c.own?.level ?? 1}
              locked={!c.own}
              featured={state.featuredId === c.philosopherId}
              maxLevel={state.settings.maxLevel}
              shards={c.own?.shards}
              shardsNeeded={c.own ? (c.own.upgrade?.shards ?? null) : undefined}
              onClick={() => onOpen(c.philosopherId)}
              badge={canUp(c.own) ? <span className="rounded-full bg-ok px-2 py-0.5 text-[10px] font-bold text-white shadow">강화 가능</span> : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
