import "server-only";
import { getReadClient } from "@/lib/supabase/server";
import type {
  AnalysisStatus,
  Concept,
  Exam,
  ExamPage,
  Philosopher,
  PhilosopherRole,
  Question,
  QuestionAnalysis,
  QuestionConceptLink,
  QuestionPhilosopherLink,
  QuestionSourceLink,
  Source,
  SourcePassage,
} from "@/lib/types";
import { many, one, sanitizeSearch } from "./shape";

// ---------------------------------------------------------------------
// 문항 요약 (카드 / 목록 / 통계 공용)
// ---------------------------------------------------------------------

export interface QuestionSummary {
  id: string;
  label: string;
  question_number: number;
  sort_order: number;
  score: number | null;
  question_type: string | null;
  question_text: string | null;
  page_start: number | null;
  page_end: number | null;
  exam: Pick<Exam, "id" | "exam_year" | "section" | "exam_name" | "subject">;
  analysis: {
    area: string | null;
    answer: string | null;
    difficulty: string | null;
    overall_confidence: number | null;
    source_confidence: number | null;
    status: AnalysisStatus;
  } | null;
  philosophers: { id: string; name: string; role: PhilosopherRole }[];
  concepts: { id: string; name: string }[];
  sources: { id: string; title: string }[];
}

const SUMMARY_SELECT = `
  id, label, question_number, sort_order, score, question_type, question_text, page_start, page_end,
  exams!inner ( id, exam_year, section, exam_name, subject ),
  question_analysis ( area, answer, difficulty, overall_confidence, source_confidence, status ),
  question_philosophers ( role, philosophers ( id, name ) ),
  question_concepts ( concepts ( id, name ) ),
  question_sources ( sources ( id, title ) )
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSummary(row: any): QuestionSummary {
  const roleOrder: Record<string, number> = { main: 0, comparison: 1, distractor: 2, mentioned: 3 };
  const sources = new Map<string, { id: string; title: string }>();
  for (const s of many<any>(row.question_sources)) {
    const src = one<any>(s.sources);
    if (src) sources.set(src.id, { id: src.id, title: src.title });
  }
  return {
    id: row.id,
    label: row.label,
    question_number: row.question_number,
    sort_order: row.sort_order,
    score: row.score,
    question_type: row.question_type,
    question_text: row.question_text,
    page_start: row.page_start,
    page_end: row.page_end,
    exam: one<any>(row.exams),
    analysis: one<any>(row.question_analysis),
    philosophers: many<any>(row.question_philosophers)
      .map((l) => ({ ...one<any>(l.philosophers), role: l.role }))
      .filter((p) => p.id)
      .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)),
    concepts: many<any>(row.question_concepts)
      .map((l) => one<any>(l.concepts))
      .filter(Boolean),
    sources: [...sources.values()],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function sortSummaries(list: QuestionSummary[]): QuestionSummary[] {
  return [...list].sort(
    (a, b) =>
      b.exam.exam_year - a.exam.exam_year ||
      (a.exam.section ?? "").localeCompare(b.exam.section ?? "") ||
      a.sort_order - b.sort_order ||
      a.question_number - b.question_number,
  );
}

export async function listQuestionSummaries(filter?: { ids?: string[]; examId?: string }): Promise<QuestionSummary[]> {
  if (filter?.ids && filter.ids.length === 0) return [];
  const db = getReadClient();
  let q = db.from("questions").select(SUMMARY_SELECT);
  if (filter?.ids) q = q.in("id", filter.ids);
  if (filter?.examId) q = q.eq("exam_id", filter.examId);
  const { data, error } = await q.limit(5000);
  if (error) throw new Error(error.message);
  return sortSummaries((data ?? []).map(toSummary));
}

// ---------------------------------------------------------------------
// 대시보드
// ---------------------------------------------------------------------

export async function getDashboard() {
  const db = getReadClient();
  const count = async (table: string) => {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [examCount, questionCount, philosopherCount, sourceCount, recentExams, recentAnalyzed, all] = await Promise.all([
    count("exams"),
    count("questions"),
    count("philosophers"),
    count("sources"),
    db
      .from("exams")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6)
      .then((r) => (r.data ?? []) as Exam[]),
    db
      .from("question_analysis")
      .select("question_id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(6)
      .then((r) => (r.data ?? []).map((x) => x.question_id as string)),
    listQuestionSummaries(),
  ]);

  const recentQuestions = all
    .filter((q) => recentAnalyzed.includes(q.id))
    .sort((a, b) => recentAnalyzed.indexOf(a.id) - recentAnalyzed.indexOf(b.id));

  const stats = computeTrends(all);
  return {
    examCount,
    questionCount,
    philosopherCount,
    sourceCount,
    recentExams,
    recentQuestions,
    topPhilosophers: stats.philosopherCounts.slice(0, 10),
    recentConcepts: stats.recentConceptCounts.slice(0, 12),
    recentYears: stats.recentYears,
  };
}

// ---------------------------------------------------------------------
// 시험
// ---------------------------------------------------------------------

export async function listExams(): Promise<(Exam & { question_count: number })[]> {
  const db = getReadClient();
  const { data, error } = await db
    .from("exams")
    .select("*, questions(count)")
    .order("exam_year", { ascending: false })
    .order("section", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => {
    const { questions, ...rest } = e as Exam & { questions: { count: number }[] };
    return { ...rest, question_count: questions?.[0]?.count ?? 0 };
  });
}

export async function getExam(id: string): Promise<Exam | null> {
  const db = getReadClient();
  const { data, error } = await db.from("exams").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Exam | null;
}

export async function getExamPages(examId: string): Promise<ExamPage[]> {
  const db = getReadClient();
  const { data, error } = await db.from("exam_pages").select("*").eq("exam_id", examId).order("page_number");
  if (error) throw new Error(error.message);
  return (data ?? []) as ExamPage[];
}

// ---------------------------------------------------------------------
// 문항 상세
// ---------------------------------------------------------------------

export interface QuestionDetail {
  question: Question;
  exam: Exam;
  analysis: QuestionAnalysis | null;
  philosophers: (QuestionPhilosopherLink & { philosophers: Philosopher })[];
  concepts: (QuestionConceptLink & { concepts: Concept })[];
  sources: QuestionSourceLink[];
  passages: (SourcePassage & { source_title: string })[];
  children: Question[];
  siblings: { id: string; label: string }[];
}

export async function getQuestionDetail(id: string): Promise<QuestionDetail | null> {
  const db = getReadClient();
  const { data: question, error } = await db.from("questions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!question) return null;

  const [exam, analysis, phil, conc, src, children, siblings] = await Promise.all([
    db.from("exams").select("*").eq("id", question.exam_id).single(),
    db.from("question_analysis").select("*").eq("question_id", id).maybeSingle(),
    db.from("question_philosophers").select("*, philosophers(*)").eq("question_id", id),
    db.from("question_concepts").select("*, concepts(*)").eq("question_id", id),
    db.from("question_sources").select("*, sources(*)").eq("question_id", id).order("confidence", { ascending: false }),
    db.from("questions").select("*").eq("parent_id", id).order("sort_order"),
    db.from("questions").select("id, label, sort_order").eq("exam_id", question.exam_id).order("sort_order"),
  ]);

  const sourceLinks = (src.data ?? []) as QuestionSourceLink[];
  const sourceIds = [...new Set(sourceLinks.map((s) => s.source_id).filter(Boolean))] as string[];
  let passages: (SourcePassage & { source_title: string })[] = [];
  if (sourceIds.length > 0) {
    const { data } = await db.from("source_passages").select("*, sources(title)").in("source_id", sourceIds).limit(50);
    passages = (data ?? []).map((p) => {
      const { sources, ...rest } = p as SourcePassage & { sources: { title: string } | null };
      return { ...rest, source_title: one(sources)?.title ?? "" };
    });
  }

  const roleOrder: Record<string, number> = { main: 0, comparison: 1, distractor: 2, mentioned: 3 };
  return {
    question: question as Question,
    exam: exam.data as Exam,
    analysis: (analysis.data as QuestionAnalysis | null) ?? null,
    philosophers: ((phil.data ?? []) as QuestionDetail["philosophers"]).sort(
      (a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9),
    ),
    concepts: (conc.data ?? []) as QuestionDetail["concepts"],
    sources: sourceLinks,
    passages,
    children: (children.data ?? []) as Question[],
    siblings: (siblings.data ?? []) as { id: string; label: string }[],
  };
}

// ---------------------------------------------------------------------
// 사상가 / 개념 / 원전
// ---------------------------------------------------------------------

export async function listPhilosophers() {
  const db = getReadClient();
  const [{ data, error }, all] = await Promise.all([
    db.from("philosophers").select("*").order("name"),
    listQuestionSummaries(),
  ]);
  if (error) throw new Error(error.message);
  const stats = philosopherStats(all);
  return ((data ?? []) as Philosopher[]).map((p) => ({
    ...p,
    count: stats.get(p.id)?.count ?? 0,
    lastYear: stats.get(p.id)?.lastYear ?? null,
  }));
}

function philosopherStats(all: QuestionSummary[]) {
  const m = new Map<string, { count: number; lastYear: number | null }>();
  for (const q of all) {
    for (const p of q.philosophers) {
      const cur = m.get(p.id) ?? { count: 0, lastYear: null };
      cur.count++;
      cur.lastYear = Math.max(cur.lastYear ?? 0, q.exam.exam_year);
      m.set(p.id, cur);
    }
  }
  return m;
}

export async function getPhilosopher(id: string) {
  const db = getReadClient();
  const { data: philosopher } = await db.from("philosophers").select("*").eq("id", id).maybeSingle();
  if (!philosopher) return null;
  const [links, sources, conceptLinks] = await Promise.all([
    db.from("question_philosophers").select("question_id, role, reasoning").eq("philosopher_id", id),
    db.from("sources").select("*").eq("philosopher_id", id).order("title"),
    db.from("concept_philosophers").select("concepts(id, name)").eq("philosopher_id", id),
  ]);
  const questionIds = (links.data ?? []).map((l) => l.question_id as string);
  const questions = await listQuestionSummaries({ ids: questionIds });

  // 개념: 직접 연결 + 이 사상가가 main 으로 나온 문항의 개념
  const conceptCount = new Map<string, { id: string; name: string; count: number }>();
  for (const c of conceptLinks.data ?? []) {
    const cc = one(c.concepts as unknown as { id: string; name: string });
    if (cc) conceptCount.set(cc.id, { ...cc, count: 0 });
  }
  const coPhilosophers = new Map<string, { id: string; name: string; count: number }>();
  const sourceCount = new Map<string, { id: string; title: string; count: number }>();
  for (const s of (sources.data ?? []) as Source[]) sourceCount.set(s.id, { id: s.id, title: s.title, count: 0 });
  for (const q of questions) {
    for (const c of q.concepts) {
      const cur = conceptCount.get(c.id) ?? { ...c, count: 0 };
      cur.count++;
      conceptCount.set(c.id, cur);
    }
    for (const p of q.philosophers) {
      if (p.id === id) continue;
      const cur = coPhilosophers.get(p.id) ?? { id: p.id, name: p.name, count: 0 };
      cur.count++;
      coPhilosophers.set(p.id, cur);
    }
    for (const s of q.sources) {
      const cur = sourceCount.get(s.id) ?? { ...s, count: 0 };
      cur.count++;
      sourceCount.set(s.id, cur);
    }
  }
  const reasoning = (links.data ?? [])
    .flatMap((l) => ((l.reasoning as { decisiveExpressions?: string[] })?.decisiveExpressions ?? []))
    .filter(Boolean);

  return {
    philosopher: philosopher as Philosopher,
    questions,
    concepts: [...conceptCount.values()].sort((a, b) => b.count - a.count),
    sources: [...sourceCount.values()].sort((a, b) => b.count - a.count),
    coPhilosophers: [...coPhilosophers.values()].sort((a, b) => b.count - a.count),
    decisiveExpressions: [...new Set(reasoning)].slice(0, 30),
    lastYear: questions.length ? Math.max(...questions.map((q) => q.exam.exam_year)) : null,
  };
}

export async function listConcepts() {
  const db = getReadClient();
  const [{ data, error }, all] = await Promise.all([db.from("concepts").select("*").order("name"), listQuestionSummaries()]);
  if (error) throw new Error(error.message);
  const m = new Map<string, { count: number; lastYear: number | null; philosophers: Set<string> }>();
  for (const q of all) {
    for (const c of q.concepts) {
      const cur = m.get(c.id) ?? { count: 0, lastYear: null, philosophers: new Set<string>() };
      cur.count++;
      cur.lastYear = Math.max(cur.lastYear ?? 0, q.exam.exam_year);
      q.philosophers.filter((p) => p.role === "main").forEach((p) => cur.philosophers.add(p.name));
      m.set(c.id, cur);
    }
  }
  return ((data ?? []) as Concept[]).map((c) => ({
    ...c,
    count: m.get(c.id)?.count ?? 0,
    lastYear: m.get(c.id)?.lastYear ?? null,
    philosophers: [...(m.get(c.id)?.philosophers ?? [])],
  }));
}

export async function getConcept(id: string) {
  const db = getReadClient();
  const { data: concept } = await db.from("concepts").select("*").eq("id", id).maybeSingle();
  if (!concept) return null;
  const [links, direct] = await Promise.all([
    db.from("question_concepts").select("question_id").eq("concept_id", id),
    db.from("concept_philosophers").select("philosophers(id, name)").eq("concept_id", id),
  ]);
  const questions = await listQuestionSummaries({ ids: (links.data ?? []).map((l) => l.question_id as string) });
  const philosophers = new Map<string, { id: string; name: string; count: number }>();
  for (const d of direct.data ?? []) {
    const p = one(d.philosophers as unknown as { id: string; name: string });
    if (p) philosophers.set(p.id, { ...p, count: 0 });
  }
  const sources = new Map<string, { id: string; title: string; count: number }>();
  for (const q of questions) {
    for (const p of q.philosophers.filter((x) => x.role === "main" || x.role === "comparison")) {
      const cur = philosophers.get(p.id) ?? { id: p.id, name: p.name, count: 0 };
      cur.count++;
      philosophers.set(p.id, cur);
    }
    for (const s of q.sources) {
      const cur = sources.get(s.id) ?? { ...s, count: 0 };
      cur.count++;
      sources.set(s.id, cur);
    }
  }
  // 유사/혼동 개념 이름 → id 매핑 (DB 에 있으면 링크)
  const relatedNames = [...(concept.similar_concepts ?? []), ...(concept.confusable_concepts ?? [])];
  const { data: relatedRows } = relatedNames.length
    ? await db.from("concepts").select("id, name").in("name", relatedNames)
    : { data: [] as { id: string; name: string }[] };
  return {
    concept: concept as Concept,
    questions,
    philosophers: [...philosophers.values()].sort((a, b) => b.count - a.count),
    sources: [...sources.values()].sort((a, b) => b.count - a.count),
    relatedIds: Object.fromEntries((relatedRows ?? []).map((r) => [r.name, r.id])) as Record<string, string>,
    lastYear: questions.length ? Math.max(...questions.map((q) => q.exam.exam_year)) : null,
  };
}

export async function listSources() {
  const db = getReadClient();
  const { data, error } = await db.from("sources").select("*, philosophers(id, name), question_sources(question_id)").order("title");
  if (error) throw new Error(error.message);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return (data ?? []).map((s: any) => ({
    ...(s as Source),
    philosopher: one<{ id: string; name: string }>(s.philosophers),
    count: new Set(many<any>(s.question_sources).map((x) => x.question_id)).size,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function getSource(id: string) {
  const db = getReadClient();
  const { data: source } = await db.from("sources").select("*, philosophers(id, name)").eq("id", id).maybeSingle();
  if (!source) return null;
  const [links, passages] = await Promise.all([
    db.from("question_sources").select("*").eq("source_id", id),
    db.from("source_passages").select("*").eq("source_id", id).order("created_at"),
  ]);
  const linkRows = (links.data ?? []) as QuestionSourceLink[];
  const questions = await listQuestionSummaries({ ids: [...new Set(linkRows.map((l) => l.question_id))] });
  const conceptCount = new Map<string, { id: string; name: string; count: number }>();
  for (const q of questions)
    for (const c of q.concepts) {
      const cur = conceptCount.get(c.id) ?? { ...c, count: 0 };
      cur.count++;
      conceptCount.set(c.id, cur);
    }
  const { philosophers, ...rest } = source as Source & { philosophers: unknown };
  return {
    source: rest as Source,
    philosopher: one(philosophers as { id: string; name: string } | null),
    links: linkRows,
    passages: (passages.data ?? []) as SourcePassage[],
    questions,
    concepts: [...conceptCount.values()].sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------
// 통합 검색
// ---------------------------------------------------------------------

export async function searchAll(raw: string) {
  const q = sanitizeSearch(raw);
  const empty = { q, philosophers: [], concepts: [], sources: [], questions: [] as QuestionSummary[], exams: [] as Exam[] };
  if (!q) return empty;
  const db = getReadClient();
  const like = `%${q}%`;
  const year = /^\d{4}$/.test(q) ? Number(q) : null;

  const [philosophers, concepts, sources, qText, qAnalysis, exams] = await Promise.all([
    db
      .from("philosophers")
      .select("*")
      .or(`name.ilike.${like},school.ilike.${like},core_ideas.ilike.${like},aliases.cs.{${q}}`)
      .limit(20),
    db.from("concepts").select("*").or(`name.ilike.${like},definition.ilike.${like},aliases.cs.{${q}}`).limit(30),
    db.from("sources").select("*").or(`title.ilike.${like},summary.ilike.${like}`).limit(20),
    db.from("questions").select("id").ilike("question_text", like).limit(100),
    db
      .from("question_analysis")
      .select("question_id")
      .or(`answer.ilike.${like},answer_explanation.ilike.${like},question_intent.ilike.${like},area.ilike.${like}`)
      .limit(100),
    year ? db.from("exams").select("*").eq("exam_year", year) : Promise.resolve({ data: [] as Exam[] }),
  ]);

  const ids = new Set<string>([
    ...(qText.data ?? []).map((r) => r.id as string),
    ...(qAnalysis.data ?? []).map((r) => r.question_id as string),
  ]);
  // 검색어와 일치하는 사상가 / 개념의 기출도 함께 보여준다.
  const pIds = (philosophers.data ?? []).map((p) => p.id);
  const cIds = (concepts.data ?? []).map((c) => c.id);
  const [pq, cq] = await Promise.all([
    pIds.length ? db.from("question_philosophers").select("question_id").in("philosopher_id", pIds) : { data: [] },
    cIds.length ? db.from("question_concepts").select("question_id").in("concept_id", cIds) : { data: [] },
  ]);
  for (const r of [...(pq.data ?? []), ...(cq.data ?? [])]) ids.add((r as { question_id: string }).question_id);
  const examIds = new Set(((exams.data ?? []) as Exam[]).map((e) => e.id));

  let questions = await listQuestionSummaries({ ids: [...ids].slice(0, 300) });
  if (examIds.size) {
    const byExam = await Promise.all([...examIds].map((id) => listQuestionSummaries({ examId: id })));
    const merged = new Map(questions.map((x) => [x.id, x]));
    byExam.flat().forEach((x) => merged.set(x.id, x));
    questions = sortSummaries([...merged.values()]);
  }

  return {
    q,
    philosophers: (philosophers.data ?? []) as Philosopher[],
    concepts: (concepts.data ?? []) as Concept[],
    sources: (sources.data ?? []) as Source[],
    questions,
    exams: (exams.data ?? []) as Exam[],
  };
}

// ---------------------------------------------------------------------
// 출제 경향
// ---------------------------------------------------------------------

export interface CountRow {
  id: string;
  name: string;
  count: number;
  lastYear: number;
  years: number[];
}

function bump(m: Map<string, CountRow>, id: string, name: string, year: number) {
  const cur = m.get(id) ?? { id, name, count: 0, lastYear: 0, years: [] };
  cur.count++;
  cur.lastYear = Math.max(cur.lastYear, year);
  if (!cur.years.includes(year)) cur.years.push(year);
  m.set(id, cur);
}

export function computeTrends(all: QuestionSummary[]) {
  const years = [...new Set(all.map((q) => q.exam.exam_year))].sort((a, b) => b - a);
  const latest = years[0] ?? new Date().getFullYear();
  const recentYears = years.slice(0, 5);

  const phil = new Map<string, CountRow>();
  const conc = new Map<string, CountRow>();
  const src = new Map<string, CountRow>();
  const recentConc = new Map<string, CountRow>();
  const area = new Map<string, number>();
  const areaBySection: Record<string, Map<string, number>> = { A: new Map(), B: new Map() };
  const yearPhil = new Map<number, Map<string, number>>();

  for (const q of all) {
    const y = q.exam.exam_year;
    for (const p of q.philosophers) {
      if (p.role === "distractor" || p.role === "mentioned") continue;
      bump(phil, p.id, p.name, y);
      const ym = yearPhil.get(y) ?? new Map();
      ym.set(p.id, (ym.get(p.id) ?? 0) + 1);
      yearPhil.set(y, ym);
    }
    for (const c of q.concepts) {
      bump(conc, c.id, c.name, y);
      if (recentYears.includes(y)) bump(recentConc, c.id, c.name, y);
    }
    for (const s of q.sources) bump(src, s.id, s.title, y);
    const a = q.analysis?.area ?? "미분류";
    area.set(a, (area.get(a) ?? 0) + 1);
    if (q.exam.section) {
      const m = areaBySection[q.exam.section];
      m.set(a, (m.get(a) ?? 0) + 1);
    }
  }

  const sortRows = (m: Map<string, CountRow>) => [...m.values()].sort((a, b) => b.count - a.count || b.lastYear - a.lastYear);
  const philosopherCounts = sortRows(phil);

  return {
    years,
    recentYears,
    philosopherCounts,
    conceptCounts: sortRows(conc),
    sourceCounts: sortRows(src),
    recentConceptCounts: sortRows(recentConc),
    repeatedConcepts: sortRows(conc).filter((c) => c.years.length >= 2),
    // 과거에 출제됐지만 최근 5개 학년도에는 나오지 않은 사상가
    dormantPhilosophers: philosopherCounts
      .filter((p) => !recentYears.includes(p.lastYear) && p.lastYear < latest)
      .sort((a, b) => a.lastYear - b.lastYear),
    areaCounts: [...area.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    areaBySection: Object.fromEntries(
      Object.entries(areaBySection).map(([k, m]) => [k, [...m.entries()].map(([name, count]) => ({ name, count }))]),
    ) as Record<"A" | "B", { name: string; count: number }[]>,
    yearPhilosopher: Object.fromEntries([...yearPhil.entries()].map(([y, m]) => [y, Object.fromEntries(m)])) as Record<
      number,
      Record<string, number>
    >,
    total: all.length,
  };
}

export async function getTrends() {
  const all = await listQuestionSummaries();
  return computeTrends(all);
}
