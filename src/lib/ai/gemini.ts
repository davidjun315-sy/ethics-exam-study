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
 * 생각(thinking) 설정 후보. 생각을 길게 하면 응답이 수십 초 걸리므로 줄인다.
 * Gemini 3 계열은 thinkingLevel, 2.5 계열은 thinkingBudget 을 받는다 → 거절되면 다음 후보로.
 */
const THINKING: (Record<string, unknown> | null)[] = [{ thinkingLevel: "low" }, { thinkingBudget: 512 }, null];
const thinkingPick = new Map<string, number>(); // 모델별로 한 번 통한 설정은 기억 (인스턴스가 살아 있는 동안)

/** 전체 제한. 라우트의 maxDuration(120초)보다 짧게 두어 Vercel 이 끊기 전에 알기 쉬운 오류를 돌려준다 */
const TOTAL_MS = 105_000;
/** 기본 모델이 이 시간 안에 답하지 않으면 (무료 등급 요청이 가끔 오래 붙잡힘) 빠른 모델로 다시 */
const PRIMARY_MS = 40_000;

/** 사용할 모델 순서: 기본(GEMINI_MODEL) → 빠른 예비(GEMINI_FALLBACK_MODEL, "none" 이면 사용 안 함) */
export function geminiModels(): string[] {
  const primary = serverEnv.geminiModel() ?? "gemini-flash-latest";
  const fallback = serverEnv.geminiFallbackModel() ?? "gemini-flash-lite-latest";
  return fallback === "none" || fallback === primary ? [primary] : [primary, fallback];
}

type Attempt = { kind: "ok"; text: string } | { kind: "timeout" } | { kind: "retry-thinking" };

async function attempt(model: string, key: string, system: string, prompt: string, thinkingConfig: Record<string, unknown> | null, ms: number, started: number): Promise<Attempt> {
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
      signal: AbortSignal.timeout(ms),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error(`[gemini] ${model} ${timedOut ? "timeout" : "fetch error"} after ${Date.now() - started}ms`, timedOut ? "" : e);
    if (timedOut) return { kind: "timeout" };
    throw new GeminiError("AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", 502);
  }
  const json = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    error?: { message?: string; status?: string; details?: { reason?: string }[] };
  };
  const message = json.error?.message ?? "";
  console.info(`[gemini] ${model} thinking=${JSON.stringify(thinkingConfig)} status=${res.status} ${Date.now() - started}ms`);
  if (!res.ok) {
    // 이 모델이 받지 않는 생각 설정 → 다음 후보로 다시
    if (res.status === 400 && /thinking/i.test(message)) return { kind: "retry-thinking" };
    if (res.status === 429) throw new GeminiError("오늘 무료 AI 채점 한도를 다 썼습니다. 아래 '채팅 AI로 채점받기'를 이용하세요.", 429);
    if (res.status === 404) throw new GeminiError(`AI 모델(${model})을 찾을 수 없습니다. 관리자: GEMINI_MODEL 환경변수를 확인하세요.`, 503);
    const badKey = res.status === 401 || res.status === 403 || /api[_ ]?key/i.test(message) || json.error?.details?.some((d) => d.reason === "API_KEY_INVALID");
    if (badKey) throw new GeminiError("AI 채점 키가 올바르지 않습니다. 관리자: GEMINI_API_KEY 를 확인하세요.", 503);
    // 서버 과부하(503/500 등) → 다음 모델로
    if (res.status >= 500) return { kind: "timeout" };
    throw new GeminiError(`AI 채점 실패 (${res.status}) ${message}`.trim(), 502);
  }
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) throw new GeminiError("AI 가 빈 답을 보냈습니다. 다시 시도하세요.", 502);
  return { kind: "ok", text };
}

export async function geminiJson<S extends z.ZodType>(schema: S, system: string, prompt: string): Promise<{ data: z.infer<S>; model: string; ms: number }> {
  const key = serverEnv.geminiApiKey();
  if (!key) throw new GeminiError("GEMINI_API_KEY 가 설정되지 않았습니다.", 503);
  const models = geminiModels();
  const started = Date.now();
  const deadline = started + TOTAL_MS;

  for (const [mi, model] of models.entries()) {
    const isLast = mi === models.length - 1;
    // 기본 모델은 PRIMARY_MS 까지만 기다리고, 마지막 모델은 남은 시간을 모두 쓴다
    const until = isLast ? deadline : Math.min(deadline, Date.now() + PRIMARY_MS);
    for (let i = thinkingPick.get(model) ?? 0; i < THINKING.length; i++) {
      const left = until - Date.now();
      if (left < 3000) break;
      const r = await attempt(model, key, system, prompt, THINKING[i], left, started);
      if (r.kind === "retry-thinking" && i < THINKING.length - 1) continue;
      if (r.kind !== "ok") break; // 시간 초과·과부하 → 다음 모델
      thinkingPick.set(model, i);
      try {
        return { data: validatePasted(schema, r.text), model, ms: Date.now() - started };
      } catch {
        throw new GeminiError("AI 답의 형식이 맞지 않습니다. 다시 시도하세요.", 502);
      }
    }
  }
  throw new GeminiError("AI 가 너무 오래 답하지 않아 중단했습니다. 잠시 후 다시 시도하거나 아래 '채팅 AI로 채점받기'를 이용하세요.", 504);
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
