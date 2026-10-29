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

export async function geminiJson<S extends z.ZodType>(schema: S, system: string, prompt: string): Promise<{ data: z.infer<S>; model: string }> {
  const key = serverEnv.geminiApiKey();
  if (!key) throw new GeminiError("GEMINI_API_KEY 가 설정되지 않았습니다.", 503);
  const model = serverEnv.geminiModel() ?? "gemini-flash-latest";
  let res: Response;
  try {
    res = await fetch(`${serverEnv.geminiBaseUrl()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new GeminiError("AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", 502);
  }
  const json = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    if (res.status === 429) throw new GeminiError("오늘 무료 AI 채점 한도를 다 썼습니다. 아래 '채팅 AI로 채점받기'를 이용하세요.", 429);
    if (res.status === 404) throw new GeminiError(`AI 모델(${model})을 찾을 수 없습니다. 관리자: GEMINI_MODEL 환경변수를 확인하세요.`, 503);
    if (res.status === 400 || res.status === 401 || res.status === 403)
      throw new GeminiError("AI 채점 키가 올바르지 않습니다. 관리자: GEMINI_API_KEY 를 확인하세요.", 503);
    throw new GeminiError(`AI 채점 실패 (${res.status}) ${json.error?.message ?? ""}`.trim(), 502);
  }
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text.trim()) throw new GeminiError("AI 가 빈 답을 보냈습니다. 다시 시도하세요.", 502);
  try {
    return { data: validatePasted(schema, text), model };
  } catch {
    throw new GeminiError("AI 답의 형식이 맞지 않습니다. 다시 시도하세요.", 502);
  }
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
