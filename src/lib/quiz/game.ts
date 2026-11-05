/**
 * 윤리 퀴즈 게임 요소 (순수 계산 · npm run test:quiz).
 * 학습 지표(숙련도·복습 일정·정답률)와 분리된 "보여 주기용" 지표만 다룬다:
 * - 체크포인트: 오늘의 미션 안의 중간 목표. 연속 학습·미션 보너스 규칙은 그대로 (10문제 완료 시)
 * - 콤보: 최종 판정(자동 채점 또는 학습자의 최종 자기평가)이 연속으로 '정답'인 횟수. 경험치·복습에는 영향 없음
 * - 재정복: 지난번에 틀렸거나 일부만 맞힌 문제를 이번에 맞힘
 */
import type { QuizResult } from "./srs.ts";

// ---------------------------------------------------------------------
// 오늘의 미션 체크포인트
// ---------------------------------------------------------------------
export interface Checkpoint {
  at: number;
  title: string;
}

/** 미션 문제 수에 맞춘 체크포인트 (10문제: 1 · 3 · 5 · 10) */
export function checkpoints(total: number): Checkpoint[] {
  if (total <= 0) return [];
  const half = Math.ceil(total / 2);
  const raw: Checkpoint[] = [
    { at: 1, title: "첫 도전 성공" },
    // 문제 수가 적은 미션에서는 절반보다 앞설 때만 (순서가 뒤바뀌지 않게)
    ...(3 < half ? [{ at: 3, title: "첫 번째 체크포인트" }] : []),
    { at: half, title: "절반 정복" },
    { at: total, title: "오늘의 미션 완수" },
  ];
  const out: Checkpoint[] = [];
  for (const c of raw) {
    if (c.at > total || c.at < 1) continue;
    const same = out.findIndex((x) => x.at === c.at);
    // 같은 자리면 더 큰 목표의 이름을 쓴다 (예: 3문제 미션의 마지막 = 미션 완수)
    if (same >= 0) out[same] = c;
    else out.push(c);
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface MissionStatus {
  reached: Checkpoint | null; // 마지막으로 달성한 체크포인트
  next: Checkpoint | null;
  remaining: number; // 다음 체크포인트까지 남은 문제
  headline: string;
  sub: string;
  completed: boolean;
}

/** 진행 상황을 "몇 개 남았다"가 아니라 "어디까지 왔다"로 표현 */
export function missionStatus(done: number, total: number): MissionStatus {
  const cps = checkpoints(total);
  const reached = [...cps].reverse().find((c) => done >= c.at) ?? null;
  const next = cps.find((c) => done < c.at) ?? null;
  const remaining = next ? next.at - done : 0;
  const completed = total > 0 && done >= total;
  let headline: string;
  if (total === 0) headline = "오늘의 미션을 준비 중입니다";
  else if (completed) headline = "오늘의 미션 완수!";
  else if (!reached) headline = "오늘의 첫 문제에 도전하세요";
  else if (reached.at === 3) headline = "첫 번째 체크포인트 돌파!";
  else headline = `${reached.title}!`;
  const sub = completed
    ? "연속 학습이 이어졌습니다. 더 풀고 싶다면 실전 도전에 나서 보세요."
    : next
      ? `다음 목표 '${next.title}'까지 ${remaining}문제`
      : "";
  return { reached, next, remaining, headline, sub, completed };
}

/** 이번 풀이로 새로 달성한 체크포인트 (없으면 null) */
export function checkpointReached(doneBefore: number, doneAfter: number, total: number): Checkpoint | null {
  return checkpoints(total).find((c) => doneBefore < c.at && doneAfter >= c.at) ?? null;
}

// ---------------------------------------------------------------------
// 콤보
// ---------------------------------------------------------------------
export interface ComboTier {
  count: number;
  label: string;
  level: 1 | 2 | 3 | 4;
}

/** 2연속: COMBO x2 · 3연속: NICE COMBO · 5연속: PERFECT STREAK · 10연속: MASTER COMBO */
export function comboTier(count: number): ComboTier | null {
  if (count >= 10) return { count, label: "MASTER COMBO", level: 4 };
  if (count >= 5) return { count, label: "PERFECT STREAK", level: 3 };
  if (count >= 3) return { count, label: "NICE COMBO", level: 2 };
  if (count >= 2) return { count, label: `COMBO x${count}`, level: 1 };
  return null;
}

/** 시간 순 판정 목록의 끝에서부터 이어진 정답 수 */
export function trailingCombo(results: QuizResult[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === "correct"; i--) n++;
  return n;
}

/** 가장 길게 이어진 정답 수 */
export function bestCombo(results: QuizResult[]): number {
  let best = 0;
  let cur = 0;
  for (const r of results) {
    cur = r === "correct" ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

// ---------------------------------------------------------------------
// 재정복
// ---------------------------------------------------------------------
export function isReconquest(prev: QuizResult | null, result: QuizResult): boolean {
  return result === "correct" && (prev === "wrong" || prev === "partial");
}

/** 시간 순 풀이 기록에서 기간 안의 재정복 수 (직전 풀이가 오답·부분 정답이던 문제를 맞힘) */
export function countReconquests(attempts: { itemId: string; result: QuizResult; day: string }[], fromDay: string): number {
  const last = new Map<string, QuizResult>();
  let n = 0;
  for (const a of attempts) {
    if (a.day >= fromDay && isReconquest(last.get(a.itemId) ?? null, a.result)) n++;
    last.set(a.itemId, a.result);
  }
  return n;
}

// ---------------------------------------------------------------------
// 성장 (실제 학습 지표)
// ---------------------------------------------------------------------
export interface AreaGrowth {
  area: string;
  before: number; // 정답률 0~1
  now: number;
  attempts: number;
}

/**
 * 최근 기간과 그 이전 기간의 영역별 정답률을 비교해 오른 영역을 찾는다.
 * 우연을 줄이려고 두 기간 모두 최소 풀이 수를 요구하고, 10%p 이상 오른 경우만.
 */
export function areaGrowth(
  attempts: { area: string; result: QuizResult; day: string }[],
  recentFrom: string,
  minAttempts = 3,
): AreaGrowth[] {
  const acc = new Map<string, { r: [number, number]; p: [number, number] }>();
  for (const a of attempts) {
    const x = acc.get(a.area) ?? { r: [0, 0], p: [0, 0] };
    const slot = a.day >= recentFrom ? x.r : x.p;
    slot[1]++;
    if (a.result === "correct") slot[0]++;
    else if (a.result === "partial") slot[0] += 0.5;
    acc.set(a.area, x);
  }
  return [...acc.entries()]
    .filter(([, x]) => x.r[1] >= minAttempts && x.p[1] >= minAttempts)
    .map(([area, x]) => ({ area, before: x.p[0] / x.p[1], now: x.r[0] / x.r[1], attempts: x.r[1] }))
    .filter((g) => g.now - g.before >= 0.1)
    .sort((a, b) => b.now - b.before - (a.now - a.before));
}

// ---------------------------------------------------------------------
// 실전 도전
// ---------------------------------------------------------------------
export type ChallengeType = "decode" | "essay" | "revenge";

export const CHALLENGES: Record<ChallengeType, { title: string; desc: string; size: number }> = {
  decode: { title: "원문 해독 챌린지", desc: "난이도 '상' 기입형 · 기출 원문에서 핵심 개념을 힌트 없이 복원", size: 5 },
  essay: { title: "서술형 마스터 챌린지", desc: "난이도 '상' 서술형 · 핵심 채점 요소를 갖춘 답안 작성", size: 3 },
  revenge: { title: "오답 복수전", desc: "틀렸거나 일부만 맞힌 문제에 재도전 · 맞히면 재정복", size: 5 },
};
