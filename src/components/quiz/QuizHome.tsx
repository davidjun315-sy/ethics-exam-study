import Link from "next/link";
import { ChevronRight, Compass, PenLine, RotateCcw, ScrollText, Swords } from "lucide-react";
import type { Dashboard } from "@/lib/quiz/learn";
import { CHALLENGES, checkpoints, missionStatus, type ChallengeType } from "@/lib/quiz/game";
import { SCOPE_NAMES, STREAK_BADGES } from "@/lib/quiz/srs";
import { Bar, CheckpointTrack, ComboChip } from "./GameBits";
import { ScopePicker } from "./ScopePicker";
import { FeaturedPhilosopher, type FeaturedSummary } from "@/components/game/MyPhilosopher";

function Flame({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-6 w-6 ${on ? "text-warn" : "text-faint"}`} fill="currentColor" aria-hidden>
      <path d="M12 2c1 3.5-1.5 5.5-1.5 8 0 1.4.9 2.5 2.2 2.5 1.6 0 2.3-1.3 2.3-3 2.2 1.6 3.5 4 3.5 6.5A6.5 6.5 0 0 1 12 22.5 6.5 6.5 0 0 1 5.5 16c0-5 4.5-7.5 6.5-14Z" />
    </svg>
  );
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
// 실전 도전 I·II·III: 원문 획득(decode) · 서술형 마스터(essay) · 오답 복수전(revenge)
const CHALLENGE_ICON = [ScrollText, PenLine, Swords];
const CHALLENGE_TONE = [
  "bg-[#ebeffa] text-[#4a66bf] dark:bg-[#1f2c47] dark:text-[#9db6ee]",
  "bg-[#e9f4ee] text-[#1f7a5c] dark:bg-[#15301f] dark:text-[#7cd0a5]",
  "bg-[#fdecea] text-[#b42318] dark:bg-[#3d1c1d] dark:text-[#f08a80]",
];
const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);

/** 접기/펼치기 카드 (숙련도·달력처럼 자주 보지 않는 정보) */
function Fold({ title, summary, children, id }: { title: string; summary: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <details id={id} className="card group">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <span className="text-base font-bold">{title}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{summary}</span>
        <span className="text-faint transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

/**
 * 윤리 퀴즈 홈. 순서: 프로필 → 오늘의 미션 → 실전 도전 → 자유 학습·오답 복습 → 성장 요약 → 숙련도 → 달력·배지 → 출제 범위
 * 게임 지표(체크포인트·콤보)와 실제 학습 지표(정답률·고난도 정답·숙련도)를 구분해서 보여 준다.
 */
export function QuizHome({ d, game = null }: { d: Dashboard; game?: FeaturedSummary | null }) {
  const { level, today, todayStats: ts, week } = d;
  const xp = d.profile?.xp ?? 0;
  const lvProgress = (xp - level.current) / (level.next - level.current);
  const mission = missionStatus(today.done, today.size);
  const cps = checkpoints(today.size);
  const [y, mo, da] = d.calendar[0].day.split("-").map(Number);
  const dow0 = new Date(Date.UTC(y, mo - 1, da)).getUTCDay();
  const activeDays = d.calendar.filter((c) => c.answered > 0).length;
  const badgeCount = STREAK_BADGES.filter((n) => d.profile?.badges.includes(`streak-${n}`)).length;
  const topArea = [...d.mastery].filter((m) => m.seen).sort((a, b) => b.score - a.score)[0];
  const missionLabel = today.completed ? "오늘의 미션 완수" : today.started && today.done > 0 ? "이어 풀기" : "오늘의 미션 시작";

  const challengeInfo: Record<ChallengeType, { count: number; note: string }> = {
    decode: {
      count: d.challenges.decode.hard + d.challenges.decode.mid,
      note: d.challenges.decode.hard ? `'상' ${d.challenges.decode.hard}문제` : d.challenges.decode.mid ? `'상' 없음 · '중' ${d.challenges.decode.mid}문제로` : "",
    },
    essay: {
      count: d.challenges.essay.hard + d.challenges.essay.mid,
      note: d.challenges.essay.hard ? `'상' ${d.challenges.essay.hard}문제` : d.challenges.essay.mid ? `'상' 없음 · '중' ${d.challenges.essay.mid}문제로` : "",
    },
    revenge: { count: d.challenges.revenge, note: d.challenges.revenge ? `재도전할 문제 ${d.challenges.revenge}개` : "" },
  };

  const profile = (
    <>
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-navy-soft">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-navy/80">Lv</span>
          <span className="-mt-1 text-xl font-bold leading-none text-navy">{level.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold"><span className="text-muted">학습 레벨</span> <span className="num">{xp} XP</span></span>
            <span className="hidden text-xs text-faint sm:inline">다음 레벨까지 {level.next - xp}</span>
          </div>
          <div className="mt-1.5"><Bar value={lvProgress} /></div>
        </div>
        <div className="flex items-center gap-2">
          <Flame on={d.streak > 0} />
          <div>
            <div className="text-xl font-bold leading-none tabular-nums">{d.streak}일</div>
            <div className="whitespace-nowrap text-[11px] text-muted">연속 학습<span className="hidden sm:inline">{d.profile?.best_streak ? ` · 최고 ${d.profile.best_streak}일` : ""}</span></div>
          </div>
        </div>
        <a href="#settings" className="hidden rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted hover:border-navy/40 hover:text-navy sm:inline-block">
          {SCOPE_NAMES[d.scope]}
        </a>
      </>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* 1. 학습 레벨 · XP · 연속 학습 (학습자 지표 — 카드 레벨과 별개) */}
      <section className="card flex items-center gap-3 p-3.5 sm:gap-5 sm:p-4" aria-label="나의 학습 레벨">{profile}</section>

      {/* 2. 대표 사상가 카드 (메인 홈과 같은 데이터) */}
      {game && <FeaturedPhilosopher game={game} variant="full" />}

      {/* 2. 오늘의 미션 (메인) */}
      <section className={`card overflow-hidden ${today.completed ? "border-ok/50" : "border-navy/30"}`}>
        <div className={`px-5 pb-5 pt-4 ${today.completed ? "bg-ok-soft/50" : "bg-navy-soft/40"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-muted">오늘의 미션 · {today.size}문제</div>
              <h2 className={`mt-0.5 text-xl font-bold ${today.completed ? "text-ok" : "text-navy"}`}>{mission.headline}</h2>
              <p className="text-sm text-muted">{today.started || today.done ? mission.sub : "1문제만 풀어도 첫 도전 성공. 체크포인트를 하나씩 넘어 보세요."}</p>
            </div>
            <span className={`shrink-0 text-2xl font-bold tabular-nums ${today.completed ? "text-ok" : "text-navy"}`}>
              {today.done}
              <span className="text-base text-faint">/{today.size}</span>
            </span>
          </div>
          <div className="mt-4">
            <CheckpointTrack done={today.done} total={today.size} />
          </div>
          <ul className="flex flex-wrap gap-1.5 text-[11px]">
            {cps.map((c) => (
              <li key={c.at} className={`rounded-full border px-2 py-0.5 ${today.done >= c.at ? "border-navy/40 bg-surface font-semibold text-navy" : "border-line text-faint"}`}>
                {today.done >= c.at ? "✓ " : ""}
                {c.title}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 px-5 pb-5 pt-4">
          {ts.answered > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted">오늘의 성과</span>
              <span><b className="tabular-nums">{ts.answered}</b>문제</span>
              <span className="text-ok">정답 <b className="tabular-nums">{ts.correct}</b></span>
              {ts.reconquered > 0 && <span className="text-ok">재정복 <b className="tabular-nums">{ts.reconquered}</b></span>}
              {ts.hardCorrect > 0 && <span>&apos;상&apos; 정답 <b className="tabular-nums">{ts.hardCorrect}</b></span>}
              <span className="font-semibold tabular-nums text-warn">+{ts.xp} XP</span>
              {ts.bestCombo >= 2 && <span className="ml-auto"><ComboChip count={ts.bestCombo} /></span>}
            </div>
          )}
          {d.bankSize === 0 ? (
            <p className="rounded bg-surface-2 p-3 text-sm text-muted">아직 공개된 퀴즈 문제가 없습니다. 관리자 화면의 &apos;윤리 퀴즈 관리&apos;에서 문제은행을 동기화하고 승인하세요.</p>
          ) : today.completed ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <a href="#challenges" className="btn-primary py-3 text-base">실전 도전 이어 가기</a>
              <Link href="/quiz/free" className="btn py-3">자유 학습</Link>
            </div>
          ) : (
            <Link href="/quiz/play?mode=daily" className="btn-primary w-full py-3.5 text-base">
              {missionLabel} <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </section>

      {/* 3. 오늘의 실전 도전 */}
      <section id="challenges" className="scroll-mt-20">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-bold">오늘의 실전 도전</h2>
          <span className="text-[11px] text-faint">{SCOPE_NAMES[d.scope]} 안에서 출제</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(CHALLENGES) as ChallengeType[]).map((k, i) => {
            const c = CHALLENGES[k];
            const info = challengeInfo[k];
            const ok = info.count > 0;
            return (
              <div key={k} className={`card flex flex-col p-4 ${ok ? "" : "opacity-70"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${CHALLENGE_TONE[i]}`}>
                    {(() => {
                      const Icon = CHALLENGE_ICON[i];
                      return <Icon className="h-[18px] w-[18px]" aria-hidden />;
                    })()}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">도전 {["I", "II", "III"][i]}</div>
                    <h3 className="font-bold leading-tight">{c.title}</h3>
                  </div>
                </div>
                <p className="mt-1.5 flex-1 text-xs leading-5 text-muted">{c.desc}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-faint">{ok ? `${info.note} · ${c.size}문제씩` : k === "revenge" ? "틀린 문제가 없어요" : "조건에 맞는 문제가 아직 없어요"}</span>
                  {ok ? (
                    <Link href={`/quiz/play?challenge=${k}`} className="btn-primary shrink-0 !min-h-8 !py-1 text-xs">도전</Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. 자유 학습 · 오답 복습 */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/quiz/free" className="card p-4 transition-colors hover:border-navy/50">
          <div className="flex items-center gap-1.5 font-bold"><Compass className="h-4 w-4 text-navy" aria-hidden />자유 학습</div>
          <div className="mt-0.5 text-xs text-muted">영역·사상가·연도·유형·난이도 골라 풀기</div>
        </Link>
        <Link href={d.wrongCount ? "/quiz/play?mode=review" : "/quiz"} className={`card p-4 ${d.wrongCount ? "hover:border-navy/50" : "pointer-events-none opacity-60"}`}>
          <div className="flex items-center gap-1.5 font-bold">
            <RotateCcw className="h-4 w-4 text-danger" aria-hidden />
            오답 복습 <span className="num text-sm font-semibold text-danger">{d.wrongCount || ""}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">{d.wrongCount ? "틀렸거나 일부만 맞힌 문제" : "아직 틀린 문제가 없습니다"}</div>
        </Link>
      </div>
      {d.dueCount > 0 && <p className="text-center text-xs text-muted">복습할 때가 된 문제 {d.dueCount}개 — 다음 미션에 우선 들어갑니다</p>}

      {/* 5. 학습 성장 요약 (실제 학습 지표) */}
      <section className="card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-bold">학습 성장 요약</h2>
          <span className="text-[11px] text-faint">최근 7일 · 실제 풀이 기록 기준</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "푼 문제", value: `${week.answered}`, sub: `${week.activeDays}일 학습` },
            { label: "정답률", value: pct(week.accuracy), sub: "일부만 = 0.5" },
            { label: "난이도 '상' 정답", value: `${week.hardCorrect}`, sub: `${week.hardAnswered}문제 중` },
            { label: "서술형 답안", value: `${week.essays}`, sub: week.reconquered ? `재정복 ${week.reconquered}` : "자기평가 포함" },
          ].map((t) => (
            <div key={t.label} className="rounded-lg bg-surface-2 p-3">
              <div className="text-[11px] text-muted">{t.label}</div>
              <div className="num text-[22px] font-bold leading-tight">{t.value}</div>
              <div className="text-[10px] text-faint">{t.sub}</div>
            </div>
          ))}
        </div>
        {d.growth.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {d.growth.slice(0, 3).map((g) => (
              <li key={g.area} className="flex items-center gap-2 rounded-md border border-ok/30 bg-ok-soft/50 px-3 py-1.5">
                <span className="font-semibold text-ok">↑</span>
                <span>
                  <b>{g.area}</b> 정답률이 {pct(g.before)} → <b className="text-ok">{pct(g.now)}</b>로 올랐습니다
                </span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-4 text-xs font-semibold text-muted">난이도별 정답률 <span className="font-normal text-faint">최근 6주 · 서술형은 자기평가</span></h3>
        <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs text-muted">
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
      </section>

      {/* 6. 숙련도 */}
      <Fold
        title="영역별·사상가별 숙련도"
        summary={topArea ? `가장 높은 영역: ${topArea.name} ${Math.round(topArea.score * 100)}%` : "문제를 풀면 숙련도가 쌓입니다"}
      >
        {d.mastery.length === 0 ? (
          <p className="text-sm text-faint">문제를 풀면 영역별 숙련도가 쌓입니다.</p>
        ) : (
          <ul className="space-y-2.5">
            {[...d.mastery]
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
          <>
            <h3 className="mb-2 mt-4 text-xs font-semibold text-muted">사상가별 숙련도</h3>
            <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {d.philosophers.map((p) => (
                <li key={p.name} className="flex items-center gap-2 text-sm">
                  <span className="w-20 shrink-0 truncate">{p.name}</span>
                  <Bar value={p.score} />
                  <span className="w-10 shrink-0 text-right text-xs text-muted">{Math.round(p.score * 100)}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Fold>

      {/* 7. 학습 달력 · 배지 */}
      <Fold title="학습 달력 · 배지" summary={`최근 6주 ${activeDays}일 학습 · 배지 ${badgeCount}/${STREAK_BADGES.length}`}>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,20rem)_1fr]">
          <div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-faint">
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
                    c.completed ? "bg-ok text-on-accent" : c.answered ? "bg-navy-soft text-navy" : "bg-surface-2 text-faint"
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
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted">연속 학습 배지</h3>
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
          </div>
        </div>
      </Fold>

      {/* 8. 출제 범위 · 설정 */}
      <section id="settings" className="card scroll-mt-20 p-4">
        <h2 className="mb-1 text-base font-bold">출제 범위</h2>
        <p className="mb-3 text-xs text-muted">
          오늘의 미션·오답 복습·실전 도전에 낼 문제 종류입니다. 바꾸면 오늘 미션에서 아직 안 푼 문제도 바로 바뀝니다 (푼 문제와 기록은 그대로).
        </p>
        <ScopePicker current={d.scope} counts={d.kindCount} />
        {d.scope !== "exam" && d.kindCount.expected < 10 && (
          <p className="mt-2 text-xs text-warn">공개된 AI 예상 문제가 {d.kindCount.expected}개뿐이라 미션 문제 수가 줄어들 수 있습니다.</p>
        )}
      </section>
    </div>
  );
}
