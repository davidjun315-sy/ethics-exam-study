import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { BUCKETS, getAdminClient } from "@/lib/supabase/server";

const Body = z.object({ ext: z.enum(["webp", "png", "jpg"]) });

/** 관리자: 카드 일러스트 업로드용 signed URL (공개 이미지 버킷의 game-cards/ 아래) */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/game/cards/[id]/art">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "잘못된 사상가 id" }, { status: 400 });
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const bucket = getAdminClient().storage.from(BUCKETS.images);
    const path = `game-cards/${id}-${Date.now()}.${data.ext}`;
    const { data: s, error: e } = await bucket.createSignedUploadUrl(path, { upsert: true });
    if (e) throw new Error(e.message);
    return NextResponse.json({ path, token: s.token, publicUrl: bucket.getPublicUrl(path).data.publicUrl });
  } catch (e) {
    return jsonError(e);
  }
}
