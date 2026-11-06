import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  ChartLine,
  CircleCheck,
  Flame,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DataError, load } from "@/components/DataError";
import { FeaturedPhilosopher } from "@/components/game/MyPhilosopher";
import { cachedDashboard as getSiteDashboard } from "@/lib/data/cached";
import { examShortLabel, formatDate, questionRef } from "@/lib/format";
import { getFeatured } from "@/lib/game/data";
import { getCurrentMemberName } from "@/lib/members";
import { currentLearner, getDashboard as getQuizDashboard, type Dashboard } from "@/lib/quiz/learn";

const QUICK: { href: string; title: string; desc: string; icon: LucideIcon; tone: string }[] = [
  { href: "/exams", title: "기출문제", desc: "연도·사상가별 기출과 AI 분석", icon: BookOpenText, tone: "from-[#5b7bd6]/15 to-[#5b7bd6]/5 text-[#4a66bf] dark:text-[#9db6ee]" },
  { href: "/philosophers", title: "사상가 탐구", desc: "개념 노트 · 원전 · 관련 기출", icon: Users, tone: "from-[#2f9a77]/15 to-[#2f9a77]/5 text-[#1f7a5c] dark:text-[#7cd0a5]" },
  { href: "/quiz", title: "윤리 퀴즈", desc: "오늘의 미션 · 카드 수집", icon: Sparkles, tone: "from-[#b9832c]/18 to-[#b9832c]/5 text-[#9a6510] dark:text-[#f0c070]" },
  { href: "/trends", title: "출제 경향 분석", desc: "빈출 사상가 · 개념 · 예측", icon: ChartLine, tone: "from-[#8b5cc9]/15 to-[#8b5cc9]/5 text-[#7445b4] dark:text-[#c7a6f2]" },
];

const pctText = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);

function greeting(name: string | null) {
  const h = Number(new Intl.DateTimeFormat("ko-KR", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Seoul" }).format(new Date()));
  const who = name ? `${name}님, ` : "";
  if (h < 6) return `${who}늦은 시간까지 사유 중이시네요`;
  if (h < 12) return `${who}오늘도 사유를 이어가 볼까요?`;
  if (h < 18) return `${who}오늘의 배움이 내일의 실력이 됩니다`;
  return `${who}하루를 한 문제로 마무리해 볼까요?`;
}

const todayLabel = () => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Seoul" }).format(new Date());

/**
 * ETHOS 메인: 개인 학습 대시보드.
 * 순서 — 인사 → 대표 사상가 → 오늘의 학습 → 빠른 메뉴 → 나의 학습 현황 → 최근 기출 → 출제 분석 요약 → 데이터 현황
 * 개인 지표(퀴즈 기록)와 전체 데이터 통계를 시각적으로 나눈다.
 */
export default async function Home() {
  const learner = await currentLearner().catch(() => null);
  const [site, name, quiz, game] = await Promise.all([
    load(getSiteDashboard),
    getCurrentMemberName().catch(() => null),
    learner ? getQuizDashboard(learner).catch(() => null) : Promise.resolve(null),
    learner ? getFeatured(learner) : Promise.resolve(null),
  ]);
  const data = site.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      {/* 1. 인사 */}
      <section className="rise-in relative overflow-hidden rounded-2xl border border-line px-5 py-5 sm:px-7 sm:py-6" style={{ background: "var(--hero)" }}>
        <div className="pointer-events-none absolute -right-6 -top-10 select-none text-[7rem] font-black leading-none tracking-[0.12em] text-navy/[0.06] sm:text-[9rem]" aria-hidden>
          ETHOS
        </div>
        <div className="relative">
          <p className="eyebrow !text-navy/80">{todayLabel()}</p>
          <h1 className="mt-1.5 text-[1.35rem] font-bold leading-snug tracking-tight sm:text-2xl">{greeting(name)}</h1>
          <p className="mt-1 text-sm text-muted">ETHOS · 도덕·윤리 학습 플랫폼</p>
        </div>
      </section>

      {/* 2~3. 대표 사상가 + 오늘의 학습 */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {learner ? (
          game ? (
            <FeaturedPhilosopher game={game} variant="compact" />
          ) : (
            <section className="card p-5 text-sm text-muted">대표 사상가 카드를 불러오지 못했습니다. 잠시 후 다시 시도하세요.</section>
          )
        ) : (
          <section className="card relative overflow-hidden p-5">
            <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-navy/10 blur-3xl" aria-hidden />
            <div className="eyebrow">나의 대표 사상가</div>
            <h2 className="mt-1 text-lg font-bold">나의 첫 사상가를 만나보세요.</h2>
            <p className="mt-1 text-sm text-muted">로그인하면 퀴즈 기록과 사상가 카드가 계정에 쌓이고, 휴대폰·컴퓨터 어디서나 이어집니다.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/signup?next=/quiz" className="btn-primary">회원가입하고 시작하기</Link>
              <Link href="/login?next=/" className="btn">로그인</Link>
            </div>
          </section>
        )}
        <TodayCard quiz={quiz} loggedIn={Boolean(learner)} />
      </div>

      {/* 4. 빠른 메뉴 */}
      <nav aria-label="주요 기능" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK.map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.href} href={q.href} className="card group flex items-center gap-3 p-3.5 transition-all hover:-translate-y-0.5 hover:border-navy/40 sm:p-4">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${q.tone}`}>
                <Icon className="h-[22px] w-[22px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold">{q.title}</span>
                <span className="block truncate text-[12px] text-muted">{q.desc}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* 5. 나의 학습 현황 */}
      {quiz?.profile && <MyStats d={quiz} />}

      {site.error || !data ? (
        <DataError error={site.error} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* 6. 최근 분석 기출 */}
            <section>
              <Heading title="최근 분석된 기출" href="/exams" more="전체 기출" />
              {data.recentQuestions.length === 0 ? (
                <p className="card p-5 text-sm text-muted">아직 분석된 문항이 없습니다.</p>
              ) : (
                <ul className="card divide-y divide-line overflow-hidden">
                  {data.recentQuestions.slice(0, 3).map((q) => {
                    const main = q.philosophers.filter((p) => p.role === "main" || p.role === "comparison").map((p) => p.name);
                    return (
                      <li key={q.id}>
                        <Link href={`/questions/${q.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                          <span className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-navy-soft text-navy">
                            <span className="num text-[13px] font-bold leading-none">{q.exam.exam_year}</span>
                            <span className="text-[10px] leading-tight">{q.exam.section ? `전공${q.exam.section}` : "기출"}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-semibold">
                              {questionRef(q.exam, q.label)}
                              {q.analysis?.area && <span className="truncate text-[11px] font-medium text-faint">{q.analysis.area}</span>}
                            </span>
                            <span className="block truncate text-[13px] text-muted">
                              {main.length ? main.join(" · ") : q.concepts.map((c) => c.name).slice(0, 3).join(", ") || "분석 보기"}
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 7. 출제 분석 요약 */}
            <section>
              <Heading title="자주 출제된 사상가" href="/trends" more="출제 분석" />
              {data.topPhilosophers.length === 0 ? (
                <p className="card p-5 text-sm text-muted">데이터가 쌓이면 표시됩니다.</p>
              ) : (
                <ol className="card space-y-2.5 p-4">
                  {data.topPhilosophers.slice(0, 5).map((p, i) => (
                    <li key={p.id}>
                      <Link href={`/philosophers/${p.id}`} className="group flex items-center gap-3">
                        <span className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${i < 3 ? "bg-navy text-on-accent" : "bg-surface-2 text-muted"}`}>{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-semibold group-hover:text-navy">{p.name}</span>
                            <span className="num shrink-0 text-xs text-muted">{p.count}회 · 최근 {p.lastYear}</span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <span className="block h-full rounded-full bg-navy/70" style={{ width: `${(p.count / data.topPhilosophers[0].count) * 100}%` }} />
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {data.recentConcepts.length > 0 && (
            <section>
              <Heading
                title="최근 5년 주요 출제 개념"
                note={data.recentYears.length ? `${Math.min(...data.recentYears)}~${Math.max(...data.recentYears)}` : undefined}
                href="/concepts"
                more="개념 전체"
              />
              <div className="flex flex-wrap gap-1.5">
                {data.recentConcepts.slice(0, 10).map((c) => (
                  <Link key={c.id} href={`/concepts/${c.id}`} className="chip">
                    {c.name} <span className="num text-[11px] text-faint">{c.count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* 8. 데이터 현황 (전체 통계 — 개인 통계와 구분) */}
          <section className="rounded-2xl border border-dashed border-line-strong p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="eyebrow">ETHOS 데이터 현황</h2>
              <Link href="/sources" className="text-xs text-muted hover:text-navy">원전 {data.sourceCount}개</Link>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {[
                { label: "등록된 시험", value: data.examCount, href: "/exams" },
                { label: "전체 기출 문항", value: data.questionCount, href: "/exams" },
                { label: "분석 완료 문항", value: (data as { analyzedCount?: number }).analyzedCount ?? "-", href: "/exams" },
                { label: "등록된 사상가", value: data.philosopherCount, href: "/philosophers" },
              ].map((s) => (
                <Link key={s.label} href={s.href} className="group">
                  <dt className="text-xs text-muted">{s.label}</dt>
                  <dd className="num text-xl font-bold text-ink group-hover:text-navy">{s.value}</dd>
                </Link>
              ))}
            </dl>
            {data.recentExams.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-1.5 text-xs text-muted">최근 등록된 시험</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.recentExams.slice(0, 6).map((e) => (
                    <Link key={e.id} href={`/exams/${e.id}`} className="chip !min-h-7 !text-xs" title={`등록 ${formatDate(e.created_at)}`}>
                      {examShortLabel(e)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Heading({ title, note, href, more }: { title: string; note?: string; href?: string; more?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-2">
      <h2 className="text-base font-bold tracking-tight">
        {title}
        {note && <span className="ml-1.5 text-xs font-normal text-faint">{note}</span>}
      </h2>
      {href && (
        <Link href={href} className="inline-flex items-center gap-0.5 text-[13px] text-muted hover:text-navy">
          {more} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** 오늘의 학습: 실제 미션 진행 상태(quiz_daily)로 버튼을 정한다 */
function TodayCard({ quiz, loggedIn }: { quiz: Dashboard | null; loggedIn: boolean }) {
  if (!loggedIn || !quiz) {
    return (
      <section className="card flex flex-col justify-between gap-4 p-5">
        <div>
          <div className="eyebrow">오늘의 학습</div>
          <h2 className="mt-1 text-lg font-bold">하루 10문제, 기출로 다지는 습관</h2>
          <p className="mt-1 text-sm text-muted">실제 기출을 요구 사항 단위로 나눈 문제를 매일 조금씩. 틀린 문제는 알맞은 때에 다시 나옵니다.</p>
        </div>
        <Link href="/quiz" className="btn-primary w-full py-3 text-base">
          윤리 퀴즈 시작하기 <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    );
  }
  if (!quiz.profile) {
    return (
      <section className="card flex flex-col justify-between gap-4 p-5">
        <div>
          <div className="eyebrow">오늘의 학습</div>
          <h2 className="mt-1 text-lg font-bold">출제 범위를 고르고 첫 미션을 시작하세요</h2>
          <p className="mt-1 text-sm text-muted">기출문제 · AI 예상문제 · 둘 다 중에서 고를 수 있어요.</p>
        </div>
        <Link href="/quiz" className="btn-primary w-full py-3 text-base">시작하기 <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      </section>
    );
  }
  const { today } = quiz;
  const ratio = today.size ? Math.min(1, today.done / today.size) : 0;
  const label = today.completed ? "오늘의 학습 완료" : today.done > 0 ? "이어서 학습하기" : "오늘의 학습 시작";
  return (
    <section className={`card flex flex-col gap-4 p-5 ${today.completed ? "border-ok/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">오늘의 미션</div>
          <h2 className={`mt-1 text-lg font-bold ${today.completed ? "text-ok" : ""}`}>
            {today.completed ? "오늘 목표를 모두 채웠어요" : today.done > 0 ? `${today.size - today.done}문제 남았어요` : `오늘의 ${today.size}문제가 준비됐어요`}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {today.completed ? "실전 도전이나 오답 복습으로 이어가 보세요." : quiz.dueCount ? `복습할 때가 된 문제 ${quiz.dueCount}개가 먼저 나옵니다.` : "1문제만 풀어도 첫 체크포인트."}
          </p>
        </div>
        <div className="relative h-16 w-16 shrink-0" aria-label={`진행률 ${Math.round(ratio * 100)}%`}>
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={today.completed ? "var(--ok)" : "var(--navy)"} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${ratio * 97.4} 97.4`} />
          </svg>
          <span className="num absolute inset-0 flex items-center justify-center text-sm font-bold">
            {today.done}<span className="text-[10px] font-medium text-faint">/{today.size}</span>
          </span>
        </div>
      </div>
      {quiz.bankSize === 0 ? (
        <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">아직 공개된 퀴즈 문제가 없습니다.</p>
      ) : today.completed ? (
        <div className="grid grid-cols-2 gap-2">
          <span className="btn pointer-events-none border-ok/40 bg-ok-soft py-3 font-semibold text-ok"><CircleCheck className="h-4 w-4" aria-hidden />{label}</span>
          <Link href="/quiz#challenges" className="btn-primary py-3">실전 도전</Link>
        </div>
      ) : (
        <Link href="/quiz/play?mode=daily" className="btn-primary w-full py-3 text-base">
          {label} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** 나의 학습 현황 (윤리 퀴즈 기록) */
function MyStats({ d }: { d: Dashboard }) {
  const xp = d.profile?.xp ?? 0;
  const lv = (xp - d.level.current) / Math.max(1, d.level.next - d.level.current);
  const last7 = d.calendar.slice(-7);
  const max = Math.max(1, ...last7.map((c) => c.answered));
  const tiles: { label: string; value: string; sub: string; icon: LucideIcon; href?: string; tone?: string }[] = [
    { label: "연속 학습", value: `${d.streak}일`, sub: d.profile?.best_streak ? `최고 ${d.profile.best_streak}일` : "오늘부터 시작", icon: Flame, tone: d.streak > 0 ? "text-warn" : "text-faint" },
    { label: "최근 7일 푼 문제", value: `${d.week.answered}`, sub: `${d.week.activeDays}일 학습`, icon: Target },
    { label: "최근 7일 정답률", value: pctText(d.week.accuracy), sub: "일부만 맞힘 = 0.5", icon: TrendingUp },
    { label: "오답 복습", value: `${d.wrongCount}`, sub: d.dueCount ? `복습 예정 ${d.dueCount}개` : "복습 예정 없음", icon: RotateCcw, href: d.wrongCount ? "/quiz/play?mode=review" : undefined },
  ];
  return (
    <section>
      <Heading title="나의 학습 현황" href="/quiz" more="퀴즈 홈" />
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-navy-soft text-navy">
            <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">Lv</span>
            <span className="num -mt-0.5 text-lg font-bold leading-none">{d.level.level}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">학습 레벨 <span className="num text-muted">{xp} XP</span></span>
              <span className="text-xs text-faint">다음 레벨까지 {Math.max(0, d.level.next - xp)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-navy" style={{ width: `${Math.max(0, Math.min(1, lv)) * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => {
            const Icon = t.icon;
            const body = (
              <div className="h-full rounded-xl bg-surface-2/70 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Icon className={`h-3.5 w-3.5 ${t.tone ?? "text-navy"}`} aria-hidden />
                  {t.label}
                </div>
                <div className="num mt-1 text-[22px] font-bold leading-tight">{t.value}</div>
                <div className="text-[11px] text-faint">{t.sub}</div>
              </div>
            );
            return t.href ? <Link key={t.label} href={t.href} className="block hover:opacity-90">{body}</Link> : <div key={t.label}>{body}</div>;
          })}
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
            <span>최근 7일 학습 기록</span>
            <span className="text-faint">문제 수 · 초록 = 미션 완료</span>
          </div>
          <div className="flex items-end gap-1.5" role="img" aria-label={`최근 7일 학습: ${last7.map((c) => `${c.day.slice(5)} ${c.answered}문제`).join(", ")}`}>
            {last7.map((c) => (
              <div key={c.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-12 w-full items-end">
                  <div
                    className={`w-full rounded-md ${c.completed ? "bg-ok/80" : c.answered ? "bg-navy/60" : "bg-surface-2"}`}
                    style={{ height: `${c.answered ? Math.max(12, (c.answered / max) * 100) : 8}%` }}
                    title={`${c.day} · ${c.answered}문제`}
                  />
                </div>
                <span className="text-[10px] text-faint">{["일", "월", "화", "수", "목", "금", "토"][new Date(c.day + "T12:00:00Z").getUTCDay()]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
