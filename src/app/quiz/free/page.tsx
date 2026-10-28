import Link from "next/link";
import { redirect } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { currentLearner, getFilterOptions } from "@/lib/quiz/learn";

export const metadata = { title: "자유 학습 · 윤리 퀴즈" };

function Select({ name, label, children }: { name: string; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select name={name} className="input py-2.5 text-[15px]" defaultValue="">
        <option value="">전체</option>
        {children}
      </select>
    </label>
  );
}

export default async function QuizFreePage() {
  if (!(await currentLearner())) redirect("/quiz");
  const { data, error } = await load(getFilterOptions);
  if (error || !data) return <DataError error={error} />;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">자유 학습</h1>
        <Link href="/quiz" className="text-sm text-muted hover:text-navy">퀴즈 홈</Link>
      </div>
      <p className="text-sm text-muted">조건을 골라 10문제씩 풉니다. 오늘의 미션과 별개로 몇 번이든 할 수 있습니다.</p>
      <form action="/quiz/play" className="card space-y-3 p-4">
        <input type="hidden" name="mode" value="free" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select name="area" label="학습 영역">
            {data.areas.map(([a, n]) => (
              <option key={a} value={a}>{a} ({n})</option>
            ))}
          </Select>
          <Select name="philosopher" label="사상가">
            {data.philosophers.map(([p, n]) => (
              <option key={p} value={p}>{p} ({n})</option>
            ))}
          </Select>
          <Select name="year" label="기출 연도">
            {data.years.map(([y, n]) => (
              <option key={y} value={y}>{y} ({n})</option>
            ))}
          </Select>
          <Select name="kind" label="출처">
            <option value="exam">실제 기출</option>
            <option value="expected">AI 예상 문제 ({data.expected})</option>
          </Select>
          <Select name="format" label="유형">
            <option value="fill">기입형</option>
            <option value="essay">서술형</option>
          </Select>
          <Select name="difficulty" label="난이도">
            <option value="1">하</option>
            <option value="2">중</option>
            <option value="3">상</option>
          </Select>
        </div>
        <fieldset>
          <legend className="label">문제</legend>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {[
              ["any", "전체"],
              ["new", "새로운 문제"],
              ["review", "푼 문제 복습"],
            ].map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line p-2.5 has-[:checked]:border-navy has-[:checked]:bg-navy-soft">
                <input type="radio" name="which" value={v} defaultChecked={v === "any"} className="accent-[var(--navy)]" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn-primary w-full py-3 text-base font-semibold">10문제 풀기</button>
      </form>
      <p className="text-center text-xs text-faint">공개된 문제 {data.total}개</p>
    </div>
  );
}
