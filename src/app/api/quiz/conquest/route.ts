import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { claimConquest, conquestFor, FunError } from "@/lib/quiz/fun";

/** 사상가 한 명의 퀴즈 진행 (카드 상세 창) — ?philosopher=<id>&name=<이름> */
export async function GET(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const url = new URL(req.url);
  const id = z.string().uuid().safeParse(url.searchParams.get("philosopher"));
  if (!id.success) return NextResponse.json({ error: "사상가를 찾을 수 없습니다." }, { status: 400 });
  try {
    return NextResponse.json(await conquestFor(learner, id.data, url.searchParams.get("name")?.slice(0, 60) || undefined));
  } catch (e) {
    console.error("[quiz-conquest:get]", e);
    return NextResponse.json({ error: "퀴즈 진행을 불러오지 못했습니다." }, { status: 500 });
  }
}

const Body = z.object({ philosopherId: z.string().uuid() });

/** 사상가 정복 보상 받기 (서버가 정복 여부를 다시 확인) */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await claimConquest(learner, data.philosopherId));
  } catch (e) {
    if (e instanceof FunError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[quiz-conquest]", e);
    return NextResponse.json({ error: "보상을 받지 못했습니다. 잠시 후 다시 시도하세요." }, { status: 500 });
  }
}
