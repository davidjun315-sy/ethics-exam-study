import "server-only";
import { NextResponse } from "next/server";
import { currentLearner } from "./learn.ts";

/** 퀴즈 API 공통: 로그인한 학습자만. 실패 시 401 */
export async function requireLearner(): Promise<{ learner: string; denied: null } | { learner: null; denied: NextResponse }> {
  const learner = await currentLearner();
  if (!learner) return { learner: null, denied: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  return { learner, denied: null };
}
