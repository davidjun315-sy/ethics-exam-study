import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { BUCKETS, getAdminClient } from "@/lib/supabase/server";
import { BATTLE_BG_KEYS, saveBattleBg } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Upload = z.object({ ext: z.enum(["webp", "jpg", "png"]) });
const Save = z.object({ tradition: z.enum(BATTLE_BG_KEYS), url: z.string().url().max(1000).nullable() });

/** 관리자: 전장 배경 업로드용 signed URL (공개 이미지 버킷의 game-cards/bg/ 아래) */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Upload);
  if (error) return error;
  try {
    const bucket = getAdminClient().storage.from(BUCKETS.images);
    const path = `game-cards/bg/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${data.ext}`;
    const { data: s, error: e } = await bucket.createSignedUploadUrl(path, { upsert: true });
    if (e) throw new Error(e.message);
    return NextResponse.json({ path, token: s.token, publicUrl: bucket.getPublicUrl(path).data.publicUrl });
  } catch (e) {
    return jsonError(e);
  }
}

/** 관리자: 분야별 전장 배경 저장 · 기본으로 되돌리기 */
export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Save);
  if (error) return error;
  try {
    await saveBattleBg(data.tradition, data.url);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
