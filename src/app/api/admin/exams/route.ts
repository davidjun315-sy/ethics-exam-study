import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { BUCKETS, getAdminClient } from "@/lib/supabase/server";

const Body = z.object({
  exam_year: z.number().int().min(1990).max(2100),
  exam_name: z.string().min(1).max(100),
  subject: z.string().min(1).max(100),
  section: z.enum(["A", "B"]).nullable(),
  note: z.string().max(2000).nullable().optional(),
  pdf_hash: z.string().regex(/^[0-9a-f]{64}$/),
  pdf_size: z.number().int().positive().max(100 * 1024 * 1024),
  page_count: z.number().int().positive().max(500),
});

/**
 * 시험 등록 + PDF 업로드용 signed URL 발급.
 * PDF 는 브라우저가 Supabase Storage 로 직접 업로드한다. (Vercel 요청 크기 제한 회피)
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    const { data: dup } = await db.from("exams").select("id").eq("pdf_hash", data.pdf_hash).maybeSingle();
    if (dup) {
      return NextResponse.json({ error: "이미 등록된 시험입니다.", examId: dup.id }, { status: 409 });
    }
    const { data: exam, error: insErr } = await db
      .from("exams")
      .insert({ ...data, note: data.note ?? null })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    const path = `${exam.id}/${data.pdf_hash.slice(0, 16)}.pdf`;
    const { data: signed, error: signErr } = await db.storage.from(BUCKETS.pdfs).createSignedUploadUrl(path, { upsert: true });
    if (signErr) {
      await db.from("exams").delete().eq("id", exam.id);
      throw new Error(`Storage 업로드 URL 발급 실패: ${signErr.message} (exam-pdfs 버킷이 있는지 확인하세요)`);
    }
    const publicUrl = db.storage.from(BUCKETS.pdfs).getPublicUrl(path).data.publicUrl;
    await db.from("exams").update({ pdf_path: path, pdf_url: publicUrl }).eq("id", exam.id);
    return NextResponse.json({ exam: { ...exam, pdf_path: path, pdf_url: publicUrl }, upload: { path, token: signed.token } });
  } catch (e) {
    return jsonError(e);
  }
}
