import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminClient } from "@/lib/supabase/server";
import { findReference } from "@/lib/game/art";
import { suggestFor } from "@/lib/game/suggestions";
import { classifyPhilosopher } from "@/lib/traditions";
import { gameJsonError } from "@/lib/game/api";

/** 관리자: 위키백과에서 참고 초상 자동 찾기 (생존 인물은 찾지 않음). 없으면 null */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/game/cards/[id]/reference">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const { data: p } = await getAdminClient().from("philosophers").select("name, aliases, original_name, tradition").eq("id", id).maybeSingle();
    if (!p) return NextResponse.json({ error: "사상가를 찾을 수 없습니다." }, { status: 404 });
    const aliases = (p.aliases as string[]) ?? [];
    const living = suggestFor(p.name as string, aliases, classifyPhilosopher({ name: p.name as string, tradition: (p.tradition as string) ?? null })).living;
    if (living) return NextResponse.json({ reference: null, living: true });
    const reference = await findReference({ name: p.name as string, originalName: (p.original_name as string) ?? null, aliases });
    return NextResponse.json({ reference, living: false });
  } catch (e) {
    return gameJsonError(e);
  }
}
