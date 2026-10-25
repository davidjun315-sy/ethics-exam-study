import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeName, normalizeTitle } from "@/lib/format";

/**
 * 이름으로 사상가/개념/원전을 찾고, 없으면 만든다. (AI 분석 결과 → 관계형 데이터)
 * aliases 에 등록된 별칭으로도 매칭한다. (예: 왕양명 → 왕수인)
 */

async function findByNameOrAlias(db: SupabaseClient, table: string, column: string, value: string) {
  const { data } = await db.from(table).select("*").eq(column, value).maybeSingle();
  if (data) return data;
  const { data: alias } = await db.from(table).select("*").contains("aliases", [value]).limit(1);
  return alias?.[0] ?? null;
}

export async function upsertPhilosopher(
  db: SupabaseClient,
  input: { name: string; originalName?: string | null; tradition?: string | null; school?: string | null; era?: string | null },
): Promise<string> {
  const name = normalizeName(input.name);
  const existing = await findByNameOrAlias(db, "philosophers", "name", name);
  if (existing) {
    // 비어 있는 필드만 채운다 (관리자가 입력한 값은 덮어쓰지 않음)
    const patch: Record<string, string> = {};
    if (!existing.original_name && input.originalName) patch.original_name = input.originalName;
    if (!existing.tradition && input.tradition) patch.tradition = input.tradition;
    if (!existing.school && input.school) patch.school = input.school;
    if (!existing.era && input.era) patch.era = input.era;
    if (Object.keys(patch).length) await db.from("philosophers").update(patch).eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await db
    .from("philosophers")
    .insert({
      name,
      original_name: input.originalName ?? null,
      tradition: input.tradition ?? null,
      school: input.school ?? null,
      era: input.era ?? null,
    })
    .select("id")
    .single();
  if (error) {
    // 동시에 같은 이름이 만들어진 경우
    const again = await findByNameOrAlias(db, "philosophers", "name", name);
    if (again) return again.id;
    throw new Error(error.message);
  }
  return data.id;
}

export async function upsertConcept(db: SupabaseClient, input: { name: string; definition?: string | null }): Promise<string> {
  const name = normalizeName(input.name);
  const existing = await findByNameOrAlias(db, "concepts", "name", name);
  if (existing) {
    if (!existing.definition && input.definition) {
      await db.from("concepts").update({ definition: input.definition }).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data, error } = await db
    .from("concepts")
    .insert({ name, definition: input.definition ?? null })
    .select("id")
    .single();
  if (error) {
    const again = await findByNameOrAlias(db, "concepts", "name", name);
    if (again) return again.id;
    throw new Error(error.message);
  }
  return data.id;
}

export async function upsertSource(db: SupabaseClient, input: { title: string; philosopherId?: string | null }): Promise<string> {
  const title = normalizeTitle(input.title);
  const existing = await findByNameOrAlias(db, "sources", "title", title);
  if (existing) {
    if (!existing.philosopher_id && input.philosopherId) {
      await db.from("sources").update({ philosopher_id: input.philosopherId }).eq("id", existing.id);
    }
    return existing.id;
  }
  const { data, error } = await db
    .from("sources")
    .insert({ title, philosopher_id: input.philosopherId ?? null })
    .select("id")
    .single();
  if (error) {
    const again = await findByNameOrAlias(db, "sources", "title", title);
    if (again) return again.id;
    throw new Error(error.message);
  }
  return data.id;
}

export async function linkConceptPhilosopher(db: SupabaseClient, conceptId: string, philosopherId: string) {
  await db
    .from("concept_philosophers")
    .upsert({ concept_id: conceptId, philosopher_id: philosopherId }, { onConflict: "concept_id,philosopher_id", ignoreDuplicates: true });
}
