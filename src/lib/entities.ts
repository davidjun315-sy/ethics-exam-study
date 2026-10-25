import { z } from "zod";

const strArr = z.array(z.string().max(200)).max(100);
const opt = (s: z.ZodType) => s.nullable().optional();

/** 관리자 화면에서 직접 편집 가능한 마스터 데이터 정의 */
export const ENTITY_SCHEMAS = {
  philosophers: z.object({
    name: z.string().min(1).max(100),
    aliases: strArr.optional(),
    original_name: opt(z.string().max(200)),
    tradition: opt(z.string().max(100)),
    school: opt(z.string().max(100)),
    era: opt(z.string().max(100)),
    core_ideas: opt(z.string().max(20000)),
    description: opt(z.string().max(20000)),
  }),
  concepts: z.object({
    name: z.string().min(1).max(100),
    aliases: strArr.optional(),
    definition: opt(z.string().max(20000)),
    similar_concepts: strArr.optional(),
    confusable_concepts: strArr.optional(),
  }),
  sources: z.object({
    title: z.string().min(1).max(200),
    aliases: strArr.optional(),
    philosopher_id: opt(z.string().uuid()),
    summary: opt(z.string().max(20000)),
  }),
  source_passages: z.object({
    source_id: z.string().uuid(),
    volume: opt(z.string().max(100)),
    chapter: opt(z.string().max(200)),
    section: opt(z.string().max(200)),
    page: opt(z.string().max(50)),
    original_text: opt(z.string().max(50000)),
    translation: opt(z.string().max(50000)),
    citation: opt(z.string().max(1000)),
    related_concepts: strArr.optional(),
    note: opt(z.string().max(5000)),
  }),
} as const;

export type EntityType = keyof typeof ENTITY_SCHEMAS;

export function isEntityType(v: string): v is EntityType {
  return v in ENTITY_SCHEMAS;
}
