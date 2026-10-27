import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { importMemos } from "@/lib/data/memos";
import { parseBody } from "@/lib/http";

const Body = z.object({
  items: z.array(z.object({ questionId: z.string().uuid(), memo: z.string().max(50000) })).max(5000),
});

/** 이 브라우저의 메모를 서버로 옮기기 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await importMemos(data.items));
  } catch (e) {
    return jsonError(e, 400);
  }
}
