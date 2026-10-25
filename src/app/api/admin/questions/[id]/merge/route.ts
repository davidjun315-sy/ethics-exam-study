import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";
import type { Question } from "@/lib/types";

const Body = z.object({ otherId: z.string().uuid() });

/** 문항 합치기: other 문항의 영역과 텍스트를 이 문항 뒤에 붙이고 other 를 삭제한다. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/questions/[id]/merge">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    const { data: rows, error: e } = await db.from("questions").select("*").in("id", [id, data.otherId]);
    if (e) throw new Error(e.message);
    const a = rows?.find((r) => r.id === id) as Question | undefined;
    const b = rows?.find((r) => r.id === data.otherId) as Question | undefined;
    if (!a || !b || a.exam_id !== b.exam_id) throw new Error("같은 시험의 문항만 합칠 수 있습니다.");
    const [first, second] = a.sort_order <= b.sort_order ? [a, b] : [b, a];
    const merged = {
      regions: [...first.regions, ...second.regions],
      question_text: [first.question_text, second.question_text].filter(Boolean).join("\n"),
      page_start: Math.min(first.page_start ?? 1, second.page_start ?? 1),
      page_end: Math.max(first.page_end ?? 1, second.page_end ?? 1),
      score: a.score ?? b.score,
      segmentation_source: "manual",
      needs_review: false,
    };
    const { data: updated, error: uErr } = await db.from("questions").update(merged).eq("id", id).select("*").single();
    if (uErr) throw new Error(uErr.message);
    await db.from("questions").delete().eq("id", data.otherId);
    await db
      .from("question_analysis")
      .update({ status: "needs_review", review_reasons: ["문항이 합쳐졌습니다. 재분석이 필요합니다."] })
      .eq("question_id", id);
    return NextResponse.json({ question: updated });
  } catch (e) {
    return jsonError(e);
  }
}
