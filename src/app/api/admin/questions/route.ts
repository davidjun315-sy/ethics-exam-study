import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { QuestionFieldsSchema } from "@/lib/schemas-admin";
import { getAdminClient } from "@/lib/supabase/server";

const Body = QuestionFieldsSchema.partial().extend({
  exam_id: z.string().uuid(),
  question_number: z.number().int().min(0).max(999),
  label: z.string().min(1).max(30),
});

/** 문항 직접 추가 (자동 분리 실패 시 / 하위 문항 추가) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    const { data: last } = await db
      .from("questions")
      .select("sort_order")
      .eq("exam_id", data.exam_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const { data: q, error: e } = await db
      .from("questions")
      .insert({ sort_order: (last?.[0]?.sort_order ?? 0) + 10, segmentation_source: "manual", ...data })
      .select("*")
      .single();
    if (e) throw new Error(e.message);
    return NextResponse.json({ question: q });
  } catch (e) {
    return jsonError(e);
  }
}
