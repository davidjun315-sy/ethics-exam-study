import "server-only";
import { serverEnv } from "@/lib/env";
import { artPrompt, faceFor, suggestFor } from "./suggestions";
import { GameError } from "./data";

/**
 * 카드 일러스트 자동 제작 (관리자 전용).
 * 1) 위키백과 문서의 대표 이미지(역사 인물은 대개 초상화·흉상)를 참고 초상으로 자동으로 찾고
 * 2) 그 초상을 Gemini 이미지 모델에 함께 넣어 카드 화풍으로 새로 그린다 (얼굴은 초상, 화풍·구도는 프롬프트)
 * 생존 인물은 초상을 찾지 않고 실루엣·상징 중심으로 그린다.
 */

const UA = "ethics-exam-study/1.0 (philosopher card art; admin-only reference lookup)";

export interface Reference {
  imageUrl: string;
  pageUrl: string;
  title: string;
  description: string | null;
  lang: "en" | "ko";
}

function wikiBase(lang: "en" | "ko"): string {
  return (process.env.WIKIPEDIA_BASE ?? "https://{lang}.wikipedia.org").replace("{lang}", lang);
}

async function summary(lang: "en" | "ko", title: string): Promise<Reference | null> {
  const res = await fetch(`${wikiBase(lang)}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}?redirect=true`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as {
    type?: string;
    title?: string;
    description?: string;
    originalimage?: { source: string };
    thumbnail?: { source: string };
    content_urls?: { desktop?: { page?: string } };
  } | null;
  if (!j || j.type === "disambiguation") return null;
  const img = j.originalimage?.source ?? j.thumbnail?.source;
  if (!img || !/\.(jpe?g|png|webp)$/i.test(img.split("?")[0])) return null; // SVG(서명·도표) 등은 제외
  return { imageUrl: img, pageUrl: j.content_urls?.desktop?.page ?? `${wikiBase(lang)}/wiki/${encodeURIComponent(title)}`, title: j.title ?? title, description: j.description ?? null, lang };
}

/** 참고 초상 자동 찾기: 영문 이름(얼굴 참고표) → 원어 이름 → 한국어 위키백과 */
export async function findReference(p: { name: string; originalName: string | null; aliases: string[] }): Promise<Reference | null> {
  const f = faceFor(p.name, p.aliases);
  const en = [f?.en, f?.en?.replace(/\s*\(.*\)\s*/g, ""), p.originalName].filter((x): x is string => Boolean(x && /[A-Za-z]/.test(x)));
  for (const t of [...new Set(en)]) {
    const r = await summary("en", t);
    if (r) return r;
  }
  for (const t of [p.name, ...p.aliases]) {
    const r = await summary("ko", t);
    if (r) return r;
  }
  return null;
}

async function fetchImage(url: string): Promise<{ mimeType: string; data: string }> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new GameError(`참고 초상을 내려받지 못했습니다 (${res.status})`, 502);
  const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) throw new GameError("참고 초상 형식을 쓸 수 없습니다", 502);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 12 * 1024 * 1024) throw new GameError("참고 초상이 너무 큽니다", 502);
  return { mimeType, data: buf.toString("base64") };
}

export interface GeneratedArt {
  dataUrl: string;
  reference: Reference | null;
  model: string;
  basis: "portrait" | "reconstruction";
  note: string;
}

/** 참고 초상을 찾아 카드 일러스트를 생성한다 */
export async function generateCardArt(p: {
  name: string;
  originalName: string | null;
  aliases: string[];
  era: string | null;
  tradition: string;
  referenceUrl?: string | null; // 관리자가 다른 이미지를 원할 때 (선택)
}): Promise<GeneratedArt> {
  const key = serverEnv.geminiApiKey();
  if (!key) throw new GameError("GEMINI_API_KEY 가 설정되어 있지 않아 자동 생성을 쓸 수 없습니다. '프롬프트 복사'로 직접 만들어 주세요.", 503);
  const s = suggestFor(p.name, p.aliases, p.tradition);
  const reference = s.living ? null : p.referenceUrl ? { imageUrl: p.referenceUrl, pageUrl: p.referenceUrl, title: "관리자 지정 이미지", description: null, lang: "en" as const } : await findReference(p);
  const ref = reference ? await fetchImage(reference.imageUrl).catch(() => null) : null;
  const prompt = [
    artPrompt({ name: p.name, originalName: p.originalName, era: p.era, tradition: p.tradition, look: s.look, living: s.living, aliases: p.aliases }),
    ref ? "A reference portrait of this exact person is attached: match the face to it." : "",
  ]
    .filter(Boolean)
    .join("\n");
  const model = process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
  const parts: unknown[] = [{ text: prompt }];
  if (ref) parts.push({ inlineData: ref });

  const call = async (withAspect: boolean) =>
    fetch(`${serverEnv.geminiBaseUrl()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(withAspect ? { imageConfig: { aspectRatio: "3:4" } } : {}) },
      }),
      signal: AbortSignal.timeout(100_000),
    });
  let res: Response;
  try {
    res = await call(true);
    // 비율 설정을 받지 않는 모델이면 한 번 더 (비율은 업로드 때 3:4 로 자른다)
    if (res.status === 400) {
      const t = await res.clone().text();
      if (/aspect|imageConfig/i.test(t)) res = await call(false);
    }
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new GameError(timeout ? "이미지 생성이 너무 오래 걸려 중단했습니다. 다시 시도하세요." : "이미지 생성 서버에 연결하지 못했습니다.", 504);
  }
  const json = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string }; text?: string }[] }; finishReason?: string }[];
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
  };
  console.info(`[card-art] ${model} ${p.name} status=${res.status} ref=${reference ? reference.title : "none"}`);
  if (!res.ok) {
    const m = json.error?.message ?? "";
    if (res.status === 429) throw new GameError("오늘 이미지 생성 한도를 다 썼습니다 (무료 등급 한도일 수 있습니다). 내일 다시 하거나 '프롬프트 복사'로 직접 만들어 주세요.", 429);
    if (res.status === 404) throw new GameError(`이미지 모델(${model})을 찾을 수 없습니다. GEMINI_IMAGE_MODEL 환경변수를 확인하세요.`, 503);
    if (/billing|quota|free tier|not available/i.test(m)) throw new GameError(`이 키로는 이미지 생성을 쓸 수 없습니다 (${m.slice(0, 120)}). Google AI Studio 에서 결제를 연결하거나 '프롬프트 복사'를 이용하세요.`, 402);
    throw new GameError(`이미지 생성 실패 (${res.status}) ${m.slice(0, 160)}`.trim(), 502);
  }
  const img = (json.candidates?.[0]?.content?.parts ?? []).find((x) => x.inlineData?.data);
  if (!img?.inlineData?.data) {
    const why = json.promptFeedback?.blockReason ?? json.candidates?.[0]?.finishReason ?? "";
    throw new GameError(`AI 가 이미지를 돌려주지 않았습니다${why ? ` (${why})` : ""}. 다시 시도하세요.`, 502);
  }
  const face = faceFor(p.name, p.aliases);
  return {
    dataUrl: `data:${img.inlineData.mimeType ?? "image/png"};base64,${img.inlineData.data}`,
    reference,
    model,
    basis: s.living || !ref ? "reconstruction" : "portrait",
    note: s.living ? "생존 인물: 상징 중심 구성" : ref ? `참고 초상: ${reference!.title} (위키백과 대표 이미지)${face ? ` · ${face.ref}` : ""}`.slice(0, 200) : "확인된 초상 없음: 전통 도상 기반 재구성",
  };
}
