import Link from "next/link";
import { redirect } from "next/navigation";
import { currentLearner } from "@/lib/quiz/learn";
import { getConquest } from "@/lib/quiz/fun";
import { ConquestMap } from "@/components/quiz/ConquestMap";

export const metadata = { title: "사상가 정복 지도" };

export default async function ConquestPage() {
  const learner = await currentLearner();
  if (!learner) redirect("/login?next=/quiz/map");
  const c = await getConquest(learner);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <Link href="/quiz" className="text-xs text-muted hover:text-navy">
          ← 윤리 퀴즈
        </Link>
        <h1 className="text-2xl font-black tracking-tight">사상가 정복 지도</h1>
        <p className="mt-1 text-sm text-muted">
          완전 기출 정복 <b className="text-ink">{c.totals.full.conquered}</b>명 · 부분 기출 정복 <b className="text-ink">{c.totals.part.conquered}</b>명 <span className="text-faint">(사상가 {c.totals.philosophers}명)</span>
        </p>
      </div>
      {c.groups.length === 0 ? <p className="card p-6 text-center text-sm text-muted">아직 사상가별 문제가 없습니다.</p> : <ConquestMap c={c} />}
    </div>
  );
}
