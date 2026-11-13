import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setQuestionScope, setRealUnit, setTrack } from "@/lib/quiz/learn";

const Body = z
  .object({ scope: z.enum(["exam", "expected", "both"]).optional(), track: z.enum(["mixed", "practice", "real"]).optional(), realUnit: z.enum(["part", "full"]).optional() })
  .refine((b) => b.scope || b.track || b.realUnit, "scope · track · realUnit 중 하나가 필요합니다.");

/** 출제 범위(기출 / AI 예상 / 둘 다) · 학습 단계(연습+실전 / 개념 다지기 / 실전만) 설정 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    if (data.scope) await setQuestionScope(learner, data.scope);
    if (data.track) await setTrack(learner, data.track);
    // 실전만 안의 부분 / 완전 기출 (고르면 학습 단계도 실전만)
    if (data.realUnit) await setRealUnit(learner, data.realUnit);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
