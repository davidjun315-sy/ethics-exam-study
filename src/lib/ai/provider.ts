import "server-only";
import type { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  ANSWER_GRADING_SYSTEM,
  buildAnswerGradingPrompt,
} from "@prompts/answer-grading";
import {
  PHILOSOPHER_COMPARISON_SYSTEM,
  buildComparisonPrompt,
} from "@prompts/philosopher-comparison";
import {
  QUESTION_ANALYSIS_SYSTEM,
  buildPartialPrompt,
  buildQuestionAnalysisPrompt,
} from "@prompts/question-analysis";
import { SOURCE_ANALYSIS_SYSTEM, buildSourceAnalysisPrompt } from "@prompts/source-analysis";
import type { QuestionContext } from "@prompts/shared-rules";
import {
  AnswerOnlySchema,
  ComparisonSchema,
  ExplanationOnlySchema,
  FullAnalysisSchema,
  GradingSchema,
  PhilosophersOnlySchema,
  SourcesOnlySchema,
  type AnswerOnly,
  type Comparison,
  type ExplanationOnly,
  type FullAnalysis,
  type Grading,
  type PhilosophersOnly,
  type SourcesOnly,
} from "./schemas";

export class AIConfigError extends Error {}

export interface AIUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AIResult<T> {
  data: T;
  usage: AIUsage;
  provider: string;
  model: string;
}

export interface GenerateRequest<S extends z.ZodType> {
  schema: S;
  schemaName: string;
  system: string;
  prompt: string;
  imageUrls?: string[];
}

export interface QuestionInput extends QuestionContext {
  imageUrl: string | null;
}

export type PartialScope = "answer" | "philosophers" | "explanation";

export type PartialResult<S extends PartialScope> = S extends "answer"
  ? AnswerOnly
  : S extends "philosophers"
    ? PhilosophersOnly
    : ExplanationOnly;

/**
 * 공통 AI provider interface.
 * provider 별 구현은 generate() 하나만 작성하면 되고,
 * 나머지 기능(문항 분석, 원전 분석, 채점, 비교)은 BaseProvider 가 prompts/ 를 사용해 구성한다.
 *
 * findRelatedQuestions() 는 AI 호출이 필요 없으므로 lib/data/related.ts 에 있다.
 * (향후 embedding 기반 검색을 붙일 때 provider 에 embed() 를 추가하면 된다)
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  analyzeQuestion(input: QuestionInput): Promise<AIResult<FullAnalysis>>;
  reanalyzePart<S extends PartialScope>(
    input: QuestionInput,
    scope: S,
    existingSummary: string | null,
  ): Promise<AIResult<PartialResult<S>>>;
  analyzeSource(
    input: QuestionInput,
    knownPassages: { title: string; location: string | null; text: string }[],
  ): Promise<AIResult<SourcesOnly>>;
  gradeAnswer(
    input: QuestionInput,
    reference: { answer: string | null; modelAnswer: string | null; requiredKeywords: string[] } | null,
    studentAnswer: string,
  ): Promise<AIResult<Grading>>;
  comparePhilosophers(
    a: { name: string; school: string | null },
    b: { name: string; school: string | null },
    relatedQuestionSummaries: string[],
  ): Promise<AIResult<Comparison>>;
}

export abstract class BaseProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly model: string;

  protected abstract generate<S extends z.ZodType>(
    req: GenerateRequest<S>,
  ): Promise<{ data: z.infer<S>; usage: AIUsage }>;

  private async run<S extends z.ZodType>(req: GenerateRequest<S>): Promise<AIResult<z.infer<S>>> {
    const { data, usage } = await this.generate(req);
    // 모든 응답은 Zod 로 한 번 더 검증한다.
    const parsed = req.schema.parse(data) as z.infer<S>;
    return { data: parsed, usage, provider: this.name, model: this.model };
  }

  analyzeQuestion(input: QuestionInput) {
    return this.run({
      schema: FullAnalysisSchema,
      schemaName: "question_analysis",
      system: QUESTION_ANALYSIS_SYSTEM,
      prompt: buildQuestionAnalysisPrompt(input),
      imageUrls: input.imageUrl ? [input.imageUrl] : [],
    });
  }

  reanalyzePart<S extends PartialScope>(input: QuestionInput, scope: S, existingSummary: string | null) {
    const schema = (
      scope === "answer" ? AnswerOnlySchema : scope === "philosophers" ? PhilosophersOnlySchema : ExplanationOnlySchema
    ) as unknown as z.ZodType<PartialResult<S>>;
    return this.run({
      schema,
      schemaName: `reanalysis_${scope}`,
      system: QUESTION_ANALYSIS_SYSTEM,
      prompt: buildPartialPrompt(input, scope, existingSummary),
      imageUrls: input.imageUrl ? [input.imageUrl] : [],
    });
  }

  analyzeSource(input: QuestionInput, knownPassages: { title: string; location: string | null; text: string }[]) {
    return this.run({
      schema: SourcesOnlySchema,
      schemaName: "source_analysis",
      system: SOURCE_ANALYSIS_SYSTEM,
      prompt: buildSourceAnalysisPrompt(input, knownPassages),
      imageUrls: input.imageUrl ? [input.imageUrl] : [],
    });
  }

  gradeAnswer(
    input: QuestionInput,
    reference: { answer: string | null; modelAnswer: string | null; requiredKeywords: string[] } | null,
    studentAnswer: string,
  ) {
    return this.run({
      schema: GradingSchema,
      schemaName: "answer_grading",
      system: ANSWER_GRADING_SYSTEM,
      prompt: buildAnswerGradingPrompt(input, reference, studentAnswer),
      imageUrls: input.imageUrl ? [input.imageUrl] : [],
    });
  }

  comparePhilosophers(
    a: { name: string; school: string | null },
    b: { name: string; school: string | null },
    relatedQuestionSummaries: string[],
  ) {
    return this.run({
      schema: ComparisonSchema,
      schemaName: "philosopher_comparison",
      system: PHILOSOPHER_COMPARISON_SYSTEM,
      prompt: buildComparisonPrompt(a, b, relatedQuestionSummaries),
    });
  }
}

let cached: AIProvider | null = null;

/** AI_PROVIDER 환경변수(anthropic | openai)에 따라 provider 를 선택한다. */
export async function getAIProvider(): Promise<AIProvider> {
  if (cached) return cached;
  const providerName = serverEnv.aiProvider();
  if (providerName === "openai") {
    const key = serverEnv.openaiApiKey();
    if (!key) throw new AIConfigError("OPENAI_API_KEY 가 설정되지 않았습니다.");
    const { OpenAIProvider } = await import("./openai");
    cached = new OpenAIProvider(key, serverEnv.aiModel() ?? "gpt-5");
  } else if (providerName === "anthropic" || providerName === "claude") {
    const key = serverEnv.anthropicApiKey();
    if (!key) throw new AIConfigError("ANTHROPIC_API_KEY 가 설정되지 않았습니다.");
    const { AnthropicProvider } = await import("./anthropic");
    cached = new AnthropicProvider(key, serverEnv.aiModel() ?? "claude-opus-5-5", serverEnv.aiEffort());
  } else {
    throw new AIConfigError(`지원하지 않는 AI_PROVIDER 입니다: ${providerName} (anthropic 또는 openai)`);
  }
  return cached;
}

export function isAIConfigured(): boolean {
  const p = serverEnv.aiProvider();
  if (p === "openai") return Boolean(serverEnv.openaiApiKey());
  return Boolean(serverEnv.anthropicApiKey());
}
