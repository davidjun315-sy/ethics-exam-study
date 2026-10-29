import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { setMemberDisabled } from "@/lib/members";

const Body = z.object({ disabled: z.boolean() });

/** 회원 이용 정지 / 해제 (기록은 지우지 않음) */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/members/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await setMemberDisabled(id, data.disabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
