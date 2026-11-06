import Link from "next/link";
import type { FeaturedSummary } from "@/lib/game/data";
import { nextRarity, RARITY_NAMES } from "@/lib/game/rules";
import { CardBack, PhilosopherCard } from "./PhilosopherCard";

export type { FeaturedSummary };

function CoinChip({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 bg-warn-soft px-2.5 py-0.5 text-sm font-bold tabular-nums text-warn">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warn text-[9px] font-black text-white dark:text-[#0f141c]">C</span>
      {value.toLocaleString()}
    </span>
  );
}

/**
 * 윤리 퀴즈 메인 상단 '나의 철학자': 대표 카드를 크게, 옆에 이름·등급·레벨·강화 진행·코인·이동 버튼.
 * children: 기존 학습 프로필(레벨·XP·연속 학습) — 같은 칸에 넣어 오늘의 미션이 아래로 밀리지 않게 한다.
 */
export function MyPhilosopher({ game, children }: { game: FeaturedSummary; children: React.ReactNode }) {
  const f = game.featured;
  const progress = f ? (f.upgrade ? Math.min(1, game.shards / f.upgrade.shards) : 1) : 0;
  return (
    <section className="card overflow-hidden">
      <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[11.5rem_minmax(0,1fr)] sm:gap-6 sm:p-5">
        <div className="relative">
          {f ? (
            <Link href="/quiz/game?tab=collection" aria-label={`대표 카드 ${f.name} — 도감에서 보기`}>
              <PhilosopherCard card={f} rarity={f.rarity} level={f.level} stats={{ atk: f.atk, hp: f.hp }} maxLevel={game.maxLevel} featured shards={game.shards} shardsNeeded={f.upgrade?.shards ?? null} className="card-float" />
            </Link>
          ) : (
            <Link href={game.ownedCount && !game.freeDraw ? "/quiz/game?tab=collection" : "/quiz/game?tab=draw"} aria-label="철학자 대난투로 가기">
              <CardBack className="opacity-90" />
            </Link>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">나의 철학자</span>
            <span className="ml-auto"><CoinChip value={game.coins} /></span>
          </div>
          {f ? (
            <>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <h2 className="text-xl font-black sm:text-2xl">{f.name}</h2>
                <span className="text-xs font-semibold text-muted">{RARITY_NAMES[f.rarity]} · Lv.{f.level}/{game.maxLevel}</span>
              </div>
              {f.quote && (
                <p className="relative mt-2 rounded-xl rounded-tl-sm bg-navy-soft/60 px-3 py-2 text-sm font-medium leading-snug">
                  “{f.quote}”
                  <span className="mt-0.5 block text-[10px] font-normal text-faint">게임 대사 · 원문 인용 아님</span>
                </p>
              )}
              <div className="mt-2 text-xs text-muted">
                {f.upgrade ? (
                  <>
                    <div className="mb-1 flex justify-between"><span>다음 레벨까지 강화 조각</span><span className="tabular-nums">{game.shards}/{f.upgrade.shards} · {f.upgrade.coins}코인</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-warn" style={{ width: `${progress * 100}%` }} /></div>
                  </>
                ) : (
                  <span className="font-semibold text-warn">최대 레벨 달성</span>
                )}
                {nextRarity(f.rarity) && game.fusable > 0 && (
                  <Link href={`/quiz/game?tab=fusion&base=${f.cardId}`} className="mt-1.5 inline-block font-semibold text-ok hover:underline">
                    같은 등급 카드 {game.fusable}장 보유 · {RARITY_NAMES[nextRarity(f.rarity)!]}(으)로 합성하기 →
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="mt-1">
              <h2 className="text-lg font-black sm:text-xl">{game.ownedCount ? "대표 철학자를 정해 보세요" : "첫 철학자 카드를 획득해 보세요"}</h2>
              <p className="mt-1 text-sm text-muted">
                {game.cardCount === 0
                  ? "카드 일러스트를 준비하고 있습니다. 그동안 퀴즈로 코인을 모아 두세요."
                  : game.ownedCount
                    ? `보유한 ${game.ownedCount}명 중 한 명을 대표로 정하면 여기에 크게 표시됩니다.`
                    : game.freeDraw
                      ? "첫 카드 뽑기는 무료예요. 코인 없이 바로 첫 철학자를 영입하세요."
                      : "퀴즈를 풀어 모은 코인으로 철학자를 영입하세요."}
              </p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {game.freeDraw && game.cardCount > 0 && (
              <Link href="/quiz/game?tab=draw" className="btn-primary !px-3 !py-1.5 text-sm font-semibold">무료로 첫 철학자 획득하기</Link>
            )}
            {f || game.ownedCount ? (
              <>
                <Link href="/quiz/game?tab=collection" className="btn !px-2.5 !py-1 text-xs">{f ? "대표 카드 변경" : "대표 카드 고르기"}</Link>
                <Link href="/quiz/game?tab=draw" className="btn !px-2.5 !py-1 text-xs">카드 뽑기</Link>
                <Link href="/quiz/game?tab=battle" className="btn !px-2.5 !py-1 text-xs font-semibold">배틀 입장</Link>
              </>
            ) : game.freeDraw && game.cardCount > 0 ? null : (
              <Link href="/quiz/game?tab=draw" className="btn-primary !px-3 !py-1.5 text-sm font-semibold">카드 뽑기</Link>
            )}
            <Link href="/quiz/game?tab=collection" className="btn !px-2.5 !py-1 text-xs">카드 도감</Link>
          </div>
          <div className="mt-auto border-t border-line pt-3 max-sm:hidden">{children}</div>
        </div>
      </div>
      <div className="border-t border-line px-4 py-3 sm:hidden">{children}</div>
    </section>
  );
}
