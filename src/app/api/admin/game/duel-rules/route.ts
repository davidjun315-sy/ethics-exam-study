import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { parseBody } from "@/lib/http";
import { saveDuelRules } from "@/lib/game/data";
import { gameJsonError } from "@/lib/game/api";

const perRarity = z.object({ common: z.number(), rare: z.number(), epic: z.number(), legendary: z.number() });
const Body = z.object({
  heroHp: z.number().int(),
  maxMana: z.number().int(),
  fieldSize: z.number().int(),
  handSize: z.number().int(),
  deckSize: z.number().int(),
  turnLimit: z.number().int(),
  atkDiv: z.number(),
  hpDiv: z.number(),
  cost: perRarity,
  rarityBoost: perRarity,
});

/** 관리자: 논쟁 대전 조정값 (범위·순서 확인은 saveDuelRules) */
export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    await saveDuelRules(data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gameJsonError(e);
  }
}
