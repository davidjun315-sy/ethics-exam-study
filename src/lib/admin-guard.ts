import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/auth";
import { ConfigError } from "@/lib/supabase/server";

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}

/** API route 에서 관리자 인증 확인. 실패 시 401 응답을 반환한다. */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
}

export function jsonError(err: unknown, status = 500): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ConfigError) return NextResponse.json({ error: message }, { status: 503 });
  console.error(err);
  return NextResponse.json({ error: message }, { status });
}
