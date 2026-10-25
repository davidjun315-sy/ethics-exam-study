import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, jsonError } from "@/lib/admin-guard";
import { AIConfigError, getAIProvider } from "@/lib/ai/provider";
import { listQuestionSummaries } from "@/lib/data/queries";
import { questionRef } from "@/lib/format";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { getAdminClient, getReadClient } from "@/lib/supabase/server";
import type { Philosopher } from "@/lib/types";

export const maxDuration = 120;

const Body = z.object({ a: z.string().uuid(), b: z.string().uuid(), refresh: z.boolean().optional() });

/** 사상가 비교. 한 번 생성한 비교는 DB 에 캐시해 다시 AI 를 호출하지 않는다. */
export async function POST(req: Request) {
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  if (data.a === data.b) return NextResponse.json({ error: "서로 다른 사상가를 선택하세요." }, { status: 400 });
  const admin = await isAdmin();
  // 순서와 무관하게 같은 비교로 취급
  const [aId, bId] = [data.a, data.b].sort();
  try {
    const read = getReadClient();
    const { data: cached } = await read
      .from("philosopher_comparisons")
      .select("*")
      .eq("philosopher_a_id", aId)
      .eq("philosopher_b_id", bId)
      .maybeSingle();
    if (cached && !(data.refresh && admin)) return NextResponse.json({ comparison: cached.content, aId, bId, cached: true });

    if (!admin && !rateLimit(`compare:${clientKey(req)}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
    }
    const { data: ps } = await read.from("philosophers").select("*").in("id", [aId, bId]);
    const a = ps?.find((p) => p.id === aId) as Philosopher | undefined;
    const b = ps?.find((p) => p.id === bId) as Philosopher | undefined;
    if (!a || !b) return NextResponse.json({ error: "사상가를 찾을 수 없습니다." }, { status: 404 });

    const { data: links } = await read.from("question_philosophers").select("question_id, philosopher_id").in("philosopher_id", [aId, bId]);
    const byQ = new Map<string, Set<string>>();
    for (const l of links ?? []) byQ.set(l.question_id, (byQ.get(l.question_id) ?? new Set()).add(l.philosopher_id));
    const both = [...byQ.entries()].filter(([, s]) => s.size === 2).map(([q]) => q);
    const related = await listQuestionSummaries({ ids: both.slice(0, 10) });

    const provider = await getAIProvider();
    const res = await provider.comparePhilosophers(
      { name: a.name, school: a.school },
      { name: b.name, school: b.school },
      related.map((q) => `${questionRef(q.exam, q.label)}: ${q.analysis?.answer ?? ""}`.slice(0, 200)),
    );
    await getAdminClient()
      .from("philosopher_comparisons")
      .upsert(
        { philosopher_a_id: aId, philosopher_b_id: bId, content: res.data, provider: res.provider, model: res.model },
        { onConflict: "philosopher_a_id,philosopher_b_id" },
      );
    return NextResponse.json({ comparison: res.data, aId, bId, cached: false });
  } catch (e) {
    if (e instanceof AIConfigError) return NextResponse.json({ error: e.message }, { status: 503 });
    return jsonError(e);
  }
}
