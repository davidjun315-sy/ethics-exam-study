import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { BUCKETS, getAdminClient } from "@/lib/supabase/server";

const SAFE_PATH = /^[0-9a-f-]{36}\/(pages|questions)\/[A-Za-z0-9_.-]{1,80}\.(jpg|png|webp)$/;
const Body = z.object({ paths: z.array(z.string().regex(SAFE_PATH)).min(1).max(200) });

/** 문항/페이지 이미지 업로드용 signed URL 일괄 발급 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    const bucket = db.storage.from(BUCKETS.images);
    const results = await Promise.all(
      data.paths.map(async (path) => {
        const { data: s, error: e } = await bucket.createSignedUploadUrl(path, { upsert: true });
        if (e) throw new Error(`${path}: ${e.message}`);
        return { path, token: s.token, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
      }),
    );
    return NextResponse.json({ uploads: results });
  } catch (e) {
    return jsonError(e);
  }
}
