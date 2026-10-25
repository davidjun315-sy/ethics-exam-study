"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * 브라우저용 클라이언트. anon key 만 사용하며, 관리자 서버가 발급한
 * signed upload URL 로 Storage 에 직접 업로드할 때만 쓴다.
 * (Vercel 함수의 요청 크기 제한(4.5MB)을 피하기 위함)
 */
export function getBrowserClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다.");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
