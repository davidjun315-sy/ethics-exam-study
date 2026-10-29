import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { clearMemberCookie, setMemberCookie } from "@/lib/member-cookie";
import { authenticate } from "@/lib/members";

const Body = z.object({ username: z.string().min(1).max(40), password: z.string().min(1).max(200) });

/** 회원 로그인 */
export async function POST(req: Request) {
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  const ip = clientKey(req);
  if (!rateLimit(`member-login:${ip}`, 20, 10 * 60 * 1000) || !rateLimit(`member-login-id:${data.username.toLowerCase()}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "로그인 시도가 너무 많습니다. 10분 후 다시 시도하세요." }, { status: 429 });
  }
  try {
    const m = await authenticate(data.username, data.password);
    if (!m) return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    const res = NextResponse.json({ ok: true, displayName: m.display_name });
    await setMemberCookie(res, m.id);
    return res;
  } catch (e) {
    return jsonError(e);
  }
}

/** 로그아웃 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearMemberCookie(res);
  return res;
}
