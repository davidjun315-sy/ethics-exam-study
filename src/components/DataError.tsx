import Link from "next/link";
import { ConfigError } from "@/lib/supabase/server";

/** Supabase 미설정 / 조회 오류를 친절하게 보여준다. */
export function DataError({ error }: { error: unknown }) {
  const config = error instanceof ConfigError;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="card mx-auto max-w-2xl p-6">
      <h2 className="text-lg font-bold text-ink">{config ? "Supabase 연결 설정이 필요합니다" : "데이터를 불러오지 못했습니다"}</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {config ? (
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Supabase 프로젝트를 만들고 SQL Editor 에서 <code>supabase/schema.sql</code> 을 실행합니다.</li>
          <li>
            <code>.env.local</code> (Vercel 이면 Environment Variables) 에 <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> 를 입력합니다.
          </li>
          <li>서버를 다시 시작합니다. 자세한 내용은 README 를 참고하세요.</li>
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted">
          DB 스키마가 적용되었는지 확인하세요. 문제가 계속되면 <Link className="text-navy underline" href="/">홈</Link>으로 돌아가세요.
        </p>
      )}
    </div>
  );
}

export async function load<T>(fn: () => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: unknown }> {
  try {
    return { data: await fn(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}
