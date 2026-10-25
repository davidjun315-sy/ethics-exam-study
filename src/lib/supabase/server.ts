import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

export class ConfigError extends Error {}

let readClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/** 공개 읽기용 (anon key, RLS 적용) */
export function getReadClient(): SupabaseClient {
  if (readClient) return readClient;
  const url = serverEnv.supabaseUrl();
  const key = serverEnv.supabaseAnonKey();
  if (!url || !key) {
    throw new ConfigError(
      "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.",
    );
  }
  readClient = createClient(url, key, { auth: { persistSession: false } });
  return readClient;
}

/** 관리자 쓰기용 (service role key, RLS 우회). 반드시 관리자 인증 후 server 에서만 사용. */
export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = serverEnv.supabaseUrl();
  const key = serverEnv.supabaseServiceRoleKey();
  if (!url || !key) {
    throw new ConfigError(
      "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.",
    );
  }
  adminClient = createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

export const BUCKETS = {
  pdfs: "exam-pdfs",
  images: "question-images",
} as const;
