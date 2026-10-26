import "server-only";

/**
 * 서버 전용 환경변수 접근. 이 파일은 client component 에서 import 할 수 없다.
 */
function read(name: string): string | undefined {
  // 대시보드에 값을 붙여넣을 때 섞여 들어간 공백 / 따옴표 / "KEY=" 접두어를 제거한다.
  const v = process.env[name]
    ?.trim()
    .replace(new RegExp(`^${name}=`), "")
    .replace(/^["']|["']$/g, "")
    .trim();
  return v ? v : undefined;
}

export const serverEnv = {
  // Supabase 의 새 키 이름(publishable / secret)과 Vercel 연동이 만드는 이름도 허용한다.
  supabaseUrl: () => read("NEXT_PUBLIC_SUPABASE_URL") ?? read("SUPABASE_URL"),
  supabaseAnonKey: () =>
    read("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? read("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? read("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => read("SUPABASE_SERVICE_ROLE_KEY") ?? read("SUPABASE_SECRET_KEY"),
  adminPassword: () => read("ADMIN_PASSWORD"),
  sessionSecret: () => read("ADMIN_SESSION_SECRET"),
  aiProvider: () => (read("AI_PROVIDER") ?? "anthropic").toLowerCase(),
  aiModel: () => read("AI_MODEL"),
  aiEffort: () => read("AI_EFFORT"),
  anthropicApiKey: () => read("ANTHROPIC_API_KEY"),
  openaiApiKey: () => read("OPENAI_API_KEY"),
  publicAiGrading: () => read("PUBLIC_AI_GRADING") !== "false",
};

/** 설정되지 않은 Supabase 환경변수 이름 목록 (오류 메시지용) */
export function missingSupabaseEnv(kind: "read" | "admin"): string[] {
  const missing: string[] = [];
  if (!serverEnv.supabaseUrl()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (kind === "read" && !serverEnv.supabaseAnonKey()) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (kind === "admin" && !serverEnv.supabaseServiceRoleKey()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl() && serverEnv.supabaseAnonKey());
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl() && serverEnv.supabaseServiceRoleKey());
}
