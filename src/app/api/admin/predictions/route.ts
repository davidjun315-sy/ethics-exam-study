import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { createPredictionRun } from "@/lib/data/trends";

export const maxDuration = 120;

/** 전체 기출 통계 + 패턴 + 예측 점수를 새로 계산해 저장한다. (AI 호출 없음) */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ runId: await createPredictionRun() });
  } catch (e) {
    return jsonError(e, 400);
  }
}
