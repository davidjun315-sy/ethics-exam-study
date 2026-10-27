import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Badge, Empty, PageTitle } from "@/components/ui";
import { ExamsByPhilosopher } from "@/components/ExamsByPhilosopher";
import { listExams } from "@/lib/data/queries";

export const metadata = { title: "기출문제" };

const VIEWS = [
  { key: "year", label: "연도별" },
  { key: "philosopher", label: "사상가별" },
] as const;

export default async function ExamsPage({ searchParams }: PageProps<"/exams">) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "year";
  const tabs = (
    <nav className="mb-4 flex gap-1 rounded-lg border border-line bg-surface p-1">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.key === "year" ? "/exams" : `/exams?view=${v.key}`}
          className={`rounded-md px-4 py-2 text-sm ${view === v.key ? "bg-navy font-semibold text-white dark:text-[#0f141c]" : "text-muted hover:bg-surface-2"}`}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
  if (view === "philosopher") {
    return (
      <div>
        <PageTitle title="기출문제" subtitle="분야(동양윤리·서양윤리 …)별로 사상가를 묶고, 사상가를 펼치면 그 사상가가 나온 기출 문항을 볼 수 있습니다." />
        {tabs}
        <ExamsByPhilosopher />
      </div>
    );
  }

  const { data, error } = await load(listExams);
  if (error || !data) return <DataError error={error} />;

  const byYear = new Map<number, typeof data>();
  for (const e of data) byYear.set(e.exam_year, [...(byYear.get(e.exam_year) ?? []), e]);

  return (
    <div>
      <PageTitle title="기출문제" subtitle="학년도별 시험을 선택하면 문항 목록을 볼 수 있습니다." />
      {tabs}
      {data.length === 0 ? (
        <Empty>
          등록된 시험이 없습니다. <Link href="/admin/upload" className="text-navy underline">관리자 페이지</Link>에서 PDF 를 업로드하세요.
        </Empty>
      ) : (
        <div className="space-y-4">
          {[...byYear.entries()].map(([year, exams]) => (
            <section key={year} className="card p-4">
              <h2 className="mb-3 text-lg font-bold">{year}학년도</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {exams.map((e) => (
                  <Link
                    key={e.id}
                    href={`/exams/${e.id}`}
                    className="rounded-md border border-line px-4 py-3 hover:border-navy hover:bg-navy-soft/40"
                  >
                    <div className="font-semibold text-navy">{e.section ? `전공 ${e.section}` : e.exam_name}</div>
                    <div className="mt-1 text-xs text-muted">
                      {e.subject} · {e.question_count}문항
                    </div>
                    <div className="mt-2">
                      {e.status === "uploaded" ? <Badge tone="warn">문항 분리 전</Badge> : <Badge>{e.question_count}문항</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
