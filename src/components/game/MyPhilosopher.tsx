import Link from "next/link";
import { TitleBadge } from "./HonorTab";
import { ChevronRight, Layers, Sparkles, Swords, WandSparkles } from "lucide-react";
import type { FeaturedSummary } from "@/lib/game/data";
import { nextRarity, RARITY_NAMES } from "@/lib/game/rules";
import { CardBack, PhilosopherCard } from "./PhilosopherCard";
import { FeaturedCardOpener } from "./FeaturedCardOpener";

export type { FeaturedSummary };

function CoinChip({ value }: { value: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-warn/40 bg-warn-soft px-2.5 py-0.5 text-sm font-bold tabular-nums text-warn">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warn text-[9px] font-black text-on-accent">C</span>
      {value.toLocaleString()}
    </span>
  );
}

const RARITY_TONE: Record<string, string> = {
  common: "text-muted",
  rare: "text-[#3f74c9] dark:text-[#8fc0ff]",
  epic: "text-[#8a4fd0] dark:text-[#cfa6ff]",
  legendary: "text-[#a8730a] dark:text-[#ffd36b]",
};

/**
 * 대표 사상가 카드 위젯 — 메인 홈과 윤리 퀴즈가 같은 데이터(getFeatured: game_profiles.featured_card_id → game_user_cards)를 쓴다.
 * - 카드 성장 = 카드 레벨 + 강화석 (통일 전: 같은 사상가의 강화 조각) (학습자 레벨·XP 와는 별개)
 * - compact: 메인 홈 (가로형, 핵심 정보만) / full: 윤리 퀴즈 (대사·뽑기·합성·배틀 바로가기)
 */
export function FeaturedPhilosopher({ game, variant, children }: { game: FeaturedSummary; variant: "compact" | "full"; children?: React.ReactNode }) {
  const f = game.featured;
  const progress = f ? (f.upgrade ? Math.min(1, game.shards / f.upgrade.shards) : 1) : 0;
  const up = f ? nextRarity(f.rarity) : null;
  const compact = variant === "compact";

  if (!f) {
    const first = game.ownedCount === 0;
    return (
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-navy/10 blur-3xl" aria-hidden />
        <div className={`relative grid items-center gap-4 p-4 sm:p-5 ${compact ? "grid-cols-[5.5rem_minmax(0,1fr)]" : "grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)]"}`}>
          <Link href={first ? "/quiz/game?tab=draw" : "/quiz/game?tab=collection"} aria-label="철학자 대난투로 가기">
            <CardBack className="opacity-90" />
          </Link>
          <div className="min-w-0">
            <div className="eyebrow">나의 대표 사상가</div>
            <h2 className="mt-1 text-lg font-bold sm:text-xl">{first ? "나의 첫 사상가를 만나보세요." : "대표 사상가를 정해 보세요"}</h2>
            <p className="mt-1 text-sm text-muted">
              {game.cardCount === 0
                ? "카드 일러스트를 준비하고 있습니다. 그동안 퀴즈로 코인을 모아 두세요."
                : first
                  ? game.freeDraw
                    ? "첫 카드 뽑기는 계정당 1회 무료예요."
                    : "퀴즈로 모은 코인으로 철학자를 영입하세요."
                  : `보유한 ${game.ownedCount}장 중 한 장을 대표로 정하면 여기에 표시됩니다.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {game.cardCount > 0 && (first || game.freeDraw) ? (
                <Link href="/quiz/game?tab=draw" className="btn-primary">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  {game.freeDraw ? "무료로 첫 철학자 획득하기" : "사상가 카드 뽑기"}
                </Link>
              ) : null}
              {!first && (
                <Link href="/quiz/game?tab=collection" className={game.freeDraw ? "btn" : "btn-primary"}>대표 카드 고르기</Link>
              )}
              {!compact && <CoinChip value={game.coins} />}
            </div>
          </div>
        </div>
        {children && <div className="relative border-t border-line px-4 py-3 sm:px-5">{children}</div>}
      </section>
    );
  }

  const art = (
    <FeaturedCardOpener philosopherId={f.philosopherId} label={`대표 카드 ${f.name} — 카드 상세 보기`}>
      <PhilosopherCard
        card={f}
        rarity={f.rarity}
        level={f.level}
        stats={{ atk: f.atk, hp: f.hp }}
        maxLevel={game.maxLevel}
        featured
        shards={game.shards}
        shardsNeeded={f.upgrade?.shards ?? null}
        shardsLabel={game.stonesUnified ? "강화석" : "조각"}
        tilt={!compact}
        className={compact ? "" : "card-float"}
      />
    </FeaturedCardOpener>
  );

  return (
    <section className="card relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-navy/10 blur-3xl" aria-hidden />
      <div className={`relative grid gap-4 p-4 sm:gap-5 sm:p-5 ${compact ? "grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)]" : "grid-cols-[7.5rem_minmax(0,1fr)] sm:grid-cols-[11rem_minmax(0,1fr)]"}`}>
        <div>{art}</div>
        <div className="flex min-w-0 flex-col">
          {/* 좁은 화면에서 코인이 눌려 깨지지 않게: 코인은 줄어들지 않고, 칭호는 넘치면 다음 줄로 */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="eyebrow whitespace-nowrap">나의 대표 사상가</span>
            <TitleBadge title={game.title} />
            {!compact && (
              <span className="ml-auto shrink-0">
                <CoinChip value={game.coins} />
              </span>
            )}
          </div>
          <h2 className="mt-1 truncate text-xl font-extrabold tracking-tight sm:text-2xl">{f.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px]">
            <span className={`font-bold ${RARITY_TONE[f.rarity]}`}>{RARITY_NAMES[f.rarity]}</span>
            <span className="text-faint">·</span>
            <span className="font-semibold">카드 Lv.{f.level}<span className="font-normal text-faint">/{game.maxLevel}</span></span>
          </div>
          <div className="num mt-0.5 text-xs text-muted">공격력 {f.atk} · 체력 {f.hp}</div>
          {!compact && f.quote && (
            <p className="mt-2 hidden rounded-xl rounded-tl-sm bg-navy-soft/60 px-3 py-2 text-sm font-medium leading-snug sm:block">
              “{f.quote}”
              <span className="mt-0.5 block text-[11px] font-normal text-faint">게임 대사 · 원문 인용 아님</span>
            </p>
          )}
          <div className="mt-auto pt-3 text-xs text-muted">
            {f.upgrade ? (
              <>
                <div className="mb-1 flex justify-between gap-2">
                  <span>카드 성장 · {game.stonesUnified ? "강화석" : "강화 조각"}</span>
                  <span className="num shrink-0 font-semibold text-ink">{game.shards}/{f.upgrade.shards}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="카드 성장 진행률">
                  <div className="h-full rounded-full bg-gradient-to-r from-warn/70 to-warn" style={{ width: `${progress * 100}%` }} />
                </div>
              </>
            ) : (
              <span className="font-semibold text-warn">카드 최대 레벨 달성</span>
            )}
            {up && game.fusable > 0 && (
              <Link href={`/quiz/game?tab=fusion&base=${f.cardId}`} className="mt-1.5 inline-flex items-center gap-1 font-semibold text-ok hover:underline">
                같은 {RARITY_NAMES[f.rarity]} {f.name} {game.fusable}장 · {RARITY_NAMES[up]}(으)로 합성 가능 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="relative flex gap-1.5 overflow-x-auto border-t border-line px-4 py-2.5 sm:px-5 [&::-webkit-scrollbar]:hidden">
        {compact ? (
          <>
            <Link href="/quiz/game?tab=battle" className="btn-primary shrink-0 !min-h-8 !py-1 text-xs font-semibold"><Swords className="h-3.5 w-3.5" aria-hidden />철학자 대난투</Link>
            <Link href="/quiz/game?tab=collection" className="btn shrink-0 !min-h-8 !py-1 text-xs"><Layers className="h-3.5 w-3.5" aria-hidden />카드 관리</Link>
            <Link href="/quiz/game?tab=upgrade" className="btn shrink-0 !min-h-8 !py-1 text-xs">카드 성장</Link>
            <Link href="/quiz/game?tab=draw" className="btn shrink-0 !min-h-8 !py-1 text-xs">{game.freeDraw ? "무료 뽑기" : "카드 뽑기"}</Link>
          </>
        ) : (
          <>
            <Link href="/quiz/game?tab=collection" className="btn shrink-0 !min-h-8 !py-1 text-xs"><Layers className="h-3.5 w-3.5" aria-hidden />카드 도감 · 대표 변경</Link>
            <Link href="/quiz/game?tab=draw" className="btn shrink-0 !min-h-8 !py-1 text-xs"><Sparkles className="h-3.5 w-3.5" aria-hidden />{game.freeDraw ? "무료 뽑기" : "카드 뽑기"}</Link>
            <Link href="/quiz/game?tab=upgrade" className="btn shrink-0 !min-h-8 !py-1 text-xs">레벨업</Link>
            <Link href="/quiz/game?tab=fusion" className="btn shrink-0 !min-h-8 !py-1 text-xs"><WandSparkles className="h-3.5 w-3.5" aria-hidden />합성</Link>
            <Link href="/quiz/game?tab=battle" className="btn shrink-0 !min-h-8 !py-1 text-xs font-semibold"><Swords className="h-3.5 w-3.5" aria-hidden />배틀</Link>
          </>
        )}
      </div>
      {children && <div className="relative border-t border-line px-4 py-3 sm:px-5">{children}</div>}
    </section>
  );
}

/** 윤리 퀴즈 상단 (예전 이름 유지): children = 학습 프로필(레벨·XP·연속 학습) */
export function MyPhilosopher({ game, children }: { game: FeaturedSummary; children?: React.ReactNode }) {
  return (
    <FeaturedPhilosopher game={game} variant="full">
      {children}
    </FeaturedPhilosopher>
  );
}
