import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { saveCard } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const Body = z.object({
  rarity: z.enum(["common", "rare", "epic", "legendary"]),
  base_atk: z.number().int().min(1).max(999),
  base_hp: z.number().int().min(1).max(9999),
  skill_name: z.string().trim().max(40),
  skill_effect: z.enum(["strike", "sweep", "heal", "guard", "stun"]),
  skill_desc: z.string().trim().max(120),
  quote: z.string().trim().max(80),
  art_url: z.string().url().max(500).nullable(),
  art_basis: z.enum(["portrait", "reconstruction"]),
  art_note: z.string().trim().max(200),
  published: z.boolean(),
});

/** 관리자: 카드 정보 저장 (사상가 원본은 바꾸지 않음) */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/game/cards/[id]">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await saveCard(id, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
