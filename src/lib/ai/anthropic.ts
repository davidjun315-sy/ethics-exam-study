import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { BaseProvider, type AIUsage, type GenerateRequest } from "./provider";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

// 서버측 refusal fallback("default")을 지원하는 모델
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export class AnthropicProvider extends BaseProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private effort: Effort;

  constructor(
    apiKey: string,
    readonly model: string,
    effort?: string,
  ) {
    super();
    this.client = new Anthropic({ apiKey });
    // 분석 정확도가 최우선이므로 기본 effort 는 high
    this.effort = EFFORTS.includes(effort as Effort) ? (effort as Effort) : "high";
  }

  protected async generate<S extends z.ZodType>(req: GenerateRequest<S>): Promise<{ data: z.infer<S>; usage: AIUsage }> {
    const content: BetaContentBlockParam[] = [
      ...(req.imageUrls ?? []).map(
        (url): BetaContentBlockParam => ({ type: "image", source: { type: "url", url } }),
      ),
      { type: "text", text: req.prompt },
    ];

    const useFallback = FALLBACK_MODELS.has(this.model);
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: req.system,
      messages: [{ role: "user", content }],
      output_config: { effort: this.effort, format: betaZodOutputFormat(req.schema) },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    if (response.stop_reason === "refusal") {
      throw new Error("AI 가 요청 처리를 거절했습니다. (refusal) 문항 내용을 확인한 뒤 다시 시도하세요.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("AI 응답이 최대 길이에서 잘렸습니다. 부분 재분석을 사용해 보세요.");
    }
    if (!response.parsed_output) {
      throw new Error("AI 응답을 JSON 으로 해석하지 못했습니다.");
    }
    return {
      data: response.parsed_output as z.infer<S>,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    };
  }
}
