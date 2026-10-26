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

export interface MatchedQuestion {
  id: string;
  ref: string; // 예: "2024 A 5번"
  matched: string[]; // 겹친 개념·사상가 이름
}

/**
 * 향후 출제(futureExtensions) 항목마다 관련 기존 기출을 DB 에서 찾는다.
 * AI 가 기출 번호를 지어내지 않도록, 관련 기출은 개념·사상가 이름이 실제로 연결된 문항만 보여준다.
 */
export async function findQuestionsForTopics(
  topics: { concepts: string[]; philosophers: string[] }[],
  excludeId: string | null,
  limitPerTopic = 5,
): Promise<MatchedQuestion[][]> {
  if (topics.length === 0) return [];
  const db = getReadClient();
  const conceptNames = [...new Set(topics.flatMap((t) => t.concepts.map((c) => c.trim())).filter(Boolean))];
  const philosopherNames = [...new Set(topics.flatMap((t) => t.philosophers.map((p) => p.trim())).filter(Boolean))];
  const [cRows, pRows] = await Promise.all([
    conceptNames.length ? db.from("concepts").select("id, name").in("name", conceptNames) : { data: [] },
    philosopherNames.length ? db.from("philosophers").select("id, name").in("name", philosopherNames) : { data: [] },
  ]);
  const cId = new Map((cRows.data ?? []).map((r) => [r.name as string, r.id as string]));
  const pId = new Map((pRows.data ?? []).map((r) => [r.name as string, r.id as string]));
  const [qc, qp] = await Promise.all([
    cId.size ? db.from("question_concepts").select("question_id, concept_id").in("concept_id", [...cId.values()]) : { data: [] },
    pId.size ? db.from("question_philosophers").select("question_id, philosopher_id").in("philosopher_id", [...pId.values()]) : { data: [] },
  ]);
  const byConcept = new Map<string, Set<string>>();
  for (const r of (qc.data ?? []) as { question_id: string; concept_id: string }[]) {
    byConcept.set(r.concept_id, (byConcept.get(r.concept_id) ?? new Set()).add(r.question_id));
  }
  const byPhil = new Map<string, Set<string>>();
  for (const r of (qp.data ?? []) as { question_id: string; philosopher_id: string }[]) {
    byPhil.set(r.philosopher_id, (byPhil.get(r.philosopher_id) ?? new Set()).add(r.question_id));
  }

  const perTopic = topics.map((t) => {
    const score = new Map<string, string[]>();
    const add = (qid: string, name: string) => {
      if (qid === excludeId) return;
      score.set(qid, [...(score.get(qid) ?? []), name]);
    };
    for (const c of t.concepts) for (const q of byConcept.get(cId.get(c.trim()) ?? "") ?? []) add(q, c);
    for (const p of t.philosophers) for (const q of byPhil.get(pId.get(p.trim()) ?? "") ?? []) add(q, p);
    // 개념이 겹친 문항을 우선, 그다음 겹친 개수
    return [...score.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limitPerTopic)
      .map(([id, matched]) => ({ id, matched }));
  });
  const ids = [...new Set(perTopic.flat().map((x) => x.id))];
  const summaries = await listQuestionSummaries({ ids });
  const refOf = new Map(summaries.map((s) => [s.id, `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " ")]));
  return perTopic.map((list) =>
    list.filter((x) => refOf.has(x.id)).map((x) => ({ id: x.id, ref: refOf.get(x.id)!, matched: [...new Set(x.matched)] })),
  );
}
