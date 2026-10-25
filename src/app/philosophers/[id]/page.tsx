import Link from "next/link";
import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { QuestionCard } from "@/components/QuestionCard";
import { Badge, Empty, PageTitle, SectionTitle, StatCard, Tag } from "@/components/ui";
import { getPhilosopher } from "@/lib/data/queries";

export default async function PhilosopherPage({ params }: PageProps<"/philosophers/[id]">) {
  const { id } = await params;
  const { data, error } = await load(() => getPhilosopher(id));
  if (error) return <DataError error={error} />;
  if (!data) notFound();
  const { philosopher: p, questions, concepts, sources, coPhilosophers, decisiveExpressions, lastYear } = data;

  return (
    <div className="space-y-6">
      <PageTitle
        title={
          <>
            {p.name} {p.original_name && <span className="text-lg font-normal text-muted">{p.original_name}</span>}
          </>
        }
        subtitle={[p.tradition, p.school, p.era].filter(Boolean).join(" · ") || undefined}
        actions={<Link href={`/philosophers/compare?a=${p.id}`} className="btn">다른 사상가와 비교</Link>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="출제 횟수" value={`${questions.length}회`} />
        <StatCard label="최근 출제 연도" value={lastYear ?? "-"} />
        <StatCard label="주요 개념" value={concepts.length} />
        <StatCard label="주요 원전" value={sources.length} />
      </div>
      {p.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-sm">
          <span className="text-muted">다른 이름</span>
          {p.aliases.map((a) => (
            <Badge key={a}>{a}</Badge>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-4">
            <SectionTitle>핵심 사상</SectionTitle>
            {p.core_ideas || p.description ? (
              <p className="prose-study">{p.core_ideas ?? p.description}</p>
            ) : (
              <p className="text-sm text-faint">아직 정리되지 않았습니다. 관리자 페이지 → 데이터 관리에서 입력할 수 있습니다.</p>
            )}
          </section>
          {decisiveExpressions.length > 0 && (
            <section className="card p-4">
              <SectionTitle>기출에서 이 사상가를 판별하게 한 결정적 표현</SectionTitle>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {decisiveExpressions.map((e) => (
                  <li key={e} className="rounded bg-navy-soft/60 px-2 py-1 text-[15px]">“{e}”</li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <SectionTitle>관련 기출 ({questions.length})</SectionTitle>
            {questions.length === 0 ? (
              <Empty>관련 기출이 없습니다.</Empty>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {questions.map((q) => (
                  <QuestionCard key={q.id} q={q} hideAnswer />
                ))}
              </div>
            )}
          </section>
        </div>
        <aside className="space-y-6">
          <section className="card p-4">
            <SectionTitle>주요 개념</SectionTitle>
            {concepts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {concepts.map((c) => (
                  <Tag key={c.id} href={`/concepts/${c.id}`}>
                    {c.name} {c.count > 0 && <span className="ml-1 text-xs text-faint">{c.count}</span>}
                  </Tag>
                ))}
              </div>
            ) : (
              <p className="text-sm text-faint">없음</p>
            )}
          </section>
          <section className="card p-4">
            <SectionTitle>주요 원전</SectionTitle>
            {sources.length ? (
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sources/${s.id}`} className="text-navy hover:underline">『{s.title}』</Link>
                    {s.count > 0 && <span className="ml-1 text-xs text-faint">{s.count}회</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">없음</p>
            )}
          </section>
          <section className="card p-4">
            <SectionTitle>함께 비교되는 사상가</SectionTitle>
            {coPhilosophers.length ? (
              <ul className="space-y-1.5">
                {coPhilosophers.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/philosophers/${c.id}`} className="hover:text-navy">{c.name} <span className="text-xs text-faint">{c.count}문항</span></Link>
                    <Link href={`/philosophers/compare?a=${p.id}&b=${c.id}`} className="text-xs text-navy">비교 →</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">없음</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
