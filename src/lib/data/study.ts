import "server-only";
import type { StudyConcept } from "@/lib/ai/schemas";
import { getReadClient } from "@/lib/supabase/server";
import { buildPhilosopherNotebook, matchesPhilosopher, normalizeText, type NotebookQuestion, type PhilosopherNotebook } from "@/lib/study/notebook";
import type { AnalysisDetails, Philosopher } from "@/lib/types";
import { listQuestionSummaries } from "./queries";
import { one } from "./shape";

const ANALYZED = new Set(["analyzed", "needs_review", "verified"]);
const refOf = (s: { exam: { exam_year: number; section: string | null }; label: string }) =>
  `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " ");

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 사상가 페이지의 공부 노트 (이 사상가가 나온 모든 분석 문항을 모아 정리) */
export async function getPhilosopherNotebook(p: Philosopher): Promise<PhilosopherNotebook> {
  const db = getReadClient();
  const { data: links } = await db.from("question_philosophers").select("question_id, role, reasoning").eq("philosopher_id", p.id);
  const qids = (links ?? []).map((l) => l.question_id as string);
  if (qids.length === 0) return buildPhilosopherNotebook(p, [], new Map());
  const [summaries, analyses, qc, concepts] = await Promise.all([
    listQuestionSummaries({ ids: qids }),
    db.from("question_analysis").select("question_id, status, answer, required_keywords, details").in("question_id", qids),
    db.from("question_concepts").select("question_id, philosopher_id, concepts(id, name)").in("question_id", qids),
    db.from("concepts").select("id, name, aliases, definition"),
  ]);
  const aByQ = new Map((analyses.data ?? []).map((a: any) => [a.question_id as string, a]));
  const linkByQ = new Map((links ?? []).map((l: any) => [l.question_id as string, l]));
  const ownByQ = new Map<string, { id: string; name: string }[]>();
  for (const r of (qc.data ?? []) as any[]) {
    const c = one<any>(r.concepts);
    if (!c) continue;
    const role = linkByQ.get(r.question_id)?.role;
    // 이 사상가의 개념으로 지정되었거나, 지정이 없고 이 사상가가 main 인 문항의 개념
    if (r.philosopher_id === p.id || (!r.philosopher_id && role === "main")) {
      ownByQ.set(r.question_id, [...(ownByQ.get(r.question_id) ?? []), { id: c.id, name: c.name }]);
    }
  }
  const conceptDb = new Map<string, { id: string; definition: string | null }>();
  for (const c of (concepts.data ?? []) as any[]) {
    for (const n of [c.name, ...(c.aliases ?? [])]) conceptDb.set(normalizeText(n), { id: c.id, definition: c.definition });
  }

  const questions: NotebookQuestion[] = summaries
    .filter((s) => ANALYZED.has(aByQ.get(s.id)?.status))
    .map((s) => {
      const a = aByQ.get(s.id);
      const d = (a?.details ?? {}) as AnalysisDetails;
      const link = linkByQ.get(s.id);
      return {
        id: s.id,
        ref: refOf(s),
        year: s.exam.exam_year,
        role: link?.role ?? "mentioned",
        answer: a?.answer ?? null,
        modelAnswer: d.modelAnswer ?? null,
        requiredKeywords: a?.required_keywords ?? [],
        intent: d.examinerIntent ?? null,
        studyConcepts: d.studyConcepts ?? [],
        extensions: d.futureExtensions ?? [],
        reasoning: link?.reasoning ?? {},
        ownConcepts: ownByQ.get(s.id) ?? [],
      };
    });
  return buildPhilosopherNotebook(p, questions, conceptDb);
}

export interface PhilosopherConceptGroup {
  philosopher: { id: string; name: string } | null; // null = 사상가 미지정
  total: number; // 이 사상가 출제 문항 수 (정렬용)
  concepts: { id: string; name: string; count: number; lastYear: number | null }[];
}

/**
 * 개념을 사상가별로 묶는다.
 * 개념의 사상가: 문항-개념 연결의 사상가(question_concepts.philosopher_id) → 없으면 그 문항의 main 사상가.
 * 기출에 아직 나오지 않았지만 개념-사상가 연결이 있는 개념도 포함한다.
 */
export async function listConceptsByPhilosopher(): Promise<PhilosopherConceptGroup[]> {
  const db = getReadClient();
  const [summaries, qc, cp, concepts] = await Promise.all([
    listQuestionSummaries(),
    db.from("question_concepts").select("question_id, concept_id, philosopher_id").limit(20000),
    db.from("concept_philosophers").select("concept_id, philosopher_id, philosophers(id, name)").limit(20000),
    db.from("concepts").select("id, name"),
  ]);
  const byQ = new Map(summaries.map((s) => [s.id, s]));
  const conceptName = new Map(((concepts.data ?? []) as any[]).map((c) => [c.id as string, c.name as string]));
  const philName = new Map<string, string>();
  summaries.forEach((s) => s.philosophers.forEach((p) => philName.set(p.id, p.name)));
  ((cp.data ?? []) as any[]).forEach((r) => {
    const ph = one<any>(r.philosophers);
    if (ph) philName.set(ph.id, ph.name);
  });

  const groups = new Map<string, Map<string, { count: number; lastYear: number | null }>>();
  const bump = (pid: string, cid: string, year: number | null) => {
    const g = groups.get(pid) ?? new Map();
    const cur = g.get(cid) ?? { count: 0, lastYear: null };
    if (year !== null) {
      cur.count++;
      cur.lastYear = Math.max(cur.lastYear ?? 0, year);
    }
    g.set(cid, cur);
    groups.set(pid, g);
  };
  for (const r of (qc.data ?? []) as any[]) {
    const s = byQ.get(r.question_id);
    if (!s) continue;
    const owners = r.philosopher_id ? [r.philosopher_id] : s.philosophers.filter((p) => p.role === "main").map((p) => p.id);
    (owners.length ? owners : ["_none"]).forEach((pid: string) => bump(pid, r.concept_id, s.exam.exam_year));
  }
  for (const r of (cp.data ?? []) as any[]) if (!groups.get(r.philosopher_id)?.has(r.concept_id)) bump(r.philosopher_id, r.concept_id, null);

  const totals = new Map<string, number>();
  summaries.forEach((s) => s.philosophers.filter((p) => p.role === "main" || p.role === "comparison").forEach((p) => totals.set(p.id, (totals.get(p.id) ?? 0) + 1)));

  return [...groups.entries()]
    .map(([pid, g]) => ({
      philosopher: pid === "_none" ? null : { id: pid, name: philName.get(pid) ?? "?" },
      total: totals.get(pid) ?? 0,
      concepts: [...g.entries()]
        .map(([cid, v]) => ({ id: cid, name: conceptName.get(cid) ?? "?", ...v }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => (a.philosopher ? 0 : 1) - (b.philosopher ? 0 : 1) || b.total - a.total || (a.philosopher?.name ?? "").localeCompare(b.philosopher?.name ?? ""));
}

export interface ConceptByPhilosopherNote {
  philosopher: string; // "사상가 미지정" 포함
  definitions: string[];
  examPoints: string[];
  distinctions: string[];
  confusableWith: string[];
  questions: { id: string; ref: string }[];
}

/** 개념 페이지: 문항 분석의 "개념 정리"에서 이 개념을 사상가별로 모은 내용 */
export async function getConceptNotes(concept: { name: string; aliases: string[] }): Promise<ConceptByPhilosopherNote[]> {
  const db = getReadClient();
  const { data, error } = await db.from("question_analysis").select("question_id, status, sc:details->studyConcepts").limit(5000);
  if (error) throw new Error(error.message);
  const keys = new Set([concept.name, ...concept.aliases].map(normalizeText));
  const hits: { qid: string; sc: StudyConcept }[] = [];
  for (const r of (data ?? []) as any[]) {
    if (!ANALYZED.has(r.status) || !Array.isArray(r.sc)) continue;
    for (const sc of r.sc as StudyConcept[]) if (keys.has(normalizeText(sc.name ?? ""))) hits.push({ qid: r.question_id, sc });
  }
  if (hits.length === 0) return [];
  const summaries = await listQuestionSummaries({ ids: [...new Set(hits.map((h) => h.qid))] });
  const sById = new Map(summaries.map((s) => [s.id, s]));
  const groups = new Map<string, ConceptByPhilosopherNote>();
  const uniq = (list: string[], v?: string | null) => {
    const t = v?.trim();
    if (t && !list.some((x) => normalizeText(x) === normalizeText(t))) list.push(t);
  };
  for (const { qid, sc } of hits) {
    const s = sById.get(qid);
    if (!s) continue;
    const main = s.philosophers.find((p) => p.role === "main")?.name;
    // 개념 정리에 사상가가 없으면 그 문항의 main 사상가로 본다
    const name = sc.philosopher?.trim() || main || "사상가 미지정";
    const key = s.philosophers.find((p) => matchesPhilosopher(name, p.name, []))?.name ?? name;
    const g = groups.get(key) ?? { philosopher: key, definitions: [], examPoints: [], distinctions: [], confusableWith: [], questions: [] };
    uniq(g.definitions, sc.definition);
    uniq(g.examPoints, sc.examPoint);
    uniq(g.distinctions, sc.distinction);
    sc.confusableWith.forEach((c) => uniq(g.confusableWith, c));
    if (!g.questions.some((q) => q.id === qid)) g.questions.push({ id: qid, ref: refOf(s) });
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.questions.length - a.questions.length);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
