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

// 비슷한 이름 묶기: '토마스 아퀴나스' ⊃ '아퀴나스' · '나바에츠' ≈ '나바에즈' (한 글자, 소리가 비슷할 때만)
// 정약용 · 정약전처럼 실제로 다른 사람은 소리가 달라 묶이지 않음
const SAME_INIT = [[0, 1, 15], [3, 4, 16], [7, 8, 17], [9, 10], [12, 13, 14]]; // ㄱㄲㅋ · ㄷㄸㅌ · ㅂㅃㅍ · ㅅㅆ · ㅈㅉㅊ
const SAME_VOWEL = [[1, 5], [3, 7], [10, 11, 15]]; // ㅐㅔ · ㅒㅖ · ㅙㅚㅞ
const jamo = (ch: string) => {
  const c = ch.charCodeAt(0) - 0xac00;
  return c < 0 || c > 11171 ? null : [Math.floor(c / 588), Math.floor((c % 588) / 28), c % 28];
};
const sameGroup = (groups: number[][], a: number, b: number) => a === b || groups.some((g) => g.includes(a) && g.includes(b));
function soundsAlike(a: string, b: string): boolean {
  const x = jamo(a), y = jamo(b);
  return Boolean(x && y && sameGroup(SAME_INIT, x[0], y[0]) && sameGroup(SAME_VOWEL, x[1], y[1]) && x[2] === y[2]);
}

/** 같은 사상가 이름인가 (공백·괄호 부연을 뗀 이름끼리) */
export function sameName(a0: string, b0: string): boolean {
  const a = baseName(a0), b = baseName(b0);
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 3 && l.endsWith(s)) return true; // 토마스아퀴나스 ⊃ 아퀴나스
  // 두 글자 이름은 띄어 쓴 마지막 낱말일 때만 (임마누엘 칸트 ⊃ 칸트)
  const words = (n: string) => n.replace(/[(（[].*?[)）\]]/g, "").trim().split(/\s+/);
  const lastA = words(a0), lastB = words(b0);
  if (s.length === 2 && ((lastA.length > 1 && lastA[lastA.length - 1] === s) || (lastB.length > 1 && lastB[lastB.length - 1] === s))) return true;
  if (a.length === b.length && a.length >= 3) {
    const diff = [...a].map((ch, i) => (ch === b[i] ? -1 : i)).filter((i) => i >= 0);
    return diff.length === 1 && soundsAlike(a[diff[0]], b[diff[0]]);
  }
  return false;
}

/** 이름들을 같은 사상가끼리 묶음 → 이름마다 묶음 번호 */
export function clusterNames(names: string[]): Map<string, number> {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const parent = list.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (sameName(list[i], list[j])) parent[find(i)] = find(j);
  return new Map(list.map((n, i) => [n, find(i)]));
}

/** 카드 상세 창의 '윤리 퀴즈 진행' 한 줄 */
export interface QuizProgressRow {
  done: number;
  total: number;
  rewardable: boolean;
  reward: string;
  rarityName?: string;
}
/** 카드 상세 창의 '윤리 퀴즈 진행' (도감 · 홈 · 정복 지도 어디서 열어도 같은 내용): 완전 기출 · 부분 기출 따로 */
export interface QuizProgress {
  whole: QuizProgressRow;
  part: QuizProgressRow;
  min: number;
  /** 정복 지도의 사상가 id (기출문제 목록 링크) */
  id?: string;
}

/** 정복 보상(카드)을 주는 사상가의 최소 문제 수: 문제가 이만큼 쌓인 사상가만 */
export const CONQUEST_MIN = 10;

export type ConquestRarity = "common" | "rare" | "epic" | "legendary";
/** 부분 기출 정복 보상 등급: 문제가 많은 사상가일수록 높은 등급 (10↑ 일반 · 20↑ 희귀 · 30↑ 영웅) */
export const CONQUEST_TIERS: readonly { min: number; rarity: ConquestRarity }[] = [
  { min: 30, rarity: "epic" },
  { min: 20, rarity: "rare" },
  { min: CONQUEST_MIN, rarity: "common" },
];
export const conquestRarity = (total: number): ConquestRarity | null => CONQUEST_TIERS.find((t) => total >= t.min)?.rarity ?? null;
/** 완전 기출 정복 보상: 완전 기출 10문항 이상인 사상가를 모두 맞히면 전설 */
export const FULL_CONQUEST = { min: CONQUEST_MIN, rarity: "legendary" as ConquestRarity };
export const fullConquestRarity = (total: number): ConquestRarity | null => (total >= FULL_CONQUEST.min ? FULL_CONQUEST.rarity : null);
/** 정복 지도의 두 갈래 */
export type ConquestTrack = "part" | "full";
export const CONQUEST_TRACK_NAMES: Record<ConquestTrack, string> = { part: "부분 기출", full: "완전 기출" };
export const CONQUEST_RARITY_NAME: Record<ConquestRarity, string> = { common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" };

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
  /** 정복하면 받는 카드 등급 (보상 대상이 아니면 null) */
  rarity: ConquestRarity | null;
}

/** items: 문제 id · 사상가 이름들 / correct: 한 번 이상 맞힌 문제 id / canon: 별칭 → 대표 이름 */
export function conquestCells(
  items: { id: string; names: string[] }[],
  correct: Set<string>,
  canon: (n: string) => string | null,
  rarityOf: (total: number) => ConquestRarity | null = conquestRarity,
): ConquestCell[] {
  const by = new Map<string, { total: number; done: number }>();
  for (const it of items) {
    for (const raw of new Set(it.names.map((n) => canon(n)).filter((n): n is string => Boolean(n)))) {
      const c = by.get(raw) ?? { total: 0, done: 0 };
      c.total++;
      if (correct.has(it.id)) c.done++;
      by.set(raw, c);
    }
  }
  return [...by.entries()].map(([name, c]) => ({ name, ...c, full: c.total > 0 && c.done >= c.total, rewardable: rarityOf(c.total) !== null, rarity: rarityOf(c.total) }));
}

/** 완전 기출문제 칸의 id (부분 문항 id 와 겹치지 않게) */
export const fullKey = (questionId: string) => `q:${questionId}`;

/**
 * 정복 지도의 칸: 완전 기출문제만 (기출 문항 전체 · 부분 기출은 세지 않음).
 *  - 연계 문항: 주요 · 비교 사상가 모두에게 함께 센다
 *  - 맞힘: 기출문제 탭에서 맞힌 기록(solved) 또는 윤리 퀴즈의 완전 기출 문제(origin 'full')를 맞힘
 * items: 공개 문제 / links: 기출 문항 → 주요·비교 사상가 / correct: 퀴즈에서 맞힌 문제 / solved: 맞힌 완전 기출 문항
 */
export function fullConquestEntries(
  items: { id: string; origin?: string | null; question_id: string | null }[],
  links: Record<string, string[]>,
  correct: Set<string>,
  solved: Set<string>,
) {
  const entries = Object.entries(links).map(([q, names]) => ({ id: fullKey(q), names }));
  const done = new Set<string>();
  for (const q of solved) done.add(fullKey(q));
  for (const it of items) if (it.origin === "full" && it.question_id && correct.has(it.id)) done.add(fullKey(it.question_id));
  return { entries, done };
}

/**
 * 부분 기출 칸: 윤리 퀴즈의 기출 세부 문제(origin 이 'full' 이 아닌 kind 'exam').
 *  - 연계 문항: 원래 기출 문항의 주요 · 비교 사상가 모두에게 함께 센다
 *  - 맞힘: 퀴즈에서 한 번 이상 맞힌 문제 (완전 기출과 따로 셈)
 */
export function partConquestEntries(
  items: { id: string; kind: string; origin?: string | null; philosopher_names: string[] | null; question_id: string | null }[],
  links: Record<string, string[]>,
  correct: Set<string>,
) {
  const parts = items.filter((it) => it.kind === "exam" && it.origin !== "full");
  const entries = parts.map((it) => ({ id: it.id, names: [...new Set([...(it.philosopher_names ?? []), ...((it.question_id && links[it.question_id]) || [])])] }));
  return { entries, done: new Set(parts.filter((it) => correct.has(it.id)).map((it) => it.id)) };
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
