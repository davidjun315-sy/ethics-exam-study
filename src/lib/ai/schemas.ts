import { z } from "zod";

/**
 * AI 응답 스키마 (Zod).
 * - structured output 으로 그대로 전달되므로 min/max 같은 제약은 넣지 않고, 저장 직전에 clamp 한다.
 * - confidence 는 모두 0~1.
 */

export const RoleSchema = z.enum(["main", "comparison", "distractor", "mentioned"]);
export const VerificationSchema = z.enum(["confirmed", "likely", "candidate", "unknown"]);
export const DifficultySchema = z.enum(["상", "중", "하"]);

export const PhilosopherFindingSchema = z.object({
  name: z.string().describe("한국 임용 교재에서 통용되는 이름 (예: 왕수인, 칸트)"),
  originalName: z.string().nullable().describe("한자 또는 원어 이름. 모르면 null"),
  role: RoleSchema.describe("main=정답의 중심 사상가, comparison=비교 대상, distractor=오답 유도, mentioned=단순 언급"),
  tradition: z.string().nullable().describe("동양윤리 / 한국윤리 / 서양윤리 / 사회사상 등"),
  school: z.string().nullable(),
  era: z.string().nullable(),
  confidence: z.number(),
  decisiveExpressions: z.array(z.string()).describe("이 사상가로 판별하게 하는 제시문 속 결정적 표현"),
  similarPhilosophers: z
    .array(z.object({ name: z.string(), distinguishingPoint: z.string() }))
    .describe("혼동하기 쉬운 사상가와 구별 포인트"),
  reasoning: z.string().describe("왜 이 사상가인지에 대한 설명"),
});

export const ConceptFindingSchema = z.object({
  name: z.string().describe("개념명 (예: 양지, 치양지)"),
  philosopher: z.string().nullable().describe("이 개념을 주로 사용하는 사상가. 모르면 null"),
  definition: z.string().nullable().describe("한두 문장 정의"),
  confidence: z.number(),
});

export const SourceFindingSchema = z.object({
  philosopher: z.string().nullable(),
  title: z.string().nullable().describe("원전명 (『』 없이). 짐작조차 어렵다면 null"),
  location: z.string().nullable().describe("권/편/장. 정확히 모르면 반드시 null"),
  relatedContent: z.string().describe("해당 원전의 관련 내용"),
  relationToQuestion: z.string().describe("제시문과의 관계 (직접 인용 / 의역 / 내용 요약 / 재구성 등)"),
  quotedText: z.string().nullable().describe("출제된 제시문 문장 일부"),
  status: VerificationSchema.describe(
    "confirmed=문장 위치까지 확실, likely=원전은 유력하나 위치 불확실, candidate=후보 중 하나, unknown=모름",
  ),
  confidence: z.number(),
  reasoning: z.string().describe("판단 근거와 불확실한 부분"),
});

const ConfidenceSchema = z.object({
  philosopher: z.number(),
  answer: z.number(),
  source: z.number(),
  concept: z.number(),
  overall: z.number(),
});

const ReviewSchema = {
  needsReview: z.boolean().describe("애매하거나 해석이 갈리면 true"),
  reviewReasons: z.array(z.string()),
};

export const FullAnalysisSchema = z.object({
  transcribedText: z
    .string()
    .nullable()
    .describe(
      "이미지 기준 문항 원문 전체. 제공된 텍스트가 비었거나, 박스·표·말풍선 안 제시문처럼 이미지에는 있는데 텍스트에 빠진 부분이 있으면 이미지를 읽어 문항 전체 원문(발문, 제시문, (가)(나), ㉠㉡, <작성 방법> 포함)을 적을 것. 제공된 텍스트가 이미 완전하면 null",
    ),
  area: z.string().describe("출제 영역 (예: 동양윤리, 한국윤리, 서양윤리, 사회사상, 도덕교육론)"),
  school: z.string().nullable(),
  era: z.string().nullable(),
  questionType: z.string().describe("기입형 / 서술형 / 논술형 / 기타"),
  difficulty: DifficultySchema,
  philosophers: z.array(PhilosopherFindingSchema),
  concepts: z.array(ConceptFindingSchema),
  relatedThinkers: z.array(z.string()),
  sources: z.array(SourceFindingSchema),
  questionIntent: z.string().describe("문제에서 요구하는 것"),
  keyClues: z.array(z.string()),
  passageAnalysis: z.string(),
  solvingProcess: z.array(z.string()),
  answer: z.string().describe("정답. 기입형은 정답 어구, 서술형은 핵심 답 요약"),
  subAnswers: z.array(z.object({ label: z.string(), answer: z.string() })).describe("하위 문항별 정답 (없으면 빈 배열)"),
  answerBasis: z.string().describe("정답 근거"),
  explanation: z.string().describe("해설"),
  modelAnswer: z.string().describe("임용 답안 형식의 모범답안"),
  requiredKeywords: z.array(z.string()),
  scoringPoints: z.array(z.string()),
  recommendedExpressions: z.array(z.string()),
  deductionRisks: z.array(z.string()).describe("빠지면 감점될 가능성이 있는 요소"),
  confusablePhilosophers: z.array(z.object({ name: z.string(), reason: z.string() })),
  confusableConcepts: z.array(z.object({ name: z.string(), reason: z.string() })),
  mistakeReasons: z.array(z.string()).describe("틀리기 쉬운 이유"),
  commonMistakes: z.array(z.string()).describe("오답 포인트"),
  confidence: ConfidenceSchema,
  ...ReviewSchema,
});
export type FullAnalysis = z.infer<typeof FullAnalysisSchema>;

export const AnswerOnlySchema = z.object({
  answer: z.string(),
  subAnswers: z.array(z.object({ label: z.string(), answer: z.string() })),
  answerBasis: z.string(),
  modelAnswer: z.string(),
  requiredKeywords: z.array(z.string()),
  scoringPoints: z.array(z.string()),
  answerConfidence: z.number(),
  ...ReviewSchema,
});
export type AnswerOnly = z.infer<typeof AnswerOnlySchema>;

export const PhilosophersOnlySchema = z.object({
  philosophers: z.array(PhilosopherFindingSchema),
  concepts: z.array(ConceptFindingSchema),
  relatedThinkers: z.array(z.string()),
  confusablePhilosophers: z.array(z.object({ name: z.string(), reason: z.string() })),
  philosopherConfidence: z.number(),
  conceptConfidence: z.number(),
  ...ReviewSchema,
});
export type PhilosophersOnly = z.infer<typeof PhilosophersOnlySchema>;

export const SourcesOnlySchema = z.object({
  sources: z.array(SourceFindingSchema),
  sourceConfidence: z.number(),
  ...ReviewSchema,
});
export type SourcesOnly = z.infer<typeof SourcesOnlySchema>;

export const ExplanationOnlySchema = z.object({
  questionIntent: z.string(),
  keyClues: z.array(z.string()),
  passageAnalysis: z.string(),
  solvingProcess: z.array(z.string()),
  explanation: z.string(),
  recommendedExpressions: z.array(z.string()),
  deductionRisks: z.array(z.string()),
  confusableConcepts: z.array(z.object({ name: z.string(), reason: z.string() })),
  mistakeReasons: z.array(z.string()),
  commonMistakes: z.array(z.string()),
});
export type ExplanationOnly = z.infer<typeof ExplanationOnlySchema>;

export const GradingSchema = z.object({
  overallScore: z.number().describe("0~100"),
  overallComment: z.string(),
  conceptAccuracy: z.object({ score: z.number(), comment: z.string() }),
  keywordCoverage: z.object({ included: z.array(z.string()), missing: z.array(z.string()) }),
  completeness: z.object({ score: z.number(), comment: z.string() }),
  wrongExpressions: z.array(z.object({ text: z.string(), reason: z.string() })),
  missingContent: z.array(z.string()),
  suggestedRevisions: z.array(z.object({ original: z.string(), revised: z.string() })),
  expectedAnswer: z.string(),
});
export type Grading = z.infer<typeof GradingSchema>;

export const ComparisonSchema = z.object({
  aspects: z
    .array(z.object({ aspect: z.string(), a: z.string(), b: z.string() }))
    .describe("인간관, 본성론, 도덕 원리, 수양론, 정치관 순서. 해당 없음은 '해당 없음'으로"),
  keyConceptsA: z.array(z.string()),
  keyConceptsB: z.array(z.string()),
  sourcesA: z.array(z.string()),
  sourcesB: z.array(z.string()),
  distinguishingExpressions: z.array(
    z.object({ expression: z.string(), belongsTo: z.enum(["A", "B"]), note: z.string() }),
  ),
  examTips: z.array(z.string()),
  caveats: z.array(z.string()).describe("학계 해석이 갈리거나 단정하기 어려운 부분"),
  confidence: z.number(),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

export function clamp01(n: number | null | undefined): number | null {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  // 일부 모델이 0~100 으로 응답하는 경우 보정
  const v = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, v));
}
