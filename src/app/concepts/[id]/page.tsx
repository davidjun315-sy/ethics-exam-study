import Link from "next/link";
import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { EntityPattern } from "@/components/trends/EntityPattern";
import { QuestionCard } from "@/components/QuestionCard";
import { Badge, Empty, PageTitle, SectionTitle, StatCard, Tag } from "@/components/ui";
import { getConcept } from "@/lib/data/queries";

export default async function ConceptPage({ params }: PageProps<"/concepts/[id]">) {
  const { id } = await params;
  const { data, error } = await load(() => getConcept(id));
  if (error) return <DataError error={error} />;
  if (!data) notFound();
  const { concept: c, questions, philosophers, sources, relatedIds, lastYear } = data;
  const nameLink = (n: string) =>
    relatedIds[n] ? (
      <Tag key={n} href={`/concepts/${relatedIds[n]}`}>{n}</Tag>
    ) : (
      <Badge key={n}>{n}</Badge>
    );

  return (
    <div className="space-y-6">
      <PageTitle title={c.name} subtitle={c.aliases.length ? `다른 표현: ${c.aliases.join(", ")}` : undefined} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="출제 횟수" value={`${questions.length}회`} />
        <StatCard label="최근 출제" value={lastYear ?? "-"} />
        <StatCard label="관련 사상가" value={philosophers.length} />
        <StatCard label="관련 원전" value={sources.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <EntityPattern kind="concept" id={c.id} />
          <section className="card p-4">
            <SectionTitle>정의</SectionTitle>
            {c.definition ? <p className="prose-study">{c.definition}</p> : <p className="text-sm text-faint">아직 정리되지 않았습니다.</p>}
          </section>
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
            <SectionTitle>관련 사상가</SectionTitle>
            {philosophers.length ? (
              <div className="flex flex-wrap gap-1.5">
                {philosophers.map((p) => (
                  <Tag key={p.id} href={`/philosophers/${p.id}`}>{p.name}</Tag>
                ))}
              </div>
            ) : (
              <p className="text-sm text-faint">없음</p>
            )}
          </section>
          <section className="card p-4">
            <SectionTitle>관련 원전</SectionTitle>
            {sources.length ? (
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.id}>
                    <Link href={`/sources/${s.id}`} className="text-navy hover:underline">『{s.title}』</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-faint">없음</p>
            )}
          </section>
          <section className="card p-4">
            <SectionTitle>유사 개념</SectionTitle>
            {c.similar_concepts.length ? <div className="flex flex-wrap gap-1.5">{c.similar_concepts.map(nameLink)}</div> : <p className="text-sm text-faint">없음</p>}
          </section>
          <section className="card p-4">
            <SectionTitle>반대 또는 혼동 개념</SectionTitle>
            {c.confusable_concepts.length ? <div className="flex flex-wrap gap-1.5">{c.confusable_concepts.map(nameLink)}</div> : <p className="text-sm text-faint">없음</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
