"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { BattleCard, BattleReplay, GameState, OwnedCard } from "@/lib/game/data";
import type { BattleEvent } from "@/lib/game/battle";
import { BOSS_PATTERNS, DIFFICULTY_NAMES, type BossPattern, type Difficulty } from "@/lib/game/battle";
import { teamSynergies } from "@/lib/game/synergy";
import { SynergyChips, SynergyGuide } from "./SynergyChips";
import { SKILL_EFFECTS, type SkillEffect } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { PhilosopherCard } from "./PhilosopherCard";
import { byStrength } from "./GameApp";

export function BattleTab({ state, reload, goDraw }: { state: GameState; reload: () => Promise<GameState>; goDraw: () => void }) {
  // 덱은 카드 id로 저장 (같은 사상가의 다른 등급 카드도 따로 넣을 수 있음)
  const [deck, setDeck] = useState<string[]>(() => initialTeam(state));
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [replay, setReplay] = useState<BattleReplay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.owned.length < 3)
    return (
      <section className="card p-8 text-center">
        <h2 className="text-lg font-bold">카드 3장이 필요합니다</h2>
        <p className="mt-1 text-sm text-muted">지금 {state.owned.length}장을 보유하고 있습니다. 카드를 더 모아 3 vs 3 배틀에 도전하세요.</p>
        <button type="button" className="btn-primary mt-4 px-5 py-2.5" onClick={goDraw}>카드 뽑으러 가기</button>
      </section>
    );
  if (state.cards.length < 3) return <p className="card p-8 text-center text-sm text-muted">상대 덱을 만들 공개 카드가 아직 3장 미만입니다. 카드가 더 공개되면 배틀이 열립니다.</p>;

  if (replay)
    return (
      <BattleArena
        replay={replay}
        maxLevel={state.settings.maxLevel}
        onAgain={() => setReplay(null)}
      />
    );

  const toggle = (id: string) => setDeck((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length >= 3 ? d : [...d, id]));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold">덱 구성 <span className="font-normal text-muted">{deck.length}/3</span></h2>
          <span className="text-xs text-faint">대표 카드와 별개로 저장됩니다</span>
        </div>
        <TeamPicker owned={state.owned} deck={deck} onToggle={toggle} maxLevel={state.settings.maxLevel} featuredId={state.featuredId} />
      </section>
      <aside className="card space-y-4 p-4 lg:sticky lg:top-20 lg:self-start">
        <div>
          <h3 className="mb-2 text-sm font-semibold">상대 난이도</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => (
              <button key={d} type="button" onClick={() => setDifficulty(d)} className={`rounded-lg border px-2 py-2 text-sm ${difficulty === d ? "border-navy bg-navy-soft font-bold text-navy" : "border-line text-muted"}`}>
                {DIFFICULTY_NAMES[d]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">상대 등급: 내 덱과 같은 구성 · 상대 레벨: 내 덱 평균 레벨 {difficulty === "easy" ? "−1" : difficulty === "hard" ? "+1" : "그대로"}</p>
        </div>
        <div className="flex justify-between rounded-lg bg-surface-2 p-3 text-sm">
          <span className="text-muted">전적</span>
          <span><b className="text-ok">{state.record.wins}승</b> <b className="text-danger">{state.record.losses}패</b></span>
        </div>
        <button
          type="button"
          className="btn-primary w-full py-3 text-base font-bold"
          disabled={deck.length !== 3 || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const r = await quizApi<BattleReplay>("/api/game/battle", "POST", { deck, difficulty });
              setReplay(r);
              reload().catch(() => {});
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "상대를 찾는 중…" : deck.length === 3 ? "배틀 시작" : `카드 ${3 - deck.length}장 더 고르세요`}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-[11px] leading-5 text-faint">
          턴마다 자동으로 싸웁니다. 세 번째 행동마다 필살기를 씁니다. 같은 분야·성향 조합이면 팀 시너지가 붙습니다 (상대도 마찬가지). 배틀에는 코인 보상이 없습니다 (코인은 학습으로만).
        </p>
      </aside>
    </div>
  );
}

/** 보유 카드에서 3장 고르기 (빠른 대전 · 도장깨기 팀 공용) */
export function TeamPicker({ owned, deck, onToggle, maxLevel, featuredId }: { owned: OwnedCard[]; deck: string[]; onToggle: (id: string) => void; maxLevel: number; featuredId: string | null }) {
  const team = deck.map((id) => owned.find((o) => o.cardId === id)).filter((o): o is OwnedCard => Boolean(o));
  return (
    <div className="space-y-2">
      <div className="space-y-1.5 rounded-lg bg-surface-2/60 p-2.5">
        <SynergyChips list={teamSynergies(team)} empty={team.length < 3 ? "카드 3장을 고르면 팀 시너지가 보입니다." : "이 팀엔 시너지가 없습니다. 분야·성향을 맞춰 보세요."} />
        <SynergyGuide />
      </div>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5" aria-label="보유 카드">
      {[...owned].sort((a, b) => byStrength(a, b) || a.name.localeCompare(b.name)).map((o) => {
        const at = deck.indexOf(o.cardId);
        return (
          <div key={o.cardId} className={`relative rounded-[16px] p-0.5 ${at >= 0 ? "ring-2 ring-navy" : "opacity-80 hover:opacity-100"}`}>
            <PhilosopherCard fx="lite" card={o} rarity={o.rarity} level={o.level} stats={{ atk: o.atk, hp: o.hp }} maxLevel={maxLevel} featured={o.cardId === featuredId} tilt={false} onClick={() => onToggle(o.cardId)} />
            {at >= 0 && <span className="absolute -left-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs font-bold text-on-accent shadow">{at + 1}</span>}
          </div>
        );
      })}
    </div>
    </div>
  );
}

/** 배틀 덱 처음 값: 저장된 덱(보유 중인 것만) → 모자라면 강한 카드 */
export function initialTeam(state: GameState): string[] {
  const saved = state.deck.filter((id) => state.owned.some((o) => o.cardId === id));
  if (saved.length === 3) return saved;
  const rest = [...state.owned].sort(byStrength).map((o) => o.cardId).filter((id) => !saved.includes(id));
  return [...saved, ...rest].slice(0, 3);
}

// ---------------------------------------------------------------------
// 배틀 재생
// ---------------------------------------------------------------------
export interface UnitState {
  hp: number;
  max: number;
  dead: boolean;
  shield: boolean;
  stun: boolean;
  /** 특수 보스 패턴이 발동했으면 그 패턴 */
  phase?: BossPattern;
}

export function stateAt(units: BattleCard[], events: BattleEvent[], upto: number): Record<string, UnitState> {
  const s: Record<string, UnitState> = Object.fromEntries(units.map((u) => [u.key, { hp: u.hp, max: u.hp, dead: false, shield: false, stun: false }]));
  for (const e of events.slice(0, upto)) {
    if (e.t === "attack") {
      s[e.target].hp = e.hp;
      if (e.shielded) s[e.target].shield = false;
    } else if (e.t === "skill") {
      for (const h of e.hits) {
        s[h.target].hp = h.hp;
        if (h.shielded) s[h.target].shield = false;
      }
      if (e.heal) s[e.heal.target].hp = e.heal.hp;
      for (const g of e.guarded ?? []) s[g].shield = true;
      if (e.stunned) s[e.stunned].stun = true;
    } else if (e.t === "stunned") s[e.actor].stun = false;
    else if (e.t === "faint") s[e.target].dead = true;
    else if (e.t === "phase") {
      if (e.heal) s[e.actor].hp = e.heal.hp;
      s[e.actor].phase = e.pattern;
    }
  }
  return s;
}

export const EFFECT_COLOR: Record<SkillEffect, string> = { strike: "#ff9a7a", sweep: "#ffb84d", heal: "#7fe0a6", guard: "#8fc6ff", stun: "#d8a6ff" };
export const DURATION: Record<BattleEvent["t"], number> = { attack: 750, skill: 1300, stunned: 650, phase: 1200, faint: 550, end: 400 };

export function BattleArena({
  replay,
  maxLevel,
  onAgain,
  title,
  result,
  meLabel = "내 덱",
}: {
  replay: BattleReplay;
  maxLevel: number;
  onAgain: () => void;
  /** 위쪽 표시 (기본: 난이도) */
  title?: ReactNode;
  /** 끝났을 때 결과 상자 (기본: 승패 + 다시 배틀) */
  result?: ReactNode;
  meLabel?: string;
}) {
  const units = useMemo(() => [...replay.me, ...replay.foe], [replay]);
  const byKey = useMemo(() => new Map(units.map((u) => [u.key, u])), [units]);
  const [idx, setIdx] = useState(0); // 다음에 재생할 사건
  const [speed, setSpeed] = useState(1);
  const done = idx >= replay.events.length;
  const current = idx > 0 ? replay.events[idx - 1] : null;
  const st = stateAt(units, replay.events, idx);

  useEffect(() => {
    if (done) return;
    const ev = replay.events[idx];
    const t = setTimeout(() => setIdx((i) => i + 1), (idx === 0 ? 700 : DURATION[ev.t]) / speed);
    return () => clearTimeout(t);
  }, [idx, done, speed, replay.events]);

  const actor = current && (current.t === "attack" || current.t === "skill") ? current.actor : null;
  const targets = new Set<string>(current?.t === "attack" ? [current.target] : current?.t === "skill" ? current.hits.map((h) => h.target) : []);
  const dmgOf = (key: string) => (current?.t === "attack" && current.target === key ? current.dmg : current?.t === "skill" ? current.hits.find((h) => h.target === key)?.dmg : undefined);
  const healOf = (key: string) => (current?.t === "skill" && current.heal?.target === key ? current.heal.amount : undefined);
  const narration = !current
    ? `${replay.first === "me" ? "내 덱" : "상대"} 선공으로 시작합니다`
    : current.t === "attack"
      ? `${byKey.get(current.actor)?.name}의 공격 → ${byKey.get(current.target)?.name} ${current.dmg}${current.shielded ? " (수호막으로 반감)" : ""}`
      : current.t === "skill"
        ? `${byKey.get(current.actor)?.name}의 필살기 「${current.name}」!`
        : current.t === "stunned"
          ? `${byKey.get(current.actor)?.name}이(가) 기절해 행동하지 못합니다`
          : current.t === "faint"
            ? `${byKey.get(current.target)?.name} 쓰러짐`
            : current.t === "phase"
              ? `${byKey.get(current.actor)?.name}의 패턴 「${BOSS_PATTERNS[current.pattern].name}」 발동!${current.heal ? ` 체력 +${current.heal.amount}` : ""}`
              : current.winner === "me"
              ? "승리!"
              : "패배…";

  const boss = replay.foe.length === 1;
  const row = (side: "me" | "foe") => (
    <div className={side === "foe" && boss ? "mx-auto w-[48%] sm:w-[38%]" : "grid grid-cols-3 gap-2 sm:gap-4"}>
      {(side === "me" ? replay.me : replay.foe).map((u) => {
        const s = st[u.key];
        const isActor = actor === u.key;
        const hit = targets.has(u.key);
        const dmg = hit ? dmgOf(u.key) : undefined;
        const heal = healOf(u.key);
        return (
          <div key={`${u.key}-${idx}`} className={`relative ${s.dead ? "faint" : isActor ? (side === "me" ? "lunge-up" : "lunge-down") : hit ? "hit-shake" : ""}`}>
            <div className={`relative rounded-[14px] ${isActor && current?.t === "skill" ? "ring-4" : ""}`} style={isActor && current?.t === "skill" ? { boxShadow: `0 0 26px ${EFFECT_COLOR[current.effect]}`, ["--tw-ring-color" as string]: EFFECT_COLOR[current.effect] } : undefined}>
              <PhilosopherCard fx="lite"
                card={{ philosopherId: u.philosopherId, name: u.name, originalName: null, tradition: u.tradition, baseAtk: u.atk, baseHp: u.hp, skillName: u.skillName, skillEffect: u.skillEffect, skillDesc: "", quote: "", artUrl: u.artUrl, artBasis: "portrait", artNote: "", published: true }}
                rarity={u.rarity}
                level={u.level}
                stats={{ atk: u.atk, hp: u.hp }}
                maxLevel={maxLevel}
                tilt={false}
              />
              {dmg !== undefined && <span className="dmg-float z-20 text-2xl text-[#ffd0c4]">-{dmg}</span>}
              {heal !== undefined && heal > 0 && <span className="dmg-float z-20 text-2xl text-[#9ff0bf]">+{heal}</span>}
              <div className="absolute right-[5%] top-[14%] z-10 flex flex-col items-end gap-1">
                {s.shield && <span className="rounded bg-[#8fc6ff] px-1.5 text-[10px] font-bold text-[#0b2440]">수호</span>}
                {s.stun && <span className="rounded bg-[#d8a6ff] px-1.5 text-[10px] font-bold text-[#2a0b40]">기절</span>}
              </div>
            </div>
            <div className="mt-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${(s.hp / s.max) * 100}%`, background: s.hp / s.max > 0.5 ? "#5fd08f" : s.hp / s.max > 0.25 ? "#f2c14e" : "#ef6a5a" }}
                />
              </div>
              <div className="mt-0.5 text-center text-[11px] tabular-nums text-white/70">{s.hp}/{s.max}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-[radial-gradient(80%_60%_at_50%_50%,#24304a,#0c111b)] p-3 text-white sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-xs text-white/70">
        {title ?? (
          <>
            <span className="rounded-full bg-white/10 px-2 py-0.5">{DIFFICULTY_NAMES[replay.difficulty]}</span>
            <span>상대</span>
          </>
        )}
        <span className="ml-auto flex gap-1">
          {[1, 2].map((s) => (
            <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded px-2 py-0.5 ${speed === s ? "bg-white text-[#0c111b]" : "bg-white/10"}`}>{s}×</button>
          ))}
          {!done && <button type="button" onClick={() => setIdx(replay.events.length)} className="rounded bg-white/10 px-2 py-0.5">건너뛰기</button>}
        </span>
      </div>
      {replay.synergy && (replay.synergy.me.length > 0 || replay.synergy.foe.length > 0) && (
        <div className="mb-3 grid gap-1.5 text-[11px] text-white/60 sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-1.5">상대 <SynergyChips list={replay.synergy.foe} dark empty="시너지 없음" /></div>
          <div className="flex flex-wrap items-center gap-1.5">{meLabel} <SynergyChips list={replay.synergy.me} dark empty="시너지 없음" /></div>
        </div>
      )}
      <div className="mx-auto max-w-2xl space-y-4">
        {row("foe")}
        <div className="relative flex min-h-12 items-center justify-center">
          {current?.t === "skill" ? (
            <div key={idx} className="skill-banner rounded-full px-5 py-2 text-center text-base font-black shadow-lg sm:text-lg" style={{ background: `linear-gradient(90deg, transparent, ${EFFECT_COLOR[current.effect]}55, transparent)` }}>
              ✦ {current.name} <span className="ml-1 text-xs font-semibold text-white/70">{SKILL_EFFECTS[current.effect].name}</span>
            </div>
          ) : (
            <p className="text-center text-sm text-white/75" aria-live="polite">{narration}</p>
          )}
        </div>
        {row("me")}
        <div className="text-center text-[11px] text-white/50">{meLabel}</div>
      </div>
      {done && result}
      {done && !result && (
        <div className="card-enter mx-auto mt-5 max-w-sm rounded-2xl border border-white/15 bg-black/40 p-5 text-center backdrop-blur">
          <div className={`text-4xl font-black ${replay.winner === "me" ? "text-[#ffd36b]" : "text-white/80"}`}>{replay.winner === "me" ? "승리!" : "패배"}</div>
          <p className="mt-1 text-sm text-white/70">
            {replay.winner === "me" ? "철학자들이 논쟁에서 이겼습니다." : "다음엔 덱을 바꾸거나 강화해서 다시 도전해 보세요."} 전적 {replay.record.wins}승 {replay.record.losses}패
          </p>
          <button type="button" className="btn-primary mt-4 w-full py-2.5 font-bold" onClick={onAgain}>
            다시 배틀하기
          </button>
        </div>
      )}
    </section>
  );
}
