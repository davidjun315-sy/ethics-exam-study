import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { listQuestionSummaries, type QuestionSummary } from "./queries";

/**
 * 내 메모 (서버 저장). 관리자 세션이 확인된 뒤에만 호출한다.
 * study_memos 는 공개 읽기 정책이 없어 service role 로만 읽고 쓸 수 있다.
 */
export interface MemoRow {
  question_id: string;
  memo: string;
  updated_at: string;
}

const missing = (msg: string) => /study_memos/.test(msg);
const MIGRATION_HINT = "study_memos 테이블이 없습니다. Supabase SQL Editor 에서 supabase/migrations/004_answer_commentary_and_memos.sql 을 실행하세요.";

export async function getMemo(questionId: string): Promise<MemoRow | null> {
  const { data, error } = await getAdminClient().from("study_memos").select("question_id, memo, updated_at").eq("question_id", questionId).maybeSingle();
  if (error) return null;
  return (data as MemoRow | null) ?? null;
}

/** 빈 메모는 지운다 */
export async function saveMemo(questionId: string, memo: string): Promise<MemoRow | null> {
  const db = getAdminClient();
  const text = memo.trim() ? memo : "";
  if (!text) {
    const { error } = await db.from("study_memos").delete().eq("question_id", questionId);
    if (error) throw new Error(missing(error.message) ? MIGRATION_HINT : error.message);
    return null;
  }
  const { data, error } = await db
    .from("study_memos")
    .upsert({ question_id: questionId, memo: text, updated_at: new Date().toISOString() }, { onConflict: "question_id" })
    .select("question_id, memo, updated_at")
    .single();
  if (error) throw new Error(missing(error.message) ? MIGRATION_HINT : error.message);
  return data as MemoRow;
}

/** 이 브라우저에 저장돼 있던 메모를 서버로 옮긴다. 서버에 이미 메모가 있는 문항은 건너뛴다 */
export async function importMemos(items: { questionId: string; memo: string }[]): Promise<{ saved: number; skipped: number }> {
  const db = getAdminClient();
  const ids = items.map((i) => i.questionId);
  const [{ data: existing, error }, { data: questions }] = await Promise.all([
    db.from("study_memos").select("question_id").in("question_id", ids),
    db.from("questions").select("id").in("id", ids),
  ]);
  if (error) throw new Error(missing(error.message) ? MIGRATION_HINT : error.message);
  const have = new Set((existing ?? []).map((r) => r.question_id as string));
  const valid = new Set((questions ?? []).map((r) => r.id as string));
  const rows = items.filter((i) => i.memo.trim() && valid.has(i.questionId) && !have.has(i.questionId));
  if (rows.length) {
    const { error: e } = await db.from("study_memos").insert(rows.map((r) => ({ question_id: r.questionId, memo: r.memo })));
    if (e) throw new Error(e.message);
  }
  return { saved: rows.length, skipped: items.length - rows.length };
}

export interface MemoWithQuestion extends MemoRow {
  question: QuestionSummary;
}

/** 내 학습: 모든 메모 + 문항 정보. 테이블이 없으면 null */
export async function listMemos(): Promise<MemoWithQuestion[] | null> {
  const { data, error } = await getAdminClient().from("study_memos").select("question_id, memo, updated_at").order("updated_at", { ascending: false }).limit(2000);
  if (error) return null;
  const rows = (data ?? []) as MemoRow[];
  const summaries = await listQuestionSummaries({ ids: rows.map((r) => r.question_id) });
  const byId = new Map(summaries.map((s) => [s.id, s]));
  return rows.filter((r) => byId.has(r.question_id)).map((r) => ({ ...r, question: byId.get(r.question_id)! }));
}
