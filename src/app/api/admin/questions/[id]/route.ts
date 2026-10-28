import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { AnalysisEditSchema, QuestionFieldsSchema } from "@/lib/schemas-admin";
import { getAdminClient } from "@/lib/supabase/server";
import { syncQuestionQuietly } from "@/lib/quiz/bank";

const Body = z.object({
  question: QuestionFieldsSchema.partial().optional(),
  analysis: AnalysisEditSchema.optional(),
});

/**
 * 문항 / 분석 수정.
 * 분석을 수정하면 edited_fields 에 기록되고, ai_original(AI 원본)은 그대로 보존된다.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/questions/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    if (data.question && Object.keys(data.question).length) {
      const { error: e } = await db
        .from("questions")
        .update({ ...data.question, segmentation_source: "manual" })
        .eq("id", id);
      if (e) throw new Error(e.message);
    }
    if (data.analysis && Object.keys(data.analysis).length) {
      const { data: existing } = await db.from("question_analysis").select("edited_fields").eq("question_id", id).maybeSingle();
      const changed = Object.keys(data.analysis).filter((k) => k !== "status" && k !== "review_reasons");
      const edited = [...new Set([...(existing?.edited_fields ?? []), ...changed])];
      const { error: e } = await db.from("question_analysis").upsert(
        {
          question_id: id,
          ...data.analysis,
          edited_fields: edited,
          edited_at: changed.length ? new Date().toISOString() : undefined,
        },
        { onConflict: "question_id" },
      );
      if (e) throw new Error(e.message);
    }
    // 문항 원문이나 분석을 고치면 윤리 퀴즈 문제은행에도 반영 (관리자가 고친 퀴즈 문제는 덮어쓰지 않음)
    if (data.question || data.analysis) await syncQuestionQuietly(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/questions/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const db = getAdminClient();
    // 퀴즈 문제는 지우지 않고 출제 중지 (학습 기록 보존). 테이블이 없으면 무시
    await db.from("quiz_items").update({ status: "stale" }).eq("question_id", id);
    const { error } = await db.from("questions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
