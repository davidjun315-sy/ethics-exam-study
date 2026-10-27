import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 시험 안의 문항 순서(sort_order) 관리.
 * sort_order 는 10, 20, 30 … 으로 다시 매겨서 이후 사이에 끼워 넣을 여유를 둔다.
 */

interface Row {
  id: string;
  question_number: number;
  sub_question_number: string | null;
  sort_order: number;
}

/** 하위 문항 번호 비교용 (예: "2" < "10", 숫자가 아니면 문자열 비교) */
function subKey(s: string | null): number {
  if (!s) return -1;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && s.trim() !== "" ? n : 9999;
}

export function byNumber(a: Row, b: Row): number {
  return a.question_number - b.question_number || subKey(a.sub_question_number) - subKey(b.sub_question_number) || a.sort_order - b.sort_order;
}

async function loadRows(db: SupabaseClient, examId: string): Promise<Row[]> {
  const { data, error } = await db
    .from("questions")
    .select("id, question_number, sub_question_number, sort_order")
    .eq("exam_id", examId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** 주어진 순서대로 sort_order 를 다시 매긴다. 바뀐 문항만 업데이트한다. */
export async function applyOrder(db: SupabaseClient, examId: string, orderedIds: string[]): Promise<void> {
  const rows = await loadRows(db, examId);
  const known = new Set(rows.map((r) => r.id));
  if (orderedIds.length !== rows.length || orderedIds.some((id) => !known.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error("문항 목록이 바뀌었습니다. 새로고침한 뒤 다시 시도하세요.");
  }
  const current = new Map(rows.map((r) => [r.id, r.sort_order]));
  const updates = orderedIds.map((id, i) => ({ id, sort_order: (i + 1) * 10 })).filter((u) => current.get(u.id) !== u.sort_order);
  for (const u of updates) {
    const { error } = await db.from("questions").update({ sort_order: u.sort_order }).eq("id", u.id);
    if (error) throw new Error(error.message);
  }
}

/** 문항 번호 · 하위 문항 번호 순으로 전체 정렬 */
export async function sortByNumber(db: SupabaseClient, examId: string): Promise<void> {
  const rows = await loadRows(db, examId);
  await applyOrder(db, examId, [...rows].sort(byNumber).map((r) => r.id));
}

/** 새로 추가한 문항을 문항 번호에 맞는 자리로 옮긴다. (나머지 문항의 현재 순서는 유지) */
export async function placeByNumber(db: SupabaseClient, examId: string, questionId: string): Promise<void> {
  const rows = await loadRows(db, examId);
  const target = rows.find((r) => r.id === questionId);
  if (!target) return;
  const others = rows.filter((r) => r.id !== questionId);
  // 번호가 같거나 작은 마지막 문항 뒤에 넣는다
  let index = 0;
  others.forEach((r, i) => {
    if (byNumber(r, target) <= 0) index = i + 1;
  });
  const ordered = [...others.slice(0, index), target, ...others.slice(index)].map((r) => r.id);
  await applyOrder(db, examId, ordered);
}
