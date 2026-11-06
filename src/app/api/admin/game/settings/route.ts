import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { saveGameSettings } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const n = (max: number) => z.number().int().min(0).max(max);
const Body = z.object({
  draw_cost: z.number().int().min(1).max(10000),
  rates: z.object({ common: n(1000), rare: n(1000), epic: n(1000), legendary: n(1000) }).refine((r) => r.common + r.rare + r.epic + r.legendary > 0, "확률 합이 0 입니다."),
  coin_rules: z.object({
    fill_correct: n(1000),
    essay_correct: n(1000),
    essay_partial: n(1000),
    wrong: n(1000),
    mission: n(5000),
    reconquer: n(1000),
    daily_cap: n(100000),
    essay_min_chars: n(1000),
  }),
  max_level: z.number().int().min(2).max(20),
  rarity_mult: z.object({ common: z.number().min(0.1).max(10), rare: z.number().min(0.1).max(10), epic: z.number().min(0.1).max(10), legendary: z.number().min(0.1).max(10) }),
  fusion_count: z.number().int().min(2).max(5),
  fusion_cost: n(100000),
});

/** 관리자: 뽑기 비용 · 확률 · 등급 배율 · 합성 · 코인 지급 기준 */
export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await saveGameSettings(data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
