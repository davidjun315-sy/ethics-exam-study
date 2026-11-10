"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BattleCard, BattleReplay } from "@/lib/game/data";
import { SKILL_EFFECTS, type Rarity } from "@/lib/game/rules";
import { stateAt } from "./BattleTab";
import { fxTheme, type FxTheme } from "@/lib/game/skillFx";

/**
 * 도장깨기 전장: 캐릭터가 서서 싸우는 화면 (자동 배틀 기록을 재생만 함 — 결과는 서버가 정함).
 *  - 전투 캐릭터(투명 전신)가 있으면 그 그림, 없으면 카드 일러스트 초상 메달
 *  - 내 팀은 왼쪽(오른쪽을 봄), 보스는 오른쪽에 크게(왼쪽을 봄)
 *  - 대기 · 돌진 · 피격 · 쓰러짐 + 필살기별 효과 (일격 베기 · 광역 충격파 · 회복 빛가루 · 수호막 · 기절 별)
 */

const RING: Record<Rarity, string> = { common: "#b9c0cb", rare: "#5aa2ff", epic: "#b07cff", legendary: "#ffc94a" };
const RAR_TEXT: Record<Rarity, string> = { common: "#d5dae2", rare: "#8fc6ff", epic: "#d9b8ff", legendary: "#ffd36b" };
const RARITY_LABEL: Record<Rarity, string> = { common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" };
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
    <div className="flex h-full aspect-[0.82] flex-col items-center justify-end">
      <div className="relative aspect-square w-[88%] shrink-0 overflow-hidden rounded-full border-[3px] bg-[#1a2234] shadow-[0_4px_10px_rgba(0,0,0,.5)]" style={{ borderColor: RING[u.rarity] }}>
        {u.artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.artUrl} alt="" draggable={false} className="h-full w-full object-cover object-[center_18%]" style={{ transform: boss ? "scaleX(-1)" : undefined }} />
        ) : (
          <span className="flex h-full items-center justify-center text-2xl font-black text-white/50">{u.name.slice(0, 1)}</span>
        )}
      </div>
      <div className="-mt-1 h-[14%] w-[66%] shrink-0 rounded-b-xl rounded-t-sm" style={{ background: `linear-gradient(180deg, ${RING[u.rarity]}, #3b3f4d)` }} />
    </div>
  );
}

// 사건마다 길이 · 맞는 순간 (ms, 1배속)
const DUR = { attack: 950, skill: 2300, stunned: 700, faint: 600, end: 500 } as const;
const IMPACT = { attack: 300, skill: 1250 } as const;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Box = { x: number; y: number; feet: number; top: number; w: number; h: number };

/** 전장 안 캐릭터 위치 (px) */
function boxOf(key: string, W: number, H: number): Box {
  const boss = key.startsWith("foe");
  const slot = boss ? BOSS_SLOT : TEAM_SLOTS[Number(key.split("-")[1]) % TEAM_SLOTS.length];
  const h = H * 0.3 * slot.scale;
  const w = h * 0.82;
  const feet = H - (slot.bottom / 100) * H;
  const x = "right" in slot ? W - (slot.right / 100) * W - w / 2 : (slot.left / 100) * W + w / 2;
  return { x, y: feet - h * 0.5, feet, top: feet - h, w, h };
}

/** 맞는 곳에서 터지는 빛: 빛살 · 고리 · 파편 */
function Burst({ b, theme, big, delay }: { b: Box; theme: FxTheme; big: boolean; delay: number }) {
  const size = (big ? 1.5 : 0.95) * b.w;
  const style = { left: b.x, top: b.y, width: size, height: size, animationDelay: `${delay}ms`, ["--c0" as string]: theme.colors[0], ["--c1" as string]: theme.colors[1], ["--c2" as string]: theme.colors[2] } as CSSProperties;
  return (
    <>
      <div className="fx-rays" style={style} />
      <div className="fx-ring" style={style} />
      {Array.from({ length: big ? 12 : 7 }, (_, k) => (
        <span key={k} className="fx-shard" style={{ left: b.x, top: b.y, animationDelay: `${delay}ms`, ["--a" as string]: `${(360 / (big ? 12 : 7)) * k + 13}deg`, ["--d" as string]: `${size * (0.6 + ((k * 37) % 10) / 20)}px`, ["--c0" as string]: theme.colors[k % 2 ? 0 : 2] } as CSSProperties} />
      ))}
    </>
  );
}

/** 스킬 날아가는 모양 (사상가마다 다름) */
function Motif({ theme, from, to, H, delay }: { theme: FxTheme; from: Box; to: Box[]; H: number; delay: number }) {
  const [c0, c1, c2] = theme.colors;
  const vars = { ["--c0" as string]: c0, ["--c1" as string]: c1, ["--c2" as string]: c2 } as CSSProperties;
  const glyphSize = (b: Box) => Math.max(14, Math.min(b.w * 0.42, 40 * (theme.glyph.length > 2 ? 2.4 / theme.glyph.length + 0.2 : 1)));
  return (
    <>
      {to.map((t, ti) => {
        const dx = t.x - from.x;
        const dy = t.y - from.y;
        const dist = Math.hypot(dx, dy);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        const d0 = delay + ti * 90;
        switch (theme.motif) {
          case "beam":
            return (
              <div key={ti} className="fx-beam" style={{ ...vars, left: from.x, top: from.y, width: dist, height: Math.max(10, from.h * 0.13), ["--ang" as string]: `${ang}deg`, animationDelay: `${d0}ms` } as CSSProperties} />
            );
          case "orbs":
            return Array.from({ length: 5 }, (_, k) => (
              <span key={`${ti}-${k}`} className="fx-orb" style={{ ...vars, left: from.x, top: from.y - from.h * 0.1, width: from.w * 0.2, height: from.w * 0.2, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy + from.h * 0.1}px`, ["--arc" as string]: `${-40 - k * 12}px`, animationDelay: `${d0 + k * 70}ms` } as CSSProperties} />
            ));
          case "rain":
            return Array.from({ length: 7 }, (_, k) => (
              <span key={`${ti}-${k}`} className="fx-rain" style={{ ...vars, left: t.x + (k - 3) * t.w * 0.16, top: t.y, fontSize: glyphSize(t) * 0.8, ["--fall" as string]: `${-H * 0.6}px`, animationDelay: `${d0 + k * 60}ms` } as CSSProperties}>
                {theme.glyph}
              </span>
            ));
          case "pillar":
            return (
              <div key={ti} className="fx-pillar" style={{ ...vars, left: t.x, top: 0, height: t.feet, width: t.w * 0.75, animationDelay: `${d0}ms` }}>
                <span className="fx-pillar-glyph" style={{ fontSize: glyphSize(t), top: t.top - glyphSize(t) * 1.2 }}>
                  {theme.glyph}
                </span>
              </div>
            );
          case "slash":
            return [0, 1, 2].map((k) => (
              <span key={`${ti}-${k}`} className="fx-crescent" style={{ ...vars, left: t.x, top: t.y, width: t.w * 1.5, height: t.w * 1.5, ["--r" as string]: `${-40 + k * 55}deg`, animationDelay: `${d0 + k * 110}ms` } as CSSProperties} />
            ));
          case "sigil":
          default:
            return (
              <div key={ti} className="fx-sigil" style={{ ...vars, left: t.x, top: t.feet - t.w * 0.18, width: t.w * 1.6, height: t.w * 1.6, animationDelay: `${d0}ms` }}>
                <span style={{ fontSize: glyphSize(t) * 1.1 }}>{theme.glyph}</span>
              </div>
            );
        }
      })}
    </>
  );
}

/** 컷인: 화면이 어두워지고 캐릭터가 크게 들어오며 스킬 이름 */
function CutIn({ u, theme, name, effect, boss }: { u: BattleCard; theme: FxTheme; name: string; effect: string; boss: boolean }) {
  const [c0, c1, c2] = theme.colors;
  return (
    <div className="fx-cutin pointer-events-none absolute inset-0 z-[70] overflow-hidden" style={{ ["--c0" as string]: c0, ["--c1" as string]: c1, ["--c2" as string]: c2 } as CSSProperties}>
      <div className="fx-cutin-dim absolute inset-0" />
      <div className={`fx-cutin-band absolute inset-x-[-10%] top-[30%] h-[40%] ${boss ? "fx-from-r" : "fx-from-l"}`} />
      <span className="fx-cutin-glyph absolute inset-x-0 top-[22%] text-center font-black">{theme.glyph}</span>
      <div className={`fx-cutin-char absolute bottom-[18%] h-[78%] ${boss ? "right-[2%] fx-from-r" : "left-[2%] fx-from-l"}`}>
        {u.battleArtUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.battleArtUrl} alt="" className="h-full w-auto max-w-none" style={{ transform: boss ? "scaleX(-1)" : undefined }} draggable={false} />
        ) : u.artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.artUrl} alt="" className="aspect-[3/4] h-full rounded-2xl object-cover object-[center_18%] ring-4" style={{ ["--tw-ring-color" as string]: c0 }} draggable={false} />
        ) : null}
      </div>
      <div className={`fx-cutin-title absolute top-[38%] ${boss ? "left-[4%] text-left" : "right-[4%] text-right"}`}>
        <div className="text-[11px] font-bold tracking-[0.3em] text-white/80 sm:text-xs">{u.name} · {effect}</div>
        <div className="fx-title-text text-2xl font-black leading-tight sm:text-4xl">{name}</div>
      </div>
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
  const [impacted, setImpacted] = useState(true);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 360, H: 300 });
  const done = idx >= replay.events.length;
  const current = idx > 0 ? replay.events[idx - 1] : null;
  const t = 1 / speed; // 시간 배율

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 다음 사건으로 · 맞는 순간에 체력·피해 숫자 반영
  useEffect(() => {
    if (done) return;
    const ev = replay.events[idx];
    const step = setTimeout(() => setIdx((i) => i + 1), (idx === 0 ? 900 : DUR[ev.t]) * t);
    return () => clearTimeout(step);
  }, [idx, done, t, replay.events]);
  useEffect(() => {
    const kind = current?.t;
    if (kind !== "attack" && kind !== "skill") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 새 사건이 시작되면 '맞기 전' 상태로 돌렸다가 맞는 순간에 반영
    setImpacted(reduced());
    const h = setTimeout(() => setImpacted(true), IMPACT[kind] * t);
    return () => clearTimeout(h);
  }, [idx, current?.t, t]);

  const st = stateAt(units, replay.events, impacted ? idx : Math.max(0, idx - 1));
  const actor = current && (current.t === "attack" || current.t === "skill") ? current.actor : null;
  const skill = current?.t === "skill" ? current : null;
  const targets = new Set<string>(current?.t === "attack" ? [current.target] : skill ? skill.hits.map((h) => h.target) : []);
  const dmgOf = (key: string) => (current?.t === "attack" && current.target === key ? current.dmg : skill ? skill.hits.find((h) => h.target === key)?.dmg : undefined);
  const healTarget = skill?.heal ?? null;
  const caster = actor ? byKey.get(actor) : undefined;
  const theme = caster ? fxTheme(caster.name, skill?.name) : null;
  const { W, H } = size;
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
    const hit = targets.has(u.key) && impacted;
    const dmg = hit ? dmgOf(u.key) : undefined;
    const healed = impacted && healTarget?.target === u.key ? healTarget.amount : 0;
    const anim = s.dead ? "bs-faint" : isActor ? (skill ? "bs-cast" : boss ? "bs-lunge-l" : "bs-lunge-r") : hit ? (skill ? "bs-hit bs-hit-big" : "bs-hit") : "";
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
            <span style={{ color: RAR_TEXT[u.rarity] }}>{RARITY_LABEL[u.rarity]}</span> {u.name} <span className="font-normal text-white/70">Lv.{u.level}</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/20">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(s.hp / s.max) * 100}%`, background: s.hp / s.max > 0.5 ? "#5fd08f" : s.hp / s.max > 0.25 ? "#f2c14e" : "#ef6a5a" }} />
          </div>
          {boss && <div className="text-[9px] tabular-nums text-white/70">{s.hp}/{s.max}</div>}
        </div>
        {/* 그림자 */}
        <div className="absolute -bottom-[3%] left-1/2 h-[9%] w-[80%] -translate-x-1/2 rounded-[50%] bg-black/45 blur-[2px]" />
        {/* 몸 */}
        <div className={`relative h-full ${s.dead ? "" : "bs-idle"}`} style={{ animationDelay: `${-i * 0.37}s` }}>
          <div key={`${u.key}-${idx}-${hit ? 1 : 0}`} className={`h-full ${anim}`}>
            <div className={`h-full ${isActor && skill ? "bs-aura" : ""}`} style={isActor && skill && theme ? { ["--aura" as string]: theme.colors[0] } : undefined}>
              <div className={`bs-rar bs-rar-${u.rarity} relative h-full`}>
                {/* 등급 기운: 바닥 빛 · 뒤 광채 · (영웅·전설) 떠오르는 빛가루 · (전설) 후광 */}
                {u.rarity !== "common" && <span className="bs-rar-floor" aria-hidden />}
                {(u.rarity === "epic" || u.rarity === "legendary") && (
                  <span className="bs-rar-motes" aria-hidden>
                    {[0, 1, 2, 3, 4].map((k) => (
                      <i key={k} style={{ left: `${14 + k * 17}%`, animationDelay: `${(k * 0.43 + i * 0.2) % 2}s` }} />
                    ))}
                  </span>
                )}
                {u.rarity === "legendary" && <span className="bs-rar-halo" aria-hidden />}
                <Figure u={u} boss={boss} />
              </div>
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
        {healed > 0 && (
          <div key={`fx-${idx}`} className="absolute inset-0" aria-hidden>
            {[0, 1, 2, 3, 4, 5, 6].map((k) => (
              <span key={k} className="bs-heal absolute bottom-[10%] h-2 w-2 rounded-full" style={{ left: `${10 + k * 13}%`, animationDelay: `${k * 0.07}s`, background: theme?.colors[2] ?? "#9ff0bf", boxShadow: `0 0 10px ${theme?.colors[0] ?? "#9ff0bf"}` }} />
            ))}
          </div>
        )}
        {dmg !== undefined && (
          <span key={`d-${idx}`} className={`fx-dmg z-40 ${skill ? "fx-dmg-big" : ""}`} style={{ ["--c0" as string]: skill && theme ? theme.colors[2] : "#fff1e8" } as CSSProperties}>
            {dmg}
          </span>
        )}
        {healed > 0 && (
          <span key={`h-${idx}`} className="fx-dmg z-40" style={{ ["--c0" as string]: "#9ff0bf" } as CSSProperties}>
            +{healed}
          </span>
        )}
      </div>
    );
  };

  // 이번 사건의 화면 효과 (전장 좌표)
  const fx = (() => {
    if (!current || !caster || !theme || reduced()) return null;
    const from = boxOf(caster.key, W, H);
    const imp = IMPACT[current.t === "skill" ? "skill" : "attack"] * t;
    if (current.t === "attack") {
      const b = boxOf(current.target, W, H);
      return (
        <>
          <span className="fx-swing" style={{ left: b.x, top: b.y, width: b.w * 1.3, height: b.w * 1.3, animationDelay: `${imp - 80 * t}ms`, ["--c0" as string]: theme.colors[0], ["--c2" as string]: theme.colors[2], ["--r" as string]: caster.key.startsWith("foe") ? "200deg" : "-20deg" } as CSSProperties} />
          <Burst b={b} theme={theme} big={false} delay={imp} />
        </>
      );
    }
    if (current.t !== "skill") return null;
    const sk = current;
    const boss = caster.key.startsWith("foe");
    const hitBoxes = sk.hits.map((h) => boxOf(h.target, W, H));
    const allyBoxes = sk.heal ? [boxOf(sk.heal.target, W, H)] : (sk.guarded ?? []).map((k) => boxOf(k, W, H));
    const targetsBoxes = hitBoxes.length ? hitBoxes : allyBoxes;
    return (
      <>
        <CutIn u={caster} theme={theme} name={sk.name} effect={SKILL_EFFECTS[sk.effect].name} boss={boss} />
        {/* 시전 마법진 */}
        <div className="fx-sigil fx-sigil-cast" style={{ left: from.x, top: from.feet - from.w * 0.15, width: from.w * 1.5, height: from.w * 1.5, animationDelay: `${650 * t}ms`, ["--c0" as string]: theme.colors[0], ["--c1" as string]: theme.colors[1], ["--c2" as string]: theme.colors[2] } as CSSProperties}>
          <span style={{ fontSize: Math.max(12, from.w * 0.3 * (theme.glyph.length > 2 ? 2.4 / theme.glyph.length + 0.2 : 1)) }}>{theme.glyph}</span>
        </div>
        <Motif theme={theme} from={from} to={targetsBoxes} H={H} delay={850 * t} />
        {hitBoxes.map((b, k) => (
          <Burst key={k} b={b} theme={theme} big delay={imp + k * 60 * t} />
        ))}
        {allyBoxes.length > 0 && !hitBoxes.length && allyBoxes.map((b, k) => <div key={k} className="fx-ally-glow" style={{ left: b.x, top: b.y, width: b.w * 1.4, height: b.h * 1.2, animationDelay: `${imp}ms`, ["--c0" as string]: theme.colors[0], ["--c2" as string]: theme.colors[2] } as CSSProperties} />)}
        {hitBoxes.length > 0 && <div className="fx-flash" style={{ animationDelay: `${imp}ms`, ["--c2" as string]: theme.colors[2] } as CSSProperties} />}
      </>
    );
  })();
  const shake = current && impacted && (current.t === "skill" ? (skill && skill.hits.length ? "fx-shake-big" : "") : current.t === "attack" ? "fx-shake" : "");

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-[#0c111b] text-white">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/70">
        {title}
        <span className="ml-auto flex gap-1">
          {[1, 2].map((v) => (
            <button key={v} type="button" onClick={() => setSpeed(v)} className={`rounded px-2 py-0.5 ${speed === v ? "bg-white text-[#0c111b]" : "bg-white/10"}`}>
              {v}×
            </button>
          ))}
          {!done && (
            <button type="button" onClick={() => setIdx(replay.events.length)} className="rounded bg-white/10 px-2 py-0.5">
              건너뛰기
            </button>
          )}
        </span>
      </div>
      <div ref={fieldRef} className="relative h-[19rem] overflow-hidden sm:h-[26rem]" aria-label="전장" style={{ ["--t" as string]: t } as CSSProperties}>
        <div className={`absolute inset-0 ${shake || ""}`}>
          <Scene tradition={tradition} bgUrl={bgUrl} />
          {replay.me.map((u, i) => unit(u, TEAM_SLOTS[i % TEAM_SLOTS.length], false, i))}
          {replay.foe.map((u, i) => unit(u, BOSS_SLOT, true, i + 3))}
          <div key={`fx-${idx}`} className="fx-layer pointer-events-none absolute inset-0 z-[60]">
            {fx}
          </div>
        </div>
      </div>
      <p className="min-h-10 border-t border-white/10 bg-black/30 px-3 py-2 text-center text-[13px] text-white/85" aria-live="polite">
        {narration}
      </p>
      {done && <div className="px-3 pb-4">{result}</div>}
    </section>
  );
}
