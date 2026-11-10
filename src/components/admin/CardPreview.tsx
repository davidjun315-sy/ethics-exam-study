"use client";

import { useState } from "react";
import type { CardView } from "@/lib/game/data";
import { RARITIES, RARITY_NAMES } from "@/lib/game/rules";
import { CardBack, PhilosopherCard } from "@/components/game/PhilosopherCard";

export function CardPreview({ cards }: { cards: CardView[] }) {
  const [id, setId] = useState(cards[0]?.philosopherId ?? "");
  const card = cards.find((c) => c.philosopherId === id) ?? cards[0];
  if (!card) return <p className="card p-6 text-center text-sm text-muted">공개된 카드가 없습니다.</p>;
  return (
    <div className="space-y-6">
      <label className="block max-w-xs">
        <span className="label">사상가</span>
        <select className="input" value={card.philosopherId} onChange={(e) => setId(e.target.value)}>
          {cards.map((c) => (
            <option key={c.philosopherId} value={c.philosopherId}>{c.name}</option>
          ))}
        </select>
      </label>
      <section aria-label="크게 보기" className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {RARITIES.map((r) => (
          <div key={r} className="space-y-1.5">
            <div className="text-center text-xs font-semibold text-muted">{RARITY_NAMES[r]}</div>
            <PhilosopherCard card={card} rarity={r} level={r === "legendary" ? 5 : 2} maxLevel={5} />
          </div>
        ))}
      </section>
      <section aria-label="목록 크기" className="space-y-2">
        <h2 className="text-sm font-bold">도감·덱 목록 크기</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {RARITIES.map((r) => (
            <PhilosopherCard key={r} card={card} rarity={r} level={1} tilt={false} />
          ))}
          <PhilosopherCard card={card} rarity="common" locked tilt={false} />
          <CardBack />
        </div>
      </section>
    </div>
  );
}
