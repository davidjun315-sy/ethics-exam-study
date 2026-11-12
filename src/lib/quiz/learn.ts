import "server-only";
import { isAdmin } from "@/lib/admin-guard";
import { getCurrentMember } from "@/lib/members";
import { findRelatedQuestions } from "@/lib/data/related";
import { getAdminClient } from "@/lib/supabase/server";
import { questionRef } from "@/lib/format";
import type { AnalysisDetails, Exam } from "@/lib/types";
import { getQuizSettings, quizError, type QuizItemRow } from "./bank.ts";
import { isCorrectFill } from "./grade.ts";
import { fetchAll } from "./paged.ts";
import { focusRequirement } from "./split.ts";
import { grantQuizCoins } from "@/lib/game/data";
import type { EssayContext } from "./essay.ts";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { buildMission, buildPractice, type Candidate, type ProgressLite, type Slot } from "./mission.ts";
import { areaGrowth, bestCombo, CHALLENGES, countReconquests, isReconquest, trailingCombo, type AreaGrowth, type ChallengeType } from "./game.ts";
import {
  answerXp,
  hardBonus,
  currentStreak,
  kstDay,
  levelForXp,
  missionBonus,
  addDays,
  NEW_PROGRESS,
  newBadges,
  nextReview,
  streakAfterCompletion,
  type ProgressState,
  type QuizResult,
  type StartLevel,
  inScope,
  type QuestionScope,
  type Track,
} from "./srs.ts";
import { gradePractice, publicPayload, PRACTICE_TYPE_NAMES, type PracticePayload } from "./practice.ts";
import { passageOnly } from "./split.ts";
import type { QuizFormat, QuizKind } from "./bank.ts";

/**
 * 학습자 키: 회원은 "m:<회원 id>", 회원 로그인 없이 관리자로만 들어온 경우 "owner".
 * 모든 퀴즈 기록(진도·XP·미션)은 이 키로 따로 저장된다.
 */
export async function currentLearner(): Promise<string | null> {
  const member = await getCurrentMember();
  if (member) return `m:${member.id}`;
  return (await isAdmin()) ? "owner" : null;
}

export interface Profile {
  learner: string;
  start_level: StartLevel; // 예전 시작 난이도 (지금은 쓰지 않음, 기록 보존)
  question_scope?: QuestionScope; // 007 이후
  track?: Track; // 011 이후

  xp: number;
  streak: number;
  best_streak: number;
  last_completed_day: string | null;
  badges: string[];
  total_answered: number;
}

export async function getProfile(learner: string): Promise<Profile | null> {
  const { data, error } = await getAdminClient().from("quiz_profiles").select("*").eq("learner", learner).maybeSingle();
  if (error) throw quizError(error.message);
  return (data as Profile | null) ?? null;
}

/** 출제 범위. 007 을 실행하기 전이거나 정하지 않았으면 기출+예상 */
export const scopeOf = (p: Profile | null): QuestionScope => p?.question_scope ?? "both";

/** 출제 범위 설정·변경 (처음이면 학습 프로필을 만든다) */
export async function setQuestionScope(learner: string, scope: QuestionScope) {
  const { error } = await getAdminClient()
    .from("quiz_profiles")
    .upsert({ learner, question_scope: scope, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) {
    if (/question_scope/.test(error.message))
      throw new Error("출제 범위를 저장할 열이 없습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/007_quiz_scope.sql 을 실행하세요.");
    throw quizError(error.message);
  }
}

/** 학습 단계. 011 을 실행하기 전이거나 정하지 않았으면 연습+실전 */
export const trackOf = (p: Profile | null): Track => p?.track ?? "mixed";

/** 학습 단계 설정·변경 */
export async function setTrack(learner: string, track: Track) {
  const { error } = await getAdminClient().from("quiz_profiles").upsert({ learner, track, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) {
    if (/track/.test(error.message)) throw new Error("학습 단계를 저장할 열이 없습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/011_quiz_practice.sql 을 실행하세요.");
    throw quizError(error.message);
  }
}

/**
 * 출제 범위·학습 단계에 맞춰 미션 구성: 한쪽만 고르면 다른 쪽 자리도 그 종류로 채운다.
 * 연습+실전: 새 문제 자리의 절반을 연습문제로 (예: 기출 6·예상 2 → 연습 4·기출 2·예상 2)
 */
function missionSettings(s: { daily_total: number; daily_exam: number; daily_expected: number; daily_review: number }, scope: QuestionScope, track: Track = "real") {
  const fresh = s.daily_exam + s.daily_expected;
  const exam = scope === "both" ? s.daily_exam : scope === "exam" ? fresh : 0;
  const expected = scope === "both" ? s.daily_expected : scope === "expected" ? fresh : 0;
  if (scope === "expected" || track === "real") return { total: s.daily_total, exam, expected, review: s.daily_review, practice: 0 };
  if (track === "practice") return { total: s.daily_total, exam: 0, expected: 0, review: s.daily_review, practice: fresh };
  const practice = Math.ceil(fresh / 2);
  return { total: s.daily_total, exam: Math.max(0, exam - practice), expected, review: s.daily_review, practice };
}

// ---------------------------------------------------------------------
// 출제 후보
// ---------------------------------------------------------------------
export interface Filters {
  area?: string;
  philosopher?: string;
  year?: number;
  kind?: QuizKind;
  format?: QuizFormat;
  difficulty?: 1 | 2 | 3;
  which?: "any" | "new" | "review";
}

type CandidateRow = { id: string; kind: QuizKind; question_id: string | null; area: string | null; philosopher_names: string[] | null; difficulty: 1 | 2 | 3 };

async function approvedItems(f: Filters = {}) {
  const build = () => {
    let q = getAdminClient()
      .from("quiz_items")
      .select("id, kind, question_id, area, philosopher_names, difficulty, format, exam_year")
      .eq("status", "approved");
    if (f.kind) q = q.eq("kind", f.kind);
    if (f.format) q = q.eq("format", f.format);
    if (f.difficulty) q = q.eq("difficulty", f.difficulty);
    if (f.year) q = q.eq("exam_year", f.year);
    if (f.area) q = q.eq("area", f.area);
    if (f.philosopher) q = q.contains("philosopher_names", [f.philosopher]);
    return q.order("id");
  };
  const data = await fetchAll<CandidateRow>((from, to) => build().range(from, to)).catch((e: Error) => {
    throw quizError(e.message);
  });
  return data.map(
    (r): Candidate => ({
      id: r.id,
      kind: r.kind,
      questionId: r.question_id,
      area: r.area ?? "미분류",
      philosophers: r.philosopher_names ?? [],
      difficulty: r.difficulty,
    }),
  );
}

async function progressMap(learner: string): Promise<Map<string, ProgressLite & { raw: Record<string, unknown> }>> {
  const data = await fetchAll<Record<string, unknown>>((from, to) =>
    getAdminClient().from("quiz_progress").select("*").eq("learner", learner).order("item_id").range(from, to),
  ).catch((e: Error) => {
    throw quizError(e.message);
  });
  return new Map(
    data.map((r) => [
      r.item_id as string,
      { lastResult: (r.last_result as QuizResult | null) ?? null, dueOn: (r.due_on as string | null) ?? null, mastery: r.mastery as number, lastAt: (r.last_at as string | null) ?? null, raw: r },
    ]),
  );
}

// ---------------------------------------------------------------------
// 학습 세션
// ---------------------------------------------------------------------
export interface Session {
  mode: "daily" | "free" | "review";
  day: string;
  itemIds: string[];
  slots: Slot[];
  results: Record<string, QuizResult>;
  completed: boolean;
  /** 오늘의 실전 도전으로 시작한 세션 */
  challenge?: ChallengeType;
  /** 조건에 맞는 문제가 모자라 범위를 넓혔을 때 등 안내 */
  notice?: string | null;
}

type DailyRow = { item_ids: string[]; slots: string[]; results: Record<string, QuizResult> | null; xp: number | null; completed_at: string | null };

function toSession(day: string, d: DailyRow): Session {
  return { mode: "daily", day, itemIds: d.item_ids, slots: d.slots as Slot[], results: d.results ?? {}, completed: Boolean(d.completed_at) };
}

/**
 * 미션을 만든 뒤 관리자가 동기화·비공개로 바꿔 더 이상 공개되지 않은 문제가 생기면,
 * 아직 안 푼 그 문제를 다른 공개 문제로 바꾼다 (이미 푼 문제와 기록은 그대로).
 */
async function repairDaily(learner: string, day: string, d: DailyRow): Promise<Session> {
  const db = getAdminClient();
  const results = d.results ?? {};
  const [{ data: rows, error }, profile] = await Promise.all([db.from("quiz_items").select("id, status, question_id, kind").in("id", d.item_ids), getProfile(learner)]);
  if (error) throw quizError(error.message);
  const scope = scopeOf(profile);
  const track = trackOf(profile);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  // 아직 안 푼 문제 중: 공개가 내려갔거나, 출제 범위를 바꿔 범위 밖이 된 문제
  const bad = d.item_ids.filter((id) => {
    if (results[id]) return false;
    const r = byId.get(id);
    return r?.status !== "approved" || !inScope(r.kind as QuizKind, scope, track);
  });
  if (bad.length === 0) return toSession(day, d);

  const keep = d.item_ids.filter((id) => !bad.includes(id));
  const usedQuestions = new Set(keep.map((id) => byId.get(id)?.question_id).filter(Boolean));
  const [candidates, progress] = await Promise.all([approvedItems(), progressMap(learner)]);
  const pool = candidates.filter((c) => inScope(c.kind, scope, track) && !keep.includes(c.id) && !(c.questionId && usedQuestions.has(c.questionId)));
  const repl = buildMission({
    candidates: pool,
    progress,
    settings: {
      total: bad.length,
      exam: scope === "expected" || track === "practice" ? 0 : bad.length,
      expected: scope === "expected" ? bad.length : 0,
      practice: track === "practice" ? bad.length : 0,
      review: 0,
    },
    today: day,
    seed: `${learner}:${day}:repair:${bad.join(",")}`,
  }).itemIds;
  const itemIds: string[] = [];
  const slots: string[] = [];
  d.item_ids.forEach((id, i) => {
    if (!bad.includes(id)) {
      itemIds.push(id);
      slots.push(d.slots[i] ?? "fill");
    } else if (repl.length) {
      itemIds.push(repl.shift()!);
      slots.push("fill");
    }
  });
  const patch: Record<string, unknown> = { item_ids: itemIds, slots };
  // 바꿀 문제가 없어 남은 문제를 이미 다 풀었다면 미션 완료로 처리
  if (itemIds.length && itemIds.every((id) => results[id])) {
    const p = await getProfile(learner);
    if (p) {
      const streak = streakAfterCompletion(p.last_completed_day, p.streak, day);
      const bonus = missionBonus(streak);
      const gained = newBadges(streak, p.badges);
      await db
        .from("quiz_profiles")
        .update({ xp: p.xp + bonus, streak, best_streak: Math.max(p.best_streak, streak), last_completed_day: day, badges: [...p.badges, ...gained], updated_at: new Date().toISOString() })
        .eq("learner", learner);
      patch.completed_at = new Date().toISOString();
      patch.xp = (d.xp ?? 0) + bonus;
    }
  }
  const { error: e } = await db.from("quiz_daily").update(patch).eq("learner", learner).eq("day", day);
  if (e) throw quizError(e.message);
  return toSession(day, { ...d, item_ids: itemIds, slots, completed_at: (patch.completed_at as string) ?? null });
}

/** 오늘의 미션 (한국 시간). 없으면 만든다 — 하루 동안 같은 문제 목록이 유지된다 */
export async function getDailySession(learner: string, create = true): Promise<Session | null> {
  const db = getAdminClient();
  const day = kstDay();
  const { data, error } = await db.from("quiz_daily").select("*").eq("learner", learner).eq("day", day).maybeSingle();
  if (error) throw quizError(error.message);
  if (data) return data.completed_at ? toSession(day, data) : repairDaily(learner, day, data);
  if (!create) return null;
  const [settings, profile, candidates, progress] = await Promise.all([getQuizSettings(), getProfile(learner), approvedItems(), progressMap(learner)]);
  const scope = scopeOf(profile);
  const track = trackOf(profile);
  const { itemIds, slots } = buildMission({
    candidates: gateReal(candidates.filter((c) => inScope(c.kind, scope, track)), progress, track),
    progress,
    settings: missionSettings(settings, scope, track),
    today: day,
    seed: `${learner}:${day}`,
  });
  if (itemIds.length === 0) return { mode: "daily", day, itemIds: [], slots: [], results: {}, completed: false };
  const { error: e } = await db.from("quiz_daily").insert({ learner, day, item_ids: itemIds, slots });
  // 동시에 두 번 열면 먼저 만든 미션을 쓴다
  if (e) return getDailySession(learner, false);
  return { mode: "daily", day, itemIds, slots, results: {}, completed: false };
}

/**
 * 연습+실전: 같은 기출의 연습문제를 아직 하나도 맞히지 못한 실전 문제는 뒤로 미룬다 (연습 → 실전 순서).
 * 연습문제가 없는 기출은 그대로.
 */
function gateReal(candidates: Candidate[], progress: Map<string, ProgressLite>, track: Track): Candidate[] {
  if (track !== "mixed") return candidates;
  const practiced = new Map<string, boolean>(); // 기출 id → 연습문제를 하나라도 맞혔는가
  for (const c of candidates) {
    if (c.kind !== "practice" || !c.questionId) continue;
    const ok = progress.get(c.id)?.lastResult === "correct";
    practiced.set(c.questionId, (practiced.get(c.questionId) ?? false) || ok);
  }
  return candidates.map((c) => (c.kind === "exam" && c.questionId && practiced.get(c.questionId) === false ? { ...c, gated: true } : c));
}

export async function getPracticeSession(learner: string, mode: "free" | "review", f: Filters, n = 10): Promise<Session> {
  const day = kstDay();
  // 문제 종류를 따로 고르지 않았으면 출제 범위를 따른다
  const profile = await getProfile(learner);
  const scope = scopeOf(profile);
  const base = mode === "review" ? {} : f;
  const track = trackOf(profile);
  const [all, progress] = await Promise.all([approvedItems(base), progressMap(learner)]);
  // 종류를 고르면 그 종류만, 아니면 출제 범위·학습 단계 안에서
  const candidates = all.filter((c) => (base.kind ? c.kind === base.kind : inScope(c.kind, scope, track)));
  const itemIds = buildPractice({
    candidates,
    progress,
    today: day,
    n,
    seed: `${learner}:${Date.now()}`,
    which: mode === "review" ? "wrong" : (f.which ?? "any"),
  });
  return { mode, day, itemIds, slots: itemIds.map(() => "fill"), results: {}, completed: false };
}

// ---------------------------------------------------------------------
// 문제 보기 (정답 없이) / 해설
// ---------------------------------------------------------------------
async function loadItem(id: string): Promise<QuizItemRow> {
  const { data, error } = await getAdminClient().from("quiz_items").select("*").eq("id", id).maybeSingle();
  if (error) throw quizError(error.message);
  if (!data) throw new Error("문제를 찾을 수 없습니다.");
  return data as QuizItemRow;
}

async function loadSource(questionId: string | null) {
  if (!questionId) return null;
  const db = getAdminClient();
  const { data: q } = await db.from("questions").select("id, label, question_text, question_image_url, score, exams(exam_year, section)").eq("id", questionId).maybeSingle();
  if (!q) return null;
  const exam = (Array.isArray(q.exams) ? q.exams[0] : q.exams) as Pick<Exam, "exam_year" | "section">;
  return { id: q.id as string, label: q.label as string, text: q.question_text as string | null, image: q.question_image_url as string | null, score: q.score as number | null, exam };
}

export interface ItemView {
  id: string;
  kind: QuizKind;
  label: string;
  format: QuizFormat;
  /** 연습문제: 발문·보기 (정답 없음) */
  practice: Record<string, unknown> | null;
  practiceType: string | null;
  grading: "auto" | "self";
  prompt: string | null;
  passage: string | null;
  imageUrl: string | null;
  ref: string | null; // 실제 기출: "2018 A 1번" / 예상 문제: 근거 기출
  score: number | null;
  area: string | null;
  philosophers: string[];
  difficulty: 1 | 2 | 3;
  /** 서술형 AI 첨삭을 서버에서 바로 할 수 있는지 (아니면 채팅 AI 붙여넣기만) */
  aiGrading: boolean;
}

/** 풀이 화면용. 정답·해설·원본 링크는 넣지 않는다 */
export async function getItemView(id: string): Promise<ItemView> {
  const it = await loadItem(id);
  if (it.status !== "approved") throw new Error("공개되지 않은 문제입니다.");
  const src = await loadSource(it.question_id);
  const pp = it.kind === "practice" && it.payload ? publicPayload(it.payload) : null;
  return {
    id: it.id,
    kind: it.kind,
    // 예상 문제의 레이블은 "사상가 · 개념"이라 정답이 드러날 수 있다 → 풀이 화면에는 보내지 않는다
    label: it.kind === "exam" ? it.label : "",
    format: it.format,
    practice: pp,
    practiceType: it.kind === "practice" && it.payload ? PRACTICE_TYPE_NAMES[it.payload.type] : null,
    grading: it.grading,
    prompt: it.prompt,
    // 기출: <작성 방법> 아래에는 이 문제의 조건만 (한 화면에 한 문제) / 연습문제: 제시문만 (<작성 방법> 없이)
    passage: it.kind === "exam" ? focusRequirement(src?.text ?? null, it.prompt) : it.kind === "practice" ? passageOnly(src?.text ?? null) : it.passage,
    imageUrl: it.kind === "exam" ? (src?.image ?? null) : null,
    ref: src ? questionRef(src.exam, src.label) : null,
    score: it.kind === "exam" ? (src?.score ?? null) : null,
    area: it.area,
    philosophers: it.philosopher_names,
    difficulty: it.difficulty,
    aiGrading: it.grading === "self" && isGeminiConfigured(),
  };
}

const normLabel = (s: string) => s.replace(/\s+/g, "");

export interface PracticeSolution {
  mode: PracticePayload["mode"];
  /** 보기별 정답 여부와 해설 (choice·multi) */
  options: { text: string; correct: boolean; note: string | null }[];
  /** 진술별 정답 그룹과 해설 (classify) */
  groups: string[];
  statements: { text: string; group: string; groupIndex: number; note: string | null }[];
  explanation: string;
  grounds: string;
}

export interface Solution {
  practice: PracticeSolution | null;
  answer: string | null;
  accepted: string[];
  modelAnswer: string | null;
  itemExplanations: { label: string; answer: string; sourcePart: string; explanation: string }[];
  passageCommentary: { part: string; quote: string; commentary: string }[];
  conceptMap: NonNullable<AnalysisDetails["conceptMap"]>;
  studyConcepts: NonNullable<AnalysisDetails["studyConcepts"]>;
  intent: { summary: string | null; item: string | null };
  expectedExplanation: string | null;
  origin: { questionId: string; ref: string } | null;
  related: { id: string; ref: string; philosophers: string }[];
}

/**
 * 정답 확인 후 해설. 기출 분석(question_analysis)을 그때그때 읽으므로 관리자가 분석을 고치면 바로 반영된다.
 * 분석에 없는 항목은 비워 둔다 (임의로 만들지 않음).
 */
export async function getSolution(id: string): Promise<Solution> {
  const it = await loadItem(id);
  const db = getAdminClient();
  const [src, { data: a }] = await Promise.all([
    loadSource(it.question_id),
    it.question_id ? db.from("question_analysis").select("answer, details, status").eq("question_id", it.question_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const d = ((a?.details ?? {}) as AnalysisDetails) || {};
  // 여러 요구 사항을 묶은 문제는 레이블이 "㉢, ㉣" → 각각의 해설·의도를 모두 보여 준다
  const labels = new Set(it.kind === "exam" && it.label ? it.label.split(",").map(normLabel).filter(Boolean) : []);
  const ies = (d.itemExplanations ?? []).filter((x) => labels.has(normLabel(x.label)));
  const intents = (d.examinerIntent?.itemIntents ?? []).filter((x) => labels.has(normLabel(x.label)));
  const itemIntent = intents.length ? intents.map((x) => (intents.length > 1 ? `${x.label} ${x.intent}` : x.intent)).join("\n") : undefined;
  const related = it.question_id ? await findRelatedQuestions(it.question_id, 5).catch(() => []) : [];
  const p = it.kind === "practice" ? it.payload : null;
  const practice: PracticeSolution | null = p
    ? {
        mode: p.mode,
        options:
          p.mode === "choice" || p.mode === "multi"
            ? p.options.map((text, i) => ({ text, correct: p.mode === "choice" ? i === p.answer : p.answers.includes(i), note: p.notes[i] ?? null }))
            : [],
        groups: p.mode === "classify" ? p.groups : [],
        statements: p.mode === "classify" ? p.statements.map((x) => ({ text: x.text, group: p.groups[x.group], groupIndex: x.group, note: x.note })) : [],
        explanation: p.explanation,
        grounds: p.grounds,
      }
    : null;
  return {
    practice,
    answer: it.kind === "exam" && ies.length ? ies.map((x) => (ies.length > 1 ? `${x.label} ${x.answer}` : x.answer)).join("\n") : it.answer,
    accepted: it.accepted_answers,
    modelAnswer: it.kind === "exam" ? (d.modelAnswer ?? null) : it.model_answer,
    itemExplanations: ies.map((x) => ({ label: x.label, answer: x.answer, sourcePart: x.sourcePart, explanation: x.explanation })),
    passageCommentary: it.kind !== "expected" ? (d.passageCommentary ?? []) : [],
    conceptMap: d.conceptMap ?? [],
    studyConcepts: d.studyConcepts ?? [],
    intent: { summary: it.kind === "exam" ? (d.examinerIntent?.summary ?? null) : null, item: itemIntent ?? null },
    expectedExplanation: it.kind === "expected" ? it.explanation : null,
    origin: src ? { questionId: src.id, ref: questionRef(src.exam, src.label) } : null,
    related: related.map((r) => ({ id: r.id, ref: questionRef(r.exam, r.label), philosophers: r.philosophers.filter((p) => p.role === "main").map((p) => p.name).join(" · ") })),
  };
}

/** 서술형 첨삭 기준: 이 문제의 원문·요구 사항·정답·해설 (기존 분석 그대로) */
export async function getEssayContext(id: string): Promise<EssayContext> {
  const [view, s] = await Promise.all([getItemView(id), getSolution(id)]);
  if (view.grading !== "self") throw new Error("서술형(자기평가) 문제만 AI 첨삭을 받을 수 있습니다.");
  return {
    kind: view.kind === "expected" ? "expected" : "exam",
    ref: view.ref,
    label: view.label,
    prompt: view.prompt,
    passage: view.passage,
    answer: s.answer,
    explanations: view.kind === "exam" ? s.itemExplanations.map((x) => (s.itemExplanations.length > 1 ? `${x.label} ${x.explanation}` : x.explanation)) : s.expectedExplanation ? [s.expectedExplanation] : [],
    modelAnswer: view.kind === "expected" ? s.modelAnswer : null,
    accepted: s.accepted,
  };
}

/**
 * 오늘의 실전 도전 (새 문제은행 없이 기존 공개 문제에서 고른다, 출제 범위 유지).
 * - 원문 해독: 난이도 '상' 기입형 → 모자라면 '중'까지
 * - 서술형 마스터: 난이도 '상' 서술형 → 모자라면 '중'까지
 * - 오답 복수전: 틀렸거나 일부만 맞힌 문제 (오답 복습과 같은 기록)
 */
export async function getChallengeSession(learner: string, type: ChallengeType): Promise<Session> {
  const day = kstDay();
  const profile = await getProfile(learner);
  const scope = scopeOf(profile);
  // 실전 도전: 연습문제는 빼고 실제 기출·예상 문제만
  const kind = scope === "both" ? undefined : scope;
  const size = CHALLENGES[type].size;
  const progress = await progressMap(learner);
  const seed = `${learner}:${type}:${Date.now()}`;
  const real = (cs: Candidate[]) => cs.filter((c) => c.kind !== "practice");
  if (type === "revenge") {
    const candidates = real(await approvedItems({ kind }));
    const itemIds = buildPractice({ candidates, progress, today: day, n: size, seed, which: "wrong" });
    return { mode: "review", day, itemIds, slots: itemIds.map(() => "review"), results: {}, completed: false, challenge: type, notice: null };
  }
  const format = type === "decode" ? "fill" : "essay";
  const hard = real(await approvedItems({ kind, format, difficulty: 3 }));
  let candidates = hard;
  let notice: string | null = null;
  if (hard.length < size) {
    const mid = real(await approvedItems({ kind, format, difficulty: 2 }));
    candidates = [...hard, ...mid];
    notice = hard.length
      ? `난이도 '상' ${format === "fill" ? "기입형" : "서술형"}이 ${hard.length}문제뿐이라 '중' 문제를 함께 냈습니다.`
      : `난이도 '상' ${format === "fill" ? "기입형" : "서술형"}이 아직 없어 '중' 문제로 도전합니다.`;
  }
  // '상' 문제를 먼저, 그 안에서는 새 문제·복습할 문제 우선
  const pickHard = buildPractice({ candidates: hard, progress, today: day, n: size, seed, which: "any" });
  const rest = pickHard.length < size ? buildPractice({ candidates: candidates.filter((c) => !pickHard.includes(c.id)), progress, today: day, n: size - pickHard.length, seed, which: "any" }) : [];
  const itemIds = [...pickHard, ...rest];
  return { mode: "free", day, itemIds, slots: itemIds.map(() => "fill"), results: {}, completed: false, challenge: type, notice: itemIds.length ? notice : null };
}

// ---------------------------------------------------------------------
// 풀이 기록
// ---------------------------------------------------------------------
export interface AttemptResult {
  result: QuizResult;
  gradedBy: "auto" | "self";
  xp: number;
  missionCompleted: boolean;
  missionXp: number;
  streak: number;
  newBadges: string[];
  profile: { xp: number; level: number; levelFrom: number; levelTo: number };
  /** 오늘 최종 판정 기준 연속 정답 (게임용 · 경험치·복습과 무관) */
  combo: number;
  bestComboToday: number;
  /** 지난번에 틀렸거나 일부만 맞힌 문제를 맞힘 */
  reconquered: boolean;
  /** 레벨이 올랐으면 새 레벨 */
  levelUp: number | null;
  /** 경험치 중 난이도 '상' 보너스 */
  hardBonus: number;
  /** 숙련도 변화 (성장 요약용) */
  area: string | null;
  masteryBefore: number;
  masteryAfter: number;
  difficulty: 1 | 2 | 3;
  /** 철학자 대난투 코인 (학습 보상, 게임 테이블이 없으면 0) */
  coins: number;
  coinNote: string;
  /** 정답 직후 그 문제의 사상가가 한마디 (게임 캐릭터 · 창작 대사). 없으면 null */
  cheer: { name: string; artUrl: string | null; line: string } | null;
}

/** 정답 직후 한마디: 그 문제 사상가의 게임 카드(그림·대사), 대사가 없으면 사상 요약 첫 문장 */
async function cheerFor(names: string[] | null | undefined): Promise<AttemptResult["cheer"]> {
  const name = names?.[0];
  if (!name) return null;
  try {
    const [{ publishedCards }, { THOUGHTS }] = await Promise.all([import("@/lib/game/data"), import("@/lib/game/thought")]);
    const cards = await publishedCards();
    const n = name.replace(/\s/g, "");
    const card = cards.find((c) => c.name.replace(/\s/g, "") === n);
    const line = card?.quote?.trim() || THOUGHTS[n]?.c.split(/(?<=[.!?])\s/)[0] || "";
    if (!line && !card) return null;
    return { name: card?.name ?? name, artUrl: card?.battleArtUrl ?? card?.artUrl ?? null, line: line || "잘 짚었소!" };
  } catch {
    return null;
  }
}

function toState(raw: Record<string, unknown> | undefined): ProgressState {
  if (!raw) return { ...NEW_PROGRESS };
  return {
    attempts: raw.attempts as number,
    correctCount: raw.correct_count as number,
    lastResult: (raw.last_result as QuizResult) ?? null,
    streak: raw.streak as number,
    ease: raw.ease as number,
    intervalDays: raw.interval_days as number,
    dueOn: (raw.due_on as string) ?? null,
    mastery: raw.mastery as number,
    lastXpDay: (raw.last_xp_day as string) ?? null,
  };
}

export async function recordAttempt(
  learner: string,
  input: { itemId: string; mode: "daily" | "free" | "review"; answer?: string; self?: QuizResult },
): Promise<AttemptResult> {
  const db = getAdminClient();
  const it = await loadItem(input.itemId);
  if (it.status !== "approved") throw new Error("공개되지 않은 문제입니다.");
  const today = kstDay();

  // 채점: 자동 채점 문제는 항상 서버가 판정 (학습자가 결과를 정할 수 없음), 자기평가 문제는 학습자 선택
  let result: QuizResult;
  let gradedBy: "auto" | "self";
  if (it.kind === "practice" && it.payload && it.payload.mode !== "fill") {
    // 연습문제(고르기·분류): 서버가 정답과 비교
    result = gradePractice(it.payload, input.answer ?? "");
    gradedBy = "auto";
  } else if (it.grading === "auto") {
    result = isCorrectFill(input.answer ?? "", it.accepted_answers.length ? it.accepted_answers : it.answer ? [it.answer] : []) ? "correct" : "wrong";
    gradedBy = "auto";
  } else {
    if (!input.self) throw new Error("자기평가 결과가 필요합니다.");
    result = input.self;
    gradedBy = "self";
  }

  const { data: prevRow, error: pe } = await db.from("quiz_progress").select("*").eq("learner", learner).eq("item_id", it.id).maybeSingle();
  if (pe) throw quizError(pe.message);
  const prev = toState(prevRow ?? undefined);
  const xp = answerXp(prev, result, today, it.difficulty);
  const bonus = xp > 0 ? hardBonus(result, it.difficulty) : 0;
  const next = nextReview(prev, result, today);
  const { error: e1 } = await db.from("quiz_progress").upsert(
    {
      learner,
      item_id: it.id,
      attempts: next.attempts,
      correct_count: next.correctCount,
      last_result: next.lastResult,
      streak: next.streak,
      ease: next.ease,
      interval_days: next.intervalDays,
      due_on: next.dueOn,
      mastery: next.mastery,
      last_at: new Date().toISOString(),
      last_xp_day: xp > 0 ? today : prev.lastXpDay,
    },
    { onConflict: "learner,item_id" },
  );
  if (e1) throw quizError(e1.message);
  const { data: attemptRow } = await db
    .from("quiz_attempts")
    .insert({
      learner,
      item_id: it.id,
      mode: input.mode,
      result,
      graded_by: gradedBy,
      answer_text: input.answer?.slice(0, 5000) ?? null,
      xp,
      day: today,
    })
    .select("id")
    .single();

  // 일일 미션 진행
  let missionCompleted = false;
  let missionXp = 0;
  const profile = (await getProfile(learner)) ?? {
    learner,
    start_level: "basic" as StartLevel,
    xp: 0,
    streak: 0,
    best_streak: 0,
    last_completed_day: null,
    badges: [],
    total_answered: 0,
  };
  let streak = profile.streak;
  let lastDay = profile.last_completed_day;
  let badges = profile.badges;
  let gained: string[] = [];
  if (input.mode === "daily") {
    const { data: daily } = await db.from("quiz_daily").select("*").eq("learner", learner).eq("day", today).maybeSingle();
    if (daily && (daily.item_ids as string[]).includes(it.id) && !daily.completed_at) {
      const results = { ...(daily.results ?? {}), [it.id]: result };
      const done = (daily.item_ids as string[]).every((id) => results[id]);
      const patch: Record<string, unknown> = { results, xp: (daily.xp ?? 0) + xp };
      if (done) {
        streak = streakAfterCompletion(profile.last_completed_day, profile.streak, today);
        missionXp = missionBonus(streak);
        lastDay = today;
        gained = newBadges(streak, badges);
        badges = [...badges, ...gained];
        missionCompleted = true;
        patch.completed_at = new Date().toISOString();
        patch.xp = (patch.xp as number) + missionXp;
      }
      await db.from("quiz_daily").update(patch).eq("learner", learner).eq("day", today);
    }
  }
  const totalXp = profile.xp + xp + missionXp;
  const { error: e2 } = await db.from("quiz_profiles").upsert(
    {
      learner,
      start_level: profile.start_level,
      xp: totalXp,
      streak,
      best_streak: Math.max(profile.best_streak, streak),
      last_completed_day: lastDay,
      badges,
      total_answered: profile.total_answered + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "learner" },
  );
  if (e2) throw quizError(e2.message);
  const lv = levelForXp(totalXp);
  const levelBefore = levelForXp(profile.xp).level;
  // 콤보: 오늘의 최종 판정 순서 (방금 기록 포함)
  const { data: todays } = await db.from("quiz_attempts").select("result").eq("learner", learner).eq("day", today).order("created_at").limit(1000);
  const seq = ((todays ?? []) as { result: QuizResult }[]).map((r) => r.result);
  // 코인: 이 풀이 기록 id 로 한 번만 (같은 요청이 다시 와도 중복 지급 없음)
  const coin = attemptRow
    ? await grantQuizCoins(learner, {
        attemptId: attemptRow.id as string,
        // 연습문제는 자동 채점 기입형과 같은 기준 (코인은 하루 한 번·상한 동일)
        format: it.format === "essay" ? "essay" : "fill",
        selfGraded: gradedBy === "self",
        result,
        answerLength: (input.answer ?? "").trim().length,
        xpAwarded: xp > 0,
        reconquered: isReconquest(prev.lastResult, result),
        missionDay: missionCompleted ? today : null,
      })
    : { coins: 0, note: "" };
  return {
    result,
    gradedBy,
    xp,
    missionCompleted,
    missionXp,
    streak: currentStreak(lastDay, streak, today),
    newBadges: gained,
    profile: { xp: totalXp, level: lv.level, levelFrom: lv.current, levelTo: lv.next },
    combo: trailingCombo(seq),
    bestComboToday: bestCombo(seq),
    reconquered: isReconquest(prev.lastResult, result),
    levelUp: lv.level > levelBefore ? lv.level : null,
    hardBonus: bonus,
    area: it.area,
    masteryBefore: prev.mastery,
    masteryAfter: next.mastery,
    difficulty: it.difficulty,
    coins: coin.coins,
    coinNote: coin.note,
    cheer: result === "correct" ? await cheerFor(it.philosopher_names) : null,
  };
}

export async function reportAnswer(learner: string, itemId: string, answer: string) {
  const { error } = await getAdminClient().from("quiz_reports").insert({ learner, item_id: itemId, answer_text: answer.slice(0, 500) });
  if (error) throw quizError(error.message);
}

// ---------------------------------------------------------------------
// 퀴즈 홈
// ---------------------------------------------------------------------
export interface Dashboard {
  profile: Profile | null;
  level: { level: number; current: number; next: number };
  streak: number;
  today: { total: number; done: number; completed: boolean; started: boolean; size: number };
  dueCount: number;
  wrongCount: number;
  bankSize: number;
  scope: QuestionScope;
  kindCount: { exam: number; expected: number; practice: number }; // 공개된 문제 수 (practice = 기출 기반 연습문제)
  track: Track;
  mastery: { name: string; seen: number; total: number; score: number }[]; // 영역별
  philosophers: { name: string; seen: number; score: number }[];
  calendar: { day: string; answered: number; completed: boolean }[];
  levelStats: Record<1 | 2 | 3, { attempts: number; correct: number }>;
  /** 오늘 한 일 (미션을 다 끝내지 않아도 보이는 성과) — 게임 지표(콤보)는 따로 */
  todayStats: { answered: number; correct: number; partial: number; wrong: number; xp: number; hardCorrect: number; reconquered: number; combo: number; bestCombo: number };
  /** 최근 7일 실제 학습 지표 */
  week: { answered: number; accuracy: number | null; hardAnswered: number; hardCorrect: number; essays: number; reconquered: number; activeDays: number };
  /** 이전보다 정답률이 오른 영역 */
  growth: AreaGrowth[];
  /** 실전 도전에 낼 수 있는 문제 수 (출제 범위 안) */
  challenges: { decode: { hard: number; mid: number }; essay: { hard: number; mid: number }; revenge: number };
}

export async function getDashboard(learner: string): Promise<Dashboard> {
  const db = getAdminClient();
  const today = kstDay();
  const from = new Date(Date.now() - 41 * 86400000);
  const [settings, profile, daily, progress, items, attempts, missions] = await Promise.all([
    getQuizSettings(),
    getProfile(learner),
    getDailySession(learner, false),
    progressMap(learner),
    fetchAll<{ id: string; area: string | null; philosopher_names: string[] | null; difficulty: 1 | 2 | 3; kind: QuizKind; format: QuizFormat }>((a, b) =>
      db.from("quiz_items").select("id, area, philosopher_names, difficulty, kind, format").eq("status", "approved").order("id").range(a, b),
    ).then((data) => ({ data })),
    fetchAll<{ day: string; result: QuizResult; item_id: string; xp: number; mode: string }>((a, b) =>
      db.from("quiz_attempts").select("day, result, item_id, xp, mode").eq("learner", learner).gte("created_at", from.toISOString()).order("created_at").order("id").range(a, b),
    ).then((data) => ({ data })),
    db.from("quiz_daily").select("day, completed_at, xp").eq("learner", learner).gte("day", kstDay(from)),
  ]);
  const byArea = new Map<string, { seen: number; total: number; sum: number }>();
  const byPh = new Map<string, { seen: number; sum: number }>();
  const levelStats: Dashboard["levelStats"] = { 1: { attempts: 0, correct: 0 }, 2: { attempts: 0, correct: 0 }, 3: { attempts: 0, correct: 0 } };
  const diffOf = new Map<string, 1 | 2 | 3>();
  let dueCount = 0;
  let wrongCount = 0;
  const scope = scopeOf(profile);
  const track = trackOf(profile);
  const kindCount = { exam: 0, expected: 0, practice: 0 };
  const challenges: Dashboard["challenges"] = { decode: { hard: 0, mid: 0 }, essay: { hard: 0, mid: 0 }, revenge: 0 };
  const itemInfo = new Map<string, { area: string; difficulty: 1 | 2 | 3; format: QuizFormat }>();
  for (const it of items.data ?? []) {
    kindCount[it.kind]++;
    itemInfo.set(it.id, { area: it.area ?? "미분류", difficulty: it.difficulty, format: it.format });
    const p = progress.get(it.id);
    if (p?.lastResult) {
      if (inScope(it.kind, scope, track) && p.dueOn && p.dueOn <= today) dueCount++;
      if (inScope(it.kind, scope, track) && (p.lastResult === "wrong" || p.lastResult === "partial")) wrongCount++;
    }
    // 숙련도·실전 도전 집계는 실전 문제만 (연습문제는 같은 기출을 여러 번 묻기 때문)
    if (it.kind === "practice") continue;
    if (inScope(it.kind, scope) && it.difficulty >= 2 && (it.format === "fill" || it.format === "essay")) {
      const c = challenges[it.format === "fill" ? "decode" : "essay"];
      if (it.difficulty === 3) c.hard++;
      else c.mid++;
    }
    diffOf.set(it.id, it.difficulty);
    const area = it.area ?? "미분류";
    const a = byArea.get(area) ?? { seen: 0, total: 0, sum: 0 };
    a.total++;
    if (p?.lastResult) {
      a.seen++;
      a.sum += p.mastery / 5;
      for (const n of it.philosopher_names ?? []) {
        const ph = byPh.get(n) ?? { seen: 0, sum: 0 };
        ph.seen++;
        ph.sum += p.mastery / 5;
        byPh.set(n, ph);
      }
    }
    byArea.set(area, a);
  }
  const perDay = new Map<string, number>();
  for (const r of attempts.data ?? []) {
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + 1);
    const dl = diffOf.get(r.item_id);
    if (dl) {
      levelStats[dl].attempts++;
      if (r.result === "correct") levelStats[dl].correct++;
    }
  }
  challenges.revenge = wrongCount;

  // 오늘의 성과 · 최근 7일 학습 지표 (실제 풀이 기록에서 계산)
  const all = (attempts.data ?? []).map((r) => ({ ...r, itemId: r.item_id }));
  const todays = all.filter((r) => r.day === today);
  const weekFrom = addDays(today, -6);
  const week = all.filter((r) => r.day >= weekFrom);
  const todayDaily = (missions.data ?? []).find((m) => m.day === today);
  const dailyAttemptXp = todays.filter((r) => r.mode === "daily").reduce((n, r) => n + (r.xp ?? 0), 0);
  const missionBonusToday = todayDaily?.completed_at ? Math.max(0, ((todayDaily.xp as number) ?? 0) - dailyAttemptXp) : 0;
  const results = (xs: typeof all) => xs.map((r) => r.result);
  const hard = (r: { item_id: string }) => itemInfo.get(r.item_id)?.difficulty === 3;
  const todayStats: Dashboard["todayStats"] = {
    answered: todays.length,
    correct: todays.filter((r) => r.result === "correct").length,
    partial: todays.filter((r) => r.result === "partial").length,
    wrong: todays.filter((r) => r.result === "wrong").length,
    xp: todays.reduce((n, r) => n + (r.xp ?? 0), 0) + missionBonusToday,
    hardCorrect: todays.filter((r) => r.result === "correct" && hard(r)).length,
    reconquered: countReconquests(all, today),
    combo: trailingCombo(results(todays)),
    bestCombo: bestCombo(results(todays)),
  };
  const score = (xs: typeof all) => (xs.length ? xs.reduce((n, r) => n + (r.result === "correct" ? 1 : r.result === "partial" ? 0.5 : 0), 0) / xs.length : null);
  const weekStats: Dashboard["week"] = {
    answered: week.length,
    accuracy: score(week),
    hardAnswered: week.filter(hard).length,
    hardCorrect: week.filter((r) => r.result === "correct" && hard(r)).length,
    essays: week.filter((r) => itemInfo.get(r.item_id)?.format === "essay").length,
    reconquered: countReconquests(all, weekFrom),
    activeDays: new Set(week.map((r) => r.day)).size,
  };
  const growth = areaGrowth(
    all.filter((r) => itemInfo.has(r.item_id)).map((r) => ({ area: itemInfo.get(r.item_id)!.area, result: r.result, day: r.day })),
    weekFrom,
  );

  const completedDays = new Set((missions.data ?? []).filter((m) => m.completed_at).map((m) => m.day as string));
  const calendar: Dashboard["calendar"] = [];
  for (let i = 41; i >= 0; i--) {
    const day = kstDay(new Date(Date.now() - i * 86400000));
    calendar.push({ day, answered: perDay.get(day) ?? 0, completed: completedDays.has(day) });
  }
  const xp = profile?.xp ?? 0;
  return {
    profile,
    level: levelForXp(xp),
    streak: profile ? currentStreak(profile.last_completed_day, profile.streak, today) : 0,
    today: {
      total: daily?.itemIds.length ?? 0,
      done: daily ? Object.keys(daily.results).length : 0,
      completed: daily?.completed ?? false,
      started: Boolean(daily),
      // 아직 미션을 만들기 전이면 설정의 하루 문제 수
      size: daily?.itemIds.length || settings.daily_total,
    },
    dueCount,
    wrongCount,
    bankSize: items.data?.length ?? 0,
    scope,
    kindCount,
    track,
    mastery: [...byArea.entries()].map(([name, v]) => ({ name, seen: v.seen, total: v.total, score: v.seen ? v.sum / v.seen : 0 })),
    philosophers: [...byPh.entries()]
      .map(([name, v]) => ({ name, seen: v.seen, score: v.sum / v.seen }))
      .sort((a, b) => b.seen - a.seen)
      .slice(0, 12),
    calendar,
    levelStats,
    todayStats,
    week: weekStats,
    growth,
    challenges,
  };
}

/** 자유 학습 조건 목록 (공개된 문제 기준) */
export async function getFilterOptions() {
  const data = await fetchAll<{ area: string | null; philosopher_names: string[] | null; exam_year: number | null; kind: string }>((from, to) =>
    getAdminClient().from("quiz_items").select("area, philosopher_names, exam_year, kind").eq("status", "approved").order("id").range(from, to),
  ).catch((e: Error) => {
    throw quizError(e.message);
  });
  const count = <K extends string | number>(list: K[]) => {
    const m = new Map<K, number>();
    list.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1));
    return m;
  };
  const rows = data ?? [];
  const areas = count(rows.map((r) => r.area ?? "미분류"));
  const philosophers = count(rows.flatMap((r) => (r.philosopher_names ?? []) as string[]));
  const years = count(rows.filter((r) => r.exam_year).map((r) => r.exam_year as number));
  return {
    areas: [...areas.entries()].sort((a, b) => b[1] - a[1]),
    philosophers: [...philosophers.entries()].sort((a, b) => b[1] - a[1]),
    years: [...years.entries()].sort((a, b) => b[0] - a[0]),
    expected: rows.filter((r) => r.kind === "expected").length,
    practice: rows.filter((r) => r.kind === "practice").length,
    total: rows.length,
  };
}
