import "server-only";
import type { NextResponse } from "next/server";
import { createMemberToken, MEMBER_COOKIE, MEMBER_TTL_SECONDS } from "@/lib/auth";

/** 회원 로그인 쿠키 발급 (httpOnly) */
export async function setMemberCookie(res: NextResponse, memberId: string) {
  res.cookies.set(MEMBER_COOKIE, await createMemberToken(memberId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MEMBER_TTL_SECONDS,
  });
}

export function clearMemberCookie(res: NextResponse) {
  res.cookies.set(MEMBER_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
