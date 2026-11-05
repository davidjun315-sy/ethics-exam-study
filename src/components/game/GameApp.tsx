"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CardView, GameState, OwnedCard } from "@/lib/game/data";
import { quizApi } from "@/lib/quiz/client";
import { RARITY_NAMES, SKILL_EFFECTS, statsAt } from "@/lib/game/rules";
import { PhilosopherCard } from "./PhilosopherCard";
import { DrawTab } from "./DrawTab";
import { CollectionTab } from "./CollectionTab";
import { UpgradeTab } from "./UpgradeTab";
import { BattleTab } from "./BattleTab";

export type Tab = "draw" | "collection" | "upgrade" | "battle";
const TABS: { key: Tab; label: string }[] = [
  { key: "draw", label: "카드 뽑기" },
  { key: "collection", label: "카드 도감" },
  { key: "upgrade", label: "카드 강화" },
  { key: "battle", label: "배틀 아레나" },
];

export function Coins({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-3 py-1 text-sm font-bold tabular-nums text-warn ${className}`}>
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[9px] font-black text-white dark:text-[#0f141c]">C</span>
      {value.toLocaleString()}
    </span>
  );
}

/** 철학자 대난투: 네 탭이 같은 상태(코인·보유 카드)를 나눠 쓴다. 변경 후에는 서버에서 다시 읽는다 */
export function GameApp({ initial, initialTab }: { initial: GameState; initialTab: Tab }) {
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [detail, setDetail] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const s = await quizApi<GameState>("/api/game/state");
    setState(s);
    return s;
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `/quiz/game?tab=${t}`);
  };
  const owned = new Map(state.owned.map((o) => [o.philosopherId, o]));
  const upgradable = state.owned.filter((o) => o.upgrade && o.shards >= o.upgrade.shards && state.coins >= o.upgrade.coins).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link href="/quiz" className="text-xs text-muted hover:text-navy">← 윤리 퀴즈</Link>
          <h1 className="text-2xl font-black tracking-tight">철학자 대난투</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">보유 {state.owned.length}/{state.cards.length}</span>
          <Coins value={state.coins} />
        </div>
      </div>
      <nav role="tablist" className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go(t.key)}
            className={`relative rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors ${tab === t.key ? "bg-navy text-white dark:text-[#0f141c]" : "text-muted hover:bg-surface-2"}`}
          >
            {t.key === "battle" ? (
              <>
                <span className="sm:hidden">배틀</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
            {t.key === "upgrade" && upgradable > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{upgradable}</span>
            )}
          </button>
        ))}
      </nav>

      {state.cards.length === 0 ? (
        <section className="card p-8 text-center">
          <h2 className="text-lg font-bold">아직 공개된 카드가 없습니다</h2>
          <p className="mt-1 text-sm text-muted">카드 일러스트가 준비된 철학자부터 차례로 공개됩니다. 그동안 윤리 퀴즈로 코인을 모아 두세요.</p>
          <Link href="/quiz" className="btn-primary mt-4 inline-block px-5 py-2.5">윤리 퀴즈 풀러 가기</Link>
        </section>
      ) : tab === "draw" ? (
        <DrawTab state={state} reload={reload} onOpen={setDetail} />
      ) : tab === "collection" ? (
        <CollectionTab state={state} onOpen={setDetail} />
      ) : tab === "upgrade" ? (
        <UpgradeTab state={state} reload={reload} />
      ) : (
        <BattleTab state={state} reload={reload} goDraw={() => go("draw")} />
      )}

      {detail && (
        <CardDetail
          card={state.cards.find((c) => c.philosopherId === detail) ?? state.owned.find((o) => o.philosopherId === detail)!}
          owned={owned.get(detail) ?? null}
          featured={state.featuredId === detail}
          maxLevel={state.settings.maxLevel}
          onClose={() => setDetail(null)}
          onFeature={async () => {
            await quizApi("/api/game/featured", "POST", { philosopherId: detail });
            await reload();
          }}
          onUpgrade={() => {
            setDetail(null);
            go("upgrade");
          }}
        />
      )}
    </div>
  );
}

/** 카드 상세: 큰 일러스트 + 능력치·필살기 + 대표 설정 · 강화 · 학습 페이지 */
function CardDetail({
  card,
  owned,
  featured,
  maxLevel,
  onClose,
  onFeature,
  onUpgrade,
}: {
  card: CardView;
  owned: OwnedCard | null;
  featured: boolean;
  maxLevel: number;
  onClose: () => void;
  onFeature: () => Promise<void>;
  onUpgrade: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const level = owned?.level ?? 1;
  const now = statsAt({ atk: card.baseAtk, hp: card.baseHp }, level);
  const nextSt = owned && owned.level < maxLevel ? statsAt({ atk: card.baseAtk, hp: card.baseHp }, owned.level + 1) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${card.name} 카드 상세`} onClick={onClose}>
      <div className="card-enter max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,17rem)_1fr]">
          <div className="mx-auto w-full max-w-[17rem]">
            <PhilosopherCard card={card} level={level} locked={!owned} featured={featured} maxLevel={maxLevel} shards={owned?.shards} shardsNeeded={owned ? (owned.upgrade?.shards ?? null) : undefined} />
            {card.artBasis === "reconstruction" && <p className="mt-2 text-center text-[11px] text-faint">역사적 도상을 바탕으로 재구성한 일러스트{card.artNote ? ` · ${card.artNote}` : ""}</p>}
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-muted">{RARITY_NAMES[card.rarity]} · {card.tradition}</div>
                <h2 className="text-2xl font-black">{card.name}</h2>
                {card.originalName && <div className="text-sm text-muted">{card.originalName}</div>}
              </div>
              <button type="button" onClick={onClose} className="text-2xl leading-none text-faint hover:text-ink" aria-label="닫기">×</button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-muted">레벨</div><div className="text-lg font-bold">{owned ? `${owned.level}/${maxLevel}` : "-"}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-muted">공격력</div><div className="text-lg font-bold tabular-nums">{now.atk}{nextSt && <span className="ml-1 text-xs text-ok">→{nextSt.atk}</span>}</div></div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="text-[11px] text-muted">체력</div><div className="text-lg font-bold tabular-nums">{now.hp}{nextSt && <span className="ml-1 text-xs text-ok">→{nextSt.hp}</span>}</div></div>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs text-muted">필살기 · {SKILL_EFFECTS[card.skillEffect].name}</div>
              <div className="font-bold">✦ {card.skillName}</div>
              <p className="text-sm text-muted">{card.skillDesc || SKILL_EFFECTS[card.skillEffect].desc}</p>
              <p className="mt-1 text-[11px] text-faint">효과: {SKILL_EFFECTS[card.skillEffect].desc}</p>
            </div>
            {card.quote && (
              <figure className="rounded-lg bg-navy-soft/50 p-3">
                <blockquote className="text-[15px] font-medium">“{card.quote}”</blockquote>
                <figcaption className="mt-1 text-[11px] text-faint">게임을 위한 창작 대사 (원문 인용 아님)</figcaption>
              </figure>
            )}
            {owned && <p className="text-xs text-muted">지금까지 {owned.copies}번 획득 · 강화 조각 {owned.shards}개</p>}
            <div className="flex flex-wrap gap-2">
              {owned ? (
                <>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2"
                    disabled={busy || featured}
                    onClick={async () => {
                      setBusy(true);
                      setMsg(null);
                      try {
                        await onFeature();
                        setMsg("대표 카드로 설정했습니다. 윤리 퀴즈 메인에 표시됩니다.");
                      } catch (e) {
                        setMsg(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {featured ? "현재 대표 카드" : busy ? "설정 중…" : "대표 카드로 설정"}
                  </button>
                  {owned.upgrade && (
                    <button type="button" className="btn px-4 py-2" onClick={onUpgrade}>
                      강화하기
                    </button>
                  )}
                </>
              ) : (
                <span className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">카드 뽑기로 획득할 수 있습니다</span>
              )}
              <Link href={`/philosophers/${card.philosopherId}`} className="btn px-4 py-2">
                {card.name} 학습 페이지 →
              </Link>
            </div>
            {msg && <p className="text-sm text-ok">{msg}</p>}
            <p className="text-[11px] text-faint">카드의 능력치·필살기는 게임용이며 기출 분석의 학습 정보와는 별개입니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
