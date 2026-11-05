import "server-only";
import { NextResponse } from "next/server";
import { GameError } from "./data";

/** 게임 API 오류 응답 (알 수 없는 오류는 서버 로그에만 자세히) */
export function gameJsonError(e: unknown): NextResponse {
  if (e instanceof GameError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[game]", e);
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
}
