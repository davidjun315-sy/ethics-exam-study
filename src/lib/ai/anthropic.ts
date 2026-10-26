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

  private async callApi(params: Parameters<Anthropic["beta"]["messages"]["parse"]>[0]) {
    try {
      return await this.client.beta.messages.parse(params);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new Error(
          "ANTHROPIC_API_KEY 가 올바르지 않습니다. console.anthropic.com 의 API Keys 에서 sk-ant-api 로 시작하는 키를 새로 만들어 Vercel 환경변수에 다시 넣고 Redeploy 하세요.",
        );
      }
      if (err instanceof Anthropic.PermissionDeniedError) {
        throw new Error("이 API 키로는 해당 모델을 사용할 수 없습니다. AI_MODEL 값이나 Anthropic 콘솔의 권한/결제 상태를 확인하세요.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new Error("AI API 호출 한도를 초과했습니다. 잠시 후 다시 시도하거나 Anthropic 콘솔에서 크레딧/한도를 확인하세요.");
      }
      if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
        throw new Error("Anthropic 크레딧이 부족합니다. console.anthropic.com → Billing 에서 크레딧을 충전하세요.");
      }
      throw err;
    }
  }

  protected async generate<S extends z.ZodType>(req: GenerateRequest<S>): Promise<{ data: z.infer<S>; usage: AIUsage }> {
    const content: BetaContentBlockParam[] = [
      ...(req.imageUrls ?? []).map(
        (url): BetaContentBlockParam => ({ type: "image", source: { type: "url", url } }),
      ),
      { type: "text", text: req.prompt },
    ];

    const useFallback = FALLBACK_MODELS.has(this.model);
    const response = await this.callApi({
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
