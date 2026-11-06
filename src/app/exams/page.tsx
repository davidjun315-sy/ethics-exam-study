import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { ChevronRight } from "lucide-react";
import { Badge, Empty, PageTitle, Segmented } from "@/components/ui";
import { ExamsByPhilosopher } from "@/components/ExamsByPhilosopher";
import { cachedExams as listExams } from "@/lib/data/cached";

export const metadata = { title: "기출문제" };

const VIEWS = [
  { key: "year", label: "연도별" },
  { key: "philosopher", label: "사상가별" },
] as const;

export default async function ExamsPage({ searchParams }: PageProps<"/exams">) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "year";
  const tabs = <Segmented active={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: v.key === "year" ? "/exams" : `/exams?view=${v.key}` }))} />;
  if (view === "philosopher") {
    return (
      <div className="mx-auto max-w-4xl">
        <PageTitle title="기출문제" subtitle="분야별로 사상가를 묶었습니다. 사상가를 펼치면 그 사상가가 나온 기출 문항이 보입니다." />
        {tabs}
        <ExamsByPhilosopher />
      </div>
    );
  }

  const { data, error } = await load(listExams);
  if (error || !data) return <DataError error={error} />;

  const byYear = new Map<number, typeof data>();
  for (const e of data) byYear.set(e.exam_year, [...(byYear.get(e.exam_year) ?? []), e]);
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const total = data.reduce((n, e) => n + (e.question_count ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="기출문제" subtitle={`${years.length}개 학년도 · 시험 ${data.length}개 · ${total}문항. 시험을 누르면 문항 목록이 열립니다.`} />
      {tabs}
      {data.length === 0 ? (
        <Empty>
          등록된 시험이 없습니다. <Link href="/admin/upload" className="text-navy underline">관리자 페이지</Link>에서 PDF 를 업로드하세요.
        </Empty>
      ) : (
        <>
          {/* 빠른 연도 이동 */}
          <nav aria-label="학년도 바로가기" className="sticky top-[calc(3.5rem+var(--safe-top))] z-10 -mx-4 mb-3 flex gap-1.5 overflow-x-auto bg-bg/90 px-4 py-2 backdrop-blur [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
            {years.map((y) => (
              <a key={y} href={`#y-${y}`} className="chip num shrink-0 !min-h-8">{y}</a>
            ))}
          </nav>
          <ul className="card divide-y divide-line overflow-hidden">
            {years.map((year) => {
              const exams = [...byYear.get(year)!].sort((a, b) => (a.section ?? "").localeCompare(b.section ?? ""));
              return (
                <li key={year} id={`y-${year}`} className="scroll-mt-32 flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
                  <div className="w-16 shrink-0 sm:w-24">
                    <div className="num text-lg font-bold leading-tight tracking-tight">{year}</div>
                    <div className="text-[11px] text-faint">학년도</div>
                  </div>
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                    {exams.map((e) => (
                      <Link
                        key={e.id}
                        href={`/exams/${e.id}`}
                        className="group flex min-h-12 items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 transition-colors hover:border-navy/50 hover:bg-navy-soft/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink group-hover:text-navy">{e.section ? `전공 ${e.section}` : e.exam_name}</span>
                          <span className="block truncate text-[11px] text-muted">{e.status === "uploaded" ? "문항 분리 전" : `${e.question_count}문항`}</span>
                        </span>
                        {e.status === "uploaded" ? <Badge tone="warn">준비 중</Badge> : <ChevronRight className="h-4 w-4 shrink-0 text-faint group-hover:text-navy" aria-hidden />}
                      </Link>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
