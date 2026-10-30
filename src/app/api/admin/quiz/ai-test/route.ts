import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { geminiCheck, GeminiError, geminiJson } from "@/lib/ai/gemini";

export const maxDuration = 120;

/**
 * 관리자: 서술형 AI 첨삭(Gemini) 점검.
 * mode=check → 키·모델 확인만 (빠르고 무료 한도를 쓰지 않음)
 * mode=generate → 아주 짧은 답을 실제로 만들어 응답 시간과 쓰인 모델을 본다 (한도 1회 사용)
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const mode = new URL(req.url).searchParams.get("mode") ?? "check";
  try {
    if (mode === "generate") {
      const r = await geminiJson(z.object({ ok: z.boolean() }), "JSON 으로만 답하세요.", '{"ok": true} 를 그대로 답하세요.');
      return NextResponse.json({ model: r.model, ms: r.ms });
    }
    return NextResponse.json(await geminiCheck());
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return jsonError(e, 400);
  }
}
