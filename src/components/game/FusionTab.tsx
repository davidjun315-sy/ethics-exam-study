"use client";

import { useEffect, useState } from "react";
import type { GameState, OwnedCard } from "@/lib/game/data";
import { canFuseCard, fusionMaterials, fusionProblem, nextRarity, RARITIES, RARITY_NAMES, statsFor, type Rarity } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { PhilosopherCard } from "./PhilosopherCard";
import { byStrength, Coins, gemStyle } from "./GameApp";

type Pick = "base" | "material";
interface Show {
  base: OwnedCard;
  materials: OwnedCard[];
  result: OwnedCard;
  phase: "merge" | "flash" | "reveal";
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * 카드 합성(진화): 같은 사상가 · 같은 등급 카드 N장 → 기준 카드가 한 단계 위 등급 (확정 성공).
 * 예: 일반 콜버그 2장 → 희귀 콜버그. 일반 콜버그 + 일반 루소는 불가.
 * 기준 카드의 id·레벨·대표·덱 자리는 그대로, 재료 카드는 사라진다.
 */
export function FusionTab({ state, reload, initialBase }: { state: GameState; reload: () => Promise<GameState>; initialBase?: string | null }) {
  const { fusionCount, fusionCost, rarityMult, maxLevel } = state.settings;
  const need = fusionCount - 1;
  const materialsFor = (b: OwnedCard) => fusionMaterials(b, state.owned, state.featuredId);
  const canFuse = (b: OwnedCard) => canFuseCard(b, state.owned, state.featuredId, fusionCount);
  // 자동 선택: 레벨 낮은 카드부터, 덱 카드는 피해서
  const autoMaterials = (b: OwnedCard) =>
    materialsFor(b)
      .sort((x, y) => Number(state.deck.includes(x.cardId)) - Number(state.deck.includes(y.cardId)) || x.level - y.level)
      .slice(0, need)
      .map((m) => m.cardId);

  const [baseId, setBaseId] = useState<string | null>(() => {
    if (initialBase && state.owned.some((o) => o.cardId === initialBase)) return initialBase;
    return null;
  });
  const [materialIds, setMaterialIds] = useState<string[]>(() => {
    const b = state.owned.find((o) => o.cardId === baseId);
    return b && nextRarity(b.rarity) ? autoMaterials(b) : [];
  });
  const [picking, setPicking] = useState<Pick>(baseId ? "material" : "base");
  const [rarity, setRarity] = useState<Rarity | "all">("all");
  const [onlyFusable, setOnlyFusable] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Show | null>(null);

  // 연출 단계: 모이기 → 빛 → 공개 (건너뛰기·동작 줄이기면 바로 공개)
  useEffect(() => {
    if (!show || show.phase === "reveal") return;
    const t = setTimeout(() => setShow((s) => (s ? { ...s, phase: s.phase === "merge" ? "flash" : "reveal" } : s)), show.phase === "merge" ? 1100 : 700);
    return () => clearTimeout(t);
  }, [show]);

  const base = state.owned.find((o) => o.cardId === baseId) ?? null;
  const materials = materialIds.map((id) => state.owned.find((o) => o.cardId === id)).filter((o): o is OwnedCard => Boolean(o));
  const problem = fusionProblem(base, materials, { fusionCount, featuredId: state.featuredId, coins: state.coins, cost: fusionCost });
  const to = base ? nextRarity(base.rarity) : null;
  const preview = base && to ? statsFor({ atk: base.baseAtk, hp: base.baseHp }, to, base.level, rarityMult) : null;

  if (!state.owned.length) return <p className="card p-8 text-center text-sm text-muted">보유한 카드가 없습니다. 카드 뽑기로 첫 철학자를 영입하세요.</p>;

  const fusableCount = state.owned.filter(canFuse).length;
  const baseList = state.owned
    .filter((o) => nextRarity(o.rarity))
    .filter((o) => rarity === "all" || o.rarity === rarity)
    .filter((o) => !onlyFusable || canFuse(o))
    .sort((a, b) => Number(canFuse(b)) - Number(canFuse(a)) || byStrength(a, b) || a.name.localeCompare(b.name));
  // 재료 후보: 약한 카드부터, 덱에 든 카드는 뒤로
  const materialList = base
    ? materialsFor(base).sort((a, b) => Number(state.deck.includes(a.cardId)) - Number(state.deck.includes(b.cardId)) || a.level - b.level || a.name.localeCompare(b.name))
    : [];

  const chooseBase = (o: OwnedCard) => {
    setBaseId(o.cardId);
    setError(null);
    setConfirm(false);
    setMaterialIds(autoMaterials(o));
    setPicking("material");
  };
  const toggleMaterial = (o: OwnedCard) => {
    setConfirm(false);
    setError(null);
    setMaterialIds((ids) => (ids.includes(o.cardId) ? ids.filter((x) => x !== o.cardId) : need === 1 ? [o.cardId] : ids.length >= need ? ids : [...ids, o.cardId]));
  };

  async function fuse() {
    if (!base || problem || busy) return;
    setBusy(true);
    setError(null);
    const body = { baseId: base.cardId, materialIds, requestId: crypto.randomUUID() };
    const snapshot = { base, materials };
    try {
      // 네트워크가 끊겼다면 같은 requestId로 한 번 더 (서버는 처음 결과를 돌려주고 다시 소모하지 않음)
      const r = await quizApi<{ card: OwnedCard }>("/api/game/fuse", "POST", body).catch((e) => {
        if (e instanceof TypeError) return quizApi<{ card: OwnedCard }>("/api/game/fuse", "POST", body);
        throw e;
      });
      setShow({ ...snapshot, result: r.card, phase: reducedMotion() ? "reveal" : "merge" });
      setMaterialIds([]);
      setConfirm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const deckMaterial = materials.filter((m) => state.deck.includes(m.cardId));

  return (
    <div className="space-y-4">
      {/* 합성 슬롯: 기준(왼쪽) + 재료(오른쪽) ↓ 결과 미리보기 */}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">카드 합성 <span className="font-normal text-muted">같은 사상가 · 같은 등급 {fusionCount}장 → 한 단계 위 등급 (확정 성공)</span></h2>
          <span className="ml-auto"><Coins value={state.coins} /></span>
        </div>
        <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
          <Slot label="기준 카드" active={picking === "base"} onClick={() => setPicking("base")}>
            {base ? <MiniCard o={base} maxLevel={maxLevel} /> : <Empty text="기준 카드를 고르세요" />}
          </Slot>
          <span className="text-2xl font-black text-faint">+</span>
          <Slot label={`재료 카드 ${materials.length}/${need}`} active={picking === "material"} onClick={() => base && setPicking("material")}>
            {materials.length ? (
              <div className={need > 1 ? "grid grid-cols-2 gap-1" : ""}>
                {materials.map((m) => <MiniCard key={m.cardId} o={m} maxLevel={maxLevel} />)}
              </div>
            ) : (
              <Empty text={base ? `${RARITY_NAMES[base.rarity]} ${base.name} ${need}장` : "기준 카드를 먼저"} />
            )}
          </Slot>
        </div>
        {base && (
          <div className="mx-auto mt-3 max-w-xl text-center">
            <div className="text-xl text-faint" aria-hidden>↓</div>
            {to && preview ? (
              <div className="mt-1 rounded-xl bg-surface-2 p-3">
                <div className="flex items-center justify-center gap-2 text-sm">
                  <span className="pcard-gem inline-block text-[8px]" style={gemStyle(to)} />
                  <b className="text-base">{RARITY_NAMES[to]} {base.name} Lv.{base.level}</b>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
                  <span>공격력 {base.atk} → <b className="text-ok">{preview.atk}</b></span>
                  <span>체력 {base.hp} → <b className="text-ok">{preview.hp}</b></span>
                </div>
                <p className="mt-1.5 text-[11px] text-faint">레벨·대표·덱 자리는 그대로, 재료 카드는 사라집니다.{fusionCost ? ` 비용 ${fusionCost}코인.` : " 비용 없음."}</p>
              </div>
            ) : (
              <p className="mt-1 rounded-lg bg-warn-soft p-3 text-sm font-semibold text-warn">전설은 최고 등급입니다.</p>
            )}
          </div>
        )}
        <div className="mx-auto mt-3 max-w-xl space-y-2">
          {deckMaterial.length > 0 && (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              재료 중 {deckMaterial.map((m) => m.name).join(", ")} 카드가 배틀 덱에 있습니다. 합성하면 덱에서 빠집니다.
            </p>
          )}
          {confirm ? (
            <div className="rounded-xl border border-danger/40 p-3 text-center">
              <p className="text-sm">
                {materials.map((m) => `${RARITY_NAMES[m.rarity]} ${m.name} Lv.${m.level}`).join(", ")} 카드가 <b>사라지고</b>, {base && to ? `${RARITY_NAMES[to]} ${base.name}` : ""}(으)로 진화합니다. 되돌릴 수 없어요.
              </p>
              <div className="mt-2 flex justify-center gap-2">
                <button type="button" className="btn-primary px-5 py-2 font-bold" disabled={busy} onClick={fuse}>{busy ? "합성 중…" : "합성 확정"}</button>
                <button type="button" className="btn px-4 py-2" disabled={busy} onClick={() => setConfirm(false)}>취소</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-primary w-full py-3 text-base font-bold" disabled={Boolean(problem) || busy} onClick={() => setConfirm(true)}>
              {problem ? `합성 불가 · ${problem}` : "합성하기"}
            </button>
          )}
          {error && <p className="text-center text-sm font-semibold text-danger">{error}</p>}
        </div>
      </section>

      {/* 카드 고르기 */}
      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5 text-sm" role="tablist">
            {(["base", "material"] as Pick[]).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={picking === p}
                disabled={p === "material" && !base}
                onClick={() => setPicking(p)}
                className={`rounded-md px-3 py-1 ${picking === p ? "bg-navy font-semibold text-on-accent" : "text-muted disabled:opacity-40"}`}
              >
                {p === "base" ? "기준 카드 고르기" : "재료 고르기"}
              </button>
            ))}
          </div>
          {picking === "base" ? (
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1 text-muted">
                <input type="checkbox" checked={onlyFusable} onChange={(e) => setOnlyFusable(e.target.checked)} /> 합성 가능만 ({fusableCount})
              </label>
              <select className="input !w-auto !py-1 text-xs" value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | "all")} aria-label="등급">
                <option value="all">모든 등급</option>
                {RARITIES.slice(0, 3).map((r) => <option key={r} value={r}>{RARITY_NAMES[r]}</option>)}
              </select>
            </div>
          ) : (
            base && <span className="ml-auto text-xs text-muted">{RARITY_NAMES[base.rarity]} {base.name} 카드만 · 대표·잠금 카드 제외 · 약한 카드부터</span>
          )}
        </div>
        {picking === "base" ? (
          baseList.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              {onlyFusable ? `같은 사상가의 같은 등급 카드가 ${fusionCount}장 이상 모이면 합성할 수 있습니다 (예: 일반 콜버그 ${fusionCount}장). 카드를 더 뽑아 보세요.` : "합성할 수 있는 카드가 없습니다 (전설은 최고 등급)."}
            </p>
          ) : (
            <Grid>
              {baseList.map((o) => (
                <Pickable key={o.cardId} selected={o.cardId === baseId} dim={!canFuse(o)} onClick={() => chooseBase(o)}>
                  <PhilosopherCard fx="lite"
                    card={o}
                    rarity={o.rarity}
                    level={o.level}
                    stats={{ atk: o.atk, hp: o.hp }}
                    maxLevel={maxLevel}
                    featured={o.cardId === state.featuredId}
                    locked2={o.locked}
                    tilt={false}
                    badge={canFuse(o) ? <span className="rounded-full bg-ok px-1.5 py-0.5 text-[9px] font-bold text-white">합성</span> : undefined}
                  />
                </Pickable>
              ))}
            </Grid>
          )
        ) : materialList.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">재료로 쓸 수 있는 {base ? `${RARITY_NAMES[base.rarity]} ${base.name}` : ""} 카드가 없습니다. 같은 사상가 · 같은 등급 카드만 재료가 됩니다 (대표·잠금 카드는 제외).</p>
        ) : (
          <Grid>
            {materialList.map((o) => (
              <Pickable key={o.cardId} selected={materialIds.includes(o.cardId)} onClick={() => toggleMaterial(o)}>
                <PhilosopherCard fx="lite" card={o} rarity={o.rarity} level={o.level} stats={{ atk: o.atk, hp: o.hp }} maxLevel={maxLevel} tilt={false} badge={state.deck.includes(o.cardId) ? <span className="rounded bg-navy px-1 text-[9px] font-bold text-on-accent">덱</span> : undefined} />
              </Pickable>
            ))}
          </Grid>
        )}
      </section>

      {show && <FusionShow show={show} maxLevel={maxLevel} onSkip={() => setShow((s) => (s ? { ...s, phase: "reveal" } : s))} onClose={() => {
        setShow(null);
        const again = state.owned.find((o) => o.cardId === show.result.cardId);
        if (again && !canFuse(again)) setPicking("base");
      }} />}
    </div>
  );
}

function Slot({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-40 flex-col items-center gap-1 rounded-xl border-2 p-2 text-left transition-colors ${active ? "border-navy bg-navy-soft/40" : "border-dashed border-line hover:border-navy/50"}`}>
      <span className="text-[11px] font-semibold text-muted">{label}</span>
      <div className="w-full max-w-[9rem]">{children}</div>
    </button>
  );
}
const Empty = ({ text }: { text: string }) => <div className="flex aspect-[5/7] items-center justify-center rounded-[12px] bg-surface-2 p-2 text-center text-xs text-faint">{text}</div>;
const MiniCard = ({ o, maxLevel }: { o: OwnedCard; maxLevel: number }) => <PhilosopherCard fx="lite" card={o} rarity={o.rarity} level={o.level} stats={{ atk: o.atk, hp: o.hp }} maxLevel={maxLevel} tilt={false} />;
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">{children}</div>;
function Pickable({ selected, dim, onClick, children }: { selected: boolean; dim?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`rounded-[16px] p-0.5 text-left ${selected ? "ring-2 ring-navy" : dim ? "opacity-55 hover:opacity-90" : "hover:opacity-90"}`}>
      {children}
    </button>
  );
}

/** 진화 연출: 두 카드가 가운데로 모임 → 빛 → 재료 사라짐 → 새 등급 프레임 공개 → "진화 성공!" */
function FusionShow({ show, maxLevel, onSkip, onClose }: { show: Show; maxLevel: number; onSkip: () => void; onClose: () => void }) {
  const { base, materials, result, phase } = show;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (phase === "reveal" ? onClose() : onSkip());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose, onSkip]);
  const glow = { legendary: "rgba(255,214,110,0.95)", epic: "rgba(205,150,255,0.9)", rare: "rgba(130,190,255,0.9)", common: "rgba(255,255,255,0.8)" }[result.rarity];
  return (
    <div role="dialog" aria-modal="true" aria-label="카드 합성 결과" className="fixed inset-0 z-50 flex items-center justify-center bg-[#070a12]/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md text-center text-white">
        {phase === "reveal" ? (
          <div>
            <div className="relative mx-auto w-48 sm:w-56">
              <span className="card-burst" style={{ ["--burst" as string]: glow }} aria-hidden />
              <div className="fuse-reveal relative">
                <PhilosopherCard card={result} rarity={result.rarity} level={result.level} stats={{ atk: result.atk, hp: result.hp }} maxLevel={maxLevel} tilt={false} />
              </div>
            </div>
            <h2 className="mt-4 text-3xl font-black text-[#ffd36b]" aria-live="polite">진화 성공!</h2>
            <p className="mt-1 text-sm text-white/80">
              {RARITY_NAMES[base.rarity]} → <b>{RARITY_NAMES[result.rarity]}</b> {result.name} Lv.{result.level} · 공격력 {base.atk}→{result.atk} · 체력 {base.hp}→{result.hp}
            </p>
            <button type="button" autoFocus className="btn-primary mt-4 w-full max-w-xs py-2.5 font-bold" onClick={onClose}>확인</button>
          </div>
        ) : (
          <div>
            <div className="relative mx-auto grid max-w-sm grid-cols-2 gap-6" style={{ ["--fuse-dx" as string]: "56%" }}>
              <div className="fuse-left relative z-10"><PhilosopherCard card={base} rarity={base.rarity} level={base.level} stats={{ atk: base.atk, hp: base.hp }} maxLevel={maxLevel} tilt={false} /></div>
              <div className="fuse-right relative">
                {materials.slice(0, 1).map((m) => <PhilosopherCard key={m.cardId} card={m} rarity={m.rarity} level={m.level} stats={{ atk: m.atk, hp: m.hp }} maxLevel={maxLevel} tilt={false} />)}
              </div>
              {phase === "flash" && <span className="fuse-flash z-20" style={{ ["--burst" as string]: glow }} aria-hidden />}
            </div>
            <p className="mt-4 text-sm text-white/70" aria-live="polite">{phase === "merge" ? "카드를 합치는 중…" : "진화!"}</p>
            <button type="button" autoFocus className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20" onClick={onSkip}>건너뛰기</button>
          </div>
        )}
      </div>
    </div>
  );
}
