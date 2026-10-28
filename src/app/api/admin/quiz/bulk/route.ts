import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { setQuizItemsStatus } from "@/lib/quiz/bank";

const Body = z.object({ ids: z.array(z.string().uuid()).min(1).max(2000), status: z.enum(["approved", "hidden", "pending"]) });

/** 여러 문제 승인 / 비공개 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setQuizItemsStatus(data.ids, data.status);
    return NextResponse.json({ ok: true, count: data.ids.length });
  } catch (e) {
    return jsonError(e, 400);
  }
}
