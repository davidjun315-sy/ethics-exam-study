import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { createManualItem } from "@/lib/quiz/bank";

const Body = z.object({
  passage: z.string().min(10).max(20000),
  answer: z.string().min(1).max(10000),
  explanation: z.string().max(10000).optional(),
  format: z.enum(["fill", "essay"]),
  area: z.string().max(50).nullable().optional(),
  questionId: z.string().uuid().nullable().optional(),
});

/** 예상 문제 직접 추가 (승인 대기) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json({ id: await createManualItem(data) });
  } catch (e) {
    return jsonError(e, 400);
  }
}
