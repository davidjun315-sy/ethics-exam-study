"use client";

import { bankOf } from "@/lib/game/bank";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CardView, GameState, OwnedCard } from "@/lib/game/data";
import { quizApi } from "@/lib/quiz/client";
import { canFuseCard, fusionMaterials, nextRarity, RARITIES, RARITY_NAMES, SHARDS_FOR_CARD, SKILL_EFFECTS } from "@/lib/game/rules";
import { PhilosopherCard } from "./PhilosopherCard";
import { DrawTab } from "./DrawTab";
import { CollectionTab } from "./CollectionTab";
import { UpgradeTab } from "./UpgradeTab";
import { FusionTab } from "./FusionTab";
import { BattleTab } from "./BattleTab";
import { DuelTab } from "./DuelTab";
import { StageTab } from "./StageTab";

export type Tab = "draw" | "collection" | "upgrade" | "fusion" | "battle";
const TABS: { key: Tab; label: string; short: string }[] = [
  { key: "draw", label: "카드 뽑기", short: "뽑기" },
  { key: "collection", label: "카드 도감", short: "도감" },
  { key: "upgrade", label: "레벨업", short: "레벨업" },
  { key: "fusion", label: "카드 합성", short: "합성" },
  { key: "battle", label: "배틀 아레나", short: "배틀" },
];

export function Coins({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-3 py-1 text-sm font-bold tabular-nums text-warn ${className}`}>
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[9px] font-black text-on-accent">C</span>
      {value.toLocaleString()}
    </span>
  );
}

/** 보유 카드 정렬: 등급 높은 순 → 레벨 높은 순 */
export const byStrength = (a: OwnedCard, b: OwnedCard) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.level - a.level;

/** 철학자 대난투: 다섯 탭이 같은 상태(코인·보유 카드)를 나눠 쓴다. 변경 후에는 서버에서 다시 읽는다 */
export function GameApp({ initial, initialTab, initialBase, initialDetail }: { initial: GameState; initialTab: Tab; initialBase?: string | null; initialDetail?: string | null }) {
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<Tab>(initialTab);
  // 사상가 id (카드 상세). 주소로 받은 값은 도감에 있는 사상가일 때만
  const [detail, setDetail] = useState<string | null>(() =>
    initialDetail && (initial.cards.some((c) => c.philosopherId === initialDetail) || initial.owned.some((o) => o.philosopherId === initialDetail)) ? initialDetail : null,
  );
  const [fusionBase, setFusionBase] = useState<string | null>(initialBase ?? null);
  const [upgradeCard, setUpgradeCard] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const s = await quizApi<GameState>("/api/game/state");
    setState(s);
    return s;
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `/quiz/game?tab=${t}`);
  };
  const levelable = state.owned.filter((o) => o.upgrade && bankOf(state, o.philosopherId) >= o.upgrade.shards && state.coins >= o.upgrade.coins).length;
  // 합성 가능한 (사상가 · 등급) 묶음 수
  const fusable = new Set(state.owned.filter((o) => canFuseCard(o, state.owned, state.featuredId, state.settings.fusionCount)).map((o) => `${o.philosopherId}:${o.rarity}`)).size;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Link href="/quiz" className="text-xs text-muted hover:text-navy">← 윤리 퀴즈</Link>
          <h1 className="text-2xl font-black tracking-tight">철학자 대난투</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">보유 카드 {state.owned.length}장</span>
          <Coins value={state.coins} />
        </div>
      </div>
      <nav role="tablist" className="grid grid-cols-5 gap-1 rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => {
          const badge = t.key === "upgrade" ? levelable : t.key === "fusion" ? fusable : t.key === "draw" && state.freeDraw.available ? "무료" : 0;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => go(t.key)}
              className={`relative rounded-lg px-1 py-2.5 text-sm font-semibold transition-colors ${tab === t.key ? "bg-navy text-on-accent" : "text-muted hover:bg-surface-2"}`}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
              {badge ? (
                <span className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${badge === "무료" ? "bg-ok" : "bg-danger"}`}>{badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {state.cards.length === 0 && state.owned.length === 0 ? (
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
        <UpgradeTab state={state} reload={reload} initialCard={upgradeCard} />
      ) : tab === "fusion" ? (
        <FusionTab state={state} reload={reload} initialBase={fusionBase} />
      ) : (
        <ArenaTab state={state} reload={reload} goDraw={() => go("draw")} />
      )}

      {detail && (
        <PhilosopherSheet
          card={state.cards.find((c) => c.philosopherId === detail) ?? state.owned.find((o) => o.philosopherId === detail)!}
          copies={state.owned.filter((o) => o.philosopherId === detail).sort(byStrength)}
          state={state}
          reload={reload}
          onClose={() => {
            setDetail(null);
            // 주소의 detail 은 지워서 새로고침해도 다시 열리지 않게
            if (window.location.search.includes("detail=")) window.history.replaceState(null, "", `/quiz/game?tab=${tab}`);
          }}
          onLevelUp={(cardId) => {
            setDetail(null);
            setUpgradeCard(cardId);
            go("upgrade");
          }}
          onFuse={(cardId) => {
            setDetail(null);
            setFusionBase(cardId);
            go("fusion");
          }}
        />
      )}
    </div>
  );
}

/** 사상가 상세: 큰 일러스트 + 필살기·대사 + 이 사상가의 보유 카드 (등급·레벨별 한 장씩) */
export function PhilosopherSheet({
  card,
  copies,
  state,
  reload,
  onClose,
  onLevelUp,
  onFuse,
}: {
  card: CardView;
  copies: OwnedCard[];
  state: GameState;
  reload: () => Promise<GameState>;
  onClose: () => void;
  onLevelUp: (cardId: string) => void;
  onFuse: (cardId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(copies[0]?.cardId ?? null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const top = copies.find((c) => c.cardId === shown) ?? copies[0] ?? null;
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      await reload();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${card.name} 카드 상세`} onClick={onClose}>
      <div className="card-enter max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_1fr]">
          <div className="mx-auto w-full max-w-[15rem]">
            <PhilosopherCard card={card} rarity={top?.rarity ?? "common"} level={top?.level ?? 1} locked={!top} stats={top ? { atk: top.atk, hp: top.hp } : undefined} featured={top?.cardId === state.featuredId} maxLevel={state.settings.maxLevel} />
            {card.artBasis === "reconstruction" && <p className="mt-2 text-center text-[11px] text-faint">역사적 도상을 바탕으로 재구성한 일러스트{card.artNote ? ` · ${card.artNote}` : ""}</p>}
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-muted">
                  {card.tradition}
                  {card.role && <span className="ml-1.5 rounded bg-navy-soft px-1.5 py-0.5 text-[10px] text-navy">{card.role}</span>}
                </div>
                <h2 className="text-2xl font-black">{card.name}</h2>
                {card.originalName && <div className="text-sm text-muted">{card.originalName}</div>}
              </div>
              <button type="button" onClick={onClose} className="text-2xl leading-none text-faint hover:text-ink" aria-label="닫기">×</button>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="text-xs text-muted">필살기 · {SKILL_EFFECTS[card.skillEffect].name}</div>
              <div className="font-bold">✦ {card.skillName}</div>
              <p className="text-sm text-muted">{card.skillDesc || SKILL_EFFECTS[card.skillEffect].desc}</p>
            </div>
            {card.quote && (
              <figure className="rounded-lg bg-navy-soft/50 p-3">
                <blockquote className="text-[15px] font-medium">“{card.quote}”</blockquote>
                <figcaption className="mt-1 text-[11px] text-faint">게임을 위한 창작 대사 (원문 인용 아님)</figcaption>
              </figure>
            )}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <h3 className="text-sm font-bold">보유 카드 {copies.length}장</h3>
                <span className="text-xs text-muted">{state.settings.stonesUnified ? "강화석" : "강화 조각"} {bankOf(state, card.philosopherId)}개</span>
              </div>
              {copies.length === 0 ? (
                <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">아직 없습니다. 카드 뽑기에서 일반~전설 등급으로 나올 수 있어요.</p>
              ) : (
                <ul className="space-y-1.5">
                  {copies.map((c) => {
                    const featured = c.cardId === state.featuredId;
                    const sameRarity = fusionMaterials(c, state.owned, state.featuredId).length;
                    return (
                      <li key={c.cardId} className={`rounded-lg border p-2.5 ${shown === c.cardId ? "border-navy/50 bg-navy-soft/30" : "border-line"}`}>
                        <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left" onClick={() => setShown(c.cardId)}>
                          <span className="pcard-gem inline-block text-[8px]" style={gemStyle(c.rarity)} />
                          <b className="text-sm">{RARITY_NAMES[c.rarity]} Lv.{c.level}</b>
                          <span className="text-xs tabular-nums text-muted">공 {c.atk} · 체 {c.hp}</span>
                          {featured && <span className="rounded bg-[#ffd36b] px-1.5 text-[10px] font-bold text-[#3a2600]">대표</span>}
                          {state.deck.includes(c.cardId) && <span className="rounded bg-navy-soft px-1.5 text-[10px] font-bold text-navy">덱</span>}
                          {c.locked && <span className="rounded bg-surface-2 px-1.5 text-[10px] font-bold text-muted">잠금</span>}
                          {c.source === "free" && <span className="text-[10px] text-faint">무료 획득</span>}
                        </button>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button type="button" className="btn !px-2 !py-0.5 text-xs" disabled={featured || busy !== null} onClick={() => act(`f-${c.cardId}`, () => quizApi("/api/game/featured", "POST", { cardId: c.cardId }), "대표 카드로 설정했습니다. 윤리 퀴즈 메인에 표시됩니다.")}>
                            {featured ? "대표 카드" : "대표로"}
                          </button>
                          <button type="button" className="btn !px-2 !py-0.5 text-xs" disabled={busy !== null} onClick={() => act(`l-${c.cardId}`, () => quizApi("/api/game/lock", "POST", { cardId: c.cardId, locked: !c.locked }), c.locked ? "잠금을 풀었습니다" : "잠갔습니다 (합성 재료·강화 재료 전환에서 보호)")}>
                            {c.locked ? "잠금 해제" : "잠금"}
                          </button>
                          {c.upgrade && <button type="button" className="btn !px-2 !py-0.5 text-xs" onClick={() => onLevelUp(c.cardId)}>레벨업</button>}
                          {nextRarity(c.rarity) && sameRarity >= state.settings.fusionCount - 1 && (
                            <button type="button" className="btn !px-2 !py-0.5 text-xs" onClick={() => onFuse(c.cardId)} title={`같은 사상가 · 같은 등급 재료 후보 ${sameRarity}장`}>
                              합성 → {RARITY_NAMES[nextRarity(c.rarity)!]}
                            </button>
                          )}
                          {!featured && !c.locked && (
                            confirm === c.cardId ? (
                              <span className="flex items-center gap-1 text-xs">
                                <span className="text-warn">이 카드를 없애고 {state.settings.stonesUnified ? "강화석" : "조각"} {SHARDS_FOR_CARD[c.rarity]}개로?</span>
                                <button type="button" className="btn-danger !px-2 !py-0.5 text-xs" disabled={busy !== null} onClick={() => act(`s-${c.cardId}`, () => quizApi("/api/game/shards", "POST", { cardId: c.cardId }), `${state.settings.stonesUnified ? "강화석" : "강화 조각"} +${SHARDS_FOR_CARD[c.rarity]}`)}>바꾸기</button>
                                <button type="button" className="btn !px-2 !py-0.5 text-xs" onClick={() => setConfirm(null)}>취소</button>
                              </span>
                            ) : (
                              <button type="button" className="btn !px-2 !py-0.5 text-xs text-muted" onClick={() => setConfirm(c.cardId)}>{state.settings.stonesUnified ? "강화석으로 바꾸기" : "조각으로 바꾸기"}</button>
                            )
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
            <Link href={`/philosophers/${card.philosopherId}`} className="btn inline-block px-4 py-2">
              {card.name} 학습 페이지 →
            </Link>
            <p className="text-[11px] text-faint">카드의 능력치·필살기는 게임용이며 기출 분석의 학습 정보와는 별개입니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 등급 보석 색 (카드 밖에서 쓸 때) */
export function gemStyle(r: OwnedCard["rarity"]): React.CSSProperties {
  const c = { common: ["#a7b0bd", "#5d6673"], rare: ["#8fd0ff", "#2a6fd6"], epic: ["#d8b4ff", "#7b3fe4"], legendary: ["#ffe39a", "#b9780f"] }[r];
  return { ["--r1" as string]: c[0], ["--r2" as string]: c[1] };
}

/** 배틀 아레나: 도장깨기(내 카드 3장 vs 관 보스) · 빠른 대전(3 vs 3) · 카드 대전(턴제 카드 게임) */
function ArenaTab({ state, reload, goDraw }: { state: GameState; reload: () => Promise<GameState>; goDraw: () => void }) {
  const [mode, setMode] = useState<"stage" | "quick" | "duel">("stage");
  const modes = [
    { key: "stage" as const, label: "도장깨기" },
    { key: "quick" as const, label: "빠른 대전" },
    { key: "duel" as const, label: "카드 대전" },
  ];
  return (
    <div className="space-y-4">
      <div role="tablist" className="inline-flex w-full gap-1 rounded-xl bg-surface-2 p-1 sm:w-auto">
        {modes.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-center text-sm transition-colors sm:flex-none ${mode === m.key ? "bg-surface font-semibold text-ink shadow-soft" : "text-muted hover:text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "stage" ? (
        <StageTab state={state} reload={reload} goDraw={goDraw} />
      ) : mode === "duel" ? (
        <DuelTab state={state} reload={reload} goDraw={goDraw} />
      ) : (
        <BattleTab state={state} reload={reload} goDraw={goDraw} />
      )}
    </div>
  );
}
