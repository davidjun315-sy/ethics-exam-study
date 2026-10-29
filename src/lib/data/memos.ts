import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { listQuestionSummaries, type QuestionSummary } from "./queries";

/**
 * 내 메모 (서버 저장). 학습자(회원 / 관리자) 확인 뒤에만 호출하고, 모든 질의는 learner 로 제한한다.
 * study_memos 는 공개 읽기 정책이 없어 service role 로만 읽고 쓸 수 있다.
 */
export interface MemoRow {
  question_id: string;
  memo: string;
  updated_at: string;
}

const MIGRATION_HINT = "메모 테이블이 최신이 아닙니다. Supabase SQL Editor 에서 supabase/migrations/004_answer_commentary_and_memos.sql 과 006_members.sql 을 실행하세요.";
const memoError = (msg: string) => new Error(/study_memos|learner/.test(msg) ? MIGRATION_HINT : msg);

export async function getMemo(learner: string, questionId: string): Promise<MemoRow | null> {
  const { data, error } = await getAdminClient().from("study_memos").select("question_id, memo, updated_at").eq("learner", learner).eq("question_id", questionId).maybeSingle();
  if (error) return null;
  return (data as MemoRow | null) ?? null;
}

/** 빈 메모는 지운다 */
export async function saveMemo(learner: string, questionId: string, memo: string): Promise<MemoRow | null> {
  const db = getAdminClient();
  const text = memo.trim() ? memo : "";
  if (!text) {
    const { error } = await db.from("study_memos").delete().eq("learner", learner).eq("question_id", questionId);
    if (error) throw memoError(error.message);
    return null;
  }
  const { data, error } = await db
    .from("study_memos")
    .upsert({ learner, question_id: questionId, memo: text, updated_at: new Date().toISOString() }, { onConflict: "learner,question_id" })
    .select("question_id, memo, updated_at")
    .single();
  if (error) throw memoError(error.message);
  return data as MemoRow;
}

/** 이 브라우저에 저장돼 있던 메모를 서버로 옮긴다. 서버에 이미 메모가 있는 문항은 건너뛴다 */
export async function importMemos(learner: string, items: { questionId: string; memo: string }[]): Promise<{ saved: number; skipped: number }> {
  const db = getAdminClient();
  const ids = [...new Set(items.map((i) => i.questionId))];
  const existing: { question_id: string }[] = [];
  const questions: { id: string }[] = [];
  for (let i = 0; i < ids.length; i += 60) {
    const part = ids.slice(i, i + 60);
    const [a, b] = await Promise.all([
      db.from("study_memos").select("question_id").eq("learner", learner).in("question_id", part),
      db.from("questions").select("id").in("id", part),
    ]);
    if (a.error) throw memoError(a.error.message);
    existing.push(...((a.data ?? []) as { question_id: string }[]));
    questions.push(...((b.data ?? []) as { id: string }[]));
  }
  const have = new Set((existing ?? []).map((r) => r.question_id as string));
  const valid = new Set((questions ?? []).map((r) => r.id as string));
  const rows = items.filter((i) => i.memo.trim() && valid.has(i.questionId) && !have.has(i.questionId));
  if (rows.length) {
    const { error: e } = await db.from("study_memos").insert(rows.map((r) => ({ learner, question_id: r.questionId, memo: r.memo })));
    if (e) throw new Error(e.message);
  }
  return { saved: rows.length, skipped: items.length - rows.length };
}

export interface MemoWithQuestion extends MemoRow {
  question: QuestionSummary;
}

/** 내 학습: 모든 메모 + 문항 정보. 테이블이 없으면 null */
export async function listMemos(learner: string): Promise<MemoWithQuestion[] | null> {
  const { data, error } = await getAdminClient().from("study_memos").select("question_id, memo, updated_at").eq("learner", learner).order("updated_at", { ascending: false }).limit(1000);
  if (error) return null;
  const rows = (data ?? []) as MemoRow[];
  const summaries = await listQuestionSummaries({ ids: rows.map((r) => r.question_id) });
  const byId = new Map(summaries.map((s) => [s.id, s]));
  return rows.filter((r) => byId.has(r.question_id)).map((r) => ({ ...r, question: byId.get(r.question_id)! }));
}
