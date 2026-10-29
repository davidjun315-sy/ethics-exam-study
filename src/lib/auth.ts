/**
 * 관리자 세션 + 회원 세션 토큰.
 * - ADMIN_PASSWORD 는 서버에서만 비교한다.
 * - 로그인 성공 시 HMAC 서명된 토큰을 httpOnly cookie 로 발급한다.
 * - Web Crypto 만 사용하므로 proxy(edge) 와 Node route 양쪽에서 동작한다.
 */

export const ADMIN_COOKIE = "ees_admin";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7일

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

function getSecretMaterial(): string | null {
  const explicit = process.env.ADMIN_SESSION_SECRET?.trim();
  if (explicit) return explicit;
  const pw = process.env.ADMIN_PASSWORD?.trim();
  // 별도 secret 이 없으면 비밀번호에서 파생 (비밀번호를 바꾸면 기존 세션은 모두 무효화됨)
  return pw ? `derived:${pw}` : null;
}

async function hmac(message: string): Promise<string | null> {
  const secret = getSecretMaterial();
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAdminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

export async function verifyPassword(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  // 길이 정보 노출을 막기 위해 hash 끼리 비교
  const [a, b] = await Promise.all([sha256Hex(input), sha256Hex(expected)]);
  return constantTimeEqual(a, b);
}

export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `admin.${exp}`;
  const sig = await hmac(payload);
  if (!sig) throw new Error("ADMIN_PASSWORD 가 설정되지 않았습니다.");
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const sig = await hmac(`${parts[0]}.${parts[1]}`);
  if (!sig) return false;
  return constantTimeEqual(sig, parts[2]);
}

// ---------------------------------------------------------------------
// 회원 세션: "member.<회원 id>.<만료>.<서명>" (관리자 세션과 같은 비밀값으로 서명)
// ---------------------------------------------------------------------
export const MEMBER_COOKIE = "ees_member";
export const MEMBER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30일

export async function createMemberToken(memberId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MEMBER_TTL_SECONDS;
  const payload = `member.${memberId}.${exp}`;
  const sig = await hmac(payload);
  if (!sig) throw new Error("서버 세션 비밀값(ADMIN_PASSWORD 또는 ADMIN_SESSION_SECRET)이 설정되지 않았습니다.");
  return `${payload}.${sig}`;
}

/** 서명·만료가 맞으면 회원 id, 아니면 null */
export async function verifyMemberToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "member") return null;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const sig = await hmac(parts.slice(0, 3).join("."));
  if (!sig || !constantTimeEqual(sig, parts[3])) return null;
  return parts[1];
}
