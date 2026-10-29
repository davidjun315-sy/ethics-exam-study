import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { saveQuizSettings } from "@/lib/quiz/bank";

const n = z.number().int().min(0).max(50);
const Body = z
  .object({ daily_total: z.number().int().min(1).max(50), daily_exam: n, daily_expected: n, daily_review: n, auto_approve_exam: z.boolean(), signup_open: z.boolean() })
  .refine((s) => s.daily_exam + s.daily_expected + s.daily_review <= s.daily_total, { message: "기출 + 예상 + 복습 수가 하루 문제 수보다 많습니다." });

/** 일일 미션 구성 설정 */
export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await saveQuizSettings(data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
