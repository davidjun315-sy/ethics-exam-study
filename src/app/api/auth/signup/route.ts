import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/admin-guard";
import { clientKey, parseBody, rateLimit } from "@/lib/http";
import { setMemberCookie } from "@/lib/member-cookie";
import { createMember, isSignupOpen } from "@/lib/members";

const Body = z.object({
  username: z.string().min(1).max(40),
  password: z.string().min(1).max(200),
  displayName: z.string().max(30).optional(),
});

/** 회원가입 → 바로 로그인 */
export async function POST(req: Request) {
  if (!rateLimit(`signup:${clientKey(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "가입 시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }
  const { data, error } = await parseBody(req, Body);
  if (error) return error;
  try {
    if (!(await isSignupOpen())) return NextResponse.json({ error: "지금은 회원가입을 받지 않습니다." }, { status: 403 });
    const m = await createMember({ username: data.username, password: data.password, displayName: data.displayName ?? "" });
    const res = NextResponse.json({ ok: true, displayName: m.display_name });
    await setMemberCookie(res, m.id);
    return res;
  } catch (e) {
    return jsonError(e, 400);
  }
}
