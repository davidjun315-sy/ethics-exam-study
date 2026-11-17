"use client";

import { useEffect, useState } from "react";
import { floorReward, isBossFloor, type TowerTier } from "@/lib/game/tower";
import type { TeamCard } from "@/lib/game/tower-data";

/**
 * 사상의 탑 그림 (SVG): 밤하늘 · 먼 산 · 안개 위에 돌로 쌓은 탑.
 * 층마다 처마 · 아치 창 (깬 층은 불이 켜짐) · 보스층 깃발 · 곡선 지붕과 빛나는 첨탑 · 아래 문.
 * 층마다 번호와 보상, 지금 층에는 상대, 내 위치(팀)는 탑 왼쪽에서 층을 따라 올라간다.
 */
export interface TowerPalette {
  sky: [string, string, string];
  wall: [string, string];
  trim: string;
  roof: [string, string];
  glow: string;
  mount: string;
}
export const TOWER_PALETTES: Record<TowerTier, TowerPalette> = {
  1: { sky: ["#0f1a36", "#2b3c72", "#6b6aa3"], wall: ["#e6dcc6", "#9a8d74"], trim: "#f4ecda", roof: ["#41598f", "#1f2c52"], glow: "#ffd98a", mount: "#1a2547" },
  2: { sky: ["#1c1330", "#5a3558", "#c27a63"], wall: ["#e9cfa2", "#9a7447"], trim: "#f8e4bd", roof: ["#8a3b2c", "#4a1c16"], glow: "#ffcf7a", mount: "#2a1a33" },
  3: { sky: ["#0b0a22", "#2a1f57", "#5b3f86"], wall: ["#b9b0d6", "#5a5180"], trim: "#ddd6f3", roof: ["#3a2a6e", "#1a1238"], glow: "#e6b8ff", mount: "#140f2f" },
  4: { sky: ["#03050f", "#0f1840", "#253a7a"], wall: ["#dfe6f5", "#7884a3"], trim: "#f6f9ff", roof: ["#203a7a", "#0d1838"], glow: "#bfe3ff", mount: "#070c24" },
};

const W = 360;
const TOP = 132; // 하늘 · 지붕
const FH = 46; // 한 층
const BASE = 78; // 받침 · 문 · 안개

function tierOfFloor(f: number): TowerTier {
  return f <= 10 ? 1 : f <= 20 ? 2 : f <= 30 ? 3 : 4;
}

/** 결정적 난수 (별 위치가 매번 같게) */
function rnd(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** 층 정보 */
export type FloorState = "done" | "here" | "next" | "locked";

export function TowerScene({
  floors,
  stateOf,
  tier,
  compact = false,
  showRewards = true,
  epicTicketGiven = false,
  hereLabel,
  dim = false,
}: {
  /** 아래 → 위 층 번호 */
  floors: number[];
  stateOf: (f: number) => FloorState;
  tier: TowerTier;
  compact?: boolean;
  showRewards?: boolean;
  epicTicketGiven?: boolean;
  hereLabel?: string | null;
  /** 잠긴 탑 (흐리게) */
  dim?: boolean;
}) {
  const p = TOWER_PALETTES[tier];
  const n = floors.length;
  const fh = compact ? 40 : FH;
  const H = TOP + n * fh + BASE;
  const cx = W / 2;
  const bottomW = compact ? 190 : 206;
  const taper = compact ? 9 : 5.2;
  const widthAt = (i: number) => bottomW - i * taper; // i = 0 (맨 아래) …
  const yBottom = (i: number) => H - BASE - i * fh;
  const id = `t${tier}${compact ? "c" : ""}`;
  const r = rnd(7 + tier * 13);
  const stars = Array.from({ length: compact ? 18 : 46 }, () => ({ x: r() * W, y: r() * (H * 0.55), s: r() * 1.3 + 0.35, d: r() * 4 }));
  const topW = widthAt(n);
  const roofBase = yBottom(n);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block h-auto w-full ${dim ? "opacity-55 grayscale-[.6]" : ""}`} role="img" aria-label={`사상의 탑 ${floors[0]}~${floors[n - 1]}층`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset=".62" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={p.wall[1]} />
          <stop offset=".28" stopColor={p.wall[0]} />
          <stop offset=".62" stopColor={p.wall[0]} />
          <stop offset="1" stopColor={p.wall[1]} />
        </linearGradient>
        <linearGradient id={`${id}-boss`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5c1a26" />
          <stop offset=".35" stopColor="#a8394a" />
          <stop offset=".65" stopColor="#a8394a" />
          <stop offset="1" stopColor="#5c1a26" />
        </linearGradient>
        <linearGradient id={`${id}-roof`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.roof[0]} />
          <stop offset="1" stopColor={p.roof[1]} />
        </linearGradient>
        <radialGradient id={`${id}-lit`} cx=".5" cy=".35" r=".7">
          <stop offset="0" stopColor="#fff6d8" />
          <stop offset=".55" stopColor={p.glow} />
          <stop offset="1" stopColor="#d9822b" />
        </radialGradient>
        <radialGradient id={`${id}-moon`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset=".6" stopColor="#f6e7b8" />
          <stop offset="1" stopColor="#f6e7b8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-halo`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={p.glow} stopOpacity=".75" />
          <stop offset="1" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={`${id}-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 하늘 · 별 · 달 */}
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      {stars.map((s, k) => (
        <circle key={k} cx={s.x} cy={s.y} r={s.s} fill="#fff" className="tower-star" style={{ animationDelay: `${s.d}s` }} />
      ))}
      {tier !== 2 && (
        <>
          <circle cx={compact ? 58 : 62} cy={compact ? 46 : 64} r={compact ? 34 : 46} fill={`url(#${id}-moon)`} opacity=".5" />
          <circle cx={compact ? 58 : 62} cy={compact ? 46 : 64} r={compact ? 13 : 17} fill="#fffaf0" opacity=".92" />
        </>
      )}
      <SkyExtras tier={tier} H={H} compact={compact} id={id} />

      {/* 먼 산 */}
      <path d={`M0 ${H - 150} L46 ${H - 196} L96 ${H - 160} L148 ${H - 214} L208 ${H - 168} L262 ${H - 206} L318 ${H - 166} L360 ${H - 188} L360 ${H} L0 ${H} Z`} fill={p.mount} opacity=".55" />
      <path d={`M0 ${H - 110} L60 ${H - 140} L120 ${H - 118} L190 ${H - 150} L250 ${H - 120} L310 ${H - 146} L360 ${H - 124} L360 ${H} L0 ${H} Z`} fill={p.mount} opacity=".85" />

      {/* 탑 뒤 후광 */}
      <ellipse cx={cx} cy={roofBase - 30} rx={140} ry={90} fill={`url(#${id}-halo)`} opacity=".45" />

      {/* 층 (아래 → 위) */}
      {floors.map((f, i) => {
        const st = stateOf(f);
        const w0 = widthAt(i);
        const w1 = widthAt(i + 1);
        const yb = yBottom(i);
        const yt = yb - fh;
        const boss = isBossFloor(f);
        const lit = st === "done" || st === "here";
        const wins = w0 > 180 ? 4 : w0 > 160 ? 3 : 2;
        const winW = compact ? 13 : 14;
        const winH = compact ? 18 : 22;
        // 창 자리: 왼쪽은 층 번호 자리를 비움
        const left = cx - w0 / 2 + (compact ? 14 : 34);
        const right = cx + w0 / 2 - 14;
        const span = (right - left) / wins;
        const x0 = left;
        return (
          <g key={f} data-floor={f}>
            {/* 벽 */}
            <path d={`M${cx - w0 / 2} ${yb} L${cx - w1 / 2} ${yt} L${cx + w1 / 2} ${yt} L${cx + w0 / 2} ${yb} Z`} fill={boss ? `url(#${id}-boss)` : `url(#${id}-wall)`} />
            {/* 돌 줄눈 */}
            <line x1={cx - w0 / 2 + 2} y1={yb - fh / 2} x2={cx + w0 / 2 - 2} y2={yb - fh / 2} stroke="#000" strokeOpacity=".07" />
            {/* 지금 층: 금빛 띠 */}
            {st === "here" && <rect x={cx - w0 / 2 - 7} y={yt - 3} width={w0 + 14} height={fh + 6} rx={6} fill="none" stroke="#ffd36b" strokeWidth={2.5} className="tower-here" filter={`url(#${id}-glow)`} />}
            {/* 탑마다 다른 장식: 기둥 · 붉은 기둥 · 버팀벽 · 금빛 띠 */}
            <FloorDecor tier={tier} cx={cx} w0={w0} w1={w1} yb={yb} yt={yt} fh={fh} left={left} span={span} wins={wins} trim={p.trim} />
            {/* 창 (탑마다 모양이 다름) */}
            {Array.from({ length: wins }, (_, k) => {
              const x = x0 + span * k + span / 2 - winW / 2;
              const y = yb - fh / 2 - winH / 2 + 2;
              return (
                <g key={k}>
                  {lit && <ellipse cx={x + winW / 2} cy={y + winH / 2} rx={winW} ry={winH * 0.8} fill={p.glow} opacity={st === "here" ? 0.45 : 0.22} filter={`url(#${id}-blur)`} />}
                  <Window tier={tier} x={x} y={y} w={winW} h={winH} lit={lit} litFill={`url(#${id}-lit)`} delay={(f * 3 + k) * 0.31} />
                </g>
              );
            })}
            {/* 보스층 깃발 */}
            {boss && (
              <>
                {[-1, 1].map((d) => {
                  const bx = cx + d * (w1 / 2 - 4) - (d > 0 ? 18 : 0);
                  return (
                    <g key={d}>
                      <path d={`M${bx} ${yt + 2} h18 v${fh - 12} l-9 -7 l-9 7 Z`} fill="#8e1e30" stroke="#ffd36b" strokeWidth={1} />
                      <circle cx={bx + 9} cy={yt + 14} r={3.6} fill="#ffd36b" />
                    </g>
                  );
                })}
              </>
            )}
            {/* 처마 (층 위 테두리) · 논증의 계단은 끝이 들린 기와 처마 */}
            {tier === 2 ? (
              <g>
                <path
                  d={`M${cx - w1 / 2 - 26} ${yt - 9} Q${cx - w1 / 2 - 12} ${yt + 3} ${cx - w1 / 2 + 8} ${yt + 2} L${cx + w1 / 2 - 8} ${yt + 2} Q${cx + w1 / 2 + 12} ${yt + 3} ${cx + w1 / 2 + 26} ${yt - 9} L${cx + w1 / 2 + 14} ${yt - 9} Q${cx} ${yt - 14} ${cx - w1 / 2 - 14} ${yt - 9} Z`}
                  fill={`url(#${id}-roof)`}
                />
                <path d={`M${cx - w1 / 2 - 26} ${yt - 9} Q${cx - w1 / 2 - 12} ${yt + 3} ${cx - w1 / 2 + 8} ${yt + 2} L${cx + w1 / 2 - 8} ${yt + 2} Q${cx + w1 / 2 + 12} ${yt + 3} ${cx + w1 / 2 + 26} ${yt - 9}`} fill="none" stroke={p.trim} strokeWidth={1.4} />
              </g>
            ) : (
              <>
                <rect x={cx - w1 / 2 - 8} y={yt - 5} width={w1 + 16} height={tier === 3 ? 5 : 7} rx={tier === 4 ? 3.5 : 2.5} fill={tier === 4 ? "#e8c977" : p.trim} />
                <rect x={cx - w1 / 2 - 8} y={yt + 2} width={w1 + 16} height={2} fill="#000" opacity=".18" />
              </>
            )}
            {/* 층 번호 */}
            {!compact && (
              <text x={cx - w0 / 2 + 10} y={yb - fh / 2 + 5} fontSize="12.5" fontWeight="800" fill={st === "here" ? "#7a4b00" : boss ? "#ffe9c2" : "#3a3125"} opacity={st === "next" || st === "locked" ? 0.55 : 1}>
                {f}
              </text>
            )}
            {/* 보상 (오른쪽) */}
            {showRewards && !compact && <Reward f={f} x={cx + w0 / 2 + 8} y={yb - fh / 2} done={st === "done"} epicTicketGiven={epicTicketGiven} hide={st === "here" && Boolean(hereLabel)} />}
          </g>
        );
      })}

      {/* 지붕 (탑마다 다름) */}
      <Roof tier={tier} cx={cx} topW={topW} y={roofBase} id={id} trim={p.trim} />

      {/* 받침 · 계단 · 문 */}
      <g>
        <path d={`M${cx - bottomW / 2 - 22} ${H - BASE} L${cx + bottomW / 2 + 22} ${H - BASE} L${cx + bottomW / 2 + 34} ${H - BASE + 26} L${cx - bottomW / 2 - 34} ${H - BASE + 26} Z`} fill={p.wall[1]} />
        <rect x={cx - bottomW / 2 - 22} y={H - BASE} width={bottomW + 44} height={5} fill={p.trim} />
        {[0, 1, 2].map((k) => (
          <rect key={k} x={cx - 34 - k * 10} y={H - BASE + 26 + k * 8} width={68 + k * 20} height={8} fill={p.wall[k % 2 ? 0 : 1]} opacity={0.9 - k * 0.15} />
        ))}
        <path d={`M${cx - 15} ${H - BASE + 26} L${cx - 15} ${H - BASE + 8} A15 15 0 0 1 ${cx + 15} ${H - BASE + 8} L${cx + 15} ${H - BASE + 26} Z`} fill={`url(#${id}-lit)`} filter={`url(#${id}-glow)`} />
      </g>

      {/* 안개 */}
      <ellipse cx={cx - 90} cy={H - 18} rx={130} ry={22} fill="#fff" opacity=".1" filter={`url(#${id}-blur)`} />
      <ellipse cx={cx + 110} cy={H - 8} rx={150} ry={20} fill="#fff" opacity=".09" filter={`url(#${id}-blur)`} />
    </svg>
  );
}

/** 하늘 꾸밈: 구름 · 노을 해와 새 · 폭풍과 번개 · 오로라 */
function SkyExtras({ tier, H, compact, id }: { tier: TowerTier; H: number; compact: boolean; id: string }) {
  if (tier === 1)
    return (
      <g opacity=".85">
        {[
          [70, 150, 1],
          [270, 110, 0.8],
          [300, 230, 0.7],
        ].map(([x, y, k], i) => (
          <g key={i} className="tower-cloud" style={{ animationDelay: `${i * 3}s` }} opacity={0.16}>
            <ellipse cx={x} cy={y * (compact ? 0.6 : 1)} rx={44 * k} ry={12 * k} fill="#fff" />
            <ellipse cx={x - 18 * k} cy={y * (compact ? 0.6 : 1) - 8 * k} rx={22 * k} ry={12 * k} fill="#fff" />
            <ellipse cx={x + 14 * k} cy={y * (compact ? 0.6 : 1) - 10 * k} rx={26 * k} ry={14 * k} fill="#fff" />
          </g>
        ))}
      </g>
    );
  if (tier === 2)
    return (
      <g>
        <circle cx={compact ? 58 : 66} cy={compact ? 46 : 70} r={compact ? 34 : 52} fill="#ffb36b" opacity=".35" filter={`url(#${id}-blur)`} />
        <circle cx={compact ? 58 : 66} cy={compact ? 46 : 70} r={compact ? 15 : 24} fill="#ffcf8a" opacity=".9" />
        {[
          [70, 120],
          [92, 108],
          [110, 128],
        ].map(([x, y], i) => (
          <path key={i} d={`M${x - 6} ${y} q6 -5 6 0 q0 -5 6 0`} fill="none" stroke="#2a1520" strokeWidth={1.4} opacity=".7" className="tower-bird" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
      </g>
    );
  if (tier === 3)
    return (
      <g>
        {[30, 70, 110].map((y, i) => (
          <ellipse key={i} cx={i % 2 ? 260 : 90} cy={y} rx={150} ry={26} fill="#0a0820" opacity=".45" filter={`url(#${id}-blur)`} />
        ))}
        <polyline points={compact ? "300,10 286,46 298,46 280,86" : "300,20 280,80 296,80 270,150"} fill="none" stroke="#efe2ff" strokeWidth={2.4} strokeLinejoin="round" className="tower-bolt" filter={`url(#${id}-glow)`} />
      </g>
    );
  return (
    <g className="tower-aurora">
      {[0, 1, 2].map((k) => (
        <path
          key={k}
          d={`M-20 ${70 + k * 26} C 80 ${30 + k * 30}, 160 ${120 + k * 18}, 240 ${60 + k * 24} S 380 ${40 + k * 28}, 400 ${80 + k * 20}`}
          fill="none"
          stroke={["#6dffc6", "#7fd0ff", "#c08bff"][k]}
          strokeWidth={compact ? 14 : 22}
          opacity=".22"
          filter={`url(#${id}-blur)`}
        />
      ))}
    </g>
  );
}

/** 층 장식 */
function FloorDecor({ tier, cx, w0, w1, yb, yt, fh, left, span, wins, trim }: { tier: TowerTier; cx: number; w0: number; w1: number; yb: number; yt: number; fh: number; left: number; span: number; wins: number; trim: string }) {
  if (tier === 1)
    // 기둥 (창 사이)
    return (
      <g opacity=".85">
        {Array.from({ length: wins + 1 }, (_, k) => {
          const x = left + span * k - 2.5;
          return (
            <g key={k}>
              <rect x={x} y={yt + 6} width={5} height={fh - 10} fill={trim} opacity=".75" />
              <rect x={x - 1.5} y={yt + 4} width={8} height={3} fill={trim} />
              <rect x={x - 1.5} y={yb - 5} width={8} height={3} fill={trim} />
            </g>
          );
        })}
      </g>
    );
  if (tier === 2)
    // 붉은 기둥 (양 끝)
    return (
      <g>
        <rect x={cx - w0 / 2 + 2} y={yt + 2} width={6} height={fh - 2} fill="#9e2b23" />
        <rect x={cx + w0 / 2 - 8} y={yt + 2} width={6} height={fh - 2} fill="#9e2b23" />
        <line x1={cx - w0 / 2 + 8} y1={yb - 4} x2={cx + w0 / 2 - 8} y2={yb - 4} stroke="#9e2b23" strokeWidth={2} />
      </g>
    );
  if (tier === 3)
    // 버팀벽
    return (
      <g fill="#3a3160" opacity=".9">
        <path d={`M${cx - w0 / 2} ${yb} L${cx - w0 / 2 - 11} ${yb} L${cx - w1 / 2} ${yt + 8} Z`} />
        <path d={`M${cx + w0 / 2} ${yb} L${cx + w0 / 2 + 11} ${yb} L${cx + w1 / 2} ${yt + 8} Z`} />
      </g>
    );
  // 금빛 띠
  return <line x1={cx - w0 / 2 + 4} y1={yb - 6} x2={cx + w0 / 2 - 4} y2={yb - 6} stroke="#e8c977" strokeWidth={1.2} opacity=".8" />;
}

/** 창: 아치 · 격자 · 뾰족 아치 · 둥근 창 */
function Window({ tier, x, y, w, h, lit, litFill, delay }: { tier: TowerTier; x: number; y: number; w: number; h: number; lit: boolean; litFill: string; delay: number }) {
  const fill = lit ? litFill : "#141a33";
  const stroke = lit ? "#fff3cf" : "#00000055";
  const cls = lit ? "tower-window" : "";
  const style = { animationDelay: `${delay}s` };
  const bar = lit ? "#9a5a1a" : "#00000066";
  if (tier === 2)
    return (
      <g>
        <rect x={x - 1} y={y + 2} width={w + 2} height={h - 2} fill={fill} stroke={stroke} strokeWidth={0.8} className={cls} style={style} />
        <line x1={x + w / 2} y1={y + 2} x2={x + w / 2} y2={y + h} stroke={bar} strokeWidth={0.8} />
        <line x1={x - 1} y1={y + h / 2 + 1} x2={x + w + 1} y2={y + h / 2 + 1} stroke={bar} strokeWidth={0.8} />
      </g>
    );
  if (tier === 3)
    return (
      <g>
        <path d={`M${x} ${y + h} L${x} ${y + h * 0.42} Q${x} ${y + 2} ${x + w / 2} ${y - 3} Q${x + w} ${y + 2} ${x + w} ${y + h * 0.42} L${x + w} ${y + h} Z`} fill={fill} stroke={stroke} strokeWidth={0.8} className={cls} style={style} />
        <line x1={x + w / 2} y1={y + 2} x2={x + w / 2} y2={y + h} stroke={bar} strokeWidth={0.8} strokeOpacity=".6" />
      </g>
    );
  if (tier === 4)
    return (
      <g>
        <circle cx={x + w / 2} cy={y + h / 2 + 1} r={w * 0.62} fill={fill} stroke={lit ? "#fff3cf" : "#e8c97766"} strokeWidth={1.2} className={cls} style={style} />
        <line x1={x + w / 2 - w * 0.62} y1={y + h / 2 + 1} x2={x + w / 2 + w * 0.62} y2={y + h / 2 + 1} stroke={bar} strokeWidth={0.7} />
      </g>
    );
  return (
    <g>
      <path d={`M${x} ${y + h} L${x} ${y + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2} L${x + w} ${y + h} Z`} fill={fill} stroke={stroke} strokeWidth={0.8} className={cls} style={style} />
      <line x1={x + w / 2} y1={y + 3} x2={x + w / 2} y2={y + h} stroke={bar} strokeWidth={0.8} strokeOpacity=".6" />
    </g>
  );
}

/** 지붕: 박공(신전) · 겹지붕(누각) · 첨탑(고딕) · 돔과 혼천의(천문대) */
function Roof({ tier, cx, topW, y, id, trim }: { tier: TowerTier; cx: number; topW: number; y: number; id: string; trim: string }) {
  const orb = (oy: number, r = 6.5) => (
    <>
      <circle cx={cx} cy={oy} r={r * 3} fill={`url(#${id}-halo)`} className="tower-orb" />
      <circle cx={cx} cy={oy} r={r} fill="#fffbe6" filter={`url(#${id}-glow)`} />
    </>
  );
  if (tier === 1) {
    const w = topW + 34;
    return (
      <g>
        <rect x={cx - w / 2} y={y - 12} width={w} height={10} fill={trim} />
        <rect x={cx - w / 2 + 6} y={y - 8} width={w - 12} height={2} fill="#000" opacity=".15" />
        <path d={`M${cx - w / 2 - 6} ${y - 12} L${cx} ${y - 58} L${cx + w / 2 + 6} ${y - 12} Z`} fill={`url(#${id}-roof)`} />
        <path d={`M${cx - w / 2 + 14} ${y - 16} L${cx} ${y - 48} L${cx + w / 2 - 14} ${y - 16} Z`} fill={trim} opacity=".35" />
        <circle cx={cx - w / 2 - 4} cy={y - 16} r={4} fill={trim} />
        <circle cx={cx + w / 2 + 4} cy={y - 16} r={4} fill={trim} />
        <rect x={cx - 1.5} y={y - 84} width={3} height={28} fill={trim} />
        {orb(y - 88, 5.5)}
      </g>
    );
  }
  if (tier === 2) {
    const tierRoof = (w: number, by: number, h: number, k: number) => (
      <g key={k}>
        <path d={`M${cx - w / 2 - 22} ${by - 6} Q${cx - w / 2} ${by + 4} ${cx - w / 2 + 14} ${by} L${cx} ${by - h} L${cx + w / 2 - 14} ${by} Q${cx + w / 2} ${by + 4} ${cx + w / 2 + 22} ${by - 6} Z`} fill={`url(#${id}-roof)`} />
        <path d={`M${cx - w / 2 - 22} ${by - 6} Q${cx - w / 2} ${by + 4} ${cx - w / 2 + 14} ${by} L${cx + w / 2 - 14} ${by} Q${cx + w / 2} ${by + 4} ${cx + w / 2 + 22} ${by - 6}`} fill="none" stroke={trim} strokeWidth={1.6} />
      </g>
    );
    return (
      <g>
        {tierRoof(topW + 10, y - 2, 36, 0)}
        <rect x={cx - topW / 4} y={y - 46} width={topW / 2} height={14} fill="#9e2b23" />
        {tierRoof(topW * 0.62, y - 40, 30, 1)}
        {[0, 1, 2, 3].map((k) => (
          <circle key={k} cx={cx} cy={y - 76 - k * 7} r={3.4 - k * 0.5} fill={trim} />
        ))}
        {orb(y - 108, 5)}
      </g>
    );
  }
  if (tier === 3)
    return (
      <g>
        <path d={`M${cx - topW / 2 - 8} ${y - 2} L${cx} ${y - 112} L${cx + topW / 2 + 8} ${y - 2} Z`} fill={`url(#${id}-roof)`} />
        <path d={`M${cx} ${y - 112} L${cx + topW / 2 + 8} ${y - 2} L${cx + 6} ${y - 2} Z`} fill="#000" opacity=".22" />
        {[-1, 1].map((d) => (
          <g key={d}>
            <path d={`M${cx + d * (topW / 2 - 4) - 7} ${y - 2} L${cx + d * (topW / 2 - 4)} ${y - 46} L${cx + d * (topW / 2 - 4) + 7} ${y - 2} Z`} fill={`url(#${id}-roof)`} stroke={trim} strokeWidth={0.8} />
          </g>
        ))}
        <line x1={cx - topW / 2 - 8} y1={y - 2} x2={cx + topW / 2 + 8} y2={y - 2} stroke={trim} strokeWidth={2} />
        {orb(y - 116, 4.5)}
      </g>
    );
  // 천문대: 돔 + 갈빗대 + 혼천의
  const r = topW / 2 + 6;
  return (
    <g>
      <path d={`M${cx - r} ${y - 2} A${r} ${r * 0.9} 0 0 1 ${cx + r} ${y - 2} Z`} fill={`url(#${id}-roof)`} />
      {[-0.5, 0, 0.5].map((k) => (
        <path key={k} d={`M${cx + k * r} ${y - 2} Q${cx + k * r * 0.5} ${y - r * 0.85} ${cx} ${y - r * 0.9}`} fill="none" stroke="#e8c977" strokeWidth={1} opacity=".7" />
      ))}
      <rect x={cx - r} y={y - 6} width={r * 2} height={5} fill="#e8c977" />
      <rect x={cx - 1.5} y={y - r * 0.9 - 26} width={3} height={26} fill="#e8c977" />
      <g className="tower-armillary" style={{ transformOrigin: `${cx}px ${y - r * 0.9 - 40}px` }}>
        <ellipse cx={cx} cy={y - r * 0.9 - 40} rx={20} ry={7} fill="none" stroke="#e8c977" strokeWidth={1.4} />
        <ellipse cx={cx} cy={y - r * 0.9 - 40} rx={7} ry={20} fill="none" stroke="#e8c977" strokeWidth={1.4} />
        <ellipse cx={cx} cy={y - r * 0.9 - 40} rx={17} ry={17} fill="none" stroke="#e8c977" strokeWidth={1} opacity=".7" transform={`rotate(35 ${cx} ${y - r * 0.9 - 40})`} />
      </g>
      {orb(y - r * 0.9 - 40, 5)}
    </g>
  );
}

function Reward({ f, x, y, done, epicTicketGiven, hide }: { f: number; x: number; y: number; done: boolean; epicTicketGiven: boolean; hide: boolean }) {
  if (hide) return null;
  const r = floorReward(f, epicTicketGiven);
  const o = done ? 0.45 : 1;
  const dx = 15 + String(r.coins).length * 7 + 5;
  return (
    <g opacity={o}>
      <circle cx={x + 6} cy={y} r={6} fill="#ffd36b" stroke="#a8761a" strokeWidth={1} />
      <text x={x + 6} y={y + 3} fontSize="7.5" fontWeight="900" textAnchor="middle" fill="#7a4b00">
        C
      </text>
      <text x={x + 15} y={y + 4} fontSize="11" fontWeight="800" fill="#fff4d6">
        {r.coins}
      </text>
      {r.stones > 0 && (
        <g transform={`translate(${x + dx} ${y})`}>
          <path d="M0 -6 L5 0 L0 6 L-5 0 Z" transform="translate(5 0)" fill="#8fd0ff" stroke="#2a6fd6" strokeWidth={0.8} />
          <text x={13} y={4} fontSize="11" fontWeight="800" fill="#d6efff">
            {r.stones}
          </text>
        </g>
      )}
      {r.ticket && (
        <g transform={`translate(${x + dx + (r.stones ? 26 : 0)} ${y - 6})`}>
          <rect width={16} height={12} rx={2} fill="#b37bff" stroke="#fff" strokeWidth={0.8} />
          <circle cx={0} cy={6} r={2.2} fill="#3a2a6e" />
          <circle cx={16} cy={6} r={2.2} fill="#3a2a6e" />
        </g>
      )}
      {done && (
        <text x={x - 2} y={y + 4} fontSize="11" fontWeight="900" fill="#9fe0c0" textAnchor="end">
          ✓
        </text>
      )}
    </g>
  );
}

/**
 * 탑 화면의 큰 탑: 지금 구간(10층) + 내 위치 표시가 층을 따라 올라감 + 지금 층 상대
 */
export function TowerMap({
  floor,
  cleared,
  best,
  from,
  team,
  enemyName,
  mode,
  epicTicketGiven = false,
}: {
  floor: number;
  cleared: number;
  best: number;
  from?: number | null;
  team: Pick<TeamCard, "cardId" | "name" | "artUrl" | "battleArtUrl">[];
  enemyName?: string | null;
  mode: "run" | "lobby";
  epicTicketGiven?: boolean;
}) {
  const at = Math.max(1, floor);
  const lo = Math.floor((at - 1) / 10) * 10 + 1;
  const floors = Array.from({ length: 10 }, (_, i) => lo + i);
  const tier = tierOfFloor(at);
  const H = TOP + 10 * FH + BASE;
  const pct = (f: number) => ((H - BASE - (f - lo) * FH - FH / 2) / H) * 100; // 위에서부터 %
  const start = from && from !== at ? (from >= lo ? pct(from) : ((H - BASE / 2) / H) * 100) : pct(at);
  const [top, setTop] = useState(start);
  useEffect(() => {
    const t = setTimeout(() => setTop(pct(at)), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  const climbing = Math.abs(top - pct(at)) > 0.1;
  const lead = team[0];
  const stateOf = (f: number): FloorState => (f === at && mode === "run" ? "here" : f <= cleared ? "done" : mode === "lobby" && f === at ? "here" : "next");

  return (
    <div className="relative mx-auto w-full max-w-[420px] select-none overflow-hidden rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,.6)] ring-1 ring-white/10" data-tower-map>
      <TowerScene floors={floors} stateOf={stateOf} tier={tier} epicTicketGiven={epicTicketGiven} hereLabel={mode === "run" ? enemyName : best >= lo && best < lo + 10 ? "best" : null} />
      {/* 위 구간 안내 */}
      <div className="pointer-events-none absolute right-3 top-2.5 text-right text-[10px] font-bold tracking-wider text-white/70">
        {lo + 10}층부터 다음 탑 ▲
      </div>
      {/* 지금 층 상대 */}
      {mode === "run" && enemyName && (
        <div className="pointer-events-none absolute right-2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white ring-1 ring-[#ffd36b]/60 backdrop-blur-sm" style={{ top: `${pct(at)}%` }}>
          VS {isBossFloor(at) ? "👑 " : ""}
          {enemyName}
        </div>
      )}
      {/* 최고 기록 (입구) */}
      {mode === "lobby" && best > 0 && best >= lo && best < lo + 10 && (
        <div className="pointer-events-none absolute right-2 -translate-y-1/2 rounded-full bg-[#ffd36b] px-2 py-0.5 text-[10px] font-black text-[#3a2600] shadow" style={{ top: `${pct(best)}%` }}>
          🏁 최고 {best}층
        </div>
      )}
      {/* 내 위치 */}
      {(mode === "run" || best > 0) && (
        <div className="absolute left-[3%] z-10 -translate-y-1/2 transition-[top] duration-[1000ms] ease-[cubic-bezier(.3,.8,.3,1)]" style={{ top: `${top}%` }} data-tower-me>
          <span className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#ffd36b] bg-[#1a2234] shadow-[0_0_16px_rgba(255,211,107,.7)] ${climbing ? "tower-hop" : ""}`}>
            {lead?.battleArtUrl || lead?.artUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(lead.battleArtUrl ?? lead.artUrl)!} alt="" className={`h-full w-full ${lead.battleArtUrl ? "translate-y-[22%] scale-[1.6] object-contain object-top" : "object-cover object-[center_18%]"}`} />
            ) : (
              <span className="text-xs font-black text-white">나</span>
            )}
          </span>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#ffd36b] px-1.5 text-[9px] font-black leading-[14px] text-[#3a2600] shadow">{mode === "run" ? "나" : "기록"}</span>
        </div>
      )}
    </div>
  );
}
