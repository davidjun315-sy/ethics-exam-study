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
  sourceOverview: z
    .string()
    .describe("원전에 대한 간략한 해설: 어떤 저작인지(저자·성립 배경), 전체 구성, 핵심 주제와 사상사적 의의를 3~5문장으로. 원전을 모르면 빈 문자열"),
  relatedContent: z
    .string()
    .describe("제시문과 관련된 원전 부분의 내용을 자세히: 그 편·장에서 무엇을 논하는지, 앞뒤 맥락, 핵심 논지와 주요 구절의 뜻"),
  relationToQuestion: z.string().describe("제시문과의 관계 (직접 인용 / 의역 / 내용 요약 / 재구성 등)"),
  quotedText: z.string().nullable().describe("출제된 제시문 문장 일부"),
  status: VerificationSchema.describe(
    "confirmed=문장 위치까지 확실, likely=원전은 유력하나 위치 불확실, candidate=후보 중 하나, unknown=모름",
  ),
  confidence: z.number(),
});

const ConfidenceSchema = z.object({
  philosopher: z.number(),
  answer: z.number(),
  source: z.number(),
  concept: z.number(),
  overall: z.number(),
});

// ---------------------------------------------------------------------
// 심화 분석: 출제자의 의도 / 문제풀이 개념정리 / 이 문항에서 확장될 수 있는 출제
// ---------------------------------------------------------------------

/** 문제 유형 (출제 방식). 전체 기출 패턴 분석에도 쓰인다. */
export const QUESTION_FORMATS = [
  "identification", // 사상가·학파 판별
  "definition", // 개념의 정확한 의미
  "comparison", // 두 개 이상 사상 비교
  "source", // 원전 제시문 이해
  "expression", // 제시문에서 특정 표현 찾기
  "application", // 사례·상황에 적용
  "critique", // 비판·한계 서술
  "descriptive", // 논거·이유 서술
  "memorization", // 단순 암기
] as const;
export const QuestionFormatSchema = z.enum(QUESTION_FORMATS);
export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;

export const ExaminerIntentSchema = z.object({
  summary: z
    .string()
    .describe("이 문제가 출제된 이유: 출제자가 이 사상가·개념·제시문을 고른 까닭과 문항 전체로 확인하려는 것. 문제 내용 요약이 아니라 출제 이유를 구체적으로"),
  itemIntents: z
    .array(z.object({ label: z.string().describe("㉠, (가), 작성 방법 1 등 문항 안의 각 요구 사항"), intent: z.string().describe("이 요구 사항을 어떤 의도로 냈는지") }))
    .describe("문항 안의 요구 사항(빈칸·하위 문항·작성 방법 조건)별 출제 의도. 요구 사항이 하나면 하나만"),
  skillsTested: z.array(z.string()).describe("이 문항이 확인하려는 핵심 능력 (짧게)"),
  formats: z.array(QuestionFormatSchema).describe("문제 유형. 해당하는 것을 모두 고를 것"),
});
export type ExaminerIntent = z.infer<typeof ExaminerIntentSchema>;

export const StudyConceptSchema = z.object({
  name: z.string(),
  importance: z.enum(["required", "supporting", "comparison"]).describe(
    "required=이 문제를 풀려면 반드시 알아야 함, supporting=알면 더 정확히 이해, comparison=혼동하기 쉬워 함께 비교해야 함",
  ),
  philosopher: z.string().nullable().describe("이 개념의 사상가. 모르면 null"),
  definition: z.string().describe("임용 답안에 쓸 수 있는 수준의 정의"),
  examPoint: z.string().describe("시험에서 중요한 포인트"),
  connectionToQuestion: z.string().describe("이 문제와 어떻게 연결되는지"),
  confusableWith: z.array(z.string()).describe("자주 혼동하는 개념"),
  distinction: z.string().describe("구별법"),
});
export type StudyConcept = z.infer<typeof StudyConceptSchema>;

export const FutureExtensionSchema = z.object({
  topic: z.string().describe("예상 주제 한 줄 (예: 왕수인 - 지행합일)"),
  philosopher: z.string().describe("출제가 예상되는 사상가"),
  concept: z.string().describe("그 사상가의 구체적인 개념"),
  conceptSummary: z.string().describe("이 개념의 핵심 내용과, 이 문항에서 왜 이 개념으로 확장될 수 있는지"),
  format: QuestionFormatSchema,
  expectedQuestion: z
    .string()
    .describe("실제 임용 형식의 예상 문제 전문: 제시문(원전 내용을 바탕으로 재구성), 발문, <작성 방법> 조건, 배점"),
  expectedAnswer: z.string().describe("위 예상 문제의 모범답안 (임용 답안지에 쓰듯 완결된 문장)"),
  relatedConcepts: z.array(z.string()),
  relatedPhilosophers: z.array(z.string()),
  relatedSources: z.array(z.string()).describe("관련 원전명 (『』 없이). 모르면 빈 배열"),
  importance: z.enum(["high", "medium", "low"]).describe("학습 중요도"),
});
export type FutureExtension = z.infer<typeof FutureExtensionSchema>;

/** DB 에 저장된 값: 이전 버전 분석(v2)은 형식이 달라 새 항목이 없을 수 있다 */
export type StoredExaminerIntent = Pick<ExaminerIntent, "summary" | "formats"> &
  Partial<Omit<ExaminerIntent, "summary" | "formats">> & { requiredTerms?: string[]; trapPoints?: string[]; evidence?: string[] };
export type StoredFutureExtension = Pick<FutureExtension, "topic" | "format" | "relatedConcepts" | "relatedPhilosophers" | "importance"> &
  Partial<Omit<FutureExtension, "topic" | "format" | "relatedConcepts" | "relatedPhilosophers" | "importance">> & {
    possibleQuestionType?: string;
    rationale?: string;
    likelihood?: "high" | "medium" | "low";
  };

export const DeepAnalysisSchema = z.object({
  examinerIntent: ExaminerIntentSchema,
  studyConcepts: z.array(StudyConceptSchema),
  futureExtensions: z.array(FutureExtensionSchema).describe("이 문항에서 확장될 수 있는 사상가의 구체적 개념과 예상 문제·답안 2~3개"),
});
export type DeepAnalysis = z.infer<typeof DeepAnalysisSchema>;

const ReviewSchema = {
  needsReview: z.boolean().describe("애매하거나 해석이 갈리면 true"),
  reviewReasons: z.array(z.string()),
};

/** 답안: 문항 안의 요구 사항(빈칸·하위 문항·작성 방법)별 정답과 자세한 해설 */
export const ItemExplanationSchema = z.object({
  label: z.string().describe("㉠, ㉡, (가), (1), 작성 방법 1 등. 요구 사항이 하나면 \"정답\""),
  answer: z.string().describe("이 요구 사항의 정답"),
  sourcePart: z.string().describe("정답의 근거가 되는 제시문 부분: 위치((가) 둘째 문장 등)와 해당 원문을 그대로 인용"),
  explanation: z
    .string()
    .describe("왜 이것이 정답인지 자세히: 인용한 원문 표현을 하나하나 짚으며 사상가의 어떤 이론·원전의 어느 부분에서 나온 내용인지 연결해 설명. 여러 문단 가능"),
});

/** 원문 해설: 제시문을 부분별로 나눠 쉽게 풀이 */
export const PassageCommentarySchema = z.object({
  part: z.string().describe("구분 (예: (가) 제시문, (나) 1~2문장, 대화 속 교사의 말, <작성 방법>)"),
  quote: z.string().describe("해당 부분 원문을 그대로 (길면 핵심 문장)"),
  commentary: z.string().describe("이 부분을 이해하기 쉽게 풀어 쓴 자세한 설명: 어려운 용어 풀이, 문장의 뜻, 사상 안에서의 의미"),
});

export type ItemExplanation = z.infer<typeof ItemExplanationSchema>;
export type PassageCommentary = z.infer<typeof PassageCommentarySchema>;

const ConfusionSchema = z.object({ name: z.string(), reason: z.string().describe("왜 혼동되며 어떻게 구별하는지") });

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
  // ① 답안
  modelAnswer: z.string().describe("임용 답안지에 그대로 쓸 수 있는 모범답안. 요구 사항을 빠짐없이, 완결된 문장으로"),
  itemExplanations: z.array(ItemExplanationSchema).describe("요구 사항별 해설. 문항 안의 모든 요구 사항을 순서대로"),
  explanation: z.string().describe("문항 전체 해설: 요구 사항들이 어떻게 연결되는지, 전체 논리 (요구 사항별 해설과 중복되지 않게)"),
  confusablePhilosophers: z.array(ConfusionSchema).describe("오답 분석: 혼동하기 쉬운 사상가"),
  confusableConcepts: z.array(ConfusionSchema).describe("오답 분석: 혼동하기 쉬운 개념"),
  commonMistakes: z.array(z.string()).describe("오답 분석: 수험생이 자주 쓰는 틀린 답과 그것이 왜 틀렸는지"),
  answer: z.string().describe("정답 요약 한 줄 (내부 채점·검색용)"),
  requiredKeywords: z.array(z.string()).describe("채점자가 찾을 핵심 키워드 (내부 채점용)"),
  // ② 출제 의도 / ③ 원문 해설
  examinerIntent: ExaminerIntentSchema,
  passageCommentary: z.array(PassageCommentarySchema).describe("원문 해설: 제시문을 순서대로 부분별로 나눠 풀이"),
  // ④ 사상가 / ⑤ 원전
  philosophers: z.array(PhilosopherFindingSchema),
  concepts: z.array(ConceptFindingSchema),
  relatedThinkers: z.array(z.string()),
  sources: z.array(SourceFindingSchema),
  // 사상가 개념 정리 노트의 재료 (문항 화면에는 따로 보이지 않음)
  studyConcepts: z.array(StudyConceptSchema).describe("이 문제를 풀기 위해 알아야 하는 개념 (사상가별 개념 정리 노트의 재료)"),
  // ⑥ 향후 출제
  futureExtensions: DeepAnalysisSchema.shape.futureExtensions,
  confidence: ConfidenceSchema,
  ...ReviewSchema,
});
export type FullAnalysis = z.infer<typeof FullAnalysisSchema>;

export const AnswerOnlySchema = z.object({
  modelAnswer: FullAnalysisSchema.shape.modelAnswer,
  itemExplanations: FullAnalysisSchema.shape.itemExplanations,
  explanation: FullAnalysisSchema.shape.explanation,
  answer: FullAnalysisSchema.shape.answer,
  requiredKeywords: FullAnalysisSchema.shape.requiredKeywords,
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
  passageCommentary: FullAnalysisSchema.shape.passageCommentary,
  confusablePhilosophers: FullAnalysisSchema.shape.confusablePhilosophers,
  confusableConcepts: FullAnalysisSchema.shape.confusableConcepts,
  commonMistakes: FullAnalysisSchema.shape.commonMistakes,
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

// ---------------------------------------------------------------------
// 전체 기출 출제 예측: AI 해석 (점수는 DB 계산값, AI 는 해석만 덧붙인다)
// ---------------------------------------------------------------------
export const PredictionInterpretationSchema = z.object({
  overview: z.string().describe("전체 출제 경향 요약 (제공된 통계 근거로만)"),
  topics: z.array(
    z.object({
      topicKey: z.string().describe("입력에 주어진 topicKey 를 그대로"),
      title: z.string().describe("더 구체적인 주제명 (예: 칸트 - 선의지와 도덕적 가치)"),
      expectedFormat: z.string().describe("예상 출제 방식 (예: 『윤리형이상학 정초』 제시문 + 선의지·의무 서술형)"),
      interpretation: z.string().describe("AI 해석: 왜 이 주제를 우선 공부해야 하는지. 주어진 데이터 근거를 인용할 것"),
      studyConcepts: z.array(z.string()).describe("함께 공부할 개념"),
      likelihood: z.enum(["high", "medium", "low"]).describe("학습 우선순위 판단 (확률 아님)"),
      cautions: z.array(z.string()).describe("이 판단의 한계·불확실한 점"),
    }),
  ),
  caveats: z.array(z.string()),
});
export type PredictionInterpretation = z.infer<typeof PredictionInterpretationSchema>;

// ---------------------------------------------------------------------
// 예상 연습문제 생성
// ---------------------------------------------------------------------
export const PracticeQuestionSchema = z.object({
  passage: z.string().describe("제시문. 기존 기출·원전 문장을 그대로 복제하지 말고 새로 구성할 것"),
  passageNote: z.string().describe("제시문 구성 방식 (예: 『전습록』 상권 내용을 바탕으로 재구성. 직접 인용 아님)"),
  question: z.string().describe("발문"),
  conditions: z.array(z.string()).describe("<작성 방법> 항목 (없으면 빈 배열)"),
  modelAnswer: z.string(),
  requiredKeywords: z.array(z.string()),
  scoringPoints: z.array(z.string()),
  rationale: z.string().describe("출제 근거: 어떤 기출 경향을 반영했는지"),
  relatedQuestionRefs: z.array(z.string()).describe("입력에 주어진 관련 기출 ref 중에서만 고를 것"),
});
export type PracticeQuestion = z.infer<typeof PracticeQuestionSchema>;

// ---------------------------------------------------------------------
// 사상가 개념 정리 노트 (채팅 AI 로 기출 분석을 재구성 → 붙여넣기)
// ---------------------------------------------------------------------

const refs = z.array(z.string()).describe("입력의 <questions> 에 있는 기출 ref 그대로 (예: \"2024 A 3번\"). 없으면 []");

export const NoteConceptSchema = z.object({
  name: z.string().describe("개념명"),
  originalTerm: z.string().nullable().describe("한자/원어. 모르면 null"),
  definition: z.string().describe("한두 문장의 핵심 정의"),
  explanation: z.string().describe("수험생이 이해할 수 있게 풀어 쓴 설명 (앞 개념과의 연결을 포함)"),
  keyPoints: z.array(z.string()).describe("반드시 기억할 요점"),
  examPoints: z.array(z.string()).describe("기출에서 이 개념을 어떻게 물었는지 / 답안에 들어가야 할 표현"),
  confusions: z
    .array(z.object({ with: z.string(), distinction: z.string() }))
    .describe("혼동하기 쉬운 개념·사상가와 구별법"),
  relatedQuestionRefs: refs,
});

export const PhilosopherStudyNoteSchema = z.object({
  overview: z.object({
    oneLine: z.string().describe("이 사상가를 한 문장으로"),
    summary: z.string().describe("사상 전체의 큰 그림 (3~6문장)"),
    keywords: z.array(z.string()).describe("핵심 키워드 5~12개"),
  }),
  outline: z
    .array(
      z.object({
        title: z.string().describe("sections 의 같은 순서 단원 제목 (짧게, 예: 1. 인간관)"),
        items: z.array(
          z.object({
            keyword: z.string().describe("sections 의 개념명과 똑같이"),
            gist: z.string().describe("15자 안팎의 핵심 어구 (문장 X, 예: 마음 = 이치)"),
            sub: z.array(z.string()).describe("하위 키워드 0~4개 (단어만)"),
          }),
        ),
      }),
    )
    .describe("본문 전에 보여 줄 키워드 구조도. 문장 없이 키워드·어구만으로, sections 와 같은 순서·같은 개념"),
  sections: z
    .array(
      z.object({
        title: z.string().describe("단원 제목 (예: 1. 인간관과 출발점)"),
        intro: z.string().nullable().describe("이 단원에서 무엇을 배우는지, 앞 단원과의 연결"),
        concepts: z.array(NoteConceptSchema),
      }),
    )
    .describe("사상의 논리적 순서(출발점 → 핵심 이론 → 실천·수양 → 사회·정치 → 영향)대로 배열한 단원"),
  identification: z.object({
    decisiveExpressions: z.array(z.string()).describe("제시문에서 이 사상가로 판별하게 하는 표현"),
    tips: z.array(z.string()).describe("판별 요령"),
  }),
  comparisons: z
    .array(
      z.object({
        other: z.string().describe("비교 대상 사상가 또는 학파"),
        common: z.string().nullable().describe("공통점. 없으면 null"),
        differences: z.array(z.object({ aspect: z.string(), mine: z.string(), theirs: z.string() })).describe("쟁점별 차이 (이 사상가 / 상대)"),
        relatedQuestionRefs: refs,
      }),
    )
    .describe("기출에서 함께 나온·혼동되는 사상가와의 비교"),
  traps: z
    .array(z.object({ trap: z.string().describe("자주 노린 함정·오개념"), correction: z.string().describe("바른 이해"), relatedQuestionRefs: refs }))
    .describe("출제자가 노린 함정"),
  answerTips: z.array(z.string()).describe("서술형 답안 작성 요령 (필수 용어, 조건 처리 등)"),
  futureTopics: z
    .array(z.object({ topic: z.string(), reason: z.string() }))
    .describe("아직 출제되지 않았거나 확장될 수 있는 주제 (AI 판단임을 전제)"),
  studyOrder: z.array(z.string()).describe("추천 공부 순서 (단계별 한 줄씩)"),
  caveats: z.array(z.string()).describe("입력 분석끼리 충돌하거나 해석이 갈리는 부분, 확인이 필요한 부분"),
});
export type PhilosopherStudyNote = z.infer<typeof PhilosopherStudyNoteSchema>;
export type NoteConcept = z.infer<typeof NoteConceptSchema>;
