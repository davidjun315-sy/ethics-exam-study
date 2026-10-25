import "server-only";
import { z } from "zod";
import { BaseProvider, type AIUsage, type GenerateRequest } from "./provider";

/**
 * OpenAI provider. 추가 SDK 없이 Chat Completions REST API 를 호출하고,
 * JSON Schema response_format 으로 구조화된 출력을 받은 뒤 Zod 로 검증한다.
 */
export class OpenAIProvider extends BaseProvider {
  readonly name = "openai";

  constructor(
    private apiKey: string,
    readonly model: string,
  ) {
    super();
  }

  protected async generate<S extends z.ZodType>(req: GenerateRequest<S>): Promise<{ data: z.infer<S>; usage: AIUsage }> {
    const userContent = [
      { type: "text", text: req.prompt },
      ...(req.imageUrls ?? []).map((url) => ({ type: "image_url", image_url: { url } })),
    ];
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: req.schemaName, schema: z.toJSONSchema(req.schema), strict: false },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API 오류 (${res.status}): ${body.slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string | null; refusal?: string | null }; finish_reason: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = json.choices[0];
    if (choice?.message.refusal) throw new Error(`AI 가 요청을 거절했습니다: ${choice.message.refusal}`);
    if (choice?.finish_reason === "length") throw new Error("AI 응답이 최대 길이에서 잘렸습니다.");
    const text = choice?.message.content;
    if (!text) throw new Error("AI 응답이 비어 있습니다.");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("AI 응답을 JSON 으로 해석하지 못했습니다.");
    }
    return {
      data: data as z.infer<S>,
      usage: { inputTokens: json.usage?.prompt_tokens ?? null, outputTokens: json.usage?.completion_tokens ?? null },
    };
  }
}
