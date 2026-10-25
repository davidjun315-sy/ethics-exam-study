import "server-only";

/**
 * 서버 전용 환경변수 접근. 이 파일은 client component 에서 import 할 수 없다.
 */
function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const serverEnv = {
  supabaseUrl: () => read("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => read("SUPABASE_SERVICE_ROLE_KEY"),
  adminPassword: () => read("ADMIN_PASSWORD"),
  sessionSecret: () => read("ADMIN_SESSION_SECRET"),
  aiProvider: () => (read("AI_PROVIDER") ?? "anthropic").toLowerCase(),
  aiModel: () => read("AI_MODEL"),
  aiEffort: () => read("AI_EFFORT"),
  anthropicApiKey: () => read("ANTHROPIC_API_KEY"),
  openaiApiKey: () => read("OPENAI_API_KEY"),
  publicAiGrading: () => read("PUBLIC_AI_GRADING") !== "false",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl() && serverEnv.supabaseAnonKey());
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(serverEnv.supabaseUrl() && serverEnv.supabaseServiceRoleKey());
}
