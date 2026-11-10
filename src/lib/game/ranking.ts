/**
 * 주간 랭킹 (순수 계산: 서버·테스트 공통).
 * 한 주 = 한국 시간 월요일 0시 ~ 다음 월요일 0시.
 * 점수 = 이번 주에 이긴 도장깨기 관 번호의 합 (같은 관은 한 번만) → 매주 다시 도전, 뒤 관일수록 큰 점수.
 */
const KST = 9 * 3600_000;

/** 이번 주 시작 (한국 시간 월요일 0시) 의 UTC 시각 */
export function weekStart(now: Date = new Date()): Date {
  const k = new Date(now.getTime() + KST); // 한국 시간을 UTC 칸에 놓고 계산
  const dow = (k.getUTCDay() + 6) % 7; // 월 0 … 일 6
  const mon = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - dow);
  return new Date(mon - KST);
}

export interface RankRow {
  learner: string;
  score: number;
  stages: number;
  /** 마지막으로 점수를 올린 때 (같은 점수면 먼저 올린 사람이 위) */
  at: string;
}

/** 이긴 기록(학습자 · 관 번호 · 시각) → 순위표 */
export function rankWeekly(wins: { learner: string; stage: number; at: string }[]): RankRow[] {
  const by = new Map<string, { stages: Set<number>; at: string }>();
  for (const w of [...wins].sort((a, b) => a.at.localeCompare(b.at))) {
    if (!Number.isFinite(w.stage) || w.stage < 1) continue;
    const r = by.get(w.learner) ?? { stages: new Set<number>(), at: w.at };
    if (!r.stages.has(w.stage)) {
      r.stages.add(w.stage);
      r.at = w.at;
    }
    by.set(w.learner, r);
  }
  return [...by.entries()]
    .map(([learner, r]) => ({ learner, score: [...r.stages].reduce((n, s) => n + s, 0), stages: r.stages.size, at: r.at }))
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at) || a.learner.localeCompare(b.learner));
}
