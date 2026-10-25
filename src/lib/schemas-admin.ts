import { z } from "zod";

export const RegionSchema = z.object({
  page: z.number().int().min(1),
  x0: z.number().min(0).max(1),
  y0: z.number().min(0).max(1),
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
});

export const QuestionFieldsSchema = z.object({
  question_number: z.number().int().min(0).max(999),
  sub_question_number: z.string().max(20).nullable(),
  label: z.string().min(1).max(30),
  sort_order: z.number().int(),
  page_start: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  regions: z.array(RegionSchema).max(20),
  question_text: z.string().max(50000).nullable(),
  question_image_url: z.string().url().nullable(),
  score: z.number().min(0).max(100).nullable(),
  question_type: z.string().max(30).nullable(),
  parent_id: z.string().uuid().nullable(),
  needs_review: z.boolean(),
});

export const AnalysisEditSchema = z
  .object({
    area: z.string().max(100).nullable(),
    school: z.string().max(100).nullable(),
    era: z.string().max(100).nullable(),
    question_type: z.string().max(30).nullable(),
    difficulty: z.enum(["상", "중", "하"]).nullable(),
    answer: z.string().max(20000).nullable(),
    answer_explanation: z.string().max(50000).nullable(),
    question_intent: z.string().max(10000).nullable(),
    required_keywords: z.array(z.string().max(100)).max(100),
    common_mistakes: z.array(z.string().max(2000)).max(100),
    details: z.record(z.string(), z.unknown()),
    philosopher_confidence: z.number().min(0).max(1).nullable(),
    answer_confidence: z.number().min(0).max(1).nullable(),
    source_confidence: z.number().min(0).max(1).nullable(),
    concept_confidence: z.number().min(0).max(1).nullable(),
    overall_confidence: z.number().min(0).max(1).nullable(),
    status: z.enum(["pending", "analyzed", "needs_review", "verified", "error"]),
    review_reasons: z.array(z.string().max(500)).max(50),
  })
  .partial();
