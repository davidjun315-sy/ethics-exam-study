import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { RegionSchema } from "@/lib/schemas-admin";
import { getAdminClient } from "@/lib/supabase/server";

const Body = z.object({
  replace: z.boolean(),
  pages: z
    .array(
      z.object({
        page_number: z.number().int().min(1),
        image_url: z.string().url().nullable(),
        width: z.number().nullable(),
        height: z.number().nullable(),
        text_content: z.string().max(100000).nullable(),
        has_text_layer: z.boolean(),
      }),
    )
    .max(500),
  questions: z
    .array(
      z.object({
        question_number: z.number().int().min(0).max(999),
        label: z.string().min(1).max(30),
        page_start: z.number().int().nullable(),
        page_end: z.number().int().nullable(),
        regions: z.array(RegionSchema).max(20),
        question_text: z.string().max(50000).nullable(),
        question_image_url: z.string().url().nullable(),
        score: z.number().nullable(),
        question_type: z.string().max(30).nullable(),
        needs_review: z.boolean(),
      }),
    )
    .max(300),
});

/** 브라우저에서 수행한 페이지 렌더링 / 문항 분리 결과를 저장한다. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/exams/[id]/segmentation">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    if (data.replace) {
      const { error: delErr } = await db.from("questions").delete().eq("exam_id", id);
      if (delErr) throw new Error(delErr.message);
    }
    if (data.pages.length) {
      const { error: pErr } = await db
        .from("exam_pages")
        .upsert(data.pages.map((p) => ({ ...p, exam_id: id })), { onConflict: "exam_id,page_number" });
      if (pErr) throw new Error(pErr.message);
    }
    const { count } = await db.from("questions").select("*", { count: "exact", head: true }).eq("exam_id", id);
    const base = count ?? 0;
    const rows = data.questions.map((q, i) => ({ ...q, exam_id: id, sort_order: (base + i + 1) * 10, segmentation_source: "auto" }));
    const { data: inserted, error: qErr } = rows.length
      ? await db.from("questions").insert(rows).select("id, label, sort_order")
      : { data: [], error: null };
    if (qErr) throw new Error(qErr.message);
    await db.from("exams").update({ status: "segmented", page_count: data.pages.length || undefined }).eq("id", id);
    return NextResponse.json({ questions: inserted });
  } catch (e) {
    return jsonError(e);
  }
}
