import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/account/AuthForm";
import { getCurrentMember, isSignupOpen, safeNext } from "@/lib/members";

export const metadata = { title: "회원가입" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentMember().catch(() => null)) redirect(next);
  const open = await isSignupOpen().catch(() => true);
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="text-center text-2xl font-bold">회원가입</h1>
      {open ? (
        <>
          <p className="text-center text-sm text-muted">아이디와 비밀번호만 있으면 됩니다. 이메일 등 다른 정보는 받지 않습니다.</p>
          <AuthForm mode="signup" next={next} />
        </>
      ) : (
        <div className="card p-5 text-center text-sm text-muted">
          지금은 회원가입을 받지 않습니다.{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-navy underline">로그인</Link>
        </div>
      )}
    </div>
  );
}
