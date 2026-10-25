import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";

const Body = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) });

/** 같은 PDF(SHA-256)가 이미 등록되었는지 확인 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    const { data: exam } = await db
      .from("exams")
      .select("id, exam_year, section, exam_name")
      .eq("pdf_hash", data.hash)
      .maybeSingle();
    return NextResponse.json({ exists: Boolean(exam), exam });
  } catch (e) {
    return jsonError(e);
  }
}
