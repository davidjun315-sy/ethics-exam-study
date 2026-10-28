import Link from "next/link";
import type { Dashboard } from "@/lib/quiz/learn";
import { LEVEL_NAMES, STREAK_BADGES } from "@/lib/quiz/srs";
import { StartLevelPicker } from "./StartLevelPicker";

function Flame({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-6 w-6 ${on ? "text-warn" : "text-faint"}`} fill="currentColor" aria-hidden>
      <path d="M12 2c1 3.5-1.5 5.5-1.5 8 0 1.4.9 2.5 2.2 2.5 1.6 0 2.3-1.3 2.3-3 2.2 1.6 3.5 4 3.5 6.5A6.5 6.5 0 0 1 12 22.5 6.5 6.5 0 0 1 5.5 16c0-5 4.5-7.5 6.5-14Z" />
    </svg>
  );
}

function Bar({ value, tone = "navy" }: { value: number; tone?: "navy" | "ok" | "warn" }) {
  const color = { navy: "bg-navy", ok: "bg-ok", warn: "bg-warn" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={`h-full rounded-full ${color} transition-[width]`} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function QuizHome({ d }: { d: Dashboard }) {
  const { level, today } = d;
  const xp = d.profile?.xp ?? 0;
  const lvProgress = (xp - level.current) / (level.next - level.current);
  const startLabel = d.profile ? LEVEL_NAMES[d.profile.start_level] : null;
  // 달력 첫 날의 요일 (날짜 문자열 기준이라 시간대와 무관)
  const [y, mo, da] = d.calendar[0].day.split("-").map(Number);
  const dow0 = new Date(Date.UTC(y, mo - 1, da)).getUTCDay();

  const missionLabel = today.completed ? "오늘의 미션 완료" : today.started && today.done > 0 ? "이어 풀기" : "오늘의 미션 시작";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* 레벨 · 연속 학습 */}
      <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div className="min-w-[12rem] flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy">Lv.{level.level}</span>
            <span className="text-sm text-muted">{xp} XP</span>
            {startLabel && <span className="ml-auto rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">{startLabel} 과정</span>}
          </div>
          <div className="mt-2">
            <Bar value={lvProgress} />
            <div className="mt-1 text-right text-[11px] text-faint">다음 레벨까지 {level.next - xp} XP</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Flame on={d.streak > 0} />
          <div>
            <div className="text-xl font-bold leading-none">{d.streak}일</div>
            <div className="text-xs text-muted">연속 학습{d.profile?.best_streak ? ` · 최고 ${d.profile.best_streak}일` : ""}</div>
          </div>
        </div>
      </section>

      {/* 오늘의 미션 */}
      <section className={`card p-5 ${today.completed ? "border-ok/40" : "border-navy/30"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">오늘의 미션</h2>
            <p className="text-sm text-muted">
              {today.completed
                ? "오늘 미션을 끝냈습니다. 내일도 이어서 풀어 보세요."
                : today.started
                  ? `${today.total}문제 중 ${today.done}문제를 풀었습니다.`
                  : "기출 · 예상 문제 · 복습을 섞은 하루 분량"}
            </p>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${today.completed ? "text-ok" : "text-navy"}`}>
            {today.started ? `${today.done}/${today.total}` : ""}
          </span>
        </div>
        {today.started && (
          <div className="mt-3">
            <Bar value={today.total ? today.done / today.total : 0} tone={today.completed ? "ok" : "navy"} />
          </div>
        )}
        {d.bankSize === 0 ? (
          <p className="mt-4 rounded bg-surface-2 p-3 text-sm text-muted">아직 공개된 퀴즈 문제가 없습니다. 관리자 화면의 &apos;윤리 퀴즈 관리&apos;에서 문제은행을 동기화하고 승인하세요.</p>
        ) : today.completed ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/quiz/free" className="btn-primary">더 풀기 (자유 학습)</Link>
            {d.wrongCount > 0 && <Link href="/quiz/play?mode=review" className="btn">오답 복습 {d.wrongCount}</Link>}
          </div>
        ) : (
          <Link href="/quiz/play?mode=daily" className="btn-primary mt-4 block w-full py-3 text-center text-base font-semibold">
            {missionLabel}
          </Link>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/quiz/free" className="card p-4 hover:border-navy/50">
          <div className="font-bold">자유 학습</div>
          <div className="mt-0.5 text-xs text-muted">영역·사상가·연도·유형 골라 풀기</div>
        </Link>
        <Link href={d.wrongCount ? "/quiz/play?mode=review" : "/quiz"} className={`card p-4 ${d.wrongCount ? "hover:border-navy/50" : "pointer-events-none opacity-60"}`}>
          <div className="flex items-baseline gap-2 font-bold">
            오답 복습 <span className="text-sm font-semibold text-danger">{d.wrongCount || ""}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">{d.wrongCount ? "틀렸거나 일부만 맞힌 문제" : "아직 틀린 문제가 없습니다"}</div>
        </Link>
      </div>
      {d.dueCount > 0 && <p className="text-center text-xs text-muted">복습할 때가 된 문제 {d.dueCount}개 — 다음 미션에 우선 들어갑니다</p>}

      {/* 영역별 숙련도 */}
      <section className="card p-4">
        <h2 className="mb-3 text-[15px] font-bold">영역별 숙련도</h2>
        {d.mastery.length === 0 ? (
          <p className="text-sm text-faint">문제를 풀면 영역별 숙련도가 쌓입니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {d.mastery
              .sort((a, b) => b.total - a.total)
              .map((m) => (
                <li key={m.name}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-xs text-muted">
                      {m.seen ? `숙련도 ${Math.round(m.score * 100)}%` : "아직 안 풂"} · {m.seen}/{m.total}문제
                    </span>
                  </div>
                  <Bar value={m.score} tone={m.score >= 0.6 ? "ok" : m.score >= 0.3 ? "navy" : "warn"} />
                </li>
              ))}
          </ul>
        )}
        {d.philosophers.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted">사상가별 숙련도</summary>
            <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {d.philosophers.map((p) => (
                <li key={p.name} className="flex items-center gap-2 text-sm">
                  <span className="w-20 shrink-0 truncate">{p.name}</span>
                  <Bar value={p.score} />
                  <span className="w-10 shrink-0 text-right text-xs text-muted">{Math.round(p.score * 100)}%</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* 학습 달력 */}
      <section className="card p-4">
        <h2 className="mb-3 text-[15px] font-bold">학습 달력 <span className="text-xs font-normal text-faint">최근 6주</span></h2>
        <div className="grid max-w-sm grid-cols-7 gap-1.5 text-center text-[10px] text-faint">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
          {Array.from({ length: dow0 }).map((_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {d.calendar.map((c) => (
            <span
              key={c.day}
              title={`${c.day} · ${c.answered}문제${c.completed ? " · 미션 완료" : ""}`}
              className={`flex aspect-square items-center justify-center rounded-md text-[11px] ${
                c.completed ? "bg-ok text-white dark:text-[#0f141c]" : c.answered ? "bg-navy-soft text-navy" : "bg-surface-2 text-faint"
              }`}
            >
              {Number(c.day.slice(8))}
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-3 text-[11px] text-faint">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-ok" /> 미션 완료</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-navy-soft" /> 문제 풀이</span>
        </div>
      </section>

      {/* 배지 · 난이도 */}
      <section className="card p-4">
        <h2 className="mb-3 text-[15px] font-bold">연속 학습 배지</h2>
        <div className="grid grid-cols-4 gap-2">
          {STREAK_BADGES.map((n) => {
            const got = d.profile?.badges.includes(`streak-${n}`);
            return (
              <div key={n} className={`rounded-lg border p-2 text-center ${got ? "border-warn/50 bg-warn-soft/40" : "border-line opacity-50"}`}>
                <div className={`text-lg font-bold ${got ? "text-warn" : "text-faint"}`}>{n}일</div>
                <div className="text-[10px] text-muted">{got ? "획득" : "연속 학습"}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-[15px] font-bold">학습 난이도</h2>
        <p className="mb-3 text-xs text-muted">새 문제를 고를 때 난이도 비중이 달라집니다. 전문가 과정은 이미 익힌 쉬운 문제를 덜 냅니다.</p>
        <StartLevelPicker current={d.profile?.start_level ?? null} />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-muted">
          {([1, 2, 3] as const).map((k) => {
            const s = d.levelStats[k];
            return (
              <div key={k} className="rounded bg-surface-2 p-2">
                <div className="font-semibold text-ink">{["", "하", "중", "상"][k]} 문제</div>
                {s.attempts ? `정답 ${Math.round((s.correct / s.attempts) * 100)}% · ${s.attempts}회` : "기록 없음"}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-faint">최근 6주 기록 · 서술형은 자기평가 결과입니다.</p>
      </section>
    </div>
  );
}
