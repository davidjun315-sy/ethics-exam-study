"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BattleCard, BattleReplay } from "@/lib/game/data";
import { ROLE_COLOR, ROLES, SKILL_EFFECTS, type Rarity, type SkillEffect } from "@/lib/game/rules";
import { stateAt, useImpact } from "./BattleTab";
import { fxTheme, type FxTheme } from "@/lib/game/skillFx";
import { BOSS_PATTERNS, chargeAt, SKILL_READY, type BossPattern } from "@/lib/game/battle";
import { SynergyChips } from "./SynergyChips";
import type { DialogueLine } from "@/lib/game/dialogue";

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
// 아군 3명은 모두 같은 크기 (원근 없이), 겹치지 않게 앞뒤로 엇갈려 배치
const TEAM_SLOTS: { left: number; bottom: number; scale: number }[] = [
  { left: 19, bottom: 4, scale: 0.86 },
  { left: 2, bottom: 20, scale: 0.86 },
  { left: 37, bottom: 20, scale: 0.86 },
];
const roleOf = (e: SkillEffect) => ROLES[e]?.name ?? "";

/** 전장 아래: 출전한 사상가의 성향 · 필살기 */
function Roster({ units, st, foeLabel, synergy, pattern }: { units: { side: "me" | "foe"; list: BattleCard[] }[]; st: Record<string, { dead: boolean }>; foeLabel: string; synergy?: BattleReplay["synergy"]; pattern?: BossPattern | null }) {
  return (
    <div className="grid gap-2 border-t border-white/10 bg-black/20 px-3 py-2.5 sm:grid-cols-2">
      {units.map(({ side, list }) => (
        <div key={side}>
          <h3 className="mb-1 text-[11px] font-bold text-white/60">{side === "me" ? "내 팀" : foeLabel}</h3>
          {synergy && synergy[side].length > 0 && (
            <div className="mb-1.5">
              <SynergyChips list={synergy[side]} dark />
            </div>
          )}
          {side === "foe" && pattern && (
            <p className="mb-1.5 rounded-lg border border-[#ef6a5a]/40 bg-[#ef6a5a]/10 px-2 py-1 text-[11px] text-[#ffb4a8]">
              <b>특수 패턴 「{BOSS_PATTERNS[pattern].name}」</b> · {BOSS_PATTERNS[pattern].desc}
            </p>
          )}
          <ul className="space-y-1">
            {list.map((u) => (
              <li key={u.key} className={`flex items-start gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs ${st[u.key]?.dead ? "opacity-45" : ""}`} data-roster={u.key}>
                <span className="mt-px shrink-0 rounded px-1.5 py-px text-[10px] font-black text-[#0c111b]" style={{ background: ROLE_COLOR[u.skillEffect] }}>
                  {roleOf(u.skillEffect)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{u.name}</span>
                  <span className="ml-1 tabular-nums text-white/55">공 {u.atk} · 체 {u.hp}</span>
                  <span className="block text-white/80">
                    <b className="text-[#ffd36b]">✦ {u.skillName}</b> <span className="text-white/55">· {SKILL_EFFECTS[u.skillEffect].name}: {SKILL_EFFECTS[u.skillEffect].desc}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const BOSS_SLOT = { right: 4, bottom: 5, scale: 1.55 };
// 수하가 있는 관: 보스는 조금 작게 오른쪽 뒤, 수하는 보스 앞쪽 · 내 팀은 조금 왼쪽으로
const TEAM_SLOTS_TIGHT: { left: number; bottom: number; scale: number }[] = [
  { left: 12, bottom: 4, scale: 0.86 },
  { left: 0, bottom: 20, scale: 0.86 },
  { left: 24, bottom: 20, scale: 0.86 },
];
// 보스는 뒤쪽(조금 위)에 크게, 수하 둘은 앞줄에 나란히 → 이름표가 겹치지 않음
const FOE_SLOTS_MULTI: { right: number; bottom: number; scale: number }[] = [
  { right: 1, bottom: 24, scale: 1.3 },
  { right: 36, bottom: 2, scale: 0.78 },
  { right: 15, bottom: 2, scale: 0.78 },
];
type Slot = { left?: number; right?: number; bottom: number; scale: number };
/** 자리: 키(me-0 · foe-1 …)와 적 수로 정함 (화면 배치 · 효과 위치 공통) */
function slotOf(key: string, foes: number): Slot {
  const i = Number(key.split("-")[1]) || 0;
  if (key.startsWith("foe")) return foes > 1 ? FOE_SLOTS_MULTI[i % FOE_SLOTS_MULTI.length] : BOSS_SLOT;
  const team = foes > 1 ? TEAM_SLOTS_TIGHT : TEAM_SLOTS;
  return team[i % team.length];
}

/** 전장 날씨: 동양·한국 꽃잎 · 서양·사회 빛먼지 · 특수 보스 관은 어두운 하늘과 번개 (장식, 동작 줄이기면 끔) */
function Weather({ kind }: { kind: "petals" | "dust" | "storm" }) {
  return (
    <div className={`weather weather-${kind} pointer-events-none absolute inset-0 z-[2] overflow-hidden`} aria-hidden>
      {kind === "storm" && <span className="weather-flash absolute inset-0" />}
      {Array.from({ length: kind === "storm" ? 0 : 9 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37 + 7) % 100}%`, animationDelay: `${-((i * 1.7) % 9)}s`, animationDuration: `${8 + ((i * 3) % 6)}s` } as CSSProperties} />
      ))}
    </div>
  );
}

function Scene({ tradition, bgUrl, weather }: { tradition: string; bgUrl?: string; weather?: "petals" | "dust" | "storm" }) {
  const east = tradition === "동양윤리" || tradition === "한국윤리";
  // 관리자가 올린 배경 그림 (분야별). 아래쪽을 기준으로 채우고, 글자가 잘 보이게 위·아래를 살짝 어둡게
  if (bgUrl)
    return (
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover object-bottom" draggable={false} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,10,18,.35) 0%, transparent 22%, transparent 70%, rgba(8,10,18,.35) 100%)" }} />
        {weather && <Weather kind={weather} />}
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
      {weather && <Weather kind={weather} />}
    </div>
  );
}

/** 보스 등장 컷인: 관 번호 · 보스 · 등급 · 수하 · 특수 패턴 경고 (잠깐 보이고 저절로, 누르면 바로 넘어감) */
/**
 * 이미지를 미리 받아 두기: 전장 배경 · 캐릭터 그림이 다 준비되면 true.
 * 컷인 · 배틀이 그림보다 먼저 시작해 글자만 보이던 문제를 막는다. 느리거나 실패해도 timeoutMs 뒤에는 진행.
 */
function useImagesReady(urls: (string | null | undefined)[], timeoutMs = 4000): boolean {
  const list = useMemo(() => [...new Set(urls.filter((u): u is string => Boolean(u)))], [urls]);
  const key = list.join("|");
  const [readyKey, setReadyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!list.length) return;
    let alive = true;
    const finish = () => alive && setReadyKey(key);
    const timer = window.setTimeout(finish, timeoutMs);
    Promise.all(
      list.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => resolve());
            img.onerror = () => resolve();
            img.src = src;
          }),
      ),
    ).then(() => {
      window.clearTimeout(timer);
      finish();
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, timeoutMs]);
  return !list.length || readyKey === key;
}

function BossEntrance({ boss, minions, stageNo, pattern, onDone }: { boss?: BattleCard; minions: number; stageNo?: number; pattern: BossPattern | null; onDone: () => void }) {
  if (!boss) return null;
  return (
    <div className={`boss-entrance absolute inset-0 z-[95] cursor-pointer select-none overflow-hidden ent-${boss.rarity}`} onClick={onDone} role="dialog" aria-label={`${stageNo ? `${stageNo}관 · ` : ""}보스 ${boss.name} 등장`}>
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/25" />
      <div className="ent-rays absolute inset-0" aria-hidden />
      <div className="ent-char absolute bottom-[4%] right-[4%] h-[86%]">
        <Figure u={boss} boss />
      </div>
      <div className="ent-text absolute left-[5%] top-1/2 max-w-[62%] -translate-y-1/2">
        {stageNo && <div className="text-[11px] font-bold tracking-[0.35em] text-white/70 sm:text-xs">{stageNo}관</div>}
        <div className="mt-0.5 text-[11px] font-black tracking-[0.2em] sm:text-sm" style={{ color: RAR_TEXT[boss.rarity] }}>
          {RARITY_LABEL[boss.rarity]} · Lv.{boss.level}
        </div>
        <div className="ent-name mt-1 text-3xl font-black leading-none text-white sm:text-5xl">{boss.name}</div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold sm:text-xs">
          <span className="rounded bg-[#ef6a5a] px-1.5 py-0.5 text-white">보스</span>
          {minions > 0 && <span className="rounded bg-white/15 px-1.5 py-0.5 text-white/90">수하 {minions}명</span>}
          {pattern && <span className="ent-warn rounded bg-[#ffd36b] px-1.5 py-0.5 text-[#3a1a00]">⚠ 특수 패턴 「{BOSS_PATTERNS[pattern].name}」</span>}
        </div>
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/45">눌러서 넘기기</div>
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
const DUR = { attack: 950, skill: 2300, stunned: 700, phase: 1900, faint: 600, end: 500 } as const;
// 돌진(bs-lunge)이 가장 앞에 나간 때 · 필살기 연출(컷인 → 마법진 → 날아가는 효과)이 닿는 때
const IMPACT = { attack: 230, skill: 1250 } as const;

type Box = { x: number; y: number; feet: number; top: number; w: number; h: number };



/** 전장 안 캐릭터 위치 (px) */
function boxOf(key: string, W: number, H: number, foes = 1): Box {
  const slot = slotOf(key, foes);
  const h = H * 0.3 * slot.scale;
  const w = h * 0.82;
  const feet = H - (slot.bottom / 100) * H;
  const x = slot.right !== undefined ? W - (slot.right / 100) * W - w / 2 : ((slot.left ?? 0) / 100) * W + w / 2;
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
    <div className={`fx-cutin fx-cutin-r-${u.rarity} pointer-events-none absolute inset-0 z-[70] overflow-hidden`} style={{ ["--c0" as string]: c0, ["--c1" as string]: c1, ["--c2" as string]: c2 } as CSSProperties}>
      <div className="fx-cutin-dim absolute inset-0" />
      {/* 전설: 뒤에서 금빛 빛살 */}
      {u.rarity === "legendary" && <div className="fx-cutin-rays absolute inset-0" aria-hidden />}
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
      <div className={`fx-cutin-title fx-cutin-plate absolute top-[38%] max-w-[62%] ${boss ? "left-[4%] text-left" : "right-[4%] text-right"}`}>
        <div className="fx-title-sub text-[11px] font-bold tracking-[0.3em] opacity-90 sm:text-xs">{u.name} · {effect}</div>
        <div className="fx-title-text text-2xl font-black leading-tight sm:text-4xl">{name}</div>
      </div>
    </div>
  );
}

/** 배틀 전 논쟁 장면: 말하는 사상가가 자기 쪽에 크게, 아래 대사 상자 (누르면 다음) */
function DebateOverlay({ line, at, total, byKey, onNext, onSkip }: { line: DialogueLine; at: number; total: number; byKey: Map<string, BattleCard>; onNext: () => void; onSkip: () => void }) {
  const u = line.key ? byKey.get(line.key) : undefined;
  const boss = line.who === "boss";
  const narration = line.who === "narration";
  return (
    <div className="debate absolute inset-0 z-[90] cursor-pointer select-none" onClick={onNext} role="dialog" aria-label="배틀 전 논쟁" aria-live="polite">
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/30" />
      {u && (
        <div key={`${at}-${u.key}`} className={`debate-char absolute bottom-[26%] h-[62%] ${boss ? "debate-from-r right-[3%]" : "debate-from-l left-[3%]"}`}>
          <Figure u={u} boss={boss} />
        </div>
      )}
      <div key={at} className={`debate-box absolute inset-x-2 bottom-2 rounded-xl border px-3 py-2.5 sm:inset-x-6 sm:bottom-4 sm:px-4 sm:py-3 ${narration ? "border-white/15 bg-black/60 text-center" : boss ? "border-[#ef6a5a]/50 bg-[#1a0f12]/90" : "border-[#7fb2ff]/50 bg-[#0e1626]/90"}`}>
        {!narration && u && (
          <div className={`mb-1 flex items-center gap-1.5 text-xs font-black ${boss ? "justify-end text-[#ff9f92]" : "text-[#9fc6ff]"}`}>
            <span className={`rounded px-1.5 py-px text-[10px] ${boss ? "bg-[#ef6a5a] text-white" : "bg-[#5aa2ff] text-white"}`}>{boss ? "보스" : "내 팀"}</span>
            {u.name}
          </div>
        )}
        <p className={`text-[13px] leading-relaxed text-white sm:text-[15px] ${narration ? "font-bold italic text-[#ffe7a8]" : ""}`}>{line.text}</p>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/50">
          <span>
            {at + 1}/{total} · 게임을 위한 창작 대사
          </span>
          <span className="flex gap-1.5">
            <button
              type="button"
              className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                onSkip();
              }}
            >
              대화 넘기기 ≫
            </button>
            <span className="rounded bg-white/15 px-2 py-0.5 font-bold text-white">{at + 1 < total ? "다음 ▶" : "겨루기 시작 ▶"}</span>
          </span>
        </div>
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
  intro,
}: {
  replay: BattleReplay;
  tradition: string;
  bgUrl?: string;
  title?: ReactNode;
  result?: ReactNode;
  /** 배틀 전 논쟁 대사 (끝나야 배틀 시작) */
  intro?: DialogueLine[];
}) {
  const units = useMemo(() => [...replay.me, ...replay.foe], [replay]);
  const byKey = useMemo(() => new Map(units.map((u) => [u.key, u])), [units]);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 360, H: 300 });
  const done = idx >= replay.events.length;
  const current = idx > 0 ? replay.events[idx - 1] : null;
  // 배틀 전 논쟁: 다 넘기면(또는 건너뛰면) 배틀 시작
  const [introAt, setIntroAt] = useState(0);
  // 보스 등장 컷인 (도장깨기만, 논쟁 전에)
  const [entered, setEntered] = useState(!intro?.length);
  const [showResult, setShowResult] = useState(true);
  // 그림을 먼저 받아 두고 시작 (배경 · 전투 캐릭터 · 논쟁 초상)
  const imagesReady = useImagesReady(useMemo(() => [bgUrl, ...units.flatMap((u) => [u.battleArtUrl, u.artUrl])], [bgUrl, units]));
  const talking = !imagesReady || !entered || (Boolean(intro?.length) && introAt < (intro?.length ?? 0));
  // 도장깨기 기록이면 보스 특수 패턴
  const pattern = (replay as BattleReplay & { stage?: { pattern?: BossPattern | null } }).stage?.pattern ?? null;
  const nFoes = replay.foe.length;
  // 마지막 일격 (끝 직전의 공격·필살기): 느리게 · 살짝 확대 · K.O.
  const finaleIdx = useMemo(() => {
    for (let i = replay.events.length - 1; i >= 0; i--) if (replay.events[i].t === "attack" || replay.events[i].t === "skill") return i;
    return -1;
  }, [replay.events]);
  const isFinale = idx - 1 === finaleIdx && finaleIdx >= 0;
  const win = replay.winner === "me";
  const t = (1 / speed) * (isFinale ? 1.8 : 1); // 시간 배율 (마지막 일격은 슬로모션)

  // 배틀이 열리면 화면 위쪽(고정 머리글 아래)에 맞춤: 대기실을 내려 본 채로 '도전'을 누르면 전장 위가 머리글에 가리던 문제
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 72 || top > window.innerHeight * 0.4) el.scrollIntoView({ block: "start", behavior: "auto" });
  }, []);

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 다음 사건으로 · 맞는 순간에 체력·피해 숫자 반영
  useEffect(() => {
    if (done || talking) return;
    // 지금 재생 중인 사건(current)의 길이만큼 기다린 뒤 다음 사건으로
    const cur = idx > 0 ? replay.events[idx - 1] : null;
    const step = setTimeout(() => setIdx((i) => i + 1), (cur ? DUR[cur.t] : 900) * t);
    return () => clearTimeout(step);
  }, [idx, done, t, replay.events, talking]);
  // 등장 컷인은 잠깐 보여 주고 저절로 (누르면 바로) 논쟁으로.
  // 시간은 그림이 준비되어 컷인이 실제로 보이기 시작한 때부터 잰다 (그림을 기다리는 동안 시간이 흘러 글자만 보이다 넘어가지 않게)
  useEffect(() => {
    if (entered || !imagesReady) return;
    const h = setTimeout(() => setEntered(true), 2300);
    return () => clearTimeout(h);
  }, [entered, imagesReady]);
  // 대사는 자동으로 넘어가지 않음: 화면을 누르거나 '다음'을 눌러야 넘어감

  // 맞는 순간(돌진이 닿을 때 · 필살기 효과가 터질 때)에 체력·피해 숫자 반영. 움직임 줄이기 설정이면 바로
  const { impacted, shown } = useImpact(idx, current, t, IMPACT);
  const st = stateAt(units, replay.events, shown);
  const charge = chargeAt(units.map((u) => u.key), replay.events, shown);
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
      ? `${byKey.get(current.actor)?.name}의 공격 → ${byKey.get(current.target)?.name}${impacted ? ` ${current.dmg}${current.crit ? " · 치명타!" : ""}${current.shielded ? " (수호막으로 반감)" : ""}` : ""}`
      : current.t === "skill"
        ? `${byKey.get(current.actor)?.name}의 필살기 「${current.name}」`
        : current.t === "stunned"
          ? `${byKey.get(current.actor)?.name}이(가) 기절해 한 번 쉽니다`
          : current.t === "faint"
            ? `${byKey.get(current.target)?.name} 쓰러짐`
            : current.t === "phase"
              ? `${byKey.get(current.actor)?.name}의 패턴 「${BOSS_PATTERNS[current.pattern].name}」 발동! ${BOSS_PATTERNS[current.pattern].desc.split("면 ")[1] ?? ""}`
              : current.winner === "me"
              ? "승리!"
              : "패배…";

  const unit = (u: BattleCard, slot: { left?: number; right?: number; bottom: number; scale: number }, boss: boolean, i: number) => {
    const s = st[u.key];
    const crit = current?.t === "attack" && current.crit === true && current.target === u.key;
    // 수하: 휴대폰에선 이름표를 짧게 (이름 · 체력만)
    const minion = boss && u.key !== "foe-0";
    const isActor = actor === u.key;
    const hit = targets.has(u.key) && impacted;
    const dmg = hit ? dmgOf(u.key) : undefined;
    const healed = impacted && healTarget?.target === u.key ? healTarget.amount : 0;
    const anim = s.dead ? "bs-faint" : done && win && !boss ? "bs-victory" : isActor ? (skill ? "bs-cast" : boss ? "bs-lunge-l" : "bs-lunge-r") : hit ? (skill ? "bs-hit bs-hit-big" : "bs-hit") : "";
    const h = 30 * slot.scale; // 전장 높이 대비 %
    const style: CSSProperties = { bottom: `${slot.bottom}%`, height: `${h}%`, zIndex: 10 + Math.round(30 - slot.bottom) };
    if (slot.left !== undefined) style.left = `${slot.left}%`;
    if (slot.right !== undefined) style.right = `${slot.right}%`;
    // 전장 가장자리에 선 사상가는 이름표를 안쪽으로 맞춤 (휴대폰에서 체력 · 필살 게이지가 화면 밖으로 잘리지 않게)
    const edge = slot.right !== undefined && slot.right < 10 ? "right" : slot.left !== undefined && slot.left < 4 ? "left" : null;
    return (
      <div key={u.key} className="absolute" style={style} data-unit={u.key} aria-label={`${u.name} 체력 ${s.hp}/${s.max}${s.dead ? " 쓰러짐" : ""}`}>
        {/* 이름 · 체력 */}
        <div
          className={`absolute bottom-full mb-1 text-center ${edge === "right" ? "right-0" : edge === "left" ? "left-0" : "left-1/2 -translate-x-1/2"} ${minion ? "w-[104%] sm:w-[max(4.5rem,110%)]" : "w-[max(4.5rem,110%)]"}`}
          style={{ opacity: s.dead ? 0.35 : 1 }}
        >
          <div className="truncate text-[10px] font-bold text-white drop-shadow sm:text-xs">
            {boss && (u.key === "foe-0" ? <span className="mr-1 rounded bg-[#ef6a5a] px-1 text-[9px]">보스</span> : <span className="mr-1 rounded bg-white/20 px-1 text-[9px]">수하</span>)}
            <span className={minion ? "hidden sm:inline" : ""} style={{ color: RAR_TEXT[u.rarity] }}>{RARITY_LABEL[u.rarity]} </span>
            <span style={minion ? { color: RAR_TEXT[u.rarity] } : undefined}>{u.name}</span>
            <span className={`font-normal text-white/70 ${minion ? "hidden sm:inline" : ""}`}> Lv.{u.level}</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/20">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(s.hp / s.max) * 100}%`, background: s.hp / s.max > 0.5 ? "#5fd08f" : s.hp / s.max > 0.25 ? "#f2c14e" : "#ef6a5a" }} />
          </div>
          {/* 필살기 게이지: 0 에서 시작해 기본 공격할 때마다 차오르고, 가득 차면 다음 행동에 필살기 */}
          {!s.dead && (
            <div className="mt-0.5 flex items-center gap-1" aria-label={`필살기 게이지 ${Math.min(SKILL_READY, charge[u.key] ?? 0)}/${SKILL_READY}`}>
              <div className={`h-1 flex-1 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/15 ${(charge[u.key] ?? 0) >= SKILL_READY ? "bs-gauge-full" : ""}`}>
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${(Math.min(SKILL_READY, charge[u.key] ?? 0) / SKILL_READY) * 100}%`, background: (charge[u.key] ?? 0) >= SKILL_READY ? "linear-gradient(90deg,#ffd36b,#fff3c4)" : "linear-gradient(90deg,#5aa2ff,#9fd8ff)" }}
                />
              </div>
              {(charge[u.key] ?? 0) >= SKILL_READY && <span className="bs-gauge-label text-[8px] font-black text-[#ffd36b] sm:text-[9px]">필살</span>}
            </div>
          )}
          {/* 성향 · 필살기 이름 */}
          <div className={`mt-0.5 items-center justify-center gap-1 text-[8px] leading-tight sm:text-[10px] ${minion ? "hidden sm:flex" : "flex"}`} style={{ opacity: s.dead ? 0.35 : 1 }}>
            <span className="shrink-0 rounded px-1 font-black text-[#0c111b]" style={{ background: ROLE_COLOR[u.skillEffect] }}>
              {roleOf(u.skillEffect)}
            </span>
            <span className="truncate font-semibold text-[#ffe7a8] drop-shadow">✦ {u.skillName}</span>
          </div>
          {boss && u.key === "foe-0" && <div className="text-[9px] tabular-nums text-white/70">{s.hp}/{s.max}</div>}
        </div>
        {/* 그림자 */}
        <div className="absolute -bottom-[3%] left-1/2 h-[9%] w-[80%] -translate-x-1/2 rounded-[50%] bg-black/45 blur-[2px]" />
        {/* 몸 */}
        <div className={`relative h-full ${s.dead ? "" : "bs-idle"}`} style={{ animationDelay: `${-i * 0.37}s` }}>
          {/* 쓰러진 뒤에는 key 를 고정해 쓰러지는 동작이 사건마다 다시 재생되지 않게 */}
          <div key={s.dead ? `${u.key}-dead` : `${u.key}-${idx}-${hit ? 1 : 0}`} className={`h-full ${anim}`}>
            <div className={`h-full ${isActor && skill ? "bs-aura" : ""}`} style={isActor && skill && theme ? { ["--aura" as string]: theme.colors[0] } : undefined}>
              <div className={`bs-rar bs-rar-${u.rarity} relative h-full ${s.phase ? `bs-phase bs-phase-${s.phase}` : ""}`}>
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
          <span key={`d-${idx}`} className={`fx-dmg z-40 ${skill ? "fx-dmg-big" : crit ? "fx-dmg-crit" : ""}`} style={{ ["--c0" as string]: skill && theme ? theme.colors[2] : crit ? "#ffd36b" : "#fff1e8" } as CSSProperties}>
            {crit && <span className="fx-crit-tag">치명타!</span>}
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
    if (!current || !caster || !theme) return null;
    const from = boxOf(caster.key, W, H, nFoes);
    const imp = IMPACT[current.t === "skill" ? "skill" : "attack"] * t;
    if (current.t === "attack") {
      const b = boxOf(current.target, W, H, nFoes);
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
    const hitBoxes = sk.hits.map((h) => boxOf(h.target, W, H, nFoes));
    const allyBoxes = sk.heal ? [boxOf(sk.heal.target, W, H, nFoes)] : (sk.guarded ?? []).map((k) => boxOf(k, W, H, nFoes));
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
  const shake = current && impacted && (current.t === "skill" ? (skill && skill.hits.length ? "fx-shake-big" : "") : current.t === "attack" ? (current.crit ? "fx-shake-big" : "fx-shake") : "");

  return (
    <section ref={rootRef} className="scroll-mt-[4.5rem] overflow-hidden rounded-2xl border border-line bg-[#0c111b] text-white">
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/70">
        {title}
        <span className="ml-auto flex gap-1">
          {[1, 2].map((v) => (
            <button key={v} type="button" onClick={() => setSpeed(v)} className={`rounded px-2 py-0.5 ${speed === v ? "bg-white text-[#0c111b]" : "bg-white/10"}`}>
              {v}×
            </button>
          ))}
          {!done && (
            <button
              type="button"
              onClick={() => {
                setEntered(true);
                setIntroAt(intro?.length ?? 0);
                setIdx(replay.events.length);
              }}
              className="rounded bg-white/10 px-2 py-0.5"
            >
              건너뛰기
            </button>
          )}
        </span>
      </div>
      <div ref={fieldRef} className={`relative overflow-hidden transition-[height] duration-300 sm:h-[26rem] ${done && result && showResult ? "h-[23rem]" : "h-[19rem]"}`} aria-label="전장" style={{ ["--t" as string]: t } as CSSProperties}>
        <div className={`absolute inset-0 ${shake || ""} ${isFinale ? "fx-finale" : ""}`}>
          <Scene tradition={tradition} bgUrl={bgUrl} weather={pattern ? "storm" : tradition === "동양윤리" || tradition === "한국윤리" ? "petals" : "dust"} />
          {replay.me.map((u, i) => unit(u, slotOf(u.key, nFoes), false, i))}
          {replay.foe.map((u, i) => unit(u, slotOf(u.key, nFoes), true, i + 3))}
          {!imagesReady && (
            <div className="absolute inset-0 z-[96] flex items-center justify-center bg-[#0b0f1a]/85" role="status" aria-live="polite" data-battle-loading>
              <span className="flex items-center gap-2 text-xs font-semibold text-white/75">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white/80" aria-hidden />
                전장 준비 중…
              </span>
            </div>
          )}
          {imagesReady && !entered && <BossEntrance boss={replay.foe[0]} minions={replay.foe.length - 1} stageNo={(replay as BattleReplay & { stage?: { no?: number } }).stage?.no} pattern={pattern} onDone={() => setEntered(true)} />}
          {imagesReady && entered && talking && intro && <DebateOverlay line={intro[introAt]} at={introAt} total={intro.length} byKey={byKey} onNext={() => setIntroAt((i) => i + 1)} onSkip={() => setIntroAt(intro.length)} />}
          <div key={`fx-${idx}`} className="fx-layer pointer-events-none absolute inset-0 z-[60]">
            {fx}
            {isFinale && impacted && (
              <div className={`fx-ko absolute inset-x-0 top-[30%] text-center ${win ? "fx-ko-win" : "fx-ko-lose"}`}>
                <span>K.O.</span>
              </div>
            )}
            {current?.t === "phase" && (
              <div className={`fx-phase fx-phase-${current.pattern} absolute inset-x-0 top-[34%] text-center`}>
                <div className="text-[11px] font-bold tracking-[0.35em] text-white/85 sm:text-xs">특수 패턴</div>
                <div className="fx-phase-name text-4xl font-black sm:text-6xl">{BOSS_PATTERNS[current.pattern].name}!</div>
              </div>
            )}
          </div>
        </div>
        {/* 결과: 전장 위에 떠오름 (전장을 어둡게 · 이기면 금빛) */}
        {done && result && showResult && (
          <div className={`result-overlay absolute inset-0 z-[85] flex items-center justify-center overflow-y-auto p-3 ${replay.winner === "me" ? "result-win" : "result-lose"}`}>
            <button type="button" onClick={() => setShowResult(false)} className="absolute right-2 top-2 z-10 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/80 hover:bg-black/65" aria-label="결과 닫고 전장 보기">
              전장 보기 ✕
            </button>
            <div className="result-rise w-full max-w-sm">{result}</div>
          </div>
        )}
        {done && result && !showResult && (
          <button type="button" onClick={() => setShowResult(true)} className="absolute bottom-3 left-1/2 z-[85] -translate-x-1/2 rounded-full bg-[#ffd36b] px-4 py-1.5 text-xs font-black text-[#2a1d00] shadow-lg">
            결과 보기
          </button>
        )}
      </div>
      <p className="min-h-10 border-t border-white/10 bg-black/30 px-3 py-2 text-center text-[13px] text-white/85" aria-live="polite">
        {narration}
      </p>
      <Roster units={[{ side: "me", list: replay.me }, { side: "foe", list: replay.foe }]} st={st} foeLabel={replay.foe.length === 1 ? "보스" : "보스와 수하"} synergy={replay.synergy} pattern={pattern} />
    </section>
  );
}
