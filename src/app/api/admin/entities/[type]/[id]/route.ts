import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { ENTITY_SCHEMAS, isEntityType } from "@/lib/entities";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/entities/[type]/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { type, id } = await ctx.params;
  if (!isEntityType(type)) return NextResponse.json({ error: "알 수 없는 데이터 종류" }, { status: 404 });
  const { data, error } = await parseBody(req, ENTITY_SCHEMAS[type].partial());
  if (error) return error;
  try {
    const { data: row, error: e } = await getAdminClient().from(type).update(data as Record<string, unknown>).eq("id", id).select("*").single();
    if (e) throw new Error(e.code === "23505" ? "이미 같은 이름의 항목이 있습니다." : e.message);
    return NextResponse.json({ item: row });
  } catch (e) {
    return jsonError(e, 400);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/entities/[type]/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { type, id } = await ctx.params;
  if (!isEntityType(type)) return NextResponse.json({ error: "알 수 없는 데이터 종류" }, { status: 404 });
  try {
    const { error: e } = await getAdminClient().from(type).delete().eq("id", id);
    if (e) throw new Error(e.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
