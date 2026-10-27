import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { deletePhilosopherNote, updatePhilosopherNote } from "@/lib/data/notes";
import { parseBody } from "@/lib/http";

const Body = z.object({ content: z.unknown() });

/** 관리자가 직접 수정한 개념 정리 노트 저장 */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/philosophers/[id]/note">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await updatePhilosopherNote(id, data.content));
  } catch (e) {
    return jsonError(e, 400);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/philosophers/[id]/note">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await deletePhilosopherNote(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
