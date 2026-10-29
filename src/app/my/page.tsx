import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { MemoCollection } from "@/components/study/MemoCollection";
import { MyStudy } from "@/components/study/MyStudy";
import { PageTitle } from "@/components/ui";
import { listMemos } from "@/lib/data/memos";
import { currentLearner } from "@/lib/quiz/learn";

export const metadata = { title: "내 학습" };

const TABS = [
  { key: "memos", label: "메모 모아보기" },
  { key: "records", label: "학습 기록" },
] as const;

export default async function MyPage({ searchParams }: PageProps<"/my">) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "memos";
  const learner = await currentLearner();
  return (
    <div className="space-y-4">
      <PageTitle title="내 학습" subtitle="문항마다 적은 메모를 섹터별로 모아 보고, 북마크·오답 등 학습 기록을 확인합니다." />
      <nav className="flex gap-1 rounded-lg border border-line bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/my?tab=${t.key}`}
            className={`rounded-md px-4 py-2 text-sm ${tab === t.key ? "bg-navy font-semibold text-white dark:text-[#0f141c]" : "text-muted hover:bg-surface-2"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "records" ? (
        <>
          <p className="text-xs text-faint">북마크·오답·답안 기록은 이 브라우저에만 저장됩니다. 다른 기기로 옮기려면 내보내기 / 가져오기를 사용하세요.</p>
          <MyStudy />
        </>
      ) : learner ? (
        <Memos learner={learner} />
      ) : (
        <div className="card space-y-2 p-6 text-center">
          <p className="text-sm text-muted">로그인하면 메모가 계정에 저장되어 휴대폰·다른 컴퓨터에서도 볼 수 있습니다.</p>
          <div className="flex justify-center gap-2">
            <Link href="/login?next=/my?tab=memos" className="btn-primary inline-block">로그인</Link>
            <Link href="/signup?next=/my?tab=memos" className="btn inline-block">회원가입</Link>
          </div>
        </div>
      )}
    </div>
  );
}

async function Memos({ learner }: { learner: string }) {
  const { data, error } = await load(() => listMemos(learner));
  if (error) return <DataError error={error} />;
  if (data === null)
    return (
      <p className="rounded bg-danger-soft p-3 text-sm text-danger">
        메모 테이블이 최신이 아닙니다. Supabase SQL Editor 에서 supabase/migrations/004_answer_commentary_and_memos.sql 과 006_members.sql 을 실행하세요.
      </p>
    );
  return <MemoCollection memos={data ?? []} />;
}
