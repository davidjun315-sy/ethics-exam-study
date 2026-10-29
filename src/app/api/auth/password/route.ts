import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { changePassword, getCurrentMember } from "@/lib/members";

const Body = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

/** 비밀번호 변경 (본인만) */
export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await changePassword(me.id, data.current, data.next);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
