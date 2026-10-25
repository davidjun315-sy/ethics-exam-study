import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { QuestionCard } from "@/components/QuestionCard";
import { Empty, PageTitle, SectionTitle } from "@/components/ui";
import { searchAll } from "@/lib/data/queries";
import { examShortLabel } from "@/lib/format";

export const metadata = { title: "통합검색" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const { data, error } = q ? await load(() => searchAll(q)) : { data: null, error: null };

  return (
    <div className="space-y-6">
      <PageTitle title="통합검색" subtitle="사상가, 개념, 원전, 문제 텍스트, 연도, 정답 해설을 한 번에 검색합니다." />
      <form action="/search" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="예: 양지, 왕수인, 정언명령, 2024" className="input max-w-xl text-base" autoFocus />
        <button className="btn-primary">검색</button>
      </form>
      {error ? (
        <DataError error={error} />
      ) : !data ? null : (
        <>
          {data.philosophers.length + data.concepts.length + data.sources.length + data.questions.length === 0 && (
            <Empty>“{data.q}” 검색 결과가 없습니다.</Empty>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {data.concepts.length > 0 && (
              <section className="card p-4">
                <SectionTitle>개념</SectionTitle>
                <ul className="space-y-2">
                  {data.concepts.map((c) => (
                    <li key={c.id}>
                      <Link href={`/concepts/${c.id}`} className="font-semibold text-navy hover:underline">{c.name}</Link>
                      {c.definition && <p className="line-clamp-2 text-sm text-muted">{c.definition}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.philosophers.length > 0 && (
              <section className="card p-4">
                <SectionTitle>사상가</SectionTitle>
                <ul className="space-y-2">
                  {data.philosophers.map((p) => (
                    <li key={p.id}>
                      <Link href={`/philosophers/${p.id}`} className="font-semibold text-navy hover:underline">{p.name}</Link>
                      <span className="ml-2 text-sm text-muted">{[p.school, p.era].filter(Boolean).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.sources.length > 0 && (
              <section className="card p-4">
                <SectionTitle>관련 원전</SectionTitle>
                <ul className="space-y-1">
                  {data.sources.map((s) => (
                    <li key={s.id}>
                      <Link href={`/sources/${s.id}`} className="text-navy hover:underline">『{s.title}』</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.exams.length > 0 && (
              <section className="card p-4">
                <SectionTitle>시험</SectionTitle>
                <ul className="space-y-1">
                  {data.exams.map((e) => (
                    <li key={e.id}>
                      <Link href={`/exams/${e.id}`} className="text-navy hover:underline">{examShortLabel(e)}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {data.questions.length > 0 && (
            <section>
              <SectionTitle>관련 기출 ({data.questions.length})</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.questions.map((x) => (
                  <QuestionCard key={x.id} q={x} hideAnswer />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
