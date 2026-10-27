import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { QuestionCard } from "@/components/QuestionCard";
import { Empty, SectionTitle, StatCard } from "@/components/ui";
import { getDashboard } from "@/lib/data/queries";
import { examShortLabel, formatDate } from "@/lib/format";

export default async function Home() {
  const { data, error } = await load(getDashboard);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-line bg-surface px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-ink">윤리 기출</h1>
        <p className="mt-2 text-muted">기출을 사상가, 개념, 원전 단위로 연결해서 공부하세요.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/exams" className="btn-primary">기출문제 보기</Link>
          <Link href="/philosophers" className="btn">사상가별</Link>
          <Link href="/concepts" className="btn">개념별</Link>
          <Link href="/sources" className="btn">원전별</Link>
          <Link href="/philosophers/compare" className="btn">사상가 비교</Link>
          <Link href="/trends" className="btn">출제 경향</Link>
          <Link href="/my" className="btn">내 학습 기록</Link>
        </div>
      </section>

      {error || !data ? (
        <DataError error={error} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="등록된 시험" value={data.examCount} href="/exams" />
            <StatCard label="전체 기출 문항" value={data.questionCount} href="/exams" />
            <StatCard label="등록된 사상가" value={data.philosopherCount} href="/philosophers" />
            <StatCard label="등록된 원전" value={data.sourceCount} href="/sources" />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <SectionTitle right={<Link href="/exams" className="text-sm text-navy">전체 보기</Link>}>최근 분석 문제</SectionTitle>
              {data.recentQuestions.length === 0 ? (
                <Empty>아직 분석된 문항이 없습니다. 관리자 페이지에서 PDF 를 업로드하고 AI 분석을 실행하세요.</Empty>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.recentQuestions.map((q) => (
                    <QuestionCard key={q.id} q={q} hideAnswer />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionTitle>최근 등록된 시험</SectionTitle>
              {data.recentExams.length === 0 ? (
                <Empty>등록된 시험이 없습니다.</Empty>
              ) : (
                <ul className="card divide-y divide-line">
                  {data.recentExams.map((e) => (
                    <li key={e.id}>
                      <Link href={`/exams/${e.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2">
                        <span className="font-medium">{examShortLabel(e)}</span>
                        <span className="text-xs text-faint">{formatDate(e.created_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionTitle right={<Link href="/trends" className="text-sm text-navy">출제분석</Link>}>자주 출제된 사상가</SectionTitle>
              {data.topPhilosophers.length === 0 ? (
                <Empty>데이터가 쌓이면 표시됩니다.</Empty>
              ) : (
                <ul className="card divide-y divide-line">
                  {data.topPhilosophers.map((p, i) => (
                    <li key={p.id}>
                      <Link href={`/philosophers/${p.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2">
                        <span className="w-5 text-right text-sm text-faint">{i + 1}</span>
                        <span className="flex-1 font-medium">{p.name}</span>
                        <span className="text-sm text-muted">{p.count}회 · 최근 {p.lastYear}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <SectionTitle>
                최근 5년 주요 출제 개념
                {data.recentYears.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-faint">
                    ({Math.min(...data.recentYears)}~{Math.max(...data.recentYears)})
                  </span>
                )}
              </SectionTitle>
              {data.recentConcepts.length === 0 ? (
                <Empty>데이터가 쌓이면 표시됩니다.</Empty>
              ) : (
                <div className="card flex flex-wrap gap-2 p-4">
                  {data.recentConcepts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/concepts/${c.id}`}
                      className="rounded-md border border-line px-2.5 py-1 text-sm hover:border-navy hover:text-navy"
                    >
                      {c.name} <span className="text-xs text-faint">{c.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
