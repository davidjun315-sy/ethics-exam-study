import "server-only";
import { getReadClient } from "@/lib/supabase/server";
import { listQuestionSummaries, type QuestionSummary } from "./queries";

/**
 * 유사 기출 찾기 (태그 기반).
 * 점수 = 공통 사상가(main 3점 / 그 외 2점) + 공통 개념 2점 + 공통 원전 2점
 *
 * 향후 embedding 기반 semantic search 를 붙일 때는
 * question_embeddings 테이블(supabase/schema.sql 주석 참고)에서 cosine 유사도를 구해
 * 아래 score 에 더하면 된다.
 */
export async function findRelatedQuestions(questionId: string, limit = 8): Promise<(QuestionSummary & { score: number; reasons: string[] })[]> {
  const db = getReadClient();
  const [p, c, s] = await Promise.all([
    db.from("question_philosophers").select("philosopher_id, role, philosophers(name)").eq("question_id", questionId),
    db.from("question_concepts").select("concept_id, concepts(name)").eq("question_id", questionId),
    db.from("question_sources").select("source_id").eq("question_id", questionId).not("source_id", "is", null),
  ]);
  const pIds = (p.data ?? []).map((x) => x.philosopher_id as string);
  const cIds = (c.data ?? []).map((x) => x.concept_id as string);
  const sIds = (s.data ?? []).map((x) => x.source_id as string);
  if (!pIds.length && !cIds.length && !sIds.length) return [];

  const [rp, rc, rs] = await Promise.all([
    pIds.length
      ? db.from("question_philosophers").select("question_id, philosopher_id, role, philosophers(name)").in("philosopher_id", pIds)
      : { data: [] },
    cIds.length ? db.from("question_concepts").select("question_id, concepts(name)").in("concept_id", cIds) : { data: [] },
    sIds.length ? db.from("question_sources").select("question_id, sources(title)").in("source_id", sIds) : { data: [] },
  ]);

  const scores = new Map<string, { score: number; reasons: Set<string> }>();
  const add = (qid: string, pts: number, reason: string) => {
    if (qid === questionId) return;
    const cur = scores.get(qid) ?? { score: 0, reasons: new Set<string>() };
    cur.score += pts;
    cur.reasons.add(reason);
    scores.set(qid, cur);
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const nameOf = (v: any, key: string) => (Array.isArray(v) ? v[0]?.[key] : v?.[key]) ?? "";
  for (const r of (rp.data ?? []) as any[]) add(r.question_id, r.role === "main" ? 3 : 2, nameOf(r.philosophers, "name"));
  for (const r of (rc.data ?? []) as any[]) add(r.question_id, 2, nameOf(r.concepts, "name"));
  for (const r of (rs.data ?? []) as any[]) add(r.question_id, 2, `『${nameOf(r.sources, "title")}』`);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const top = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);
  const summaries = await listQuestionSummaries({ ids: top.map(([id]) => id) });
  const byId = new Map(summaries.map((x) => [x.id, x]));
  return top
    .map(([id, v]) => {
      const sum = byId.get(id);
      return sum ? { ...sum, score: v.score, reasons: [...v.reasons].filter(Boolean) } : null;
    })
    .filter((x): x is QuestionSummary & { score: number; reasons: string[] } => x !== null);
}
