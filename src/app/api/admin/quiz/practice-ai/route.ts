import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { getPracticeAiPrompt, saveAiPractice } from "@/lib/quiz/bank";

const Id = z.string().uuid();

/** 연습문제(원문 해석·채점 요소) 채팅 AI 프롬프트 — 그 기출의 저장된 분석만 담는다 (관리자 전용) */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Id.safeParse(new URL(req.url).searchParams.get("questionId"));
  if (!id.success) return NextResponse.json({ error: "questionId 가 필요합니다." }, { status: 400 });
  try {
    return NextResponse.json({ prompt: await getPracticeAiPrompt(id.data) });
  } catch (e) {
    return jsonError(e, 400);
  }
}

const Body = z.object({ text: z.string().min(10).max(100_000), source: z.string().max(40).optional() });

/** 채팅 AI 의 답(JSON)을 검증해 연습문제로 저장 (승인 대기) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Id.safeParse(new URL(req.url).searchParams.get("questionId"));
  if (!id.success) return NextResponse.json({ error: "questionId 가 필요합니다." }, { status: 400 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await saveAiPractice(id.data, data.text));
  } catch (e) {
    return jsonError(e, 400);
  }
}
