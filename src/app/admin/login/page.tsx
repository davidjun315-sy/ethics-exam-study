import { LoginForm } from "@/components/admin/LoginForm";
import { isAdminPasswordConfigured } from "@/lib/auth";

export const metadata = { title: "관리자 로그인" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  // 로그인 후 돌아갈 곳: 관리자 화면 · 내 학습 · 윤리 퀴즈만 허용 (외부 주소로 보내지 않음)
  const next = typeof sp.next === "string" && /^\/(admin|my|quiz)(\/|\?|$)/.test(sp.next) ? sp.next : "/admin";
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card p-6">
        <h1 className="text-lg font-bold">관리자</h1>
        <p className="mt-1 text-sm text-muted">PDF 업로드와 데이터 수정은 관리자만 할 수 있습니다.</p>
        {isAdminPasswordConfigured() ? (
          <LoginForm next={next} />
        ) : (
          <p className="mt-4 rounded bg-warn-soft p-3 text-sm text-warn">
            서버에 <code>ADMIN_PASSWORD</code> 환경변수가 설정되지 않았습니다. .env.local 또는 Vercel 환경변수에 추가한 뒤 서버를 다시 시작하세요.
          </p>
        )}
      </div>
    </div>
  );
}
