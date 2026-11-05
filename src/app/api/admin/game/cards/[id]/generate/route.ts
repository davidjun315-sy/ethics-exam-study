import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";
import { classifyPhilosopher } from "@/lib/traditions";
import { generateCardArt } from "@/lib/game/art";
import { gameJsonError } from "@/lib/game/api";

export const maxDuration = 120;

const Body = z.object({ referenceUrl: z.string().url().max(1000).nullable().optional() });

/** 관리자: 참고 초상을 자동으로 찾아 카드 일러스트 생성 (저장은 관리자가 '이 그림 사용'을 눌러야) */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/game/cards/[id]/generate">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const { data: p } = await getAdminClient().from("philosophers").select("name, aliases, original_name, era, tradition").eq("id", id).maybeSingle();
    if (!p) return NextResponse.json({ error: "사상가를 찾을 수 없습니다." }, { status: 404 });
    const art = await generateCardArt({
      name: p.name as string,
      originalName: (p.original_name as string) ?? null,
      aliases: (p.aliases as string[]) ?? [],
      era: (p.era as string) ?? null,
      tradition: classifyPhilosopher({ name: p.name as string, tradition: (p.tradition as string) ?? null }),
      referenceUrl: data.referenceUrl ?? null,
    });
    return NextResponse.json(art);
  } catch (e) {
    return gameJsonError(e);
  }
}
