"use client";

import { useRef, type CSSProperties } from "react";
import type { CardView } from "@/lib/game/data";
import { RARITY_NAMES, statsAt } from "@/lib/game/rules";

const Sword = () => (
  <svg viewBox="0 0 24 24" className="h-[1em] w-[1em]" fill="currentColor" aria-hidden>
    <path d="M14.5 3H21v6.5l-9.2 9.2 1.4 1.4-1.4 1.4-2.5-2.5-3 3-1.8.3.3-1.8 3-3-2.5-2.5 1.4-1.4 1.4 1.4L14.5 3Zm1 2-8.4 8.4 2.5 2.5L18 7.5V5h-2.5Z" />
  </svg>
);
const Heart = () => (
  <svg viewBox="0 0 24 24" className="h-[1em] w-[1em]" fill="currentColor" aria-hidden>
    <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3.1 4.5 6.9 4.5c2 0 3.6 1.1 5.1 2.9 1.5-1.8 3.1-2.9 5.1-2.9 3.8 0 6 3.8 4.5 7.2C19.5 16.4 12 21 12 21Z" />
  </svg>
);

/**
 * 철학자 카드. 크기는 부모가 정한 너비를 따르고, 글자는 카드 너비에 비례 (container 단위).
 * - 등급별 프레임·광택 (전설은 은은한 광택이 지나감)
 * - PC: 마우스를 올리면 살짝 기울어짐 (동작 줄이기 설정이면 끔)
 * - locked: 미획득 (실루엣)
 */
export function PhilosopherCard({
  card,
  level = 1,
  shards,
  shardsNeeded,
  maxLevel = 5,
  locked = false,
  featured = false,
  tilt = true,
  className = "",
  style,
  onClick,
  badge,
  stats,
}: {
  card: CardView;
  level?: number;
  shards?: number;
  shardsNeeded?: number | null;
  maxLevel?: number;
  locked?: boolean;
  featured?: boolean;
  tilt?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  badge?: React.ReactNode;
  /** 이미 계산된 능력치 (배틀) */
  stats?: { atk: number; hp: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const st = stats ?? statsAt({ atk: card.baseAtk, hp: card.baseHp }, level);
  const canTilt = () => tilt && typeof window !== "undefined" && window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches;
  const onMove = (e: React.MouseEvent) => {
    if (!ref.current || !canTilt()) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(700px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateZ(0)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`block text-left ${onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy/40 rounded-[14px]" : ""} ${className}`}
      style={style}
      aria-label={locked ? `미획득 카드 ${card.name}` : `${card.name} · ${RARITY_NAMES[card.rarity]} · Lv.${level}`}
    >
      <div ref={ref} className={`pcard ${locked ? "pcard-locked" : ""}`} data-rarity={card.rarity} onMouseMove={onMove} onMouseLeave={onLeave}>
        <div className="pcard-inner">
          {card.artUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.artUrl} alt="" className="pcard-art" loading="lazy" draggable={false} />
          )}
          <div className="pcard-shade" />
          {/* 위: 등급 보석 · 레벨 · 전통 */}
          <div className="absolute left-[5%] right-[5%] top-[4.5%] z-[3] flex items-start justify-between gap-1">
            <div className="flex items-center gap-[4cqw]">
              <span className="pcard-gem block text-[5.5cqw]" />
              {!locked && (
                <span className="rounded-full bg-black/55 px-[3.5cqw] py-[0.8cqw] text-[6.5cqw] font-extrabold leading-none tracking-tight text-white ring-1 ring-white/20">
                  Lv.{level}
                </span>
              )}
            </div>
            <span className="rounded-full bg-black/45 px-[3cqw] py-[0.8cqw] text-[5cqw] font-medium leading-none text-white/85 ring-1 ring-white/10">{card.tradition}</span>
          </div>
          {featured && !locked && (
            <span className="absolute left-1/2 top-[14%] z-[3] -translate-x-1/2 rounded-full bg-[#ffd36b] px-[3cqw] py-[0.6cqw] text-[4.6cqw] font-bold text-[#3a2600] shadow">대표</span>
          )}
          {locked && (
            <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-[2cqw] text-white/80">
              <svg viewBox="0 0 24 24" className="h-[16cqw] w-[16cqw]" fill="currentColor" aria-hidden>
                <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
              </svg>
              <span className="text-[6cqw] font-semibold">미획득</span>
            </div>
          )}
          {/* 아래: 이름 · 등급 · 능력치 · 필살기 */}
          <div className="absolute bottom-[4.5%] left-[6%] right-[6%] z-[3]">
            <div className="text-[5cqw] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--r1)" }}>
              {RARITY_NAMES[card.rarity]}
            </div>
            <div className="truncate text-[11cqw] font-extrabold leading-[1.15] tracking-tight text-white drop-shadow">{card.name}</div>
            {card.originalName && <div className="truncate text-[5cqw] text-white/60">{card.originalName}</div>}
            {!locked && (
              <>
                <div className="mt-[3cqw] flex items-center gap-[5cqw] text-[7cqw] font-bold tabular-nums">
                  <span className="flex items-center gap-[1.5cqw] text-[#ffb4a2]"><Sword />{st.atk}</span>
                  <span className="flex items-center gap-[1.5cqw] text-[#9ee6b8]"><Heart />{st.hp}</span>
                </div>
                <div className="mt-[2cqw] truncate rounded-md bg-white/10 px-[3cqw] py-[1.2cqw] text-[5.6cqw] font-semibold text-white/90 ring-1 ring-white/10">
                  ✦ {card.skillName}
                </div>
                {/* 강화 상태: 레벨 칸 + 다음 레벨까지 조각 */}
                <div className="mt-[2.5cqw] flex items-center gap-[1.5cqw]" aria-label={`레벨 ${level}/${maxLevel}`}>
                  {Array.from({ length: maxLevel }, (_, i) => (
                    <span key={i} className="h-[2.2cqw] flex-1 rounded-full" style={{ background: i < level ? "var(--r1)" : "rgba(255,255,255,0.15)" }} />
                  ))}
                </div>
                {shards !== undefined && shardsNeeded !== undefined && (
                  <div className="mt-[1.5cqw] text-right text-[4.6cqw] tabular-nums text-white/60">
                    {shardsNeeded === null ? "최대 레벨" : `조각 ${shards}/${shardsNeeded}`}
                  </div>
                )}
              </>
            )}
          </div>
          {badge && <div className="absolute right-[5%] top-[14%] z-[4]">{badge}</div>}
        </div>
      </div>
    </Tag>
  );
}

/** 카드 뒷면 (뽑기 연출) */
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div className={`pcard ${className}`} data-rarity="legendary">
      <div className="pcard-inner pcard-back flex flex-col items-center justify-center">
        <div className="flex h-[38cqw] w-[38cqw] items-center justify-center rounded-full border-2 border-[#e9c46a]/70 bg-black/20 shadow-[0_0_30px_rgba(233,196,106,0.35)]">
          <span className="text-[16cqw] font-black text-[#f2d27a]">哲</span>
        </div>
        <div className="mt-[6cqw] text-[6.5cqw] font-extrabold tracking-[0.2em] text-[#f2d27a]">철학자 대난투</div>
        <div className="mt-[1cqw] text-[4.4cqw] tracking-[0.3em] text-white/50">ETHICS · DUEL</div>
      </div>
    </div>
  );
}
