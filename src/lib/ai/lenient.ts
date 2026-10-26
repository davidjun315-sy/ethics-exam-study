/**
 * 채팅 AI 가 붙여준 JSON 을 스키마에 맞게 너그럽게 정리한다.
 * - ```json 코드 블록 / 앞뒤 설명문 제거
 * - 빠진 키는 기본값으로 채움 (배열 → [], nullable → null, 문자열 → "", 숫자 → 0.5, boolean → false)
 * - "0.9" 같은 숫자 문자열은 숫자로 변환
 * 정리한 뒤에는 반드시 Zod 로 다시 검증한다.
 */

type JsonSchema = {
  type?: string | string[];
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
};

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("붙여넣은 내용에서 JSON 객체({ ... })를 찾지 못했습니다.");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    throw new Error(`JSON 형식이 올바르지 않습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function types(s: JsonSchema): string[] {
  if (s.anyOf) return s.anyOf.flatMap(types);
  if (Array.isArray(s.type)) return s.type;
  return s.type ? [s.type] : [];
}

function defaultFor(s: JsonSchema): unknown {
  const t = types(s);
  if (t.includes("null")) return null;
  if (t.includes("array")) return [];
  if (t.includes("object")) return normalize(s, {});
  if (t.includes("boolean")) return false;
  if (t.includes("number") || t.includes("integer")) return 0.5;
  if (s.enum?.length) return s.enum[0];
  return "";
}

export function normalize(schema: JsonSchema, value: unknown): unknown {
  const t = types(schema);
  const objectSchema = schema.anyOf?.find((x) => types(x).includes("object")) ?? schema;
  const arraySchema = schema.anyOf?.find((x) => types(x).includes("array")) ?? schema;

  if (value === undefined) return defaultFor(schema);
  if (value === null) return t.includes("null") ? null : defaultFor({ ...schema, type: t.filter((x) => x !== "null") });

  if (t.includes("object") && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    const src = value as Record<string, unknown>;
    for (const [k, sub] of Object.entries(objectSchema.properties ?? {})) out[k] = normalize(sub, src[k]);
    return out;
  }
  if (t.includes("array")) {
    if (Array.isArray(value)) return arraySchema.items ? value.map((v) => normalize(arraySchema.items!, v)) : value;
    if (typeof value === "string") return value.trim() ? [value] : [];
  }
  if ((t.includes("number") || t.includes("integer")) && typeof value === "string") {
    const n = Number(value.replace("%", ""));
    if (!Number.isNaN(n)) return value.includes("%") ? n / 100 : n;
  }
  if (t.includes("string") && typeof value !== "string" && typeof value !== "object") return String(value);
  return value;
}
