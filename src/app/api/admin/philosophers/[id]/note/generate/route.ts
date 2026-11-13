import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { GeminiError } from "@/lib/ai/gemini";
import { invalidating } from "@/lib/cache";
import { generatePhilosopherNote } from "@/lib/data/notes";

// 무료 등급 응답이 느릴 때 예비 모델로 다시 시도할 시간까지 (Gemini 호출 전체 제한은 105초)
export const maxDuration = 120;

/** 무료 AI(Gemini)로 개념 정리 노트를 바로 만들어 저장 (기존 노트는 새 정리로 바뀜) */
export const POST = invalidating(async function POST(_req: Request, ctx: RouteContext<"/api/admin/philosophers/[id]/note/generate">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const r = await generatePhilosopherNote(id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof GeminiError) return NextResponse.json({ error: e.message }, { status: e.status });
    return jsonError(e, 400);
  }
});
