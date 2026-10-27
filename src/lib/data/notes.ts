import "server-only";
import { z } from "zod";
import { buildNotePrompt, NOTE_PROMPT_VERSION, NOTE_SYSTEM } from "@prompts/philosopher-notes";
import { validatePasted } from "@/lib/ai/lenient";
import { PhilosopherStudyNoteSchema, type PhilosopherStudyNote } from "@/lib/ai/schemas";
import { buildNoteInput, noteConceptCount, sanitizeNoteRefs } from "@/lib/study/notes";
import { getAdminClient, getReadClient } from "@/lib/supabase/server";
import type { Philosopher } from "@/lib/types";
import { getPhilosopherNotebook } from "./study";

export interface PhilosopherNoteRow {
  id: string;
  philosopher_id: string;
  content: PhilosopherStudyNote;
  ref_map: Record<string, string>;
  source: string | null;
  prompt_version: string | null;
  based_on_question_ids: string[];
  edited: boolean;
  created_at: string;
  updated_at: string;
}

/** 저장된 개념 정리 노트. 테이블이 아직 없으면(003 미실행) null */
export async function getPhilosopherNote(philosopherId: string): Promise<PhilosopherNoteRow | null> {
  const { data, error } = await getReadClient().from("philosopher_notes").select("*").eq("philosopher_id", philosopherId).maybeSingle();
  if (error) return null;
  return (data as PhilosopherNoteRow | null) ?? null;
}

async function loadPhilosopher(id: string): Promise<Philosopher> {
  const { data } = await getReadClient().from("philosophers").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("사상가를 찾을 수 없습니다.");
  return data as Philosopher;
}

/** 채팅 AI 에 붙여넣을 개념 정리 프롬프트 */
export async function buildNoteManualPrompt(philosopherId: string): Promise<string> {
  const p = await loadPhilosopher(philosopherId);
  const nb = await getPhilosopherNotebook(p);
  if (nb.timeline.length === 0) throw new Error("이 사상가가 나온 분석 완료 문항이 없습니다. 먼저 기출 문항을 분석하세요.");
  const input = buildNoteInput(
    { name: p.name, aliases: p.aliases, originalName: p.original_name, tradition: p.tradition, school: p.school, era: p.era, coreIdeas: p.core_ideas ?? p.description },
    nb,
  );
  return [
    "<instructions>",
    NOTE_SYSTEM,
    "</instructions>",
    "",
    buildNotePrompt(input),
    "",
    "출력 형식: 설명 없이 아래 JSON Schema 를 만족하는 JSON 하나만 ```json 코드 블록으로 출력하세요.",
    "<json_schema>",
    JSON.stringify(z.toJSONSchema(PhilosopherStudyNoteSchema)),
    "</json_schema>",
  ].join("\n");
}

async function save(philosopherId: string, note: PhilosopherStudyNote, meta: { source: string; edited: boolean; promptVersion?: string; refresh: boolean }) {
  const p = await loadPhilosopher(philosopherId);
  const nb = await getPhilosopherNotebook(p);
  const { note: clean, dropped } = sanitizeNoteRefs(note, nb.timeline.map((q) => q.ref));
  if (noteConceptCount(clean) === 0) throw new Error("정리된 개념이 없습니다. sections 안에 concepts 가 있어야 합니다.");
  const refMap = Object.fromEntries(nb.timeline.map((q) => [q.ref, q.id]));
  const db = getAdminClient();
  const row: Record<string, unknown> = { philosopher_id: philosopherId, content: clean, ref_map: refMap, edited: meta.edited, updated_at: new Date().toISOString() };
  // 붙여넣기(새로 정리)일 때만 기준 문항·출처를 바꾼다. 직접 수정은 기존 기준 유지
  if (meta.refresh) {
    row.source = meta.source;
    row.prompt_version = meta.promptVersion ?? null;
    row.based_on_question_ids = nb.timeline.map((q) => q.id);
  }
  const { error } = await db.from("philosopher_notes").upsert(row, { onConflict: "philosopher_id" });
  if (error) {
    if (/philosopher_notes/.test(error.message)) throw new Error("philosopher_notes 테이블이 없습니다. Supabase SQL Editor 에서 supabase/migrations/003_philosopher_notes.sql 을 실행하세요.");
    throw new Error(error.message);
  }
  return { dropped, concepts: noteConceptCount(clean) };
}

/** 채팅 AI 가 정리한 노트를 붙여넣어 저장 (기존 노트는 덮어씀) */
export function importPhilosopherNote(philosopherId: string, pasted: string, source: string) {
  const note = validatePasted(PhilosopherStudyNoteSchema, pasted);
  return save(philosopherId, note, { source, edited: false, promptVersion: NOTE_PROMPT_VERSION, refresh: true });
}

/** 관리자가 직접 수정한 노트 저장. 노트가 없던 사상가면 "직접 작성" 으로 새로 만든다 */
export async function updatePhilosopherNote(philosopherId: string, content: unknown) {
  const parsed = PhilosopherStudyNoteSchema.safeParse(content);
  if (!parsed.success) throw new Error(`양식이 맞지 않습니다. ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join(" / ")}`);
  const existing = await getPhilosopherNote(philosopherId);
  return save(philosopherId, parsed.data, { source: "직접 작성", edited: true, refresh: !existing });
}

export async function deletePhilosopherNote(philosopherId: string) {
  const { error } = await getAdminClient().from("philosopher_notes").delete().eq("philosopher_id", philosopherId);
  if (error) throw new Error(error.message);
}
