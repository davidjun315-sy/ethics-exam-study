import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { geminiCheck, GeminiError } from "@/lib/ai/gemini";

/** 관리자: 서술형 AI 첨삭(Gemini)의 키·모델 확인. 답을 생성하지 않아 빠르고 무료 한도를 쓰지 않는다 */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json(await geminiCheck());
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return jsonError(e, 400);
  }
}
