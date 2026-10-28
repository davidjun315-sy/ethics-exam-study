import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { classifyPhilosopher, classifyTradition, UNCLASSIFIED } from "@/lib/traditions";
import type { AnalysisDetails } from "@/lib/types";
import { listQuestionSummaries, type QuestionSummary } from "@/lib/data/queries";
import { seedAcceptedAnswers } from "./grade.ts";
import { dedupeKey, expectedFromAnalysis, expectedFromPractice, splitQuestion, type ExpectedItem, type SplitItem } from "./split.ts";

/**
 * 퀴즈 문제은행 동기화.
 * - 분석된 기출 문항을 세부 문제로 나누고, 분석의 예상 문제·출제 예측 예상 문제를 가져온다.
 * - key 로 이미 있는 문제를 찾아 갱신한다 → 문제 id 가 유지되어 학습 기록이 그대로 이어진다.
 * - 관리자가 고친 문제(edited)는 덮어쓰지 않고 "원본 분석 변경됨" 표시만 한다.
 * - 원본에서 사라진 문제는 지우지 않고 stale(출제 중지)로 둔다.
 * - 기존 기출·분석 데이터는 읽기만 한다.
 */

export interface QuizItemRow {
  id: string;
  key: string;
  kind: "exam" | "expected";
  origin: "analysis" | "practice" | "manual";
  question_id: string | null;
  practice_question_id: string | null;
  label: string;
  format: "fill" | "essay";
  grading: "auto" | "self";
  prompt: string | null;
  passage: string | null;
  answer: string | null;
  accepted_answers: string[];
  model_answer: string | null;
  explanation: string | null;
  area: string | null;
  philosopher_names: string[];
  concept_names: string[];
  exam_year: number | null;
  difficulty: 1 | 2 | 3;
  status: "pending" | "approved" | "hidden" | "stale";
  review_reasons: string[];
  source_hash: string | null;
  source_changed: boolean;
  edited: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface QuizSettings {
  daily_total: number;
  daily_exam: number;
  daily_expected: number;
  daily_review: number;
  auto_approve_exam: boolean;
}

export const DEFAULT_SETTINGS: QuizSettings = { daily_total: 10, daily_exam: 6, daily_expected: 2, daily_review: 2, auto_approve_exam: true };
export const MIGRATION_HINT = "퀴즈 테이블이 없습니다. Supabase SQL Editor 에서 supabase/migrations/005_quiz.sql 을 실행하세요.";

export function quizError(message: string): Error {
  return new Error(/quiz_/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message) ? MIGRATION_HINT : message);
}

export async function getQuizSettings(): Promise<QuizSettings> {
  const { data, error } = await getAdminClient().from("quiz_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw quizError(error.message);
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

const ANALYZED = ["analyzed", "needs_review", "verified"];

/** 문항의 섹터: 분석 영역 → 주요 사상가 */
export function sectorOf(area: string | null | undefined, philosophers: { name: string; role: string }[]): string {
  const byArea = classifyTradition(area);
  if (byArea !== UNCLASSIFIED) return byArea;
  const main = philosophers.find((p) => p.role === "main") ?? philosophers[0];
  return main ? classifyPhilosopher({ name: main.name, tradition: null }) : UNCLASSIFIED;
}

function meta(s: QuestionSummary) {
  const ph = s.philosophers.filter((p) => p.role === "main" || p.role === "comparison");
  return {
    area: sectorOf(s.analysis?.area, s.philosophers),
    philosopher_names: (ph.length ? ph : s.philosophers).map((p) => p.name),
    concept_names: s.concepts.map((c) => c.name),
    exam_year: s.exam.exam_year,
  };
}

async function loadAnalyzed(questionIds?: string[]) {
  const db = getAdminClient();
  let q = db.from("question_analysis").select("question_id, status, answer, difficulty, area, details").in("status", ANALYZED);
  if (questionIds) q = q.in("question_id", questionIds);
  const { data, error } = await q.limit(10000);
  if (error) throw new Error(error.message);
  const analyses = (data ?? []) as { question_id: string; answer: string | null; difficulty: "상" | "중" | "하" | null; area: string | null; details: AnalysisDetails }[];
  const summaries = await listQuestionSummaries({ ids: analyses.map((a) => a.question_id) });
  const byId = new Map(summaries.map((s) => [s.id, s]));
  return analyses.filter((a) => byId.has(a.question_id)).map((a) => ({ a, s: byId.get(a.question_id)! }));
}

/** 여러 줄을 한 번에 넣을 때 PostgREST 는 빠진 열을 기본값이 아니라 NULL 로 넣는다 → 모든 열을 채워 둔다 */
const ROW_DEFAULTS = {
  origin: "analysis",
  question_id: null,
  practice_question_id: null,
  label: "",
  prompt: null,
  passage: null,
  answer: null,
  accepted_answers: [] as string[],
  model_answer: null,
  explanation: null,
  area: null,
  philosopher_names: [] as string[],
  concept_names: [] as string[],
  exam_year: null,
  difficulty: 2,
  sort_order: 0,
};

interface Planned {
  key: string;
  row: Record<string, unknown>;
  hash: string;
  reasons: string[];
  kind: "exam" | "expected";
  questionId: string | null;
  dedupe?: string;
}

function planExam(s: QuestionSummary, a: { answer: string | null; difficulty: "상" | "중" | "하" | null; area: string | null; details: AnalysisDetails }): Planned[] {
  const m = meta(s);
  const items: SplitItem[] = splitQuestion({
    questionId: s.id,
    questionLabel: s.label,
    questionText: s.question_text,
    questionType: s.question_type,
    examYear: s.exam.exam_year,
    answer: a.answer,
    difficulty: a.difficulty,
    area: a.area,
    details: a.details ?? {},
    philosophers: m.philosopher_names,
    concepts: m.concept_names,
  });
  return items.map((it) => ({
    key: it.key,
    hash: it.sourceHash,
    reasons: it.reviewReasons,
    kind: "exam",
    questionId: s.id,
    row: {
      key: it.key,
      kind: "exam",
      origin: "analysis",
      question_id: s.id,
      label: it.label,
      format: it.format,
      grading: it.grading,
      prompt: it.prompt,
      answer: it.answer,
      accepted_answers: it.acceptedAnswers,
      difficulty: it.difficulty,
      sort_order: it.sortOrder,
      ...m,
    },
  }));
}

function planExpected(s: QuestionSummary | null, x: ExpectedItem, extra: Record<string, unknown>): Planned {
  return {
    key: x.key,
    hash: x.sourceHash,
    reasons: x.reviewReasons,
    kind: "expected",
    questionId: s?.id ?? null,
    dedupe: x.dedupeKey,
    row: {
      key: x.key,
      kind: "expected",
      label: x.label,
      format: x.format,
      grading: x.grading,
      passage: x.passage,
      answer: x.answer,
      model_answer: x.modelAnswer,
      explanation: x.explanation,
      accepted_answers: x.acceptedAnswers,
      difficulty: 2,
      ...(s ? meta(s) : {}),
      ...extra,
    },
  };
}

export interface SyncResult {
  created: number;
  updated: number;
  changed: number; // 관리자가 고친 문제인데 원본이 바뀜
  stale: number;
  expected: number;
  duplicates: number;
}

/**
 * 문제은행 동기화. questionIds 를 주면 그 문항만 (분석 저장 직후 자동 반영용).
 */
export async function syncQuizBank(opts: { questionIds?: string[]; includePractice?: boolean } = {}): Promise<SyncResult> {
  const db = getAdminClient();
  const settings = await getQuizSettings();
  const rows = await loadAnalyzed(opts.questionIds);
  const planned: Planned[] = [];
  for (const { a, s } of rows) {
    planned.push(...planExam(s, a));
    for (const ext of a.details?.futureExtensions ?? []) {
      const x = expectedFromAnalysis(s.id, ext);
      if (x) planned.push(planExpected(s, x, { origin: "analysis", question_id: s.id }));
    }
  }
  if (opts.includePractice !== false && !opts.questionIds) {
    const { data: practice } = await db.from("practice_questions").select("id, passage, question, conditions, model_answer, rationale, related_question_ids").limit(2000);
    for (const p of practice ?? []) {
      const x = expectedFromPractice(p as Parameters<typeof expectedFromPractice>[0]);
      const rel = ((p.related_question_ids as string[]) ?? [])[0] ?? null;
      planned.push(planExpected(null, x, { origin: "practice", practice_question_id: p.id, question_id: rel }));
    }
  }

  // 기존 문제 (키 / 해당 문항)
  const keys = planned.map((p) => p.key);
  const existing = new Map<string, QuizItemRow>();
  for (let i = 0; i < keys.length; i += 300) {
    const { data, error } = await db.from("quiz_items").select("*").in("key", keys.slice(i, i + 300));
    if (error) throw quizError(error.message);
    for (const r of (data ?? []) as QuizItemRow[]) existing.set(r.key, r);
  }
  // 중복 검사용: 이미 있는 예상 문제의 본문 키
  const { data: expRows, error: expErr } = await db.from("quiz_items").select("key, passage").eq("kind", "expected");
  if (expErr) throw quizError(expErr.message);
  const dedupe = new Map<string, string>();
  for (const r of expRows ?? []) if (r.passage) dedupe.set(dedupeKey(r.passage as string), r.key as string);

  const result: SyncResult = { created: 0, updated: 0, changed: 0, stale: 0, expected: 0, duplicates: 0 };
  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  for (const p of planned) {
    const cur = existing.get(p.key);
    const reasons = [...p.reasons];
    if (p.dedupe) {
      const other = dedupe.get(p.dedupe);
      if (other && other !== p.key) {
        reasons.push("다른 예상 문제와 본문이 거의 같습니다 (중복 의심)");
        result.duplicates++;
      } else dedupe.set(p.dedupe, p.key);
    }
    if (!cur) {
      const autoOk = p.kind === "exam" && settings.auto_approve_exam && reasons.length === 0;
      inserts.push({ ...ROW_DEFAULTS, ...p.row, review_reasons: reasons, source_hash: p.hash, status: autoOk ? "approved" : "pending" });
      result.created++;
      if (p.kind === "expected") result.expected++;
      continue;
    }
    if (cur.source_hash === p.hash && cur.status !== "stale") continue;
    if (cur.edited) {
      if (!cur.source_changed && cur.source_hash !== p.hash) {
        await db.from("quiz_items").update({ source_changed: true, updated_at: now }).eq("id", cur.id);
        result.changed++;
      }
      continue;
    }
    // 원본이 바뀐 문제: 내용 갱신 (id 유지 → 학습 기록 유지). 관리자가 추가한 인정 표현은 남긴다
    const seeded = (p.row.accepted_answers as string[]) ?? [];
    const accepted = [...new Set([...seeded, ...cur.accepted_answers.filter((x) => !seedAcceptedAnswers(cur.answer ?? "").includes(x))])];
    const status = cur.status === "stale" ? "pending" : reasons.length && cur.status === "approved" ? "pending" : cur.status;
    const { error } = await db
      .from("quiz_items")
      .update({ ...p.row, accepted_answers: accepted, review_reasons: reasons, source_hash: p.hash, source_changed: false, status, updated_at: now })
      .eq("id", cur.id);
    if (error) throw quizError(error.message);
    result.updated++;
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await db.from("quiz_items").insert(inserts.slice(i, i + 200));
    if (error) throw quizError(error.message);
  }

  // 원본 분석에서 사라진 세부 문제 → stale (지우지 않음)
  const syncedQuestions = [...new Set(rows.map((r) => r.s.id))];
  const keySet = new Set(keys);
  for (let i = 0; i < syncedQuestions.length; i += 200) {
    const { data } = await db.from("quiz_items").select("id, key, status, edited, origin").in("question_id", syncedQuestions.slice(i, i + 200)).eq("origin", "analysis");
    const gone = (data ?? []).filter((r) => !keySet.has(r.key as string) && r.status !== "stale" && !r.edited).map((r) => r.id as string);
    if (gone.length) {
      await db.from("quiz_items").update({ status: "stale", updated_at: now }).in("id", gone);
      result.stale += gone.length;
    }
  }
  return result;
}

/** 분석 저장 직후 그 문항만 반영 (퀴즈 테이블이 없거나 실패해도 분석 저장은 그대로) */
export async function syncQuestionQuietly(questionId: string) {
  try {
    await syncQuizBank({ questionIds: [questionId], includePractice: false });
  } catch {
    // 005 마이그레이션 전이거나 일시 오류: 관리자 화면의 '동기화' 로 다시 반영할 수 있다
  }
}

export interface BankStatus {
  counts: Record<string, number>; // "exam:approved" …
  total: number;
  unsynced: { id: string; ref: string }[]; // 분석됐지만 문제은행에 없는 기출
  changed: number; // 원본 분석 변경 (관리자 수정 문제)
  openReports: number;
}

export async function getBankStatus(): Promise<BankStatus> {
  const db = getAdminClient();
  const [{ data: items, error }, { data: analyses }, { count: openReports }] = await Promise.all([
    db.from("quiz_items").select("kind, status, question_id, source_changed").limit(20000),
    db.from("question_analysis").select("question_id").in("status", ANALYZED).limit(10000),
    db.from("quiz_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  if (error) throw quizError(error.message);
  const counts: Record<string, number> = {};
  const have = new Set<string>();
  let changed = 0;
  for (const r of items ?? []) {
    counts[`${r.kind}:${r.status}`] = (counts[`${r.kind}:${r.status}`] ?? 0) + 1;
    if (r.kind === "exam" && r.question_id) have.add(r.question_id as string);
    if (r.source_changed) changed++;
  }
  const missing = (analyses ?? []).map((a) => a.question_id as string).filter((id) => !have.has(id));
  const summaries = missing.length ? await listQuestionSummaries({ ids: missing.slice(0, 200) }) : [];
  return {
    counts,
    total: items?.length ?? 0,
    unsynced: summaries.map((s) => ({ id: s.id, ref: `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " ") })),
    changed,
    openReports: openReports ?? 0,
  };
}

// ---------------------------------------------------------------------
// 관리자: 목록 · 수정 · 승인 · 설정 · 검수 요청
// ---------------------------------------------------------------------
export interface AdminItem extends QuizItemRow {
  ref: string | null;
  questionText: string | null;
  attempts: number;
}

export async function listQuizItems(f: { status?: string; kind?: string; review?: boolean; changed?: boolean; q?: string; limit?: number }): Promise<AdminItem[]> {
  const db = getAdminClient();
  let q = db.from("quiz_items").select("*").order("updated_at", { ascending: false }).limit(f.limit ?? 300);
  if (f.status) q = q.eq("status", f.status);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.review) q = q.neq("review_reasons", "{}");
  if (f.changed) q = q.eq("source_changed", true);
  if (f.q) q = q.or(`label.ilike.%${f.q.replace(/[%,()]/g, "")}%,answer.ilike.%${f.q.replace(/[%,()]/g, "")}%,prompt.ilike.%${f.q.replace(/[%,()]/g, "")}%`);
  const { data, error } = await q;
  if (error) throw quizError(error.message);
  const items = (data ?? []) as QuizItemRow[];
  const qids = [...new Set(items.map((i) => i.question_id).filter((x): x is string => Boolean(x)))];
  const [summaries, { data: att }] = await Promise.all([
    qids.length ? listQuestionSummaries({ ids: qids }) : Promise.resolve([]),
    items.length ? db.from("quiz_attempts").select("item_id").in("item_id", items.map((i) => i.id)).limit(20000) : Promise.resolve({ data: [] }),
  ]);
  const byQ = new Map(summaries.map((s) => [s.id, s]));
  const count = new Map<string, number>();
  for (const a of att ?? []) count.set(a.item_id as string, (count.get(a.item_id as string) ?? 0) + 1);
  return items.map((i) => {
    const s = i.question_id ? byQ.get(i.question_id) : undefined;
    return {
      ...i,
      ref: s ? `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " ") : null,
      questionText: s?.question_text ?? null,
      attempts: count.get(i.id) ?? 0,
    };
  });
}

const EDITABLE = ["label", "format", "grading", "prompt", "passage", "answer", "accepted_answers", "model_answer", "explanation", "difficulty", "status", "area"] as const;

/** 관리자 수정: id 는 그대로라 학습 기록이 유지된다. 내용을 고치면 edited=true (동기화가 덮어쓰지 않음) */
export async function updateQuizItem(id: string, patch: Partial<Record<(typeof EDITABLE)[number], unknown>> & { clearChanged?: boolean; clearReasons?: boolean }) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (patch[k] !== undefined) row[k] = patch[k];
  const contentEdited = EDITABLE.some((k) => k !== "status" && patch[k] !== undefined);
  if (contentEdited) row.edited = true;
  if (patch.clearChanged) row.source_changed = false;
  if (patch.clearReasons || patch.status === "approved") row.review_reasons = [];
  const { error } = await getAdminClient().from("quiz_items").update(row).eq("id", id);
  if (error) throw quizError(error.message);
}

export async function setQuizItemsStatus(ids: string[], status: "approved" | "hidden" | "pending") {
  const row: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "approved") row.review_reasons = [];
  const { error } = await getAdminClient().from("quiz_items").update(row).in("id", ids);
  if (error) throw quizError(error.message);
}

/** 관리자가 직접 추가하는 예상 문제 (승인 대기로 저장) */
export async function createManualItem(input: { passage: string; answer: string; explanation?: string; format: "fill" | "essay"; area?: string | null; questionId?: string | null }) {
  const { error, data } = await getAdminClient()
    .from("quiz_items")
    .insert({
      key: `m:${crypto.randomUUID()}`,
      kind: "expected",
      origin: "manual",
      question_id: input.questionId ?? null,
      format: input.format,
      grading: input.format === "fill" ? "auto" : "self",
      passage: input.passage,
      answer: input.answer,
      model_answer: input.answer,
      explanation: input.explanation ?? null,
      accepted_answers: input.format === "fill" ? seedAcceptedAnswers(input.answer) : [],
      area: input.area ?? null,
      status: "pending",
      edited: true,
    })
    .select("id")
    .single();
  if (error) throw quizError(error.message);
  return data.id as string;
}

export async function saveQuizSettings(s: QuizSettings) {
  const { error } = await getAdminClient()
    .from("quiz_settings")
    .upsert({ id: 1, ...s, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw quizError(error.message);
}

export interface ReportRow {
  id: string;
  item_id: string;
  answer_text: string;
  created_at: string;
  item: { label: string; answer: string | null; accepted_answers: string[]; question_id: string | null } | null;
}

export async function listOpenReports(): Promise<ReportRow[]> {
  const { data, error } = await getAdminClient()
    .from("quiz_reports")
    .select("id, item_id, answer_text, created_at, quiz_items(label, answer, accepted_answers, question_id)")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw quizError(error.message);
  return (data ?? []).map((r) => ({ ...r, item: (Array.isArray(r.quiz_items) ? r.quiz_items[0] : r.quiz_items) ?? null })) as ReportRow[];
}

/** 검수 요청 처리: 인정하면 그 표현을 정답 목록에 추가 (이미 기록된 채점 결과는 바꾸지 않음) */
export async function resolveReport(id: string, action: "accept" | "reject") {
  const db = getAdminClient();
  const { data: r, error } = await db.from("quiz_reports").select("item_id, answer_text").eq("id", id).maybeSingle();
  if (error) throw quizError(error.message);
  if (!r) throw new Error("검수 요청을 찾을 수 없습니다.");
  if (action === "accept") {
    const { data: it } = await db.from("quiz_items").select("accepted_answers").eq("id", r.item_id).single();
    const accepted = [...new Set([...((it?.accepted_answers as string[]) ?? []), r.answer_text.trim()])];
    await db.from("quiz_items").update({ accepted_answers: accepted, edited: true, updated_at: new Date().toISOString() }).eq("id", r.item_id);
  }
  await db.from("quiz_reports").update({ status: action === "accept" ? "accepted" : "rejected" }).eq("id", id);
}

export interface LearnerStat {
  learner: string;
  xp: number;
  streak: number;
  best_streak: number;
  total_answered: number;
  last_completed_day: string | null;
  start_level: string;
  accuracy: number | null;
  selfRated: number;
}

export async function listLearnerStats(): Promise<LearnerStat[]> {
  const db = getAdminClient();
  const [{ data: profiles, error }, { data: attempts }] = await Promise.all([
    db.from("quiz_profiles").select("*"),
    db.from("quiz_attempts").select("learner, result, graded_by").limit(50000),
  ]);
  if (error) throw quizError(error.message);
  return (profiles ?? []).map((p) => {
    const mine = (attempts ?? []).filter((a) => a.learner === p.learner);
    const auto = mine.filter((a) => a.graded_by === "auto");
    return {
      learner: p.learner,
      xp: p.xp,
      streak: p.streak,
      best_streak: p.best_streak,
      total_answered: p.total_answered,
      last_completed_day: p.last_completed_day,
      start_level: p.start_level,
      accuracy: auto.length ? auto.filter((a) => a.result === "correct").length / auto.length : null,
      selfRated: mine.length - auto.length,
    };
  });
}
