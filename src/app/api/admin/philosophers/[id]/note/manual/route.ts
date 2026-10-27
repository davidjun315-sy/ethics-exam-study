import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { buildNoteManualPrompt, importPhilosopherNote } from "@/lib/data/notes";
import { parseBody } from "@/lib/http";

/** 채팅 AI 에 붙여넣을 사상가 개념 정리 프롬프트 (이 사상가의 기출 분석 모음 포함) */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/philosophers/[id]/note/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ prompt: await buildNoteManualPrompt(id) });
  } catch (e) {
    return jsonError(e, 400);
  }
}

const Body = z.object({ text: z.string().min(2).max(400000), source: z.string().max(50).optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/admin/philosophers/[id]/note/manual">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    return NextResponse.json(await importPhilosopherNote(id, data.text, data.source?.trim() || "채팅 AI"));
  } catch (e) {
    return jsonError(e, 400);
  }
}
