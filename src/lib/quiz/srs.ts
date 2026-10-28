/**
 * 반복 학습(간격 반복) · 경험치 · 레벨 · 연속 학습. (순수 계산)
 * 지금은 SM-2 를 단순화한 규칙이다. 규칙을 바꾸려면 nextReview 만 고치면 된다.
 */

export type QuizResult = "correct" | "partial" | "wrong";

export interface ProgressState {
  attempts: number;
  correctCount: number;
  lastResult: QuizResult | null;
  streak: number; // 연속 정답
  ease: number;
  intervalDays: number;
  dueOn: string | null; // YYYY-MM-DD (한국 시간)
  mastery: number; // 0~5
  lastXpDay: string | null;
}

export const NEW_PROGRESS: ProgressState = {
  attempts: 0,
  correctCount: 0,
  lastResult: null,
  streak: 0,
  ease: 2.5,
  intervalDays: 0,
  dueOn: null,
  mastery: 0,
  lastXpDay: null,
};

// ---------------------------------------------------------------------
// 날짜 (한국 시간)
// ---------------------------------------------------------------------
export function kstDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

// ---------------------------------------------------------------------
// 복습 일정
// ---------------------------------------------------------------------
/**
 * - 맞힘: 간격 1 → 3 → 간격×ease 로 늘어남, 숙련도 +1
 * - 일부만: 2일 뒤 다시, ease 조금 감소
 * - 틀림: 오늘(다음 학습) 다시, 숙련도 -1
 */
export function nextReview(prev: ProgressState, result: QuizResult, today: string): ProgressState {
  const s = { ...prev, attempts: prev.attempts + 1, lastResult: result };
  if (result === "correct") {
    s.correctCount = prev.correctCount + 1;
    s.streak = prev.streak + 1;
    s.ease = Math.min(3, prev.ease + 0.1);
    s.intervalDays = s.streak === 1 ? 1 : s.streak === 2 ? 3 : Math.round(Math.max(prev.intervalDays, 3) * s.ease);
    s.mastery = Math.min(5, prev.mastery + 1);
  } else if (result === "partial") {
    s.streak = 0;
    s.ease = Math.max(1.3, prev.ease - 0.15);
    s.intervalDays = 2;
    s.mastery = Math.max(0, Math.min(prev.mastery, 3));
  } else {
    s.streak = 0;
    s.ease = Math.max(1.3, prev.ease - 0.2);
    s.intervalDays = 0;
    s.mastery = Math.max(0, prev.mastery - 1);
  }
  s.dueOn = addDays(today, s.intervalDays);
  return s;
}

// ---------------------------------------------------------------------
// 경험치
// ---------------------------------------------------------------------
export const XP = {
  correct: 10,
  partial: 6,
  wrong: 2, // 풀어 본 것 자체에 대한 작은 보상
  recovered: 5, // 틀렸거나 일부만 맞힌 문제를 다시 맞힘
  missionComplete: 30,
  streakPerDay: 2, // 연속 학습 일수 × 2 (최대 20)
} as const;

/** 같은 문제는 하루 한 번만 경험치를 준다 (반복 풀이로 경험치를 쌓지 못하게) */
export function answerXp(prev: ProgressState, result: QuizResult, today: string): number {
  if (prev.lastXpDay === today) return 0;
  const base = XP[result];
  const recovered = result === "correct" && (prev.lastResult === "wrong" || prev.lastResult === "partial") ? XP.recovered : 0;
  return base + recovered;
}

export function missionBonus(streakAfter: number): number {
  return XP.missionComplete + Math.min(20, streakAfter * XP.streakPerDay);
}

/** 레벨 L 에 필요한 누적 경험치: 100 × L(L-1)/2  (1→0, 2→100, 3→300, 4→600 …) */
export function levelForXp(xp: number): { level: number; current: number; next: number } {
  let level = 1;
  while (100 * ((level + 1) * level) / 2 <= xp) level++;
  const current = (100 * (level * (level - 1))) / 2;
  const next = (100 * ((level + 1) * level)) / 2;
  return { level, current, next };
}

// ---------------------------------------------------------------------
// 연속 학습 (일일 미션을 끝낸 날 기준)
// ---------------------------------------------------------------------
export function streakAfterCompletion(lastCompletedDay: string | null, streak: number, today: string): number {
  if (lastCompletedDay === today) return streak;
  if (lastCompletedDay && daysBetween(lastCompletedDay, today) === 1) return streak + 1;
  return 1;
}

/** 화면에 보여 줄 연속 학습 일수: 어제나 오늘 끝냈으면 유지, 아니면 끊김 */
export function currentStreak(lastCompletedDay: string | null, streak: number, today: string): number {
  if (!lastCompletedDay) return 0;
  return daysBetween(lastCompletedDay, today) <= 1 ? streak : 0;
}

export const STREAK_BADGES = [7, 30, 100, 365] as const;

export function newBadges(streak: number, have: string[]): string[] {
  return STREAK_BADGES.filter((n) => streak >= n && !have.includes(`streak-${n}`)).map((n) => `streak-${n}`);
}

export const LEVEL_NAMES = { basic: "입문", advanced: "심화", expert: "전문가" } as const;
export type StartLevel = keyof typeof LEVEL_NAMES;
