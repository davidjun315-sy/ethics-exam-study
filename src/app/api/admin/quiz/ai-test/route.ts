import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { geminiJson, GeminiError } from "@/lib/ai/gemini";

export const maxDuration = 60;

/** 관리자: 서술형 AI 첨삭(Gemini) 키·모델이 실제로 동작하는지 짧게 호출해 본다 */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { data, model } = await geminiJson(z.object({ ok: z.boolean() }), "JSON 으로만 답하세요.", '{"ok": true} 를 그대로 답하세요.');
    return NextResponse.json({ ok: data.ok, model });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return jsonError(e, 400);
  }
}
