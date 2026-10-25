import Link from "next/link";
import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { QuestionCard } from "@/components/QuestionCard";
import { Empty, PageTitle, SectionTitle, StatCard, Tag, VerificationBadge, ConfidenceBadge } from "@/components/ui";
import { getSource } from "@/lib/data/queries";
import { questionRef } from "@/lib/format";

export default async function SourcePage({ params }: PageProps<"/sources/[id]">) {
  const { id } = await params;
  const { data, error } = await load(() => getSource(id));
  if (error) return <DataError error={error} />;
  if (!data) notFound();
  const { source: s, philosopher, links, passages, questions, concepts } = data;
  const qById = new Map(questions.map((q) => [q.id, q]));

  return (
    <div className="space-y-6">
      <PageTitle
        title={`『${s.title}』`}
        subtitle={philosopher ? <Link href={`/philosophers/${philosopher.id}`} className="text-navy hover:underline">{philosopher.name}</Link> : "사상가 미지정"}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="출제 횟수" value={`${questions.length}회`} />
        <StatCard label="원문 DB" value={`${passages.length}건`} />
        <StatCard label="주요 개념" value={concepts.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-4">
            <SectionTitle>핵심 내용</SectionTitle>
            {s.summary ? <p className="prose-study">{s.summary}</p> : <p className="text-sm text-faint">아직 정리되지 않았습니다.</p>}
          </section>
          <section>
            <SectionTitle>출제된 문장</SectionTitle>
            {links.length === 0 ? (
              <Empty>없음</Empty>
            ) : (
              <ul className="space-y-2">
                {links.map((l) => {
                  const q = qById.get(l.question_id);
                  return (
                    <li key={l.id} className="card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {q && (
                          <Link href={`/questions/${q.id}`} className="font-bold text-navy hover:underline">
                            {questionRef(q.exam, q.label)}
                          </Link>
                        )}
                        <VerificationBadge status={l.verification_status} />
                        <ConfidenceBadge label="확신도" value={l.confidence} />
                        {l.location && <span className="text-sm text-muted">{l.location}</span>}
                      </div>
                      {l.quoted_text && <p className="prose-study mt-2">“{l.quoted_text}”</p>}
                      {l.relation_to_question && <p className="mt-1 text-sm text-muted">{l.relation_to_question}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <SectionTitle>원문 / 번역문</SectionTitle>
            {passages.length === 0 ? (
              <Empty>등록된 원문이 없습니다. 관리자 페이지 → 데이터 관리에서 원문과 번역문을 추가할 수 있습니다.</Empty>
            ) : (
              <div className="space-y-2">
                {passages.map((p) => (
                  <div key={p.id} className="card p-4">
                    <div className="text-sm font-semibold">{[p.volume, p.chapter, p.section, p.page && `p.${p.page}`].filter(Boolean).join(" · ") || "위치 미기재"}</div>
                    {p.original_text && <p className="prose-study mt-2 font-serif">{p.original_text}</p>}
                    {p.translation && <p className="prose-study mt-2 text-muted">{p.translation}</p>}
                    {p.citation && <p className="mt-2 text-xs text-faint">출처: {p.citation}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
          <section>
            <SectionTitle>관련 기출</SectionTitle>
            {questions.length === 0 ? <Empty>없음</Empty> : (
              <div className="grid gap-3 md:grid-cols-2">
                {questions.map((q) => <QuestionCard key={q.id} q={q} hideAnswer />)}
              </div>
            )}
          </section>
        </div>
        <aside>
          <section className="card p-4">
            <SectionTitle>주요 개념</SectionTitle>
            {concepts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {concepts.map((c) => <Tag key={c.id} href={`/concepts/${c.id}`}>{c.name}</Tag>)}
              </div>
            ) : <p className="text-sm text-faint">없음</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
