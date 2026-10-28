import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { requireLearner } from "@/lib/quiz/api";
import { setStartLevel } from "@/lib/quiz/learn";

const Body = z.object({ startLevel: z.enum(["basic", "advanced", "expert"]) });

/** 시작 난이도 설정·변경 */
export async function POST(req: Request) {
  const { learner, denied } = await requireLearner();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setStartLevel(learner, data.startLevel);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
