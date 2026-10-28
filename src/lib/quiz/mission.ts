/**
 * 일일 미션 · 자유 학습 문제 배정. (순수 계산)
 * - 복습할 문제(틀림 > 일부만 > 복습일 지남)를 먼저, 다음으로 안 푼 기출, AI 예상 문제
 * - 한 번에 같은 원문(기출 문항)에서 나온 문제는 하나만
 * - 영역이 고르게 섞이도록, 같은 영역이 연달아 나오지 않게 순서를 정한다
 * - 시작 난이도에 맞는 문제를 우선, 전문가는 이미 익힌 쉬운 문제를 덜 낸다
 */
import type { QuizResult, StartLevel } from "./srs.ts";

export interface Candidate {
  id: string;
  kind: "exam" | "expected";
  questionId: string | null;
  area: string; // 섹터 (동양윤리 …)
  philosophers: string[];
  difficulty: 1 | 2 | 3;
}

export interface ProgressLite {
  lastResult: QuizResult | null;
  dueOn: string | null;
  mastery: number;
  lastAt: string | null;
}

export interface MissionSettings {
  total: number;
  exam: number;
  expected: number;
  review: number;
}

export type Slot = "review" | "exam" | "expected" | "fill";

function rngFrom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIT: Record<StartLevel, Record<1 | 2 | 3, number>> = {
  basic: { 1: 1, 2: 0.6, 3: 0.1 },
  advanced: { 1: 0.4, 2: 0.8, 3: 0.6 },
  expert: { 1: 0, 2: 0.6, 3: 1 },
};

/** 같은 영역·같은 원문이 이어지지 않게 순서를 정한다 */
export function spaceOut<T extends { area: string; questionId: string | null }>(items: T[]): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length) {
    const prev = out[out.length - 1];
    let idx = rest.findIndex((x) => !prev || (x.area !== prev.area && (!x.questionId || x.questionId !== prev.questionId)));
    if (idx < 0) idx = rest.findIndex((x) => !prev || !x.questionId || x.questionId !== prev.questionId);
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

export function buildMission(opts: {
  candidates: Candidate[];
  progress: Map<string, ProgressLite>;
  settings: MissionSettings;
  today: string;
  level: StartLevel;
  seed: string;
}): { itemIds: string[]; slots: Slot[] } {
  const { candidates, progress, settings, today, level } = opts;
  const rand = rngFrom(opts.seed);
  const chosen: { c: Candidate; slot: Slot }[] = [];
  const usedItems = new Set<string>();
  const usedQuestions = new Set<string>();
  const areaCount = new Map<string, number>();

  // 최근에 덜 공부한 영역에 가산점
  const areaLast = new Map<string, string>();
  for (const c of candidates) {
    const at = progress.get(c.id)?.lastAt;
    if (at && (!areaLast.has(c.area) || at > areaLast.get(c.area)!)) areaLast.set(c.area, at);
  }
  const staleRank = [...new Set(candidates.map((c) => c.area))].sort((a, b) => (areaLast.get(a) ?? "").localeCompare(areaLast.get(b) ?? ""));
  const areaStale = new Map(staleRank.map((a, i) => [a, 1 - i / Math.max(1, staleRank.length)]));

  const jitter = new Map(candidates.map((c) => [c.id, rand()]));
  const pick = (pool: { c: Candidate; score: number }[], n: number, slot: Slot, allowSameQuestion = false) => {
    for (let k = 0; k < n; k++) {
      let best: { c: Candidate; score: number } | null = null;
      let bestScore = -Infinity;
      for (const x of pool) {
        if (usedItems.has(x.c.id)) continue;
        if (!allowSameQuestion && x.c.questionId && usedQuestions.has(x.c.questionId)) continue;
        const s = x.score - 0.8 * (areaCount.get(x.c.area) ?? 0);
        if (s > bestScore) {
          bestScore = s;
          best = x;
        }
      }
      if (!best) return;
      usedItems.add(best.c.id);
      if (best.c.questionId) usedQuestions.add(best.c.questionId);
      areaCount.set(best.c.area, (areaCount.get(best.c.area) ?? 0) + 1);
      chosen.push({ c: best.c, slot });
    }
  };

  const reviewPool: { c: Candidate; score: number }[] = [];
  const newExam: { c: Candidate; score: number }[] = [];
  const newExpected: { c: Candidate; score: number }[] = [];
  const seenLater: { c: Candidate; score: number }[] = [];
  for (const c of candidates) {
    const p = progress.get(c.id);
    const fit = FIT[level][c.difficulty];
    const j = jitter.get(c.id)!;
    if (!p || !p.lastResult) {
      const score = fit + j + 0.5 * (areaStale.get(c.area) ?? 0);
      (c.kind === "exam" ? newExam : newExpected).push({ c, score });
      continue;
    }
    // 전문가: 이미 익힌 쉬운 문제는 복습에서 뺀다
    if (level === "expert" && c.difficulty === 1 && p.mastery >= 3 && p.lastResult === "correct") continue;
    const due = !p.dueOn || p.dueOn <= today;
    if (due) {
      const weight = p.lastResult === "wrong" ? 3 : p.lastResult === "partial" ? 2 : 1;
      const overdue = p.dueOn ? Math.max(0, (Date.parse(today) - Date.parse(p.dueOn)) / 86400000) : 0;
      reviewPool.push({ c, score: weight + Math.min(1, overdue * 0.1) + 0.3 * j });
    } else {
      // 아직 복습일이 아니지만 오래 안 본 문제: 기억 유지 확인용 보충
      const idle = p.lastAt ? (Date.parse(today + "T00:00:00Z") - Date.parse(p.lastAt)) / 86400000 : 30;
      seenLater.push({ c, score: idle / 30 + 0.2 * j });
    }
  }

  pick(reviewPool, settings.review, "review");
  // 예상 문제는 수가 적으므로 기출보다 먼저 자리를 잡는다 (같은 원문 제한 때문에 밀려나지 않게)
  pick(newExpected, settings.expected, "expected");
  pick(newExam, settings.exam, "exam");
  // 부족하면 다른 문제로 채운다 (출처는 문제 자체의 kind 로 표시)
  for (const pool of [newExam, reviewPool, newExpected, seenLater]) {
    if (chosen.length >= settings.total) break;
    pick(pool, settings.total - chosen.length, "fill");
  }
  // 그래도 부족하면 같은 원문 제한을 풀어서
  for (const pool of [newExam, reviewPool, newExpected, seenLater]) {
    if (chosen.length >= settings.total) break;
    pick(pool, settings.total - chosen.length, "fill", true);
  }

  const ordered = spaceOut(chosen.map((x) => ({ ...x, area: x.c.area, questionId: x.c.questionId })));
  return { itemIds: ordered.map((x) => x.c.id), slots: ordered.map((x) => x.slot) };
}

/** 자유 학습 / 오답 복습: 조건에 맞는 문제 중 n 개 */
export function buildPractice(opts: {
  candidates: Candidate[];
  progress: Map<string, ProgressLite>;
  today: string;
  n: number;
  seed: string;
  which: "any" | "new" | "review" | "wrong";
}): string[] {
  const rand = rngFrom(opts.seed);
  const scored = opts.candidates
    .map((c) => {
      const p = opts.progress.get(c.id);
      const seen = Boolean(p?.lastResult);
      if (opts.which === "new" && seen) return null;
      if (opts.which === "review" && !seen) return null;
      if (opts.which === "wrong" && !(p?.lastResult === "wrong" || p?.lastResult === "partial")) return null;
      const due = seen && (!p!.dueOn || p!.dueOn <= opts.today);
      const priority = p?.lastResult === "wrong" ? 3 : p?.lastResult === "partial" ? 2 : due ? 1.5 : seen ? 0.5 : 1;
      return { c, score: priority + rand() };
    })
    .filter((x): x is { c: Candidate; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);
  // 같은 원문은 가능하면 한 번만
  const out: Candidate[] = [];
  const usedQ = new Set<string>();
  for (const x of scored) {
    if (out.length >= opts.n) break;
    if (x.c.questionId && usedQ.has(x.c.questionId)) continue;
    out.push(x.c);
    if (x.c.questionId) usedQ.add(x.c.questionId);
  }
  for (const x of scored) {
    if (out.length >= opts.n) break;
    if (!out.includes(x.c)) out.push(x.c);
  }
  return spaceOut(out).map((c) => c.id);
}
