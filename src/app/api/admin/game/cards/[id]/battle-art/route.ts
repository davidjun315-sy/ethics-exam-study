import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { BUCKETS, getAdminClient } from "@/lib/supabase/server";
import { saveBattleArt } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Upload = z.object({ ext: z.enum(["webp", "png"]) });
const Save = z.object({ url: z.string().url().max(1000).nullable() });

const badId = (id: string) => !/^[0-9a-f-]{36}$/.test(id);

/** 관리자: 전투 캐릭터 업로드용 signed URL (공개 이미지 버킷의 game-cards/battle/ 아래) */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/game/cards/[id]/battle-art">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (badId(id)) return NextResponse.json({ error: "잘못된 사상가 id" }, { status: 400 });
  const { data, error } = await parseBody(req, Upload);
  if (error) return error;
  try {
    const bucket = getAdminClient().storage.from(BUCKETS.images);
    const path = `game-cards/battle/${id}-${Date.now()}.${data.ext}`;
    const { data: s, error: e } = await bucket.createSignedUploadUrl(path, { upsert: true });
    if (e) throw new Error(e.message);
    return NextResponse.json({ path, token: s.token, publicUrl: bucket.getPublicUrl(path).data.publicUrl });
  } catch (e) {
    return jsonError(e);
  }
}

/** 관리자: 전투 캐릭터 주소 저장 · 지우기 */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/game/cards/[id]/battle-art">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (badId(id)) return NextResponse.json({ error: "잘못된 사상가 id" }, { status: 400 });
  const { data, error } = await parseBody(req, Save);
  if (error) return error;
  try {
    await saveBattleArt(id, data.url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
