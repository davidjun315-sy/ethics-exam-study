import "server-only";
import { fetchAll } from "@/lib/quiz/paged";
import { getAdminClient } from "@/lib/supabase/server";
import { questionRef } from "@/lib/format";
import { classifyPhilosopher, TRADITIONS, UNCLASSIFIED } from "@/lib/traditions";
import type { PhilosopherStudyNote } from "@/lib/ai/schemas";
import type { AnalysisDetails, PhilosopherRole } from "@/lib/types";
import { philosopherUpdatedAt, questionsOf, type ExportPhilosopher, type ExportQuestion } from "@/lib/export/markdown";

export interface ExportData {
  philosophers: ExportPhilosopher[]; // 섹터 순서 → 문항 많은 순
  questions: ExportQuestion[];
}

type Row = Record<string, unknown>;

/**
 * 내보내기용으로 기출·분석·원전·사상가·개념 정리를 모두 읽는다 (그때그때 DB 에서 읽으므로 항상 최신).
 * 각 표는 1,000줄씩 끝까지 읽는다.
 */
export async function loadExportData(): Promise<ExportData> {
  const db = getAdminClient();
  // 페이지를 나눠 읽으므로 순서가 겹치지 않는 열로 정렬한다
  const all = (table: string, cols: string, order: string[] = ["id"]) =>
    fetchAll<Row>(
      (from, to) =>
        order.reduce((q, c) => q.order(c), db.from(table).select(cols)).range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    );
  const [exams, questions, analyses, links, philosophers, sources, notes] = await Promise.all([
    all("exams", "id, exam_year, section"),
    all("questions", "id, exam_id, label, score, question_text, sort_order, updated_at"),
    all("question_analysis", "question_id, area, school, question_type, difficulty, answer, answer_explanation, question_intent, common_mistakes, details, status, analysis_version, updated_at"),
    all("question_philosophers", "question_id, philosopher_id, role", ["question_id", "philosopher_id"]),
    all("philosophers", "id, name, tradition, school, era, core_ideas"),
    all("question_sources", "*, sources(title)"),
    // 003 을 실행하지 않았으면 개념 정리 노트 없이
    all("philosopher_notes", "philosopher_id, content, updated_at").catch(() => [] as Row[]),
  ]);

  const examById = new Map(exams.map((e) => [e.id as string, e as { exam_year: number; section: "A" | "B" | null }]));
  const nameById = new Map(philosophers.map((p) => [p.id as string, p.name as string]));
  const analysisBy = new Map(analyses.map((a) => [a.question_id as string, a]));
  const linksBy = new Map<string, Row[]>();
  for (const l of links) linksBy.set(l.question_id as string, [...(linksBy.get(l.question_id as string) ?? []), l]);
  const sourcesBy = new Map<string, Row[]>();
  for (const s of sources) sourcesBy.set(s.question_id as string, [...(sourcesBy.get(s.question_id as string) ?? []), s]);
  const ROLE_ORDER: Record<string, number> = { main: 0, comparison: 1, distractor: 2, mentioned: 3 };

  const qs: ExportQuestion[] = questions.flatMap((q) => {
    const exam = examById.get(q.exam_id as string);
    if (!exam) return [];
    const a = analysisBy.get(q.id as string);
    return [
      {
        id: q.id as string,
        ref: questionRef(exam, q.label as string),
        year: exam.exam_year,
        order: (exam.section === "B" ? 100000 : 0) + ((q.sort_order as number) ?? 0),
        score: (q.score as number) ?? null,
        text: (q.question_text as string) ?? null,
        updatedAt: q.updated_at as string,
        philosophers: (linksBy.get(q.id as string) ?? [])
          .filter((l) => nameById.has(l.philosopher_id as string))
          .sort((x, y) => ROLE_ORDER[x.role as string] - ROLE_ORDER[y.role as string])
          .map((l) => ({ id: l.philosopher_id as string, name: nameById.get(l.philosopher_id as string)!, role: l.role as PhilosopherRole })),
        analysis: a
          ? {
              area: (a.area as string) ?? null,
              school: (a.school as string) ?? null,
              questionType: (a.question_type as string) ?? null,
              difficulty: (a.difficulty as string) ?? null,
              answer: (a.answer as string) ?? null,
              answerExplanation: (a.answer_explanation as string) ?? null,
              questionIntent: (a.question_intent as string) ?? null,
              commonMistakes: (a.common_mistakes as string[]) ?? [],
              details: ((a.details as AnalysisDetails) ?? {}) as AnalysisDetails,
              status: a.status as string,
              version: (a.analysis_version as number) ?? 1,
              updatedAt: a.updated_at as string,
            }
          : null,
        sources: (sourcesBy.get(q.id as string) ?? []).map((s) => ({
          title: ((s.sources as { title?: string } | null)?.title ?? (s.title_raw as string)) || null,
          location: (s.location as string) ?? null,
          philosopher: (s.philosopher_name as string) ?? null,
          overview: (s.source_overview as string) ?? null,
          related: (s.related_content as string) ?? null,
          relation: (s.relation_to_question as string) ?? null,
          quoted: (s.quoted_text as string) ?? null,
          status: (s.verification_status as string) ?? "unknown",
        })),
      },
    ];
  });

  const noteBy = new Map(notes.map((n) => [n.philosopher_id as string, { content: n.content as PhilosopherStudyNote, updatedAt: n.updated_at as string }]));
  const order = [...TRADITIONS, UNCLASSIFIED] as string[];
  const ps: ExportPhilosopher[] = philosophers
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      tradition: classifyPhilosopher({ name: p.name as string, tradition: (p.tradition as string) ?? null }),
      school: (p.school as string) ?? null,
      era: (p.era as string) ?? null,
      coreIdeas: (p.core_ideas as string) ?? null,
      note: noteBy.get(p.id as string) ?? null,
    }))
    // 문항도 노트도 없는 사상가는 내보낼 것이 없다
    .filter((p) => p.note || questionsOf(p.id, qs).length > 0)
    .sort((x, y) => order.indexOf(x.tradition) - order.indexOf(y.tradition) || questionsOf(y.id, qs).length - questionsOf(x.id, qs).length || x.name.localeCompare(y.name));
  return { philosophers: ps, questions: qs };
}

/** 내보내기 화면용 목록 (내용 없이 개수와 마지막 변경 시각만) */
export async function listExportTargets() {
  const { philosophers, questions } = await loadExportData();
  const latest = [...questions.flatMap((q) => [q.updatedAt, q.analysis?.updatedAt]), ...philosophers.map((p) => p.note?.updatedAt)]
    .filter((t): t is string => Boolean(t))
    .reduce((m, t) => (t > m ? t : m), "");
  return {
    totals: { questions: questions.length, analyzed: questions.filter((q) => q.analysis).length, philosophers: philosophers.length, notes: philosophers.filter((p) => p.note).length },
    latest: latest || null,
    philosophers: philosophers.map((p) => {
      const qs = questionsOf(p.id, questions);
      return {
        id: p.id,
        name: p.name,
        tradition: p.tradition,
        questions: qs.length,
        analyzed: qs.filter((q) => q.analysis).length,
        hasNote: Boolean(p.note),
        updatedAt: philosopherUpdatedAt(p, questions),
      };
    }),
  };
}
export type ExportTargets = Awaited<ReturnType<typeof listExportTargets>>;
