import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { applyOrder, sortByNumber } from "@/lib/data/ordering";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";

const Body = z.union([
  z.object({ mode: z.literal("manual"), order: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ mode: z.literal("byNumber") }),
]);

/** 문항 순서 바꾸기: 직접 지정한 순서(manual) 또는 문항 번호순(byNumber) */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/exams/[id]/order">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    if (data.mode === "byNumber") await sortByNumber(db, id);
    else await applyOrder(db, id, data.order);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e, 400);
  }
}
