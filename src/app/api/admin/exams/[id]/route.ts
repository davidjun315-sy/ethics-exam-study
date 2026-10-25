import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { BUCKETS, getAdminClient } from "@/lib/supabase/server";

const Patch = z
  .object({
    exam_year: z.number().int().min(1990).max(2100),
    exam_name: z.string().min(1).max(100),
    subject: z.string().min(1).max(100),
    section: z.enum(["A", "B"]).nullable(),
    note: z.string().max(2000).nullable(),
    status: z.enum(["uploaded", "segmented", "analyzing", "analyzed"]),
  })
  .partial();

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/exams/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Patch);
  if (error) return error;
  try {
    const db = getAdminClient();
    const { data: exam, error: upErr } = await db.from("exams").update(data).eq("id", id).select("*").single();
    if (upErr) throw new Error(upErr.message);
    return NextResponse.json({ exam });
  } catch (e) {
    return jsonError(e);
  }
}

async function removeFolder(bucket: string, prefix: string) {
  const db = getAdminClient();
  const stack = [prefix];
  const files: string[] = [];
  while (stack.length) {
    const dir = stack.pop()!;
    const { data } = await db.storage.from(bucket).list(dir, { limit: 1000 });
    for (const f of data ?? []) {
      const full = `${dir}/${f.name}`;
      if (f.id) files.push(full);
      else stack.push(full); // 폴더
    }
  }
  for (let i = 0; i < files.length; i += 100) await db.storage.from(bucket).remove(files.slice(i, i + 100));
}

/** 시험 삭제 (문항, 분석, 페이지, Storage 파일 모두 삭제) */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/exams/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const db = getAdminClient();
    const { error } = await db.from("exams").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await Promise.allSettled([removeFolder(BUCKETS.pdfs, id), removeFolder(BUCKETS.images, id)]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
