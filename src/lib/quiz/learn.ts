import "server-only";
import { isAdmin } from "@/lib/admin-guard";
import { findRelatedQuestions } from "@/lib/data/related";
import { getAdminClient } from "@/lib/supabase/server";
import { questionRef } from "@/lib/format";
import type { AnalysisDetails, Exam } from "@/lib/types";
import { getQuizSettings, quizError, type QuizItemRow } from "./bank.ts";
import { isCorrectFill } from "./grade.ts";
import { fetchAll } from "./paged.ts";
import { buildMission, buildPractice, type Candidate, type ProgressLite, type Slot } from "./mission.ts";
import {
  answerXp,
  currentStreak,
  kstDay,
  levelForXp,
  missionBonus,
  NEW_PROGRESS,
  newBadges,
  nextReview,
  streakAfterCompletion,
  type ProgressState,
  type QuizResult,
  type StartLevel,
} from "./srs.ts";

/**
 * 학습자 = 지금은 관리자 비밀번호로 로그인한 본인 한 명('owner').
 * 나중에 계정 기능을 붙이면 이 함수만 바꾸면 된다. (모든 기록은 learner 키로 저장)
 */
export async function currentLearner(): Promise<string | null> {
  return (await isAdmin()) ? "owner" : null;
}

export interface Profile {
  learner: string;
  start_level: StartLevel;
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

export async function setStartLevel(learner: string, level: StartLevel) {
  const { error } = await getAdminClient()
    .from("quiz_profiles")
    .upsert({ learner, start_level: level, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) throw quizError(error.message);
}

// ---------------------------------------------------------------------
// 출제 후보
// ---------------------------------------------------------------------
export interface Filters {
  area?: string;
  philosopher?: string;
  year?: number;
  kind?: "exam" | "expected";
  format?: "fill" | "essay";
  difficulty?: 1 | 2 | 3;
  which?: "any" | "new" | "review";
}

type CandidateRow = { id: string; kind: "exam" | "expected"; question_id: string | null; area: string | null; philosopher_names: string[] | null; difficulty: 1 | 2 | 3 };

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
}

/** 오늘의 미션 (한국 시간). 없으면 만든다 — 하루 동안 같은 문제 목록이 유지된다 */
export async function getDailySession(learner: string, create = true): Promise<Session | null> {
  const db = getAdminClient();
  const day = kstDay();
  const { data, error } = await db.from("quiz_daily").select("*").eq("learner", learner).eq("day", day).maybeSingle();
  if (error) throw quizError(error.message);
  if (data) return { mode: "daily", day, itemIds: data.item_ids, slots: data.slots, results: data.results ?? {}, completed: Boolean(data.completed_at) };
  if (!create) return null;
  const [settings, profile, candidates, progress] = await Promise.all([getQuizSettings(), getProfile(learner), approvedItems(), progressMap(learner)]);
  const { itemIds, slots } = buildMission({
    candidates,
    progress,
    settings: { total: settings.daily_total, exam: settings.daily_exam, expected: settings.daily_expected, review: settings.daily_review },
    today: day,
    level: profile?.start_level ?? "basic",
    seed: `${learner}:${day}`,
  });
  if (itemIds.length === 0) return { mode: "daily", day, itemIds: [], slots: [], results: {}, completed: false };
  const { error: e } = await db.from("quiz_daily").insert({ learner, day, item_ids: itemIds, slots });
  // 동시에 두 번 열면 먼저 만든 미션을 쓴다
  if (e) return getDailySession(learner, false);
  return { mode: "daily", day, itemIds, slots, results: {}, completed: false };
}

export async function getPracticeSession(learner: string, mode: "free" | "review", f: Filters, n = 10): Promise<Session> {
  const day = kstDay();
  const [candidates, progress] = await Promise.all([approvedItems(mode === "review" ? {} : f), progressMap(learner)]);
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
  kind: "exam" | "expected";
  label: string;
  format: "fill" | "essay";
  grading: "auto" | "self";
  prompt: string | null;
  passage: string | null;
  imageUrl: string | null;
  ref: string | null; // 실제 기출: "2018 A 1번" / 예상 문제: 근거 기출
  score: number | null;
  area: string | null;
  philosophers: string[];
  difficulty: 1 | 2 | 3;
}

/** 풀이 화면용. 정답·해설·원본 링크는 넣지 않는다 */
export async function getItemView(id: string): Promise<ItemView> {
  const it = await loadItem(id);
  if (it.status !== "approved") throw new Error("공개되지 않은 문제입니다.");
  const src = await loadSource(it.question_id);
  return {
    id: it.id,
    kind: it.kind,
    // 예상 문제의 레이블은 "사상가 · 개념"이라 정답이 드러날 수 있다 → 풀이 화면에는 보내지 않는다
    label: it.kind === "exam" ? it.label : "",
    format: it.format,
    grading: it.grading,
    prompt: it.prompt,
    passage: it.kind === "exam" ? (src?.text ?? null) : it.passage,
    imageUrl: it.kind === "exam" ? (src?.image ?? null) : null,
    ref: src ? questionRef(src.exam, src.label) : null,
    score: it.kind === "exam" ? (src?.score ?? null) : null,
    area: it.area,
    philosophers: it.philosopher_names,
    difficulty: it.difficulty,
  };
}

const normLabel = (s: string) => s.replace(/\s+/g, "");

export interface Solution {
  answer: string | null;
  accepted: string[];
  modelAnswer: string | null;
  itemExplanation: { sourcePart: string; explanation: string } | null;
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
  const ie = it.kind === "exam" && it.label ? d.itemExplanations?.find((x) => normLabel(x.label) === normLabel(it.label)) : undefined;
  const itemIntent = it.kind === "exam" && it.label ? d.examinerIntent?.itemIntents?.find((x) => normLabel(x.label) === normLabel(it.label))?.intent : undefined;
  const related = it.question_id ? await findRelatedQuestions(it.question_id, 5).catch(() => []) : [];
  return {
    answer: it.kind === "exam" ? (ie?.answer ?? it.answer) : it.answer,
    accepted: it.accepted_answers,
    modelAnswer: it.kind === "exam" ? (d.modelAnswer ?? null) : it.model_answer,
    itemExplanation: ie ? { sourcePart: ie.sourcePart, explanation: ie.explanation } : null,
    passageCommentary: it.kind === "exam" ? (d.passageCommentary ?? []) : [],
    conceptMap: d.conceptMap ?? [],
    studyConcepts: d.studyConcepts ?? [],
    intent: { summary: it.kind === "exam" ? (d.examinerIntent?.summary ?? null) : null, item: itemIntent ?? null },
    expectedExplanation: it.kind === "expected" ? it.explanation : null,
    origin: src ? { questionId: src.id, ref: questionRef(src.exam, src.label) } : null,
    related: related.map((r) => ({ id: r.id, ref: questionRef(r.exam, r.label), philosophers: r.philosophers.filter((p) => p.role === "main").map((p) => p.name).join(" · ") })),
  };
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
  if (it.grading === "auto") {
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
  const xp = answerXp(prev, result, today);
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
  await db.from("quiz_attempts").insert({
    learner,
    item_id: it.id,
    mode: input.mode,
    result,
    graded_by: gradedBy,
    answer_text: input.answer?.slice(0, 5000) ?? null,
    xp,
    day: today,
  });

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
  return {
    result,
    gradedBy,
    xp,
    missionCompleted,
    missionXp,
    streak: currentStreak(lastDay, streak, today),
    newBadges: gained,
    profile: { xp: totalXp, level: lv.level, levelFrom: lv.current, levelTo: lv.next },
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
  today: { total: number; done: number; completed: boolean; started: boolean };
  dueCount: number;
  wrongCount: number;
  bankSize: number;
  mastery: { name: string; seen: number; total: number; score: number }[]; // 영역별
  philosophers: { name: string; seen: number; score: number }[];
  calendar: { day: string; answered: number; completed: boolean }[];
  levelStats: Record<1 | 2 | 3, { attempts: number; correct: number }>;
}

export async function getDashboard(learner: string): Promise<Dashboard> {
  const db = getAdminClient();
  const today = kstDay();
  const from = new Date(Date.now() - 41 * 86400000);
  const [profile, daily, progress, items, attempts, missions] = await Promise.all([
    getProfile(learner),
    getDailySession(learner, false),
    progressMap(learner),
    fetchAll<{ id: string; area: string | null; philosopher_names: string[] | null; difficulty: 1 | 2 | 3 }>((a, b) =>
      db.from("quiz_items").select("id, area, philosopher_names, difficulty").eq("status", "approved").order("id").range(a, b),
    ).then((data) => ({ data })),
    fetchAll<{ day: string; result: string; item_id: string }>((a, b) =>
      db.from("quiz_attempts").select("day, result, item_id").eq("learner", learner).gte("created_at", from.toISOString()).order("created_at").range(a, b),
    ).then((data) => ({ data })),
    db.from("quiz_daily").select("day, completed_at").eq("learner", learner).gte("day", kstDay(from)),
  ]);
  const byArea = new Map<string, { seen: number; total: number; sum: number }>();
  const byPh = new Map<string, { seen: number; sum: number }>();
  const levelStats: Dashboard["levelStats"] = { 1: { attempts: 0, correct: 0 }, 2: { attempts: 0, correct: 0 }, 3: { attempts: 0, correct: 0 } };
  const diffOf = new Map<string, 1 | 2 | 3>();
  let dueCount = 0;
  let wrongCount = 0;
  for (const it of items.data ?? []) {
    diffOf.set(it.id, it.difficulty);
    const area = it.area ?? "미분류";
    const a = byArea.get(area) ?? { seen: 0, total: 0, sum: 0 };
    a.total++;
    const p = progress.get(it.id);
    if (p?.lastResult) {
      a.seen++;
      a.sum += p.mastery / 5;
      for (const n of it.philosopher_names ?? []) {
        const ph = byPh.get(n) ?? { seen: 0, sum: 0 };
        ph.seen++;
        ph.sum += p.mastery / 5;
        byPh.set(n, ph);
      }
      if (p.dueOn && p.dueOn <= today) dueCount++;
      if (p.lastResult === "wrong" || p.lastResult === "partial") wrongCount++;
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
    },
    dueCount,
    wrongCount,
    bankSize: items.data?.length ?? 0,
    mastery: [...byArea.entries()].map(([name, v]) => ({ name, seen: v.seen, total: v.total, score: v.seen ? v.sum / v.seen : 0 })),
    philosophers: [...byPh.entries()]
      .map(([name, v]) => ({ name, seen: v.seen, score: v.sum / v.seen }))
      .sort((a, b) => b.seen - a.seen)
      .slice(0, 12),
    calendar,
    levelStats,
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
    total: rows.length,
  };
}
