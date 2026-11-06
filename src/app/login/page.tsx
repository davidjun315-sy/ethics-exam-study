import { redirect } from "next/navigation";
import { AuthForm } from "@/components/account/AuthForm";
import { LogoMark } from "@/components/brand/Logo";
import { getCurrentMember, safeNext } from "@/lib/members";

export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentMember().catch(() => null)) redirect(next);
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <div className="flex flex-col items-center gap-3 pb-2 pt-4">
        <LogoMark className="h-12 w-12 drop-shadow-sm" />
        <h1 className="text-center text-2xl font-bold tracking-tight">로그인</h1>
      </div>
      <p className="text-center text-sm text-muted">윤리 퀴즈 학습 기록이 계정에 저장되어 어느 기기에서나 이어집니다.</p>
      <AuthForm mode="login" next={next} />
    </div>
  );
}
