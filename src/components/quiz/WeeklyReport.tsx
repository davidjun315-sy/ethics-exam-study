import Link from "next/link";
import type { WeekReport } from "@/lib/quiz/fun-core";

const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

function Delta({ now, before, unit = "", pctMode = false }: { now: number | null; before: number | null; unit?: string; pctMode?: boolean }) {
  if (now === null || before === null) return null;
  const d = pctMode ? Math.round((now - before) * 100) : now - before;
  if (!d) return <span className="block text-[10px] text-faint">지난주와 같음</span>;
  return (
    <span className={`block whitespace-nowrap text-[10px] font-semibold ${d > 0 ? "text-ok" : "text-danger"}`} title="지난주와 비교">
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}
      {pctMode ? "%p" : unit}
    </span>
  );
}

/** 주간 학습 리포트: 이번 주(월~일) · 지난주와 비교 · 약한 사상가 */
export function WeeklyReport({ r }: { r: WeekReport }) {
  const t = r.thisWeek, l = r.lastWeek;
  const verdict =
    t.answered === 0
      ? "이번 주는 아직 시작 전이에요. 오늘의 미션부터 가볍게 시작해 보세요."
      : t.answered > l.answered
        ? `지난주보다 ${t.answered - l.answered}문제 더 풀었어요. 좋은 흐름이에요!`
        : t.activeDays >= 5
          ? "꾸준히 공부하고 있어요. 이 속도를 유지해요!"
          : "조금씩이라도 매일 푸는 게 가장 큰 힘이 돼요.";
  return (
    <section className="card p-4" aria-labelledby="week-report-h">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="week-report-h" className="text-base font-bold">
          이번 주 학습 리포트
        </h2>
        <span className="text-[11px] text-faint">월~일 · 지난주와 비교</span>
      </div>
      <p className="mb-3 text-sm">{verdict}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-surface-2 p-2.5">
          <div className="text-[11px] text-muted">푼 문제</div>
          <div className="num text-xl font-bold">{t.answered}</div>
          <Delta now={t.answered} before={l.answered} unit="문제" />
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5">
          <div className="text-[11px] text-muted">정답률</div>
          <div className="num text-xl font-bold">{pct(t.accuracy)}</div>
          <Delta now={t.accuracy} before={l.accuracy} pctMode />
        </div>
        <div className="col-span-2 rounded-lg bg-surface-2 p-2.5 sm:col-span-1">
          <div className="text-[11px] text-muted">
            공부한 날 <b className="text-ink">{t.activeDays}</b>/7
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1" aria-label={`공부한 날 ${t.activeDays}일`}>
            {t.days.map((on, i) => (
              <span key={i} className={`flex h-6 items-center justify-center rounded text-[10px] font-bold ${on ? "bg-ok text-on-accent" : "bg-surface text-faint"}`}>
                {DAYS[i]}
              </span>
            ))}
          </div>
        </div>
      </div>
      {(r.weakPhilosophers.length > 0 || r.strongPhilosophers.length > 0) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {r.weakPhilosophers.length > 0 && (
            <div className="rounded-lg border border-line p-2.5">
              <div className="mb-1 text-[11px] font-semibold text-muted">더 다져야 할 사상가</div>
              <ul className="space-y-1 text-sm">
                {r.weakPhilosophers.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-2">
                    <span>
                      <b>{p.name}</b> <span className="text-xs text-muted">놓친 {p.missed % 1 ? p.missed.toFixed(1) : p.missed} / {p.answered}문제</span>
                    </span>
                    <Link href={`/quiz/free?philosopher=${encodeURIComponent(p.name)}`} className="shrink-0 text-xs font-semibold text-navy hover:underline">
                      복습 →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.strongPhilosophers.length > 0 && (
            <div className="rounded-lg border border-line p-2.5">
              <div className="mb-1 text-[11px] font-semibold text-muted">잘하고 있는 사상가</div>
              <ul className="space-y-1 text-sm">
                {r.strongPhilosophers.map((p) => (
                  <li key={p.name}>
                    <b>{p.name}</b> <span className="text-xs text-ok">정답률 {pct(p.accuracy)}</span> <span className="text-xs text-muted">· {p.answered}문제</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {r.weakAreas.length > 0 && <p className="mt-2 text-xs text-muted">가장 많이 놓친 영역: {r.weakAreas.map((a) => a.area).join(" · ")}</p>}
      <p className="mt-2 text-right text-xs">
        <Link href="/quiz/game?tab=honor" className="font-semibold text-navy hover:underline">
          퀴즈 업적 · 칭호 보기 →
        </Link>
      </p>
    </section>
  );
}
