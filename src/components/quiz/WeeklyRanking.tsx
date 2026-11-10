import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import type { QuizWeekly } from "@/lib/quiz/weekly";
import { TitleBadge } from "@/components/game/HonorTab";

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });
const MEDAL = ["bg-[#ffd36b] text-[#3a2600]", "bg-[#d5dae2] text-[#2a2f38]", "bg-[#e0a46a] text-[#3a1f00]"];

/** 윤리 퀴즈 주간 랭킹 (이번 주 풀이 경험치). limit · more: 메인 화면용 (상위 몇 명 + 전체 보기) */
export function WeeklyRanking({ w, limit, more }: { w: QuizWeekly; limit?: number; more?: string }) {
  const lastDay = new Date(new Date(w.weekEnd).getTime() - 1).toISOString();
  const rows = limit ? w.rows.slice(0, limit) : w.rows;
  return (
    <section id="weekly-ranking" className="card scroll-mt-20 p-4" aria-labelledby="quiz-rank-h">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="quiz-rank-h" className="flex items-center gap-1.5 text-base font-bold">
          <Trophy className="h-4 w-4 text-[#c99a2e]" aria-hidden />
          {more ? "윤리 퀴즈 이번 주 랭킹" : "이번 주 랭킹"}
        </h2>
        <span className="text-[11px] text-faint">
          {fmtDay(w.weekStart)} (월) ~ {fmtDay(lastDay)} (일) · 풀이 경험치 합 · 월요일 0시 새로 시작
        </span>
      </div>
      <div className="mb-2 rounded-xl bg-navy-soft/60 px-3 py-2 text-sm">
        {w.mine ? (
          <>
            내 순위 <b className="text-navy">{w.mine.rank}위</b> · <span className="num font-semibold">{w.mine.xp}</span> XP
            <span className="ml-1 text-xs text-muted">
              ({w.mine.solved}문제 · 정답 {w.mine.correct})
            </span>
          </>
        ) : (
          <span className="text-muted">이번 주 기록이 아직 없어요. 한 문제만 풀어도 순위에 올라갑니다.</span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">아직 이번 주에 문제를 푼 사람이 없습니다. 첫 번째가 되어 보세요!</p>
      ) : (
        <ol className="grid gap-1 sm:grid-cols-2 sm:gap-x-4" aria-label="이번 주 윤리 퀴즈 순위">
          {rows.map((r) => (
            <li key={r.rank} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${r.me ? "bg-navy-soft/70 ring-1 ring-navy/30" : ""}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${MEDAL[r.rank - 1] ?? "bg-surface-2 text-muted"}`}>{r.rank}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{r.name}</span>
                {r.me && <span className="ml-1 text-xs text-muted">(나)</span>}
                {r.title && <TitleBadge title={r.title} className="ml-1.5 align-middle" />}
              </span>
              <span className="shrink-0 text-right">
                <b className="num">{r.xp}</b>
                <span className="text-xs text-muted"> XP</span>
                <span className="ml-1.5 hidden text-[11px] text-faint sm:inline">{r.solved}문제</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {more && (
        <Link href={more} className="mt-2 flex items-center justify-end gap-0.5 text-xs font-semibold text-navy hover:underline">
          {w.rows.length > rows.length ? "전체 순위 보기" : "퀴즈 풀러 가기"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </section>
  );
}
