import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";

export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S>; error: null } | { data: null; error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { data: null, error: NextResponse.json({ error: "JSON 형식이 올바르지 않습니다." }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      data: null,
      error: NextResponse.json({ error: "입력값이 올바르지 않습니다.", issues: parsed.error.issues }, { status: 400 }),
    };
  }
  return { data: parsed.data, error: null };
}

/** 아주 단순한 메모리 기반 rate limit (서버 인스턴스별). 공개 AI 기능 남용 방지용. */
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
