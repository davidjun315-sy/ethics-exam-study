import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { FULL_PASS, getFullSolve, recordFullSolve } from "@/lib/quiz/full";

/** 완전 기출문제 기록 보기 — ?question=<문항 id> */
export async function GET(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("question"));
  if (!id.success) return NextResponse.json({ error: "문항을 찾을 수 없습니다." }, { status: 400 });
  const r = await getFullSolve(learner, id.data);
  return NextResponse.json({ ...r, pass: FULL_PASS });
}

const Body = z.object({ questionId: z.string().uuid(), verdict: z.enum(["correct", "wrong"]) });

/** 스스로 채점 (모범답안과 비교한 뒤 '다 맞혔어요' / '아직이에요') — 윤리 퀴즈 서술형 스스로 채점과 같은 방식 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  const r = await recordFullSolve(learner, data.questionId, null, data.verdict === "correct", "self");
  if (!r.ready) return NextResponse.json({ error: "완전 기출문제 기록은 관리자가 업데이트(SQL 022)를 적용하면 쓸 수 있습니다." }, { status: 503 });
  return NextResponse.json(r);
}
