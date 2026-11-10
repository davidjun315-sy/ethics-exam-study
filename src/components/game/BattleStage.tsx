"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { BattleCard, BattleReplay } from "@/lib/game/data";
import { SKILL_EFFECTS, type Rarity } from "@/lib/game/rules";
import { DURATION, EFFECT_COLOR, stateAt } from "./BattleTab";

/**
 * 도장깨기 전장: 캐릭터가 서서 싸우는 화면 (자동 배틀 기록을 재생만 함 — 결과는 서버가 정함).
 *  - 전투 캐릭터(투명 전신)가 있으면 그 그림, 없으면 카드 일러스트 초상 메달
 *  - 내 팀은 왼쪽(오른쪽을 봄), 보스는 오른쪽에 크게(왼쪽을 봄)
 *  - 대기 · 돌진 · 피격 · 쓰러짐 + 필살기별 효과 (일격 베기 · 광역 충격파 · 회복 빛가루 · 수호막 · 기절 별)
 */

const RING: Record<Rarity, string> = { common: "#b9c0cb", rare: "#5aa2ff", epic: "#b07cff", legendary: "#ffc94a" };
// 내 팀 자리 (전장 안 %, 아래쪽일수록 앞) · 크기
const TEAM_SLOTS: { left: number; bottom: number; scale: number }[] = [
  { left: 17, bottom: 3, scale: 0.95 },
  { left: 4, bottom: 21, scale: 0.8 },
  { left: 35, bottom: 23, scale: 0.78 },
];
const BOSS_SLOT = { right: 4, bottom: 5, scale: 1.55 };

function Scene({ tradition, bgUrl }: { tradition: string; bgUrl?: string }) {
  const east = tradition === "동양윤리" || tradition === "한국윤리";
  // 관리자가 올린 배경 그림 (분야별). 아래쪽을 기준으로 채우고, 글자가 잘 보이게 위·아래를 살짝 어둡게
  if (bgUrl)
    return (
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-bottom" draggable={false} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,10,18,.35) 0%, transparent 22%, transparent 70%, rgba(8,10,18,.35) 100%)" }} />
      </div>
    );
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* 하늘 */}
      <div className="absolute inset-0" style={{ background: east ? "linear-gradient(180deg,#f2b880 0%,#b7768f 28%,#4c3f78 58%,#1d2142 100%)" : "linear-gradient(180deg,#a9d0ff 0%,#6b8fcf 30%,#33497c 60%,#151d33 100%)" }} />
      {/* 해·달 */}
      <div className="absolute rounded-full" style={{ left: "62%", top: "10%", width: "13%", aspectRatio: "1", background: east ? "radial-gradient(circle,#fff1d0,#ffc58a 60%,transparent 70%)" : "radial-gradient(circle,#ffffff,#e9f3ff 55%,transparent 70%)", opacity: 0.85 }} />
      {east ? (
        <>
          {/* 먹빛 산 */}
          <div className="absolute inset-x-0 bottom-[34%] h-[38%] bg-[#3a3060]/70" style={{ clipPath: "polygon(0 70%,10% 35%,18% 55%,30% 15%,42% 50%,52% 30%,63% 58%,74% 22%,86% 50%,100% 28%,100% 100%,0 100%)" }} />
          <div className="absolute inset-x-0 bottom-[30%] h-[28%] bg-[#231f44]/85" style={{ clipPath: "polygon(0 60%,14% 30%,26% 62%,40% 36%,55% 70%,68% 40%,82% 66%,100% 42%,100% 100%,0 100%)" }} />
          {/* 정자 */}
          <div className="absolute bottom-[34%] left-[44%] h-[16%] w-[16%]">
            <div className="absolute inset-x-0 top-0 h-[38%] bg-[#1a1530]" style={{ clipPath: "polygon(0 100%,12% 30%,50% 0,88% 30%,100% 100%)" }} />
            <div className="absolute bottom-0 left-[16%] top-[38%] w-[7%] bg-[#1a1530]" />
            <div className="absolute bottom-0 right-[16%] top-[38%] w-[7%] bg-[#1a1530]" />
          </div>
        </>
      ) : (
        <>
          {/* 언덕과 신전 기둥 */}
          <div className="absolute inset-x-0 bottom-[30%] h-[24%] bg-[#24345e]/80" style={{ clipPath: "polygon(0 55%,20% 30%,38% 50%,60% 20%,80% 45%,100% 25%,100% 100%,0 100%)" }} />
          <div className="absolute bottom-[34%] left-[38%] h-[24%] w-[26%]">
            <div className="absolute inset-x-0 top-0 h-[22%] bg-[#1b2440]" style={{ clipPath: "polygon(0 100%,50% 0,100% 100%)" }} />
            <div className="absolute inset-x-[4%] top-[22%] h-[8%] bg-[#1b2440]" />
            <div className="absolute inset-x-[8%] bottom-0 top-[30%]" style={{ background: "repeating-linear-gradient(90deg,#1b2440 0 9%,transparent 9% 22%)" }} />
          </div>
        </>
      )}
      {/* 바닥 */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34%]"
        style={{
          background: east
            ? "linear-gradient(180deg,#5a4a3a,#2e2620 70%), repeating-linear-gradient(90deg,rgba(0,0,0,.18) 0 1px,transparent 1px 12%)"
            : "linear-gradient(180deg,#7a8296,#353b4c 70%)",
          boxShadow: "inset 0 10px 18px rgba(0,0,0,.35)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[34%] opacity-25" style={{ background: "repeating-linear-gradient(180deg,transparent 0 22%,rgba(255,255,255,.25) 22% 23%)" }} />
    </div>
  );
}

function Figure({ u, boss }: { u: BattleCard; boss: boolean }) {
  if (u.battleArtUrl)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={u.battleArtUrl} alt="" draggable={false} className="block h-full w-auto max-w-none object-contain" style={{ transform: boss ? "scaleX(-1)" : undefined }} />
    );
  // 전투 캐릭터가 없으면: 초상 메달 + 받침
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <div className="relative aspect-square w-[78%] overflow-hidden rounded-full border-[3px] bg-[#1a2234] shadow-[0_4px_10px_rgba(0,0,0,.5)]" style={{ borderColor: RING[u.rarity] }}>
        {u.artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.artUrl} alt="" draggable={false} className="h-full w-full object-cover object-[center_18%]" style={{ transform: boss ? "scaleX(-1)" : undefined }} />
        ) : (
          <span className="flex h-full items-center justify-center text-2xl font-black text-white/50">{u.name.slice(0, 1)}</span>
        )}
      </div>
      <div className="-mt-1 h-[16%] w-[62%] rounded-b-xl rounded-t-sm" style={{ background: `linear-gradient(180deg, ${RING[u.rarity]}, #3b3f4d)` }} />
    </div>
  );
}

export function BattleStage({
  replay,
  tradition,
  bgUrl,
  title,
  result,
}: {
  replay: BattleReplay;
  tradition: string;
  bgUrl?: string;
  title?: ReactNode;
  result?: ReactNode;
}) {
  const units = useMemo(() => [...replay.me, ...replay.foe], [replay]);
  const byKey = useMemo(() => new Map(units.map((u) => [u.key, u])), [units]);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const done = idx >= replay.events.length;
  const current = idx > 0 ? replay.events[idx - 1] : null;
  const st = stateAt(units, replay.events, idx);

  useEffect(() => {
    if (done) return;
    const ev = replay.events[idx];
    const t = setTimeout(() => setIdx((i) => i + 1), (idx === 0 ? 900 : DURATION[ev.t]) / speed);
    return () => clearTimeout(t);
  }, [idx, done, speed, replay.events]);

  const actor = current && (current.t === "attack" || current.t === "skill") ? current.actor : null;
  const targets = new Set<string>(current?.t === "attack" ? [current.target] : current?.t === "skill" ? current.hits.map((h) => h.target) : []);
  const dmgOf = (key: string) => (current?.t === "attack" && current.target === key ? current.dmg : current?.t === "skill" ? current.hits.find((h) => h.target === key)?.dmg : undefined);
  const healTarget = current?.t === "skill" && current.heal ? current.heal : null;
  const skill = current?.t === "skill" ? current : null;
  const narration = !current
    ? `${replay.first === "me" ? "내 팀" : byKey.get(replay.foe[0]?.key)?.name ?? "상대"} 선공으로 시작합니다`
    : current.t === "attack"
      ? `${byKey.get(current.actor)?.name}의 공격 → ${byKey.get(current.target)?.name} ${current.dmg}${current.shielded ? " (수호막으로 반감)" : ""}`
      : current.t === "skill"
        ? `${byKey.get(current.actor)?.name}의 필살기 「${current.name}」`
        : current.t === "stunned"
          ? `${byKey.get(current.actor)?.name}이(가) 기절해 한 번 쉽니다`
          : current.t === "faint"
            ? `${byKey.get(current.target)?.name} 쓰러짐`
            : current.winner === "me"
              ? "승리!"
              : "패배…";

  const unit = (u: BattleCard, slot: { left?: number; right?: number; bottom: number; scale: number }, boss: boolean, i: number) => {
    const s = st[u.key];
    const isActor = actor === u.key;
    const hit = targets.has(u.key);
    const dmg = hit ? dmgOf(u.key) : undefined;
    const healed = healTarget?.target === u.key ? healTarget.amount : 0;
    const anim = s.dead ? "bs-faint" : isActor ? (skill ? "bs-cast" : boss ? "bs-lunge-l" : "bs-lunge-r") : hit ? "bs-hit" : "";
    const h = 30 * slot.scale; // 전장 높이 대비 %
    const style: CSSProperties = { bottom: `${slot.bottom}%`, height: `${h}%`, zIndex: 10 + Math.round(30 - slot.bottom) };
    if (slot.left !== undefined) style.left = `${slot.left}%`;
    if (slot.right !== undefined) style.right = `${slot.right}%`;
    return (
      <div key={u.key} className="absolute" style={style} data-unit={u.key} aria-label={`${u.name} 체력 ${s.hp}/${s.max}${s.dead ? " 쓰러짐" : ""}`}>
        {/* 이름 · 체력 */}
        <div className="absolute bottom-full left-1/2 mb-1 w-[max(4.5rem,110%)] -translate-x-1/2 text-center" style={{ opacity: s.dead ? 0.35 : 1 }}>
          <div className="truncate text-[10px] font-bold text-white drop-shadow sm:text-xs">
            {boss && <span className="mr-1 rounded bg-[#ef6a5a] px-1 text-[9px]">보스</span>}
            {u.name} <span className="font-normal text-white/70">Lv.{u.level}</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/20">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(s.hp / s.max) * 100}%`, background: s.hp / s.max > 0.5 ? "#5fd08f" : s.hp / s.max > 0.25 ? "#f2c14e" : "#ef6a5a" }} />
          </div>
          {boss && <div className="text-[9px] tabular-nums text-white/70">{s.hp}/{s.max}</div>}
        </div>
        {/* 그림자 */}
        <div className="absolute -bottom-[3%] left-1/2 h-[9%] w-[80%] -translate-x-1/2 rounded-[50%] bg-black/45 blur-[2px]" />
        {/* 몸 (움직임은 key 로 매 사건마다 다시) */}
        <div className={`relative h-full ${s.dead ? "" : "bs-idle"}`} style={{ animationDelay: `${-i * 0.37}s` }}>
          <div key={`${u.key}-${idx}`} className={`h-full ${anim}`}>
            <div className={`h-full ${isActor && skill ? "bs-aura" : ""}`} style={isActor && skill ? { ["--aura" as string]: EFFECT_COLOR[skill.effect] } : undefined}>
              <Figure u={u} boss={boss} />
            </div>
          </div>
        </div>
        {/* 상태: 수호막 · 기절 */}
        {s.shield && !s.dead && <div className="bs-dome absolute -inset-x-[12%] -top-[4%] bottom-0 rounded-t-full" />}
        {s.stun && !s.dead && (
          <div className="bs-stars absolute -top-[6%] left-1/2 -translate-x-1/2 text-sm text-[#ffe68a] sm:text-base" aria-hidden>
            ✦ ✧ ✦
          </div>
        )}
        {/* 이번 사건 효과 */}
        {hit && skill?.effect === "strike" && <div key={`fx-${idx}`} className="bs-slash absolute inset-0" style={{ ["--fx" as string]: EFFECT_COLOR.strike }} />}
        {hit && skill?.effect === "stun" && <div key={`fx-${idx}`} className="bs-slash absolute inset-0" style={{ ["--fx" as string]: EFFECT_COLOR.stun }} />}
        {hit && skill?.effect === "sweep" && <div key={`fx-${idx}`} className="bs-wave absolute left-1/2 top-1/2 aspect-square w-[140%] -translate-x-1/2 -translate-y-1/2 rounded-full" />}
        {hit && current?.t === "attack" && <div key={`fx-${idx}`} className="bs-spark absolute left-1/2 top-[40%] h-[24%] w-[24%] -translate-x-1/2 rounded-full" />}
        {healed > 0 && (
          <div key={`fx-${idx}`} className="absolute inset-0" aria-hidden>
            {[0, 1, 2, 3, 4].map((k) => (
              <span key={k} className="bs-heal absolute bottom-[10%] h-2 w-2 rounded-full bg-[#9ff0bf]" style={{ left: `${18 + k * 15}%`, animationDelay: `${k * 0.09}s` }} />
            ))}
          </div>
        )}
        {dmg !== undefined && <span key={`d-${idx}`} className="dmg-float z-40 text-xl text-[#ffd0c4] sm:text-2xl">-{dmg}</span>}
        {healed > 0 && <span key={`h-${idx}`} className="dmg-float z-40 text-xl text-[#9ff0bf] sm:text-2xl">+{healed}</span>}
      </div>
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-[#0c111b] text-white">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/70">
        {title}
        <span className="ml-auto flex gap-1">
          {[1, 2].map((s) => (
            <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded px-2 py-0.5 ${speed === s ? "bg-white text-[#0c111b]" : "bg-white/10"}`}>
              {s}×
            </button>
          ))}
          {!done && (
            <button type="button" onClick={() => setIdx(replay.events.length)} className="rounded bg-white/10 px-2 py-0.5">
              건너뛰기
            </button>
          )}
        </span>
      </div>
      <div className="relative h-[19rem] overflow-hidden sm:h-[26rem]" aria-label="전장">
        <Scene tradition={tradition} bgUrl={bgUrl} />
        {replay.me.map((u, i) => unit(u, TEAM_SLOTS[i % TEAM_SLOTS.length], false, i))}
        {replay.foe.map((u, i) => unit(u, BOSS_SLOT, true, i + 3))}
        {skill && (
          <div key={`banner-${idx}`} className="skill-banner absolute left-1/2 top-3 z-50 -translate-x-1/2 whitespace-nowrap rounded-full px-5 py-1.5 text-sm font-black shadow-lg sm:text-base" style={{ background: `linear-gradient(90deg, transparent, ${EFFECT_COLOR[skill.effect]}88, transparent)` }}>
            ✦ {skill.name} <span className="ml-1 text-xs font-semibold text-white/80">{SKILL_EFFECTS[skill.effect].name}</span>
          </div>
        )}
      </div>
      <p className="min-h-10 border-t border-white/10 bg-black/30 px-3 py-2 text-center text-[13px] text-white/85" aria-live="polite">
        {narration}
      </p>
      {done && <div className="px-3 pb-4">{result}</div>}
    </section>
  );
}
