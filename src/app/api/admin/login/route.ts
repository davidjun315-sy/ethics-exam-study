import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
  isAdminPasswordConfigured,
  verifyPassword,
} from "@/lib/auth";
import { clientKey, parseBody, rateLimit } from "@/lib/http";

const Body = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!isAdminPasswordConfigured()) {
    return NextResponse.json({ error: "서버에 ADMIN_PASSWORD 환경변수가 설정되지 않았습니다." }, { status: 503 });
  }
  if (!rateLimit(`login:${clientKey(req)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "로그인 시도가 너무 많습니다. 10분 후 다시 시도하세요." }, { status: 429 });
  }
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  if (!(await verifyPassword(data.password))) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
