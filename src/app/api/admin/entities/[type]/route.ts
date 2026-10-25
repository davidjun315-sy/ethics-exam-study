import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { ENTITY_SCHEMAS, isEntityType } from "@/lib/entities";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";

export async function POST(req: Request, ctx: RouteContext<"/api/admin/entities/[type]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { type } = await ctx.params;
  if (!isEntityType(type)) return NextResponse.json({ error: "알 수 없는 데이터 종류" }, { status: 404 });
  const { data, error } = await parseBody(req, ENTITY_SCHEMAS[type]);
  if (error) return error;
  try {
    const { data: row, error: e } = await getAdminClient().from(type).insert(data as Record<string, unknown>).select("*").single();
    if (e) throw new Error(e.code === "23505" ? "이미 같은 이름의 항목이 있습니다." : e.message);
    return NextResponse.json({ item: row });
  } catch (e) {
    return jsonError(e, 400);
  }
}
