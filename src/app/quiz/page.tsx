import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { QuizHome } from "@/components/quiz/QuizHome";
import { StartLevelPicker } from "@/components/quiz/StartLevelPicker";
import { currentLearner, getDashboard } from "@/lib/quiz/learn";

export const metadata = { title: "윤리 퀴즈" };

export default async function QuizPage() {
  const learner = await currentLearner();
  if (!learner) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-6 text-center">
        <h1 className="text-2xl font-bold">윤리 퀴즈</h1>
        <p className="text-muted">
          실제 기출을 답 하나 단위로 나눈 문제를 매일 조금씩 풉니다. 틀린 문제는 알맞은 때에 다시 나오고, 정답 확인 후에는 기존 기출 분석으로 해설을 봅니다.
        </p>
        <div className="card space-y-3 p-5">
          <p className="text-sm text-muted">계정을 만들면 푼 문제·복습 일정·경험치·연속 학습이 계정에 쌓여 휴대폰·다른 컴퓨터에서도 이어집니다.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/signup?next=/quiz" className="btn-primary px-6 py-2.5">회원가입하고 시작하기</Link>
            <Link href="/login?next=/quiz" className="btn px-6 py-2.5">로그인</Link>
          </div>
        </div>
      </div>
    );
  }
  const { data, error } = await load(() => getDashboard(learner));
  if (error || !data) return <DataError error={error} />;
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-3xl items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">윤리 퀴즈</h1>
        <span className="text-xs text-faint">문제은행 {data.bankSize}문제</span>
      </div>
      {!data.profile ? (
        <section className="card mx-auto max-w-3xl p-5">
          <h2 className="text-lg font-bold">어디서부터 시작할까요?</h2>
          <p className="mb-4 mt-1 text-sm text-muted">기출을 이미 충분히 공부했다면 전문가로 시작하세요. 언제든 바꿀 수 있습니다.</p>
          <StartLevelPicker current={null} />
        </section>
      ) : (
        <QuizHome d={data} />
      )}
    </div>
  );
}
