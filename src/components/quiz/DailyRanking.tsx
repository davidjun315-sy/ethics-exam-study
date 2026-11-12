import { Check } from "lucide-react";
import type { DailyRanking as Ranking } from "@/lib/quiz/fun";
import { TitleBadge } from "@/components/game/HonorTab";

/** 오늘의 미션 랭킹: 오늘 10문제 중 몇 문제를 풀었나. 다 푼 사람은 은은한 금빛 '완주' */
export function DailyRanking({ r }: { r: Ranking }) {
  return (
    <section className="card p-4" aria-labelledby="daily-rank-h">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="daily-rank-h" className="text-base font-bold">
          오늘의 미션 랭킹
        </h2>
        <span className="text-[11px] text-faint">
          오늘 {r.players}명 참여 · 완주 {r.finishers}명 · 자정에 새로 시작
        </span>
      </div>
      {r.rows.length === 0 ? (
        <p className="text-sm text-muted">아직 오늘 미션을 푼 사람이 없어요. 첫 번째가 되어 보세요!</p>
      ) : (
        <ol className="space-y-1" aria-label="오늘의 미션 순위">
          {r.rows.map((x) => (
            <li key={x.rank} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm ${x.done ? "bg-[#ffd36b]/[0.09]" : ""} ${x.me ? "ring-1 ring-navy/30" : ""}`}>
              <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted">{x.rank}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{x.name}</span>
                {x.me && <span className="ml-1 text-xs text-muted">(나)</span>}
                {x.title && <TitleBadge title={x.title} className="ml-1.5 align-middle" />}
              </span>
              {/* 10칸 진행 */}
              <span className="hidden gap-[3px] sm:flex" aria-hidden>
                {Array.from({ length: x.total }, (_, i) => (
                  <span key={i} className={`h-2 w-2 rounded-sm ${i < x.answered ? (x.done ? "bg-[#d9a520]" : "bg-navy/70") : "bg-surface-2"}`} />
                ))}
              </span>
              {x.done ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#d9a520]/40 bg-[#ffd36b]/15 px-2 py-0.5 text-[11px] font-bold text-[#8a5a00] dark:text-[#ffd36b]">
                  <Check className="h-3 w-3" aria-hidden /> 완주
                </span>
              ) : (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                  {x.answered}/{x.total}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {r.mine && r.mine.rank > r.rows.length && (
        <p className="mt-2 rounded-lg bg-navy-soft/60 px-3 py-1.5 text-xs">
          내 순위 <b className="text-navy">{r.mine.rank}위</b> · {r.mine.done ? "완주" : `${r.mine.answered}/${r.mine.total}`}
        </p>
      )}
    </section>
  );
}
