import "server-only";
import type { z } from "zod";
import { serverEnv } from "@/lib/env";
import { validatePasted } from "./lenient";

/**
 * Google Gemini API (AI Studio 무료 등급 키로 사용 가능) — 퀴즈 서술형 첨삭 전용.
 * 키는 서버 환경변수 GEMINI_API_KEY 에만 둔다. 브라우저에는 결과만 보낸다.
 */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(serverEnv.geminiApiKey());
}

/**
 * 생각(thinking) 설정 후보. 생각을 길게 하면 응답이 수십 초 걸려 Vercel 제한 시간(60초)을 넘길 수 있으므로 줄인다.
 * Gemini 3 계열은 thinkingLevel, 2.5 계열은 thinkingBudget 을 받는다 → 거절되면 다음 후보로.
 */
const THINKING: (Record<string, unknown> | null)[] = [{ thinkingLevel: "low" }, { thinkingBudget: 512 }, null];
let thinkingPick = 0; // 한 번 통한 설정은 기억 (인스턴스가 살아 있는 동안)

/** 서버가 먼저 멈추는 시간. Vercel 이 60초에 끊기 전에 알기 쉬운 오류를 돌려준다 */
const DEADLINE_MS = 50_000;

export async function geminiJson<S extends z.ZodType>(schema: S, system: string, prompt: string): Promise<{ data: z.infer<S>; model: string }> {
  const key = serverEnv.geminiApiKey();
  if (!key) throw new GeminiError("GEMINI_API_KEY 가 설정되지 않았습니다.", 503);
  const model = serverEnv.geminiModel() ?? "gemini-flash-latest";
  const deadline = Date.now() + DEADLINE_MS;
  const started = Date.now();

  for (let i = thinkingPick; i < THINKING.length; i++) {
    const thinkingConfig = THINKING[i];
    const left = deadline - Date.now();
    if (left < 3000) break;
    let res: Response;
    try {
      res = await fetch(`${serverEnv.geminiBaseUrl()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 4096,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        }),
        signal: AbortSignal.timeout(left),
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      console.error(`[gemini] ${model} ${timedOut ? "timeout" : "fetch error"} after ${Date.now() - started}ms`, timedOut ? "" : e);
      throw new GeminiError(
        timedOut
          ? "AI 응답이 너무 오래 걸려 중단했습니다. 잠시 후 다시 시도하거나 아래 '채팅 AI로 채점받기'를 이용하세요."
          : "AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
        timedOut ? 504 : 502,
      );
    }
    const json = (await res.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      error?: { message?: string; status?: string; details?: { reason?: string }[] };
    };
    const message = json.error?.message ?? "";
    console.info(`[gemini] ${model} thinking=${JSON.stringify(thinkingConfig)} status=${res.status} ${Date.now() - started}ms`);
    if (!res.ok) {
      // 이 모델이 받지 않는 생각 설정 → 다음 후보로 다시
      if (res.status === 400 && /thinking/i.test(message) && i < THINKING.length - 1) continue;
      if (res.status === 429) throw new GeminiError("오늘 무료 AI 채점 한도를 다 썼습니다. 아래 '채팅 AI로 채점받기'를 이용하세요.", 429);
      if (res.status === 404) throw new GeminiError(`AI 모델(${model})을 찾을 수 없습니다. 관리자: GEMINI_MODEL 환경변수를 확인하세요.`, 503);
      const badKey = res.status === 401 || res.status === 403 || /api[_ ]?key/i.test(message) || json.error?.details?.some((d) => d.reason === "API_KEY_INVALID");
      if (badKey) throw new GeminiError("AI 채점 키가 올바르지 않습니다. 관리자: GEMINI_API_KEY 를 확인하세요.", 503);
      throw new GeminiError(`AI 채점 실패 (${res.status}) ${message}`.trim(), 502);
    }
    thinkingPick = i;
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    if (!text.trim()) throw new GeminiError("AI 가 빈 답을 보냈습니다. 다시 시도하세요.", 502);
    try {
      return { data: validatePasted(schema, text), model };
    } catch {
      throw new GeminiError("AI 답의 형식이 맞지 않습니다. 다시 시도하세요.", 502);
    }
  }
  throw new GeminiError("AI 응답이 너무 오래 걸려 중단했습니다. 아래 '채팅 AI로 채점받기'를 이용하세요.", 504);
}

/**
 * 연결 확인: 답을 생성하지 않고 모델 정보만 조회한다 (빠르고 무료 한도를 쓰지 않음).
 * 키가 틀리면 400/403, 모델 이름이 틀리면 404.
 */
export async function geminiCheck(): Promise<{ model: string; displayName: string | null }> {
  const key = serverEnv.geminiApiKey();
  if (!key) throw new GeminiError("GEMINI_API_KEY 가 설정되지 않았습니다.", 503);
  const model = serverEnv.geminiModel() ?? "gemini-flash-latest";
  let res: Response;
  try {
    res = await fetch(`${serverEnv.geminiBaseUrl()}/v1beta/models/${encodeURIComponent(model)}`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GeminiError("AI 서버에 연결하지 못했습니다 (15초 안에 응답 없음).", 502);
  }
  const json = (await res.json().catch(() => ({}))) as { displayName?: string; error?: { message?: string } };
  if (res.status === 404) throw new GeminiError(`AI 모델(${model})을 찾을 수 없습니다. GEMINI_MODEL 환경변수를 확인하세요.`, 503);
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiError("GEMINI_API_KEY 가 올바르지 않습니다.", 503);
  if (!res.ok) throw new GeminiError(`확인 실패 (${res.status}) ${json.error?.message ?? ""}`.trim(), 502);
  return { model, displayName: json.displayName ?? null };
}
