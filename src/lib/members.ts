import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { MEMBER_COOKIE, verifyMemberToken } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/server";

/**
 * 회원: 아이디 + 비밀번호. 비밀번호는 scrypt(무작위 salt) 해시로만 저장한다.
 * members 테이블은 공개 읽기 정책이 없어 서버만 접근한다.
 */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface Member {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
  disabled: boolean;
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const MIGRATION_HINT = "회원 테이블이 없습니다. Supabase SQL Editor 에서 supabase/migrations/006_members.sql 을 실행하세요.";

function dbError(message: string): Error {
  return new Error(/members/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message) ? MIGRATION_HINT : message);
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, saltHex, hashHex] = stored.split("$");
  if (kind !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const got = await scrypt(pw, Buffer.from(saltHex, "hex"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** 로그인한 회원 (쿠키 서명 확인 + 정지되지 않은 회원) */
export async function getCurrentMember(): Promise<Member | null> {
  const store = await cookies();
  const id = await verifyMemberToken(store.get(MEMBER_COOKIE)?.value);
  if (!id) return null;
  const { data, error } = await getAdminClient().from("members").select("id, username, display_name, created_at, last_login_at, disabled").eq("id", id).maybeSingle();
  if (error || !data || data.disabled) return null;
  return data as Member;
}

export async function isSignupOpen(): Promise<boolean> {
  const { data } = await getAdminClient().from("quiz_settings").select("signup_open").eq("id", 1).maybeSingle();
  return (data as { signup_open?: boolean } | null)?.signup_open ?? true;
}

export async function createMember(input: { username: string; password: string; displayName: string }): Promise<Member> {
  const username = input.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new Error("아이디는 영문 소문자·숫자·밑줄(_) 3~20자로 정해 주세요.");
  if (input.password.length < 8) throw new Error("비밀번호는 8자 이상으로 정해 주세요.");
  const display = input.displayName.trim() || username;
  const db = getAdminClient();
  const { data, error } = await db
    .from("members")
    .insert({ username, display_name: display.slice(0, 30), password_hash: await hashPassword(input.password), last_login_at: new Date().toISOString() })
    .select("id, username, display_name, created_at, last_login_at, disabled")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("이미 사용 중인 아이디입니다.");
    throw dbError(error.message);
  }
  return data as Member;
}

/** 아이디·비밀번호 확인. 틀리면 어느 쪽이 틀렸는지 알려 주지 않는다 */
export async function authenticate(username: string, password: string): Promise<Member | null> {
  const db = getAdminClient();
  const { data, error } = await db.from("members").select("*").eq("username", username.trim().toLowerCase()).maybeSingle();
  if (error) throw dbError(error.message);
  if (!data) {
    await hashPassword(password); // 아이디 존재 여부가 응답 시간으로 드러나지 않게
    return null;
  }
  if (data.disabled || !(await checkPassword(password, data.password_hash))) return null;
  await db.from("members").update({ last_login_at: new Date().toISOString() }).eq("id", data.id);
  const { password_hash: _ignored, ...member } = data;
  void _ignored;
  return member as Member;
}

export async function changePassword(memberId: string, current: string, next: string) {
  if (next.length < 8) throw new Error("새 비밀번호는 8자 이상으로 정해 주세요.");
  const db = getAdminClient();
  const { data } = await db.from("members").select("password_hash").eq("id", memberId).maybeSingle();
  if (!data || !(await checkPassword(current, data.password_hash))) throw new Error("현재 비밀번호가 올바르지 않습니다.");
  const { error } = await db.from("members").update({ password_hash: await hashPassword(next) }).eq("id", memberId);
  if (error) throw dbError(error.message);
}

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await getAdminClient().from("members").select("id, username, display_name, created_at, last_login_at, disabled").order("created_at", { ascending: false }).limit(1000);
  if (error) throw dbError(error.message);
  return (data ?? []) as Member[];
}

export async function setMemberDisabled(id: string, disabled: boolean) {
  const { error } = await getAdminClient().from("members").update({ disabled }).eq("id", id);
  if (error) throw dbError(error.message);
}

/** 로그인 뒤 돌아갈 곳: 사이트 안의 경로만 (다른 사이트로 보내지 않음) */
export function safeNext(v: unknown, fallback = "/quiz"): string {
  return typeof v === "string" && /^\/(?![\/\\])[^\s\\]*$/.test(v) && !v.startsWith("/admin") ? v : fallback;
}
