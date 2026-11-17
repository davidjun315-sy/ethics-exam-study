"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Crown, Flag } from "lucide-react";
import { isBossFloor, tierOf, TIERS } from "@/lib/game/tower";
import type { TeamCard } from "@/lib/game/tower-data";

const FH = 38; // 한 층 높이 (px)
const BASE = 34; // 받침 높이
const TIER_TONE: Record<number, { wall: string; lit: string; edge: string }> = {
  1: { wall: "#3a3f63", lit: "#ffe3a3", edge: "#59608f" },
  2: { wall: "#4a3a5c", lit: "#ffd08a", edge: "#6d5683" },
  3: { wall: "#3b2b55", lit: "#e7b8ff", edge: "#5b4382" },
  4: { wall: "#1f2347", lit: "#a8d8ff", edge: "#3b4382" },
};

/**
 * 탑 그림: 지금 구간(10층)을 층마다 쌓아 보여 주고, 내 위치(팀)가 어느 층인지 · 어디까지 깼는지 · 최고 기록을 한눈에.
 * from 을 주면 그 층에서 지금 층으로 올라가는 연출.
 */
export function TowerMap({
  floor,
  cleared,
  best,
  from,
  team,
  enemyName,
  mode,
}: {
  /** 내 위치 (도전 중: 이번에 들어갈 층 · 입구: 최고 기록 층) */
  floor: number;
  /** 이번 도전에서 깬 층 (입구에선 최고 기록) */
  cleared: number;
  best: number;
  from?: number | null;
  team: Pick<TeamCard, "cardId" | "name" | "artUrl" | "battleArtUrl">[];
  enemyName?: string | null;
  mode: "run" | "lobby";
}) {
  const at = Math.max(1, floor);
  const decade = Math.floor((at - 1) / 10); // 0 = 1~10층
  const lo = decade * 10 + 1;
  const floors = Array.from({ length: 10 }, (_, i) => lo + i); // 아래 → 위
  const tier = tierOf(at);
  const tone = TIER_TONE[tier];
  const posOf = (f: number) => BASE + (f - lo) * FH + FH / 2; // 아래에서부터 px
  // 올라가는 연출: 처음엔 이전 층(다른 구간이면 받침 아래)에서 시작
  const start = from && from !== at ? (from >= lo ? posOf(from) : BASE / 2) : posOf(at);
  const [pos, setPos] = useState(start);
  useEffect(() => {
    const t = setTimeout(() => setPos(posOf(at)), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  const climbing = pos !== posOf(at);
  const height = BASE + FH * 10 + 70;
  const lead = team[0];

  return (
    <div className="relative mx-auto w-full max-w-md select-none" style={{ height }} data-tower-map aria-label={`사상의 탑 ${lo}~${lo + 9}층 · ${mode === "run" ? `지금 ${at}층` : `최고 ${best}층`}`}>
      {/* 위 구간 안내 */}
      <div className="absolute inset-x-0 top-0 text-center text-[10px] font-semibold text-white/60">{TIERS[tierOf(lo + 10)].name} · {lo + 10}층부터 ▲</div>

      {/* 탑 */}
      <div className="absolute inset-x-[16%] bottom-0 flex flex-col-reverse items-center" style={{ height: height - 16 }}>
        {/* 받침 */}
        <div className="relative w-full rounded-t-md" style={{ height: BASE, background: `linear-gradient(180deg, ${tone.edge}, #141830)` }}>
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] font-bold text-white/70">{decade === 0 ? "탑 입구" : `${lo - 1}층까지 ✓`}</span>
        </div>
        {floors.map((f, i) => {
          const done = f <= cleared;
          const here = f === at;
          const boss = isBossFloor(f);
          const w = 100 - i * 3.2;
          const isBest = f === best && best > 0;
          return (
            <div
              key={f}
              className={`relative flex shrink-0 items-center justify-between border-x border-t px-2 transition-colors ${here ? "z-10" : ""}`}
              style={{
                height: FH,
                width: `${w}%`,
                background: boss ? `linear-gradient(180deg, #5a1830, ${tone.wall})` : tone.wall,
                borderColor: here ? "#ffd36b" : "rgba(255,255,255,.12)",
                boxShadow: here ? "0 0 0 2px #ffd36b, 0 0 24px rgba(255,211,107,.55)" : undefined,
              }}
              data-floor={f}
            >
              <span className={`w-9 shrink-0 text-[11px] font-black tabular-nums ${here ? "text-[#ffd36b]" : done ? "text-white" : "text-white/45"}`}>{f}층</span>
              {/* 창문: 깬 층은 불이 켜짐 */}
              <span className="flex flex-1 items-center justify-center gap-1.5">
                {Array.from({ length: Math.max(2, 5 - Math.floor(i / 3)) }, (_, k) => (
                  <span
                    key={k}
                    className={`h-3 w-2 rounded-t-full ${done || here ? "tower-window" : ""}`}
                    style={{ background: done ? tone.lit : here ? "#ffd36b" : "rgba(255,255,255,.12)", animationDelay: `${(f * 3 + k) * 0.29}s` } as CSSProperties}
                  />
                ))}
              </span>
              <span className="flex w-9 shrink-0 justify-end">
                {boss ? (
                  <Crown className={`h-3.5 w-3.5 ${done ? "text-[#ffd36b]" : "text-[#ff8a7a]"}`} aria-label="보스층" />
                ) : isBest && mode === "run" ? (
                  <Flag className="h-3.5 w-3.5 text-[#9fe0c0]" aria-label="최고 기록" />
                ) : done ? (
                  <span className="text-[10px] font-bold text-[#9fe0c0]">✓</span>
                ) : null}
              </span>
              {/* 지금 층의 적 */}
              {here && enemyName && mode === "run" && (
                <span className="absolute left-full ml-1.5 max-w-[88px] truncate whitespace-nowrap rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  {boss ? "👑 " : ""}
                  {enemyName}
                </span>
              )}
              {isBest && mode === "lobby" && (
                <span className="absolute left-full ml-1.5 flex items-center gap-0.5 whitespace-nowrap rounded-full bg-[#ffd36b] px-1.5 py-0.5 text-[10px] font-black text-[#3a2600]">
                  <Flag className="h-3 w-3" /> 최고
                </span>
              )}
            </div>
          );
        })}
        {/* 지붕 · 첨탑 */}
        <div className="h-0 w-0 border-x-[38px] border-b-[34px] border-x-transparent" style={{ borderBottomColor: tone.edge }} />
        <div className="h-4 w-1 rounded-t bg-[#ffd36b]/80" />
      </div>

      {/* 내 위치: 팀 표시 (층을 따라 올라감) */}
      {(mode === "run" || best > 0) && (
        <div
          className="absolute left-0 z-20 flex translate-y-1/2 items-center gap-0.5 transition-[bottom] duration-[900ms] ease-[cubic-bezier(.3,.8,.3,1)]"
          style={{ bottom: pos }}
          data-tower-me
        >
          <span className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[#ffd36b] bg-[#1a2234] shadow-[0_0_14px_rgba(255,211,107,.6)] ${climbing ? "tower-hop" : ""}`}>
            {lead?.battleArtUrl || lead?.artUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(lead.battleArtUrl ?? lead.artUrl)!} alt="" className={`h-full w-full ${lead.battleArtUrl ? "object-contain object-top scale-[1.6] translate-y-[22%]" : "object-cover object-[center_18%]"}`} />
            ) : (
              <span className="text-xs font-black text-white">나</span>
            )}
          </span>
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-[60%] whitespace-nowrap rounded-full bg-[#ffd36b] px-1 text-[9px] font-black leading-[14px] text-[#3a2600] shadow">{mode === "run" ? "나" : "기록"}</span>
          <span className="text-sm text-[#ffd36b] drop-shadow">▶</span>
        </div>
      )}
    </div>
  );
}
