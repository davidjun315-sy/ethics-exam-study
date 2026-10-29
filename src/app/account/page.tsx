import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton, PasswordForm } from "@/components/account/AccountActions";
import { getCurrentMember } from "@/lib/members";
import { getProfile } from "@/lib/quiz/learn";
import { levelForXp } from "@/lib/quiz/srs";

export const metadata = { title: "내 계정" };

export default async function AccountPage() {
  const me = await getCurrentMember().catch(() => null);
  if (!me) redirect("/login?next=/account");
  const profile = await getProfile(`m:${me.id}`).catch(() => null);
  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <h1 className="text-2xl font-bold">내 계정</h1>
      <section className="card space-y-1 p-4 text-sm">
        <div className="text-lg font-bold">{me.display_name}</div>
        <div className="text-muted">아이디 {me.username} · 가입 {new Date(me.created_at).toLocaleDateString("ko-KR")}</div>
        {profile && (
          <div className="pt-2">
            윤리 퀴즈 Lv.{levelForXp(profile.xp).level} · {profile.xp} XP · 푼 문제 {profile.total_answered}개 · 최고 연속 {profile.best_streak}일
          </div>
        )}
        <div className="flex gap-2 pt-3">
          <Link href="/quiz" className="btn-primary">윤리 퀴즈</Link>
          <LogoutButton />
        </div>
      </section>
      <section className="card p-4">
        <h2 className="mb-2 text-[15px] font-bold">비밀번호 변경</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
