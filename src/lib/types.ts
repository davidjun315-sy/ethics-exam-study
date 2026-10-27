import type { ItemExplanation, PassageCommentary, QuestionFormat, StoredExaminerIntent, StoredFutureExtension, StudyConcept } from "./ai/schemas";

// DB row 타입 (supabase/schema.sql 과 동기화)

export type Section = "A" | "B";
export type PhilosopherRole = "main" | "comparison" | "distractor" | "mentioned";
export type VerificationStatus = "confirmed" | "likely" | "candidate" | "unknown";
export type AnalysisStatus = "pending" | "analyzed" | "needs_review" | "verified" | "error";
export type AnalysisScope = "full" | "answer" | "philosophers" | "sources" | "explanation" | "deep";

/** 페이지 위 문항 영역. 좌표는 0~1 로 정규화 (좌상단 원점) */
export interface Region {
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Exam {
  id: string;
  exam_year: number;
  exam_name: string;
  subject: string;
  section: Section | null;
  note: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  pdf_hash: string;
  pdf_size: number | null;
  page_count: number | null;
  status: "uploaded" | "segmented" | "analyzing" | "analyzed";
  created_at: string;
  updated_at: string;
}

export interface ExamPage {
  id: string;
  exam_id: string;
  page_number: number;
  image_url: string | null;
  width: number | null;
  height: number | null;
  text_content: string | null;
  has_text_layer: boolean;
}

export interface Question {
  id: string;
  exam_id: string;
  parent_id: string | null;
  question_number: number;
  sub_question_number: string | null;
  label: string;
  sort_order: number;
  page_start: number | null;
  page_end: number | null;
  regions: Region[];
  question_text: string | null;
  question_image_url: string | null;
  score: number | null;
  question_type: string | null;
  segmentation_source: "auto" | "manual";
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface Philosopher {
  id: string;
  name: string;
  aliases: string[];
  original_name: string | null;
  tradition: string | null;
  school: string | null;
  era: string | null;
  core_ideas: string | null;
  description: string | null;
}

export interface Concept {
  id: string;
  name: string;
  aliases: string[];
  definition: string | null;
  similar_concepts: string[];
  confusable_concepts: string[];
}

export interface Source {
  id: string;
  title: string;
  aliases: string[];
  philosopher_id: string | null;
  summary: string | null;
}

export interface SourcePassage {
  id: string;
  source_id: string;
  volume: string | null;
  chapter: string | null;
  section: string | null;
  page: string | null;
  original_text: string | null;
  translation: string | null;
  citation: string | null;
  related_concepts: string[];
  note: string | null;
}

/**
 * question_analysis.details 에 저장되는 상세 분석.
 * v3(현재): 답안(요구 사항별 해설) / 출제 의도(요구 사항별) / 원문 해설 / 원전 해설 / 예상 문제.
 * v2 이하 항목(keyClues 등)은 이전 분석을 보여주기 위해 남겨 둔다.
 */
export interface AnalysisDetails {
  modelAnswer?: string;
  itemExplanations?: ItemExplanation[];
  passageCommentary?: PassageCommentary[];
  confusablePhilosophers?: { name: string; reason: string }[];
  confusableConcepts?: { name: string; reason: string }[];
  relatedThinkers?: string[];
  examinerIntent?: StoredExaminerIntent;
  studyConcepts?: StudyConcept[];
  futureExtensions?: StoredFutureExtension[];
  // v2 이하
  keyClues?: string[];
  passageAnalysis?: string;
  solvingProcess?: string[];
  answerBasis?: string;
  subAnswers?: { label: string; answer: string }[];
  scoringPoints?: string[];
  recommendedExpressions?: string[];
  deductionRisks?: string[];
  mistakeReasons?: string[];
}

export interface QuestionAnalysis {
  id: string;
  question_id: string;
  area: string | null;
  school: string | null;
  era: string | null;
  question_type: string | null;
  difficulty: "상" | "중" | "하" | null;
  answer: string | null;
  answer_explanation: string | null;
  question_intent: string | null;
  required_keywords: string[];
  common_mistakes: string[];
  details: AnalysisDetails;
  philosopher_confidence: number | null;
  answer_confidence: number | null;
  source_confidence: number | null;
  concept_confidence: number | null;
  overall_confidence: number | null;
  status: AnalysisStatus;
  review_reasons: string[];
  ai_original: unknown;
  analysis_version: number;
  edited_fields: string[];
  edited_at: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhilosopherReasoning {
  decisiveExpressions?: string[];
  similarPhilosophers?: { name: string; distinguishingPoint: string }[];
  reasoning?: string;
}

export interface QuestionPhilosopherLink {
  question_id: string;
  philosopher_id: string;
  role: PhilosopherRole;
  confidence: number | null;
  reasoning: PhilosopherReasoning;
  is_manual: boolean;
  philosophers?: Philosopher;
}

export interface QuestionConceptLink {
  question_id: string;
  concept_id: string;
  philosopher_id: string | null;
  confidence: number | null;
  is_manual: boolean;
  concepts?: Concept;
}

export interface QuestionSourceLink {
  id: string;
  question_id: string;
  source_id: string | null;
  passage_id: string | null;
  philosopher_name: string | null;
  title_raw: string | null;
  location: string | null;
  source_overview?: string | null; // 원전 해설 (004 이후)
  related_content: string | null;
  relation_to_question: string | null;
  quoted_text: string | null;
  verification_status: VerificationStatus;
  confidence: number | null;
  reasoning: string | null;
  is_manual: boolean;
  sources?: Source | null;
}

export const ROLE_LABEL: Record<PhilosopherRole, string> = {
  main: "주요",
  comparison: "비교",
  distractor: "오답 유도",
  mentioned: "언급",
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  confirmed: "확인됨",
  likely: "유력",
  candidate: "후보",
  unknown: "미확인",
};

export const STATUS_LABEL: Record<AnalysisStatus, string> = {
  pending: "분석 전",
  analyzed: "분석 완료",
  needs_review: "검토 필요",
  verified: "검수 완료",
  error: "오류",
};

export const FORMAT_LABEL: Record<QuestionFormat, string> = {
  identification: "사상가 판별",
  definition: "개념 정의",
  comparison: "사상 비교",
  source: "원전 이해",
  expression: "제시문 표현 찾기",
  application: "적용",
  critique: "비판·한계",
  descriptive: "서술·논증",
  memorization: "단순 암기",
};

export const IMPORTANCE_LABEL = { required: "필수 개념", supporting: "보조 개념", comparison: "함께 비교할 개념" } as const;
export const LEVEL_LABEL = { high: "높음", medium: "보통", low: "낮음" } as const;

/** 심화 분석(출제 의도 / 개념 정리 / 향후 출제)이 들어간 분석 버전 */
/** 1 = 기본, 2 = 출제 의도·개념 정리·향후 출제, 3 = 답안 해설·원문 해설·원전 해설·예상 문제 */
export const DEEP_ANALYSIS_VERSION = 3;
