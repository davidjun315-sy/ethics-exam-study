import Link from "next/link";
import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { EntityPattern } from "@/components/trends/EntityPattern";
import { QuestionCard } from "@/components/QuestionCard";
import { Badge, Empty, PageTitle, SectionTitle, StatCard, Tag } from "@/components/ui";
import { getConcept } from "@/lib/data/queries";
import { getConceptNotes } from "@/lib/data/study";

export default async function ConceptPage({ params }: PageProps<"/concepts/[id]">) {
  const { id } = await params;
  const { data, error } = await load(async () => {
    const base = await getConcept(id);
    return base ? { ...base, notes: await getConceptNotes(base.concept) } : null;
  });
  if (error) return <DataError error={error} />;
  if (!data) notFound();
  const { concept: c, questions, philosophers, sources, relatedIds, lastYear, notes } = data;
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
          {notes.length > 0 && (
            <section className="card p-4">
              <SectionTitle right={<span className="text-xs text-faint">기출 문항 분석의 개념 정리를 사상가별로 모은 것</span>}>사상가별 정리</SectionTitle>
              <div className="space-y-3">
                {notes.map((n) => {
                  const pid = philosophers.find((p) => p.name === n.philosopher)?.id;
                  return (
                    <div key={n.philosopher} className="rounded-lg border border-line p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {pid ? (
                          <Link href={`/philosophers/${pid}#concepts`} className="font-bold text-navy hover:underline">
                            {n.philosopher}
                          </Link>
                        ) : (
                          <span className="font-bold">{n.philosopher}</span>
                        )}
                        <span className="flex flex-wrap gap-1">
                          {n.questions.map((q) => (
                            <Link key={q.id} href={`/questions/${q.id}`} className="rounded bg-surface-2 px-1.5 text-[11px] text-muted hover:text-navy">
                              {q.ref}
                            </Link>
                          ))}
                        </span>
                      </div>
                      <dl className="grid gap-x-3 gap-y-1.5 text-[15px] sm:grid-cols-[6.5rem_1fr]">
                        {n.definitions.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">정의</dt>
                            <dd className="prose-study">{n.definitions[0]}</dd>
                          </>
                        )}
                        {n.examPoints.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">시험 포인트</dt>
                            <dd>
                              <ul className="list-disc space-y-0.5 pl-5">
                                {n.examPoints.map((x, i) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            </dd>
                          </>
                        )}
                        {n.distinctions.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">구별법</dt>
                            <dd>
                              <ul className="list-disc space-y-0.5 pl-5">
                                {n.distinctions.map((x, i) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            </dd>
                          </>
                        )}
                        {n.confusableWith.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">혼동 개념</dt>
                            <dd>{n.confusableWith.join(", ")}</dd>
                          </>
                        )}
                      </dl>
                      {n.definitions.length > 1 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted">다른 문항의 정의 ({n.definitions.length - 1})</summary>
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                            {n.definitions.slice(1).map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
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
