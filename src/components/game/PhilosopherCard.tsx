"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CardView } from "@/lib/game/data";
import { DEFAULT_RARITY_MULT, RARITY_NAMES, ROLE_COLOR, ROLES, statsFor, type Rarity } from "@/lib/game/rules";
import { FRAME_GEOMETRY } from "@/lib/game/frameGeometry";

/**
 * 등급 프레임 그림 (public/cards/frames, scripts/build-card-frames.py 로 만듦).
 * 카드 상자 = 프레임 몸통. 위·아래로 튀어나온 장식은 상자 밖으로 그린다.
 * 내용(레벨·이름·능력치)은 프레임 안쪽 창 안에 오도록 --ft/--fr/--fb/--fl 만큼 들여 쓴다.
 */
function frameVars(rarity: Rarity): CSSProperties {
  const g = FRAME_GEOMETRY[rarity];
  return {
    ["--ft" as string]: `${g.open.t}%`,
    ["--fr" as string]: `${g.open.r}%`,
    ["--fb" as string]: `${g.open.b}%`,
    ["--fl" as string]: `${g.open.l}%`,
    ["--fradn" as string]: g.radius,
    ["--fimg" as string]: `url(/cards/frames/${rarity}.webp)`,
  };
}
function FrameArt({ rarity, onError, lite }: { rarity: Rarity; onError?: () => void; lite?: boolean }) {
  const g = FRAME_GEOMETRY[rarity];
  const box: CSSProperties = {
    top: `-${g.out.t}%`,
    left: `-${g.out.l}%`,
    width: `calc(100% + ${g.out.l + g.out.r}%)`,
    height: `calc(100% + ${g.out.t + g.out.b}%)`,
  };
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/cards/frames/${rarity}.webp`} alt="" className="pcard-frameimg" style={box} draggable={false} decoding="async" onError={onError} />
      {rarity !== "common" && !lite && <div className="pcard-framefx" style={box} aria-hidden />}
    </>
  );
}

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

/** 모서리 장식 (왼쪽 위 기준, 나머지는 CSS 로 뒤집음) */
function Corner({ rarity }: { rarity: Rarity }) {
  if (rarity === "rare")
    return (
      <svg viewBox="0 0 40 40" aria-hidden>
        <path d="M5 17V9a4 4 0 0 1 4-4h8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  if (rarity === "epic")
    return (
      <svg viewBox="0 0 40 40" aria-hidden>
        <path d="M4 22V9a5 5 0 0 1 5-5h13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M9 16v-4a3 3 0 0 1 3-3h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
        <path d="M9 4.5 11.5 7 9 9.5 6.5 7Z" fill="#fff" opacity="0.95" transform="translate(-2.5 -2.5)" />
      </svg>
    );
  // 전설: 두 겹 금박 꺾쇠 + 소용돌이 + 보석
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="pcard-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.45" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#b9780f" />
        </linearGradient>
      </defs>
      <path d="M3.5 28V9.5a6 6 0 0 1 6-6H28" fill="none" stroke="url(#pcard-gold)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8.5 21v-8a4.5 4.5 0 0 1 4.5-4.5h8" fill="none" stroke="url(#pcard-gold)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 28c0 3 2.6 4.6 4.6 3.4 1.6-1 1-3.2-.6-3" fill="none" stroke="url(#pcard-gold)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M28 3.5c3 0 4.6 2.6 3.4 4.6-1 1.6-3.2 1-3-.6" fill="none" stroke="url(#pcard-gold)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9.5" cy="9.5" r="2.6" fill="#fff4c2" stroke="#b9780f" strokeWidth="0.8" />
      <circle cx="9" cy="9" r="0.9" fill="#fff" />
    </svg>
  );
}

/** 전설 반짝이 위치 (카드 안 %) · 시작 지연 */
const SPARKLES = [
  [18, 22, 0],
  [78, 14, 0.9],
  [64, 40, 1.8],
  [28, 52, 0.4],
  [86, 60, 2.3],
  [12, 70, 1.4],
] as const;

/**
 * 철학자 카드. 크기는 부모가 정한 너비를 따르고, 글자는 카드 너비에 비례 (container 단위).
 * 같은 사상가는 같은 일러스트를 쓰고, 등급(rarity)에 따라 프레임·광택·효과만 달라진다.
 * - 등급별 차등: 일반(은회색) · 희귀(푸른 금속 + 빛줄기) · 영웅(자수정 + 테두리를 도는 빛 + 보라 홀로그램)
 *   · 전설(금박 + 문양 + 무지개 홀로그램·금가루 + 반짝이 + 금박 이름)
 * - 광택은 가만히 있으면 천천히 지나가고, 포인터를 올리면 포인터를 따라 움직인다
 * - PC: 마우스를 올리면 살짝 기울어짐 (동작 줄이기 설정이면 끔)
 * - locked: 미획득 (실루엣)
 */
export function PhilosopherCard({
  card,
  rarity,
  level = 1,
  shards,
  shardsNeeded,
  shardsLabel = "조각",
  maxLevel = 5,
  locked = false,
  featured = false,
  tilt = true,
  className = "",
  style,
  onClick,
  badge,
  stats,
  count,
  locked2,
  fx = "full",
}: {
  card: CardView;
  rarity: Rarity;
  level?: number;
  shards?: number;
  shardsNeeded?: number | null;
  /** 강화 재료 이름 (통일 후 "강화석") */
  shardsLabel?: string;
  maxLevel?: number;
  locked?: boolean;
  featured?: boolean;
  tilt?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  badge?: React.ReactNode;
  /** 이미 계산된 능력치 (서버 계산값). 없으면 기본 배율로 계산 */
  stats?: { atk: number; hp: number };
  count?: number; // 같은 사상가 보유 장수 (도감 묶음)
  locked2?: boolean; // 카드 잠금 표시
  /** full: 반짝임·테두리 빛·후광 등 움직이는 효과 전부 (대표 카드·상세·뽑기 결과) / lite: 목록용 — 테두리·색·정지 광택만 (휴대폰이 느려지지 않게) */
  fx?: "full" | "lite";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lite = fx === "lite";
  // 화면 밖에 있는 카드는 움직임을 멈춘다 (긴 목록에서 휴대폰이 느려지지 않게)
  useEffect(() => {
    const el = ref.current;
    if (!el || lite || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => el.toggleAttribute("data-offscreen", !e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, [lite]);
  const frameRarity: Rarity = locked ? "common" : rarity;
  // 프레임 그림을 못 불러오면 코드로 그린 테두리로
  const [frameOk, setFrameOk] = useState(true);
  const st = stats ?? statsFor({ atk: card.baseAtk, hp: card.baseHp }, rarity, level, DEFAULT_RARITY_MULT);
  const motionOk = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
  const fancy = !locked && rarity !== "common";
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !fancy || !motionOk()) return;
    const r = el.getBoundingClientRect();
    const x = Math.min(0.5, Math.max(-0.5, (e.clientX - r.left) / r.width - 0.5));
    const y = Math.min(0.5, Math.max(-0.5, (e.clientY - r.top) / r.height - 0.5));
    el.classList.add("is-active");
    el.style.setProperty("--px", x.toFixed(3));
    el.style.setProperty("--py", y.toFixed(3));
    if (tilt && e.pointerType === "mouse") el.style.transform = `perspective(700px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateZ(0)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    el.classList.remove("is-active");
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`block text-left ${onClick ? "w-full cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy/40 rounded-[14px]" : ""} ${className}`}
      style={style}
      aria-label={locked ? `미획득 카드 ${card.name}` : `${card.name} · ${RARITY_NAMES[rarity]} · Lv.${level}`}
    >
      <div
        ref={ref}
        className={`pcard ${locked ? "pcard-locked" : ""}`}
        data-rarity={locked ? "common" : rarity}
        data-frame={frameOk ? "img" : undefined}
        data-fx={lite ? "lite" : undefined}
        style={frameOk ? frameVars(frameRarity) : undefined}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerCancel={onLeave}
        onPointerUp={(e) => e.pointerType !== "mouse" && onLeave()}
      >
        <div className="pcard-glow" aria-hidden />
        <div className="pcard-frame" aria-hidden />
        <div className="pcard-inner">
          {card.artUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.artUrl} alt="" className="pcard-art" loading="lazy" draggable={false} />
          )}
          <div className="pcard-shade" />
          {fancy && <div className="pcard-glare" aria-hidden />}
          {fancy && (
            <div className="pcard-foilwrap" aria-hidden>
              <div className="pcard-foil" />
            </div>
          )}
          {!locked && !lite && rarity === "legendary" && (
            <div className="pcard-sparkles" aria-hidden>
              {SPARKLES.map(([x, y, d], i) => (
                <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
              ))}
            </div>
          )}
          {/* 위: 등급 보석 · 레벨 · 전통 */}
          <div className="pcard-top absolute z-[3] flex items-start justify-between gap-1">
            <div className="flex items-center gap-[4cqw]">
              <span className="pcard-gem block text-[5.5cqw]" />
              {!locked && (
                <span className="rounded-full bg-black/55 px-[3.5cqw] py-[0.8cqw] text-[6.5cqw] font-extrabold leading-none tracking-tight text-white ring-1 ring-white/20">
                  Lv.{level}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-[1.5cqw]">
              <span className="rounded-full bg-black/45 px-[3cqw] py-[0.8cqw] text-[5cqw] font-medium leading-none text-white/85 ring-1 ring-white/10">{card.tradition}</span>
              {/* 빈출 순위 (기출에 많이 나온 순) */}
              {card.freqRank !== undefined && (
                <span
                  className={`rounded-full px-[3cqw] py-[0.8cqw] text-[4.6cqw] font-bold leading-none ring-1 ${card.freqRank <= 3 ? "bg-[#ffd36b]/90 text-[#3a2600] ring-[#fff3c4]/60" : "bg-black/45 text-white/85 ring-white/10"}`}
                  title={`기출에 많이 나온 순서 ${card.freqRank}위${card.freqTotal ? ` / ${card.freqTotal}명` : ""}`}
                  data-freq-rank={card.freqRank}
                >
                  빈출 {card.freqRank}위
                </span>
              )}
            </div>
          </div>
          {locked && (
            <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-[2cqw] text-white/80">
              <svg viewBox="0 0 24 24" className="h-[16cqw] w-[16cqw]" fill="currentColor" aria-hidden>
                <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
              </svg>
              <span className="text-[6cqw] font-semibold">미획득</span>
            </div>
          )}
          {/* 아래: 이름 · 등급 · 능력치 · 필살기 */}
          <div className="pcard-bottom absolute z-[3]">
            <div className="flex items-center gap-[2.5cqw] text-[5cqw] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--r1)" }}>
              {locked ? "" : RARITY_NAMES[rarity]}
              {/* 성향 (필살기에 따라): 미획득 카드에도 보여 줌 */}
              {ROLES[card.skillEffect] && (
                <span
                  className="rounded-full px-[2.5cqw] py-[0.4cqw] text-[4.6cqw] font-black normal-case leading-none tracking-normal text-[#0c111b] shadow"
                  style={{ background: ROLE_COLOR[card.skillEffect] }}
                  title={`성향: ${ROLES[card.skillEffect].name}`}
                >
                  {ROLES[card.skillEffect].name}
                </span>
              )}
              {featured && !locked && (
                <span className="rounded-full bg-[#ffd36b] px-[2.5cqw] py-[0.4cqw] text-[4.4cqw] font-bold normal-case leading-none tracking-normal text-[#3a2600] shadow">대표</span>
              )}
            </div>
            <div className="pcard-name truncate text-[11cqw] font-extrabold leading-[1.15] tracking-tight text-white drop-shadow">{card.name}</div>
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
                    {shardsNeeded === null ? "최대 레벨" : `${shardsLabel} ${shards}/${shardsNeeded}`}
                  </div>
                )}
              </>
            )}
          </div>
          {badge && <div className="pcard-badge absolute z-[4]">{badge}</div>}
          {count !== undefined && count > 1 && (
            <span className="pcard-count absolute z-[4] rounded-full bg-black/70 px-[3cqw] py-[0.8cqw] text-[5.5cqw] font-bold text-white ring-1 ring-white/20">×{count}</span>
          )}
          {locked2 && (
            <span className="pcard-lock absolute z-[4] rounded-full bg-black/70 px-[2.5cqw] py-[0.6cqw] text-[4.6cqw] font-bold text-white ring-1 ring-white/20" title="잠긴 카드">잠금</span>
          )}
        </div>
        {frameOk && <FrameArt rarity={frameRarity} onError={() => setFrameOk(false)} lite={lite} />}
        {fancy && !frameOk && (
          <div className="pcard-corners" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Corner key={i} rarity={rarity} />
            ))}
          </div>
        )}
      </div>
    </Tag>
  );
}

/** 카드 뒷면 (뽑기 연출) */
export function CardBack({ className = "" }: { className?: string }) {
  return (
    <div className={`pcard ${className}`} data-rarity="legendary" data-frame="img" style={frameVars("legendary")}>
      <div className="pcard-glow" aria-hidden />
      <div className="pcard-inner pcard-back flex flex-col items-center justify-center">
        <div className="flex h-[38cqw] w-[38cqw] items-center justify-center rounded-full border-2 border-[#e9c46a]/70 bg-black/20 shadow-[0_0_30px_rgba(233,196,106,0.35)]">
          <span className="text-[16cqw] font-black text-[#f2d27a]">哲</span>
        </div>
        <div className="mt-[6cqw] text-[6.5cqw] font-extrabold tracking-[0.2em] text-[#f2d27a]">철학자 대난투</div>
        <div className="mt-[1cqw] text-[4.4cqw] tracking-[0.3em] text-white/50">ETHICS · DUEL</div>
      </div>
      <FrameArt rarity="legendary" />
    </div>
  );
}
