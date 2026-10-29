import { redirect } from "next/navigation";
import { AuthForm } from "@/components/account/AuthForm";
import { getCurrentMember, safeNext } from "@/lib/members";

export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentMember().catch(() => null)) redirect(next);
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="text-center text-2xl font-bold">로그인</h1>
      <p className="text-center text-sm text-muted">윤리 퀴즈 학습 기록이 계정에 저장되어 어느 기기에서나 이어집니다.</p>
      <AuthForm mode="login" next={next} />
    </div>
  );
}
