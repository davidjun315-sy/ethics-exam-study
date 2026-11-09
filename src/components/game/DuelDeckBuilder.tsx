"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { GameState } from "@/lib/game/data";
import { pickDuelDeck } from "@/lib/game/duelDeck";
import { RESONANCE } from "@/lib/game/duel";
import { RARITIES, RARITY_NAMES, type Rarity } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { DeckSummary, duelCardOf, HandCard, shortTradition } from "./DuelParts";

type Filter = "all" | Rarity | string;

/** 논쟁 대전 덱 만들기: 보유 카드에서 최대 덱 크기만큼 고른다. 모자란 칸은 대전 때 강한 카드로 자동 */
export function DuelDeckBuilder({ state, onClose, onSaved }: { state: GameState; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const rules = state.settings.duelRules;
  const size = rules.deckSize;
  const [picked, setPicked] = useState<string[]>(state.duelDeck);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const owned = useMemo(
    () => [...state.owned].sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.level - a.level || a.name.localeCompare(b.name)),
    [state.owned],
  );
  const cardOf = useMemo(() => new Map(owned.map((o) => [o.cardId, duelCardOf(o, rules, o.cardId)])), [owned, rules]);
  // 실제로 대전에 들어갈 덱 (고른 카드 + 자동으로 채울 카드)
  const deck = useMemo(() => pickDuelDeck(owned, picked, size).map((o, i) => duelCardOf(o, rules, `d${i}`)), [owned, picked, size, rules]);
  const autoCount = Math.max(0, deck.length - picked.length);
  const traditions = [...new Set(owned.map((o) => o.tradition))].filter((t) => RESONANCE[t]);
  const shown = owned.filter((o) => filter === "all" || o.rarity === filter || o.tradition === filter);
  const dirty = JSON.stringify(picked) !== JSON.stringify(state.duelDeck);

  function toggle(id: string) {
    setMsg(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= size ? p : [...p, id]));
    if (!picked.includes(id) && picked.length >= size) setMsg({ ok: false, text: `덱은 ${size}장까지입니다. 다른 카드를 먼저 빼세요.` });
  }
  function autoFill() {
    setMsg(null);
    // 같은 카드는 한 번만 (보유 카드가 덱 크기보다 적으면 나머지는 대전 때 자동으로 반복)
    const ids = [...new Set(pickDuelDeck(owned, picked, size).map((o) => o.cardId))].slice(0, size);
    setPicked(ids);
  }
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await quizApi("/api/game/duel-deck", "POST", { ids: picked });
      await onSaved();
      setMsg({ ok: true, text: picked.length ? "덱을 저장했습니다" : "자동 덱으로 되돌렸습니다" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const chip = (k: Filter, label: string) => (
    <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${filter === k ? "border-navy bg-navy text-on-accent" : "border-line text-muted"}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="card sticky top-[3.75rem] z-10 flex items-center gap-2 px-3 py-2 sm:px-4 shadow-soft sm:top-16">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black">덱 만들기</h2>
            <p className="text-xs text-muted">
              <b className="text-ink tabular-nums">{picked.length}</b> / {size}장
              {autoCount > 0 && <> · 나머지 {autoCount}장 자동</>}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button type="button" className="btn px-3 py-2 text-sm" onClick={onClose}>
              {dirty ? "취소" : "닫기"}
            </button>
            <button type="button" className="btn-primary px-4 py-2 text-sm font-bold" disabled={busy || !dirty} onClick={save}>
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
      </div>
      <section className="card space-y-3 p-4">
        <DeckSummary deck={deck} rules={rules} />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" className="rounded-lg border border-line px-2.5 py-1.5 hover:bg-surface-2" onClick={autoFill} disabled={picked.length >= Math.min(size, owned.length)}>
            남은 칸 자동으로 채우기
          </button>
          <button type="button" className="rounded-lg border border-line px-2.5 py-1.5 hover:bg-surface-2" onClick={() => setPicked([])} disabled={!picked.length}>
            모두 빼기 (자동 덱)
          </button>
          {msg && <span className={msg.ok ? "text-ok" : "text-danger"} role="status">{msg.text}</span>}
        </div>
        {owned.length < size && <p className="text-[11px] text-faint">보유 카드가 {owned.length}장이라 대전 때 같은 카드를 다시 넣어 {size}장을 채웁니다 (같은 사상가 최대 3장부터).</p>}
      </section>

      <section className="space-y-3">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden">
          {chip("all", `전체 ${owned.length}`)}
          {RARITIES.filter((r) => owned.some((o) => o.rarity === r)).map((r) => chip(r, RARITY_NAMES[r]))}
          {traditions.map((t) => chip(t, shortTradition(t)))}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6" aria-label="보유 카드">
          {shown.map((o) => {
            const i = picked.indexOf(o.cardId);
            const c = cardOf.get(o.cardId)!;
            return (
              <button
                key={o.cardId}
                type="button"
                onClick={() => toggle(o.cardId)}
                aria-pressed={i >= 0}
                aria-label={`${o.name} ${RARITY_NAMES[o.rarity]} Lv.${o.level} · 비용 ${c.cost} · ${c.atk}/${c.hp}`}
                className={`relative rounded-xl text-left transition-transform ${i >= 0 ? "ring-2 ring-navy ring-offset-2 ring-offset-bg" : "opacity-80 hover:opacity-100"}`}
              >
                <HandCard c={c} playable full />
                <span className="absolute left-1 top-[2.6rem] rounded bg-black/60 px-1 text-[9px] text-white">
                  Lv.{o.level} · {shortTradition(o.tradition)}
                </span>
                {i >= 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-navy text-[11px] font-black text-on-accent shadow">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{i + 1}번째</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
