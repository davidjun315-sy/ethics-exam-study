import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { classifyPhilosopher, classifyTradition, UNCLASSIFIED } from "@/lib/traditions";
import type { AnalysisDetails } from "@/lib/types";
import { listQuestionSummaries, type QuestionSummary } from "@/lib/data/queries";
import { seedAcceptedAnswers } from "./grade.ts";
import { chunks, fetchAll, fetchIn } from "./paged.ts";
import { dedupeKey, expectedFromAnalysis, hashText, splitQuestion, type ExpectedItem, type SplitItem } from "./split.ts";
import { buildPracticeItems, type PracticePayload } from "./practice.ts";
import { buildPracticeAiPrompt, PracticeAiSchema, toAiPracticeItems } from "./practice-ai.ts";
import { validatePasted } from "@/lib/ai/lenient";

/**
 * 퀴즈 문제은행 동기화.
 * - 문항별 AI 분석의 "요구 사항별 해설"로 기출을 세부 문제로 나누고, "향후 출제"의 예상 문제를 가져온다.
 * - key 로 이미 있는 문제를 찾아 갱신한다 → 문제 id 가 유지되어 학습 기록이 그대로 이어진다.
 * - 관리자가 고친 문제(edited)는 덮어쓰지 않고 "원본 분석 변경됨" 표시만 한다.
 * - 원본에서 사라진 문제는 지우지 않고 stale(출제 중지)로 둔다.
 * - 기존 기출·분석 데이터는 읽기만 한다.
 */

export interface QuizItemRow {
  id: string;
  key: string;
  kind: QuizKind;
  origin: "analysis" | "practice" | "manual" | "full";
  question_id: string | null;
  practice_question_id: string | null;
  label: string;
  format: QuizFormat;
  grading: "auto" | "self";
  prompt: string | null;
  passage: string | null;
  payload?: PracticePayload | null; // 011: 연습문제 (보기·정답·해설)
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

/** exam = 실제 기출 세부 문제 · expected = AI 예상 문제 · practice = 기출 기반 연습문제 (011) */
export type QuizKind = "exam" | "expected" | "practice";
/** choice·multi·classify 는 연습문제 (011) */
export type QuizFormat = "fill" | "essay" | "choice" | "multi" | "classify";

export interface QuizSettings {
  daily_total: number;
  daily_exam: number;
  daily_expected: number;
  daily_review: number;
  auto_approve_exam: boolean;
  signup_open: boolean;
}

export const DEFAULT_SETTINGS: QuizSettings = { daily_total: 10, daily_exam: 6, daily_expected: 2, daily_review: 2, auto_approve_exam: true, signup_open: true };
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

type AnalysisRow = { question_id: string; status: string; answer: string | null; difficulty: "상" | "중" | "하" | null; area: string | null; details: AnalysisDetails; common_mistakes: string[] | null };

async function loadAnalyzed(questionIds?: string[]) {
  const db = getAdminClient();
  const cols = "question_id, status, answer, difficulty, area, details, common_mistakes";
  const analyses = questionIds
    ? await fetchIn<AnalysisRow>(questionIds, (part) => db.from("question_analysis").select(cols).in("status", ANALYZED).in("question_id", part))
    : await fetchAll<AnalysisRow>((from, to) => db.from("question_analysis").select(cols).in("status", ANALYZED).order("question_id").range(from, to));
  // 전체 동기화는 문항 목록을 한 번에 (id 목록을 URL 에 싣지 않음)
  const summaries = questionIds ? await listQuestionSummaries({ ids: questionIds }) : await listQuestionSummaries();
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
  kind: QuizKind;
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

/**
 * 완전 기출 (023): 기출 문항 전체를 한 문제로 (서술형 · 스스로 채점, 모범답안 · 모든 해설).
 * 정답이 분석에 있을 때만. 풀이 화면은 문항 원문 전체를 보여 준다.
 */
function planFull(s: QuestionSummary, a: { answer: string | null; difficulty: "상" | "중" | "하" | null; area: string | null; details: AnalysisDetails }): Planned | null {
  const answer = a.answer?.trim();
  if (!answer || !s.question_text?.trim()) return null;
  const m = meta(s);
  const key = `full:${s.id}`;
  const prompt = "문항 전체를 <작성 방법>(조건)에 따라 시험 답안처럼 서술하시오.";
  return {
    key,
    hash: hashText(`full|${answer}|${a.details?.modelAnswer ?? ""}|${s.question_text}`),
    reasons: [],
    kind: "exam",
    questionId: s.id,
    row: {
      key,
      kind: "exam",
      origin: "full",
      question_id: s.id,
      label: "전체",
      format: "essay",
      grading: "self",
      prompt,
      answer,
      model_answer: a.details?.modelAnswer ?? null,
      accepted_answers: [],
      difficulty: a.difficulty === "상" ? 3 : a.difficulty === "하" ? 1 : 2,
      sort_order: -1,
      ...m,
    },
  };
}

/** 완전 기출을 저장할 수 있나 (023: real_unit 열과 함께 origin 'full' 이 허용됨) */
export async function fullItemsReady(): Promise<boolean> {
  const { error } = await getAdminClient().from("quiz_profiles").select("real_unit").limit(1);
  return !error;
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

/** 기출 기반 연습문제 (011): 그 문항의 저장된 분석으로만 만든다 */
function planPractice(s: QuestionSummary, a: AnalysisRow): Planned[] {
  const m = meta(s);
  // 한 문항의 분석 형식이 어긋나도 전체 동기화는 계속한다 (그 문항의 연습문제만 건너뜀)
  let built: ReturnType<typeof buildPracticeItems>;
  try {
    built = buildPracticeItems({
    questionId: s.id,
    questionText: s.question_text,
    details: a.details ?? {},
    commonMistakes: a.common_mistakes ?? [],
    needsReview: a.status === "needs_review",
    });
  } catch (e) {
    console.error(`[quiz] 연습문제 생성 건너뜀 (${s.id}):`, e instanceof Error ? e.message : e);
    return [];
  }
  return built.map((it) => ({
    key: it.key,
    hash: it.sourceHash,
    reasons: it.reviewReasons,
    kind: "practice",
    questionId: s.id,
    row: {
      key: it.key,
      kind: "practice",
      origin: "analysis",
      question_id: s.id,
      label: it.label,
      format: it.format,
      grading: "auto",
      prompt: it.prompt,
      answer: it.answer,
      accepted_answers: it.acceptedAnswers,
      payload: it.payload,
      difficulty: it.difficulty,
      sort_order: 1000 + it.sortOrder,
      ...m,
    },
  }));
}

/** 011 마이그레이션(연습문제)이 적용됐는지: payload 열이 있으면 적용된 것 */
export async function practiceReady(): Promise<boolean> {
  const { error } = await getAdminClient().from("quiz_items").select("payload").limit(1);
  return !error;
}

export interface SyncResult {
  created: number;
  updated: number;
  changed: number; // 관리자가 고친 문제인데 원본이 바뀜
  stale: number;
  expected: number;
  practice: number; // 새로 만든 연습문제
  duplicates: number;
}

/**
 * 문제은행 동기화. questionIds 를 주면 그 문항만 (분석 저장 직후 자동 반영용).
 */
export async function syncQuizBank(opts: { questionIds?: string[] } = {}): Promise<SyncResult> {
  const db = getAdminClient();
  const settings = await getQuizSettings();
  const [rows, withPractice, withFull] = await Promise.all([loadAnalyzed(opts.questionIds), practiceReady(), fullItemsReady()]);
  const planned: Planned[] = [];
  for (const { a, s } of rows) {
    planned.push(...planExam(s, a));
    const f = withFull ? planFull(s, a) : null;
    if (f) planned.push(f);
    if (withPractice) planned.push(...planPractice(s, a));
    for (const ext of a.details?.futureExtensions ?? []) {
      const x = expectedFromAnalysis(s.id, ext);
      if (x) planned.push(planExpected(s, x, { origin: "analysis", question_id: s.id }));
    }
  }

  // 같은 키가 두 번 계획된 경우 (비슷한 예상 문제 두 개, 같은 레이블 두 번 등): 내용이 같으면 하나만, 다르면 순번을 붙인다
  const seenKeys = new Map<string, string>();
  const uniquePlanned: Planned[] = [];
  for (const p of planned) {
    const prev = seenKeys.get(p.key);
    if (prev === undefined) {
      seenKeys.set(p.key, p.hash);
      uniquePlanned.push(p);
      continue;
    }
    if (prev === p.hash) continue;
    let n = 2;
    while (seenKeys.has(`${p.key}:${n}`)) n++;
    const key = `${p.key}:${n}`;
    seenKeys.set(key, p.hash);
    uniquePlanned.push({ ...p, key, row: { ...p.row, key } });
  }
  planned.splice(0, planned.length, ...uniquePlanned);

  // 기존 문제: 전체 동기화는 문제은행 전체를, 문항 동기화는 그 문항의 문제만 읽는다 (키 목록을 URL 에 싣지 않음)
  const current = opts.questionIds
    ? await fetchIn<QuizItemRow>(opts.questionIds, (part) => db.from("quiz_items").select("*").in("question_id", part))
    : await fetchAll<QuizItemRow>((from, to) => db.from("quiz_items").select("*").order("id").range(from, to));
  const existing = new Map(current.map((r) => [r.key, r]));
  // 중복 검사용: 이미 있는 예상 문제의 본문 키
  const expRows = await fetchAll<{ key: string; passage: string | null }>((from, to) =>
    db.from("quiz_items").select("key, passage").eq("kind", "expected").order("key").range(from, to),
  );
  const dedupe = new Map<string, string>();
  for (const r of expRows) if (r.passage) dedupe.set(dedupeKey(r.passage), r.key);

  const result: SyncResult = { created: 0, updated: 0, changed: 0, stale: 0, expected: 0, practice: 0, duplicates: 0 };
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
      // 기출 세부 문제·연습문제는 저장된 분석에서 규칙으로 만든 것 → 검토 사유가 없으면 자동 승인 설정을 따른다
      const autoOk = (p.kind === "exam" || p.kind === "practice") && settings.auto_approve_exam && reasons.length === 0;
      inserts.push({ ...ROW_DEFAULTS, ...(withPractice ? { payload: null } : {}), ...p.row, review_reasons: reasons, source_hash: p.hash, status: autoOk ? "approved" : "pending" });
      result.created++;
      if (p.kind === "expected") result.expected++;
      if (p.kind === "practice") result.practice++;
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
  // 이미 있는 키는 건너뛴다 (동시에 동기화하거나 읽는 사이 생긴 문제와 겹쳐도 실패하지 않게. 기존 문제는 덮어쓰지 않음)
  for (const part of chunks(inserts, 100)) {
    const { error } = await db.from("quiz_items").upsert(part, { onConflict: "key", ignoreDuplicates: true });
    if (error) throw quizError(error.message);
  }

  // 원본 분석에서 사라진 세부 문제 → stale (지우지 않음, 학습 기록 보존)
  const synced = new Set(rows.map((r) => r.s.id));
  const keySet = new Set(planned.map((p) => p.key));
  const gone = current
    .filter((r) => (r.origin === "analysis" || (withFull && r.origin === "full")) && r.question_id && synced.has(r.question_id) && !keySet.has(r.key) && r.status !== "stale" && !r.edited)
    .map((r) => r.id);
  for (const part of chunks(gone)) {
    const { error } = await db.from("quiz_items").update({ status: "stale", updated_at: now }).in("id", part);
    if (error) throw quizError(error.message);
  }
  result.stale = gone.length;
  return result;
}

/** 분석 저장 직후 그 문항만 반영 (퀴즈 테이블이 없거나 실패해도 분석 저장은 그대로) */
export async function syncQuestionQuietly(questionId: string) {
  try {
    await syncQuizBank({ questionIds: [questionId] });
  } catch {
    // 005 마이그레이션 전이거나 일시 오류: 관리자 화면의 '동기화' 로 다시 반영할 수 있다
  }
}

export interface BankStatus {
  counts: Record<string, number>; // "exam:approved" …
  total: number;
  unsynced: { id: string; ref: string }[]; // 요구 사항별 해설이 있는데 문제은행에 없는 기출
  needsAnalysis: { id: string; ref: string }[]; // 분석은 됐지만 요구 사항별 해설이 없음 → 재분석 필요
  changed: number; // 원본 분석 변경 (관리자 수정 문제)
  openReports: number;
  /** 연도별 반영 현황 (최근 연도 먼저) */
  years: YearCoverage[];
}

export interface YearCoverage {
  year: number;
  questions: number; // 등록된 문항
  analyzed: number; // AI 분석 완료
  ready: number; // 요구 사항별 해설이 있어 퀴즈로 만들 수 있는 문항
  inBank: number; // 그중 문제은행에 들어간 문항
  approved: number; // 공개된 퀴즈 문제 (기출 + 예상)
  pending: number; // 승인 대기 퀴즈 문제
}

const refOf = (s: QuestionSummary) => `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " ");

export async function getBankStatus(): Promise<BankStatus> {
  const db = getAdminClient();
  const [items, analyses, { count: openReports, error: re }] = await Promise.all([
    fetchAll<{ kind: string; status: string; question_id: string | null; source_changed: boolean }>((from, to) =>
      db.from("quiz_items").select("kind, status, question_id, source_changed").order("id").range(from, to),
    ),
    fetchAll<{ question_id: string; ie: unknown }>((from, to) =>
      db.from("question_analysis").select("question_id, ie:details->itemExplanations").in("status", ANALYZED).order("question_id").range(from, to),
    ),
    db.from("quiz_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]).catch((e: Error) => {
    throw quizError(e.message);
  });
  if (re) throw quizError(re.message);
  const counts: Record<string, number> = {};
  const have = new Set<string>();
  let changed = 0;
  for (const r of items) {
    counts[`${r.kind}:${r.status}`] = (counts[`${r.kind}:${r.status}`] ?? 0) + 1;
    if (r.kind === "exam" && r.question_id && r.status !== "stale") have.add(r.question_id);
    if (r.source_changed) changed++;
  }
  const withItems = analyses.filter((a) => Array.isArray(a.ie) && a.ie.length > 0).map((a) => a.question_id);
  const without = analyses.filter((a) => !(Array.isArray(a.ie) && a.ie.length > 0)).map((a) => a.question_id);
  const missing = withItems.filter((id) => !have.has(id));
  const summaries = await listQuestionSummaries();
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const refs = (ids: string[]) => ids.map((id) => byId.get(id)).filter((s): s is QuestionSummary => Boolean(s)).map((s) => ({ id: s.id, ref: refOf(s) }));

  const ready = new Set(withItems);
  const analyzedIds = new Set(analyses.map((a) => a.question_id));
  const year = new Map<number, YearCoverage>();
  const row = (y: number) => {
    if (!year.has(y)) year.set(y, { year: y, questions: 0, analyzed: 0, ready: 0, inBank: 0, approved: 0, pending: 0 });
    return year.get(y)!;
  };
  for (const s of summaries) {
    const r = row(s.exam.exam_year);
    r.questions++;
    if (analyzedIds.has(s.id)) r.analyzed++;
    if (ready.has(s.id)) r.ready++;
    if (have.has(s.id)) r.inBank++;
  }
  for (const it of items) {
    const s = it.question_id ? byId.get(it.question_id) : undefined;
    if (!s) continue;
    if (it.status === "approved") row(s.exam.exam_year).approved++;
    if (it.status === "pending") row(s.exam.exam_year).pending++;
  }
  const years = [...year.values()].sort((a, b) => b.year - a.year);
  return { counts, total: items.length, unsynced: refs(missing), needsAnalysis: refs(without), changed, openReports: openReports ?? 0, years };
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
    fetchIn<{ item_id: string }>(items.map((i) => i.id), (part) => db.from("quiz_attempts").select("item_id").in("item_id", part)).then((data) => ({ data })),
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
  for (const part of chunks(ids)) {
    const { error } = await getAdminClient().from("quiz_items").update(row).in("id", part);
    if (error) throw quizError(error.message);
  }
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
  name: string; // 회원 닉네임(아이디) / 관리자
  xp: number;
  streak: number;
  best_streak: number;
  total_answered: number;
  last_completed_day: string | null;
  start_level: string;
  question_scope?: string;
  accuracy: number | null;
  selfRated: number;
}

export async function listLearnerStats(): Promise<LearnerStat[]> {
  const db = getAdminClient();
  const [{ data: profiles, error }, attempts] = await Promise.all([
    db.from("quiz_profiles").select("*"),
    fetchAll<{ learner: string; result: string; graded_by: string }>((from, to) => db.from("quiz_attempts").select("learner, result, graded_by").order("id").range(from, to)),
  ]);
  if (error) throw quizError(error.message);
  // 학습자 키 "m:<회원 id>" → 회원 이름
  const { data: members } = await db.from("members").select("id, username, display_name");
  const nameOf = new Map((members ?? []).map((m) => [`m:${m.id}`, `${m.display_name} (${m.username})`]));
  return (profiles ?? []).map((p) => {
    const mine = (attempts ?? []).filter((a) => a.learner === p.learner);
    const auto = mine.filter((a) => a.graded_by === "auto");
    return {
      learner: p.learner,
      name: p.learner === "owner" ? "관리자" : (nameOf.get(p.learner) ?? p.learner),
      xp: p.xp,
      streak: p.streak,
      best_streak: p.best_streak,
      total_answered: p.total_answered,
      last_completed_day: p.last_completed_day,
      start_level: p.start_level,
      question_scope: p.question_scope,
      accuracy: auto.length ? auto.filter((a) => a.result === "correct").length / auto.length : null,
      selfRated: mine.length - auto.length,
    };
  });
}

// ---------------------------------------------------------------------
// 연습문제 ② 원문 해석 · ⑤ 채점 요소 (채팅 AI 붙여넣기, 011)
// ---------------------------------------------------------------------
async function practiceAiContext(questionId: string) {
  const rows = await loadAnalyzed([questionId]);
  const r = rows[0];
  if (!r) throw new Error("분석된 문항이 아닙니다. 먼저 AI 분석을 저장하세요.");
  return r;
}

export async function getPracticeAiPrompt(questionId: string): Promise<string> {
  const { a, s } = await practiceAiContext(questionId);
  return buildPracticeAiPrompt({
    ref: `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " "),
    questionText: s.question_text,
    details: a.details ?? {},
    commonMistakes: a.common_mistakes ?? [],
  });
}

/** 붙여넣은 결과를 연습문제로 저장 (승인 대기). 같은 문항에서 다시 붙여넣으면 덮어쓰고, 줄어든 문제는 출제 중지 */
export async function saveAiPractice(questionId: string, pasted: string): Promise<{ saved: number; skipped: string[] }> {
  if (!(await practiceReady())) throw new Error("연습문제 열이 없습니다. Supabase SQL Editor 에서 supabase/migrations/011_quiz_practice.sql 을 실행하세요.");
  const { s } = await practiceAiContext(questionId);
  const ai = validatePasted(PracticeAiSchema, pasted);
  const { items, skipped } = toAiPracticeItems(questionId, ai);
  if (!items.length) throw new Error(`저장할 문제가 없습니다. ${skipped.join(" / ")}`);
  const db = getAdminClient();
  const m = meta(s);
  const now = new Date().toISOString();
  const rows = items.map((it, i) => ({
    ...ROW_DEFAULTS,
    key: it.key,
    kind: "practice",
    origin: "manual", // 동기화가 '원본에서 사라짐'으로 출제 중지하지 않게
    question_id: questionId,
    label: it.label,
    format: it.format,
    grading: "auto",
    payload: it.payload,
    difficulty: 2,
    sort_order: 2000 + i,
    status: "pending",
    review_reasons: ["채팅 AI 가 만든 문제입니다. 보기·정답을 확인한 뒤 승인하세요."],
    source_hash: it.sourceHash,
    edited: false,
    updated_at: now,
    ...m,
  }));
  const { error } = await db.from("quiz_items").upsert(rows, { onConflict: "key" });
  if (error) throw quizError(error.message);
  // 이전에 붙여넣은 것 중 이번에 없는 문제는 출제 중지
  const { data: prev } = await db.from("quiz_items").select("id, key").eq("question_id", questionId).like("key", `d:${questionId}:ai:%`);
  const keep = new Set(items.map((i) => i.key));
  const gone = (prev ?? []).filter((r) => !keep.has(r.key as string)).map((r) => r.id as string);
  if (gone.length) await db.from("quiz_items").update({ status: "stale", updated_at: now }).in("id", gone);
  return { saved: items.length, skipped };
}
