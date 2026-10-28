import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { syncQuizBank } from "@/lib/quiz/bank";

export const maxDuration = 300;

/** 문제은행 동기화: 분석된 모든 기출 → 세부 문제, 예상 문제 가져오기 (기존 데이터는 읽기만) */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json(await syncQuizBank());
  } catch (e) {
    return jsonError(e, 400);
  }
}
