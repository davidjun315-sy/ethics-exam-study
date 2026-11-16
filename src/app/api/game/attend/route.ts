import { NextResponse } from "next/server";
import { requireLearner } from "@/lib/quiz/api";
import { attend, getAttendance } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

/** 오늘 출석 (로그인한 학습자 · 하루 한 번 · 판정과 지급은 서버 DB 함수가) */
export async function POST() {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  try {
    const r = await attend(learner);
    return NextResponse.json({ ...r, state: r.ready ? await getAttendance(learner) : null });
  } catch (e) {
    return gameJsonError(e);
  }
}
