/**
 * 윤리 퀴즈 재미 요소의 순수 계산 (서버·화면·테스트 공통)
 *  - 오늘의 미션 랭킹 · 사상가 정복 지도 · 주간 학습 리포트
 */

// 사상가 이름 · 분야 정리 (데이터의 이름 변형 · 세부 분야를 지도용으로)
/** 이름 정리: 공백 · 괄호 부연 · 『책 이름』 을 떼어 같은 사상가로 (예: 석가모니(붓다) · 주희(『대학장구』) → 석가모니 · 주희) */
export const baseName = (n: string) =>
  n
    .replace(/[(（[].*?[)）\]]/g, "")
    .replace(/[『「].*?[』」]/g, "")
    .replace(/\s/g, "");

/** 분야 정리: 지도 탭은 동양 · 한국 · 서양 · 사회사상 + 그 밖 (예: '서양윤리(사회사상)' → 사회사상, '도덕교육론' → 그 밖) */
export function mainTradition(t: string | null | undefined): string {
  const s = (t ?? "").replace(/\s/g, "");
  if (!s) return OTHER;
  if (/사회사상|정치|사회철학/.test(s)) return "사회사상";
  if (/한국/.test(s)) return "한국윤리";
  if (/동양|중국|불교|유교|도가/.test(s)) return "동양윤리";
  if (/서양/.test(s)) return "서양윤리";
  return OTHER;
}
export const OTHER = "그 밖의 사상가";

/** 정복 보상(카드)을 주는 사상가의 최소 문제 수: 문제가 이만큼 쌓인 사상가만 */
export const CONQUEST_MIN = 30;

// ---------------------------------------------------------------------
// 오늘의 미션 랭킹: 오늘 10문제 중 몇 문제를 풀었나 (다 푼 사람은 '완주')
// ---------------------------------------------------------------------
export interface DailyRow {
  learner: string;
  answered: number;
  total: number;
  correct: number;
  completedAt: string | null;
  /** 마지막으로 푼 시각 (같은 개수면 먼저 도달한 사람이 위) */
  updatedAt: string;
}

export function rankDaily(rows: DailyRow[]): DailyRow[] {
  return rows
    .filter((r) => r.answered > 0)
    .sort((a, b) => {
      const ca = a.completedAt ? 1 : 0, cb = b.completedAt ? 1 : 0;
      if (ca !== cb) return cb - ca; // 완주한 사람 먼저
      if (ca && cb) return a.completedAt!.localeCompare(b.completedAt!); // 먼저 완주한 순
      return b.answered - a.answered || b.correct - a.correct || a.updatedAt.localeCompare(b.updatedAt) || a.learner.localeCompare(b.learner);
    });
}

// ---------------------------------------------------------------------
// 사상가 정복 지도: 사상가마다 '한 번 이상 맞힌 문제 / 전체 문제'
// ---------------------------------------------------------------------
export interface ConquestCell {
  name: string;
  total: number;
  done: number;
  /** 다 채웠나 */
  full: boolean;
  /** 카드 보상 대상 (문제 수 CONQUEST_MIN 이상) */
  rewardable: boolean;
}

/** items: 문제 id · 사상가 이름들 / correct: 한 번 이상 맞힌 문제 id / canon: 별칭 → 대표 이름 */
export function conquestCells(items: { id: string; names: string[] }[], correct: Set<string>, canon: (n: string) => string | null): ConquestCell[] {
  const by = new Map<string, { total: number; done: number }>();
  for (const it of items) {
    for (const raw of new Set(it.names.map((n) => canon(n)).filter((n): n is string => Boolean(n)))) {
      const c = by.get(raw) ?? { total: 0, done: 0 };
      c.total++;
      if (correct.has(it.id)) c.done++;
      by.set(raw, c);
    }
  }
  return [...by.entries()].map(([name, c]) => ({ name, ...c, full: c.total > 0 && c.done >= c.total, rewardable: c.total >= CONQUEST_MIN }));
}

// ---------------------------------------------------------------------
// 주간 학습 리포트: 이번 주(월~일) vs 지난주
// ---------------------------------------------------------------------
export interface WeekAttempt {
  day: string; // YYYY-MM-DD (한국 시간)
  result: "correct" | "partial" | "wrong";
  names: string[];
  area: string | null;
}

export interface WeekStats {
  answered: number;
  /** 일부만 = 0.5 */
  accuracy: number | null;
  days: boolean[]; // 월~일 공부한 날
  activeDays: number;
}

export interface WeekReport {
  start: string; // 이번 주 월요일
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  /** 많이 틀린 사상가 (틀림 + 일부 0.5) */
  weakPhilosophers: { name: string; missed: number; answered: number }[];
  /** 잘한 사상가 (3문제 이상 · 정답률 높은 순) */
  strongPhilosophers: { name: string; accuracy: number; answered: number }[];
  weakAreas: { area: string; missed: number; answered: number }[];
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** 한국 날짜의 그 주 월요일 */
export function mondayOf(day: string): string {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

function statsOf(list: WeekAttempt[], start: string): WeekStats {
  const score = list.reduce((n, a) => n + (a.result === "correct" ? 1 : a.result === "partial" ? 0.5 : 0), 0);
  const days = Array.from({ length: 7 }, (_, i) => list.some((a) => a.day === addDays(start, i)));
  return { answered: list.length, accuracy: list.length ? score / list.length : null, days, activeDays: days.filter(Boolean).length };
}

export function weekReport(attempts: WeekAttempt[], today: string): WeekReport {
  const start = mondayOf(today);
  const lastStart = addDays(start, -7);
  const thisList = attempts.filter((a) => a.day >= start && a.day < addDays(start, 7));
  const lastList = attempts.filter((a) => a.day >= lastStart && a.day < start);
  const miss = (a: WeekAttempt) => (a.result === "wrong" ? 1 : a.result === "partial" ? 0.5 : 0);
  const ph = new Map<string, { missed: number; answered: number; score: number }>();
  const ar = new Map<string, { missed: number; answered: number }>();
  for (const a of thisList) {
    for (const n of new Set(a.names)) {
      const p = ph.get(n) ?? { missed: 0, answered: 0, score: 0 };
      p.missed += miss(a);
      p.answered++;
      p.score += 1 - miss(a);
      ph.set(n, p);
    }
    if (a.area) {
      const r = ar.get(a.area) ?? { missed: 0, answered: 0 };
      r.missed += miss(a);
      r.answered++;
      ar.set(a.area, r);
    }
  }
  // 더 다져야 할 = 놓친 문제가 있고 정답률 80% 미만 / 잘하고 있는 = 3문제 이상 · 80% 이상 (서로 겹치지 않음)
  const weakNames = new Set([...ph.entries()].filter(([, p]) => p.missed > 0 && p.score / p.answered < 0.8).map(([n]) => n));
  return {
    start,
    thisWeek: statsOf(thisList, start),
    lastWeek: statsOf(lastList, lastStart),
    weakPhilosophers: [...ph.entries()].filter(([name]) => weakNames.has(name)).map(([name, p]) => ({ name, missed: p.missed, answered: p.answered })).sort((a, b) => b.missed - a.missed || b.answered - a.answered).slice(0, 3),
    // 잘한 사상가: 3문제 이상 · 정답률 80% 이상 (약한 사상가 목록과 겹치지 않게)
    strongPhilosophers: [...ph.entries()].filter(([name, p]) => p.answered >= 3 && p.score / p.answered >= 0.8 && !weakNames.has(name)).map(([name, p]) => ({ name, accuracy: p.score / p.answered, answered: p.answered })).sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered).slice(0, 2),
    weakAreas: [...ar.entries()].filter(([, r]) => r.missed > 0).map(([area, r]) => ({ area, ...r })).sort((a, b) => b.missed - a.missed).slice(0, 2),
  };
}
