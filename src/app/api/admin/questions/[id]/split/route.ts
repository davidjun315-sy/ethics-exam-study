import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";
import type { Question, Region } from "@/lib/types";

const Body = z.object({
  regionIndex: z.number().int().min(0),
  y: z.number().min(0).max(1), // 페이지 기준 정규화 y 좌표
  newNumber: z.number().int().min(0).max(999),
  newLabel: z.string().min(1).max(30),
  newSubNumber: z.string().max(20).nullable(),
  textA: z.string().max(50000),
  textB: z.string().max(50000),
  asChild: z.boolean(), // true 이면 새 문항을 이 문항의 하위 문항으로 만든다
});

/** 문항 나누기: regions[regionIndex] 를 y 에서 잘라 뒤쪽을 새 문항으로 만든다. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/questions/[id]/split">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    const { data: q, error: e } = await db.from("questions").select("*").eq("id", id).single();
    if (e || !q) throw new Error("문항을 찾을 수 없습니다.");
    const question = q as Question;
    const target = question.regions[data.regionIndex];
    if (!target) throw new Error("영역 번호가 올바르지 않습니다.");
    if (data.y <= target.y0 || data.y >= target.y1) throw new Error("자를 위치가 영역 밖입니다.");

    const regionsA: Region[] = [...question.regions.slice(0, data.regionIndex), { ...target, y1: data.y }];
    const regionsB: Region[] = [{ ...target, y0: data.y }, ...question.regions.slice(data.regionIndex + 1)];

    await db
      .from("questions")
      .update({
        regions: regionsA,
        question_text: data.textA,
        page_end: regionsA[regionsA.length - 1].page,
        segmentation_source: "manual",
      })
      .eq("id", id);

    // 새 문항은 바로 뒤에 오도록 sort_order 를 정한다.
    const { data: next } = await db
      .from("questions")
      .select("sort_order")
      .eq("exam_id", question.exam_id)
      .gt("sort_order", question.sort_order)
      .order("sort_order")
      .limit(1);
    const nextOrder = next?.[0]?.sort_order ?? question.sort_order + 10;
    const sortOrder = Math.floor((question.sort_order + nextOrder) / 2) === question.sort_order
      ? question.sort_order + 1
      : Math.floor((question.sort_order + nextOrder) / 2);

    const { data: created, error: cErr } = await db
      .from("questions")
      .insert({
        exam_id: question.exam_id,
        parent_id: data.asChild ? question.id : question.parent_id,
        question_number: data.newNumber,
        sub_question_number: data.newSubNumber,
        label: data.newLabel,
        sort_order: sortOrder,
        page_start: regionsB[0].page,
        page_end: regionsB[regionsB.length - 1].page,
        regions: regionsB,
        question_text: data.textB,
        score: null,
        segmentation_source: "manual",
        needs_review: true,
      })
      .select("*")
      .single();
    if (cErr) throw new Error(cErr.message);
    await db
      .from("question_analysis")
      .update({ status: "needs_review", review_reasons: ["문항이 나뉘었습니다. 재분석이 필요합니다."] })
      .eq("question_id", id);
    return NextResponse.json({ question: created });
  } catch (e) {
    return jsonError(e);
  }
}
