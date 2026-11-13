import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/quiz/paged";

/**
 * 완전 기출문제 (기출문제 탭에서 문항 전체를 푼 기록) → 사상가 정복 지도 (022).
 * 맞힘: AI 채점 FULL_PASS 점 이상, 또는 모범답안을 본 뒤 스스로 '다 맞혔어요'.
 * 022 를 적용하기 전에는 기록 없이 동작한다 (ready: false).
 */
export const FULL_PASS = 80;

export interface FullSolve {
  correct: boolean;
  bestScore: number | null;
  attempts: number;
}

const missing = (m: string) => /quiz_full_solves|quiz_record_full_solve|schema cache|does not exist/i.test(m);

/** 이 학습자의 완전 기출문제 기록 (문항 id → 기록) */
export async function loadFullSolves(learner: string): Promise<{ ready: boolean; map: Map<string, FullSolve> }> {
  try {
    const rows = await fetchAll<{ question_id: string; best_score: number | null; attempts: number; correct_at: string | null }>((from, to) =>
      getAdminClient().from("quiz_full_solves").select("question_id, best_score, attempts, correct_at").eq("learner", learner).order("question_id").range(from, to),
    );
    return { ready: true, map: new Map(rows.map((r) => [r.question_id, { correct: Boolean(r.correct_at), bestScore: r.best_score, attempts: r.attempts }])) };
  } catch (e) {
    if (!missing(e instanceof Error ? e.message : String(e))) console.error("[quiz-full]", e);
    return { ready: false, map: new Map() };
  }
}

export interface FullSolveResult {
  ready: boolean;
  correct: boolean;
  /** 이번에 처음 맞힘 */
  newly: boolean;
  bestScore: number | null;
  attempts: number;
}

/** 기록 (점수·맞힘 판정은 서버가 정한 값만 넘긴다) */
export async function recordFullSolve(learner: string, questionId: string, score: number | null, correct: boolean, how: "ai" | "self" | "quiz"): Promise<FullSolveResult> {
  const { data, error } = await getAdminClient().rpc("quiz_record_full_solve", { p_learner: learner, p_question: questionId, p_score: score, p_correct: correct, p_how: how });
  if (error) {
    if (!missing(error.message)) console.error("[quiz-full:record]", error.message);
    return { ready: false, correct, newly: false, bestScore: score, attempts: 0 };
  }
  const d = data as { correct: boolean; newly: boolean; bestScore: number | null; attempts: number };
  return { ready: true, correct: d.correct, newly: d.newly, bestScore: d.bestScore, attempts: d.attempts };
}

export async function getFullSolve(learner: string, questionId: string): Promise<{ ready: boolean; solve: FullSolve | null }> {
  const { data, error } = await getAdminClient().from("quiz_full_solves").select("best_score, attempts, correct_at").eq("learner", learner).eq("question_id", questionId).maybeSingle();
  if (error) return { ready: false, solve: null };
  const r = data as { best_score: number | null; attempts: number; correct_at: string | null } | null;
  return { ready: true, solve: r ? { correct: Boolean(r.correct_at), bestScore: r.best_score, attempts: r.attempts } : null };
}
