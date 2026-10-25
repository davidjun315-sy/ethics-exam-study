import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, requireAdmin } from "@/lib/admin-guard";
import { upsertConcept, upsertPhilosopher, upsertSource } from "@/lib/data/tags";
import { normalizeTitle } from "@/lib/format";
import { parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/server";

const Body = z.object({
  philosophers: z
    .array(z.object({ name: z.string().min(1).max(100), role: z.enum(["main", "comparison", "distractor", "mentioned"]) }))
    .max(30)
    .optional(),
  concepts: z.array(z.object({ name: z.string().min(1).max(100), philosopher: z.string().max(100).nullable() })).max(60).optional(),
  sources: z
    .array(
      z.object({
        title: z.string().max(200).nullable(),
        philosopher_name: z.string().max(100).nullable(),
        location: z.string().max(200).nullable(),
        verification_status: z.enum(["confirmed", "likely", "candidate", "unknown"]),
        confidence: z.number().min(0).max(1).nullable(),
        related_content: z.string().max(5000).nullable(),
        relation_to_question: z.string().max(5000).nullable(),
        quoted_text: z.string().max(5000).nullable(),
        reasoning: z.string().max(5000).nullable(),
      }),
    )
    .max(20)
    .optional(),
});

/**
 * 사상가 / 개념 / 원전 연결을 관리자가 직접 수정한다.
 * 수정된 연결은 is_manual=true 로 저장되어 AI 재분석 시에도 지워지지 않는다.
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/admin/questions/[id]/tags">) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    const db = getAdminClient();
    const edited: string[] = [];
    const nameToId = new Map<string, string>();

    if (data.philosophers) {
      edited.push("philosophers");
      const { data: old } = await db.from("question_philosophers").select("*").eq("question_id", id);
      await db.from("question_philosophers").delete().eq("question_id", id);
      const seen = new Set<string>();
      for (const p of data.philosophers) {
        const pid = await upsertPhilosopher(db, { name: p.name });
        nameToId.set(p.name.trim(), pid);
        if (seen.has(pid)) continue;
        seen.add(pid);
        const prev = old?.find((o) => o.philosopher_id === pid);
        await db.from("question_philosophers").insert({
          question_id: id,
          philosopher_id: pid,
          role: p.role,
          confidence: prev?.confidence ?? null,
          reasoning: prev?.reasoning ?? {},
          is_manual: true,
        });
      }
    }

    if (data.concepts) {
      edited.push("concepts");
      const { data: old } = await db.from("question_concepts").select("*").eq("question_id", id);
      await db.from("question_concepts").delete().eq("question_id", id);
      const seen = new Set<string>();
      for (const c of data.concepts) {
        const cid = await upsertConcept(db, { name: c.name });
        if (seen.has(cid)) continue;
        seen.add(cid);
        const pid = c.philosopher
          ? (nameToId.get(c.philosopher.trim()) ?? (await upsertPhilosopher(db, { name: c.philosopher })))
          : null;
        const prev = old?.find((o) => o.concept_id === cid);
        await db.from("question_concepts").insert({
          question_id: id,
          concept_id: cid,
          philosopher_id: pid,
          confidence: prev?.confidence ?? null,
          is_manual: true,
        });
      }
    }

    if (data.sources) {
      edited.push("sources");
      await db.from("question_sources").delete().eq("question_id", id);
      for (const s of data.sources) {
        let sourceId: string | null = null;
        if (s.title?.trim()) {
          const pid = s.philosopher_name ? await upsertPhilosopher(db, { name: s.philosopher_name }) : null;
          sourceId = await upsertSource(db, { title: s.title, philosopherId: pid });
        }
        await db.from("question_sources").insert({
          ...s,
          title_raw: s.title ? normalizeTitle(s.title) : null,
          question_id: id,
          source_id: sourceId,
          is_manual: true,
        });
      }
    }

    if (edited.length) {
      const { data: a } = await db.from("question_analysis").select("edited_fields").eq("question_id", id).maybeSingle();
      if (a) {
        await db
          .from("question_analysis")
          .update({ edited_fields: [...new Set([...(a.edited_fields ?? []), ...edited])], edited_at: new Date().toISOString() })
          .eq("question_id", id);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
