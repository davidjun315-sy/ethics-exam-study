import Link from "next/link";
import { ChevronLeft, GitCompare } from "lucide-react";
import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { EntityPattern } from "@/components/trends/EntityPattern";
import { QuestionCard } from "@/components/QuestionCard";
import { Badge, Empty, SectionTitle, Tag } from "@/components/ui";
import { PhilosopherNotebook } from "@/components/study/PhilosopherNotebook";
import { PhilosopherStudyNote } from "@/components/study/PhilosopherStudyNote";
import { isAdmin } from "@/lib/admin-guard";
import { cachedPhilosopher as getPhilosopher, cachedPhilosopherNote as getPhilosopherNote, cachedPhilosopherNotebook as getPhilosopherNotebook } from "@/lib/data/cached";
import { formatDate } from "@/lib/format";
import { noteFreshness } from "@/lib/study/notes";

const TABS = [
  { key: "note", label: "개념 정리" },
  { key: "notebook", label: "기출 분석 모아보기" },
  { key: "pattern", label: "출제 패턴" },
  { key: "questions", label: "관련 기출" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function PhilosopherPage({ params, searchParams }: PageProps<"/philosophers/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { data, error } = await load(async () => {
    const base = await getPhilosopher(id);
    if (!base) return null;
    const [notebook, note, admin] = await Promise.all([getPhilosopherNotebook(base.philosopher), getPhilosopherNote(id), isAdmin()]);
    return { ...base, notebook, note, admin };
  });
  if (error) return <DataError error={error} />;
  if (!data) notFound();
  const { philosopher: p, questions, concepts: taggedConcepts, sources, coPhilosophers, lastYear, notebook, note, admin } = data;
  // 개념 정리 노트가 있으면 그것이 메인, 없으면 기출 분석 모아보기부터 보여준다
  const tab: TabKey = TABS.find((t) => t.key === sp.tab)?.key ?? (note ? "note" : "notebook");
  const fresh = note ? noteFreshness(note.based_on_question_ids, notebook.timeline.map((q) => q.id)) : null;
  // 사이드바 개념: 공부 노트의 "이 사상가의 개념" (비교 상대의 개념은 제외). 노트가 비어 있으면 기존 태그 집계
  const concepts = notebook.concepts.length
    ? notebook.concepts.map((c) => ({ id: c.id, name: c.name, count: c.askedIn.length }))
    : taggedConcepts;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-line p-5 sm:p-6" style={{ background: "var(--hero)" }}>
        <Link href="/philosophers" className="relative mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-navy">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          사상가 탐구
        </Link>
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface text-2xl font-bold text-navy shadow-card" aria-hidden>
            {p.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {p.name} {p.original_name && <span className="text-base font-normal text-muted sm:text-lg">{p.original_name}</span>}
            </h1>
            {[p.tradition, p.school, p.era].some(Boolean) && <p className="mt-0.5 text-sm text-muted">{[p.tradition, p.school, p.era].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {admin && <Link href={`/admin/philosophers/${p.id}`} className="btn">페이지 편집</Link>}
            <Link href={`/philosophers/compare?a=${p.id}`} className="btn"><GitCompare className="h-4 w-4" aria-hidden />다른 사상가와 비교</Link>
          </div>
        </div>
        <dl className="relative mt-5 grid grid-cols-4 gap-2 border-t border-line/70 pt-4 text-center sm:max-w-xl sm:text-left">
          {[
            { label: "출제", value: `${questions.length}회` },
            { label: "최근 출제", value: lastYear ?? "-" },
            { label: "주요 개념", value: concepts.length },
            { label: "주요 원전", value: sources.length },
          ].map((x) => (
            <div key={x.label}>
              <dt className="text-[11px] text-muted">{x.label}</dt>
              <dd className="num text-lg font-bold">{x.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {p.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-sm">
          <span className="text-muted">다른 이름</span>
          {p.aliases.map((a) => (
            <Badge key={a}>{a}</Badge>
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0" aria-label="사상가 보기">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/philosophers/${p.id}?tab=${t.key}`}
                scroll={false}
                aria-current={tab === t.key ? "page" : undefined}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${tab === t.key ? "border-navy font-semibold text-navy" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t.label}
                {t.key === "questions" && <span className="ml-1 text-xs opacity-70">{questions.length}</span>}
                {t.key === "notebook" && notebook.timeline.length > 0 && <span className="ml-1 text-xs opacity-70">{notebook.timeline.length}</span>}
              </Link>
            ))}
          </nav>

          {tab === "note" &&
            (note ? (
              <div className="space-y-3">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                  <span>
                    기출 {note.based_on_question_ids.length}문항의 AI 분석을 {note.source ?? "AI"}(으)로 정리 · {formatDate(note.updated_at)}
                    {note.edited && " · 관리자 수정됨"}
                  </span>
                  {fresh && fresh.added.length > 0 && <Badge tone="warn">이후 {fresh.added.length}문항이 더 분석됨</Badge>}
                  <Link href={`/philosophers/${p.id}?tab=notebook`} className="underline">원본 분석 보기</Link>
                </p>
                <PhilosopherStudyNote name={p.name} note={note.content} refMap={note.ref_map} />
              </div>
            ) : (
              <div className="space-y-4">
                <CoreIdeas text={p.core_ideas ?? p.description} />
                <Empty>
                  아직 개념 정리 노트가 없습니다. {admin ? (
                    <Link href={`/admin/philosophers/${p.id}`} className="text-navy underline">관리자 편집에서 만들기</Link>
                  ) : (
                    <Link href={`/philosophers/${p.id}?tab=notebook`} className="text-navy underline">기출 분석 모아보기</Link>
                  )}
                </Empty>
              </div>
            ))}

          {tab === "notebook" && (
            <div className="space-y-4">
              {!note && <CoreIdeas text={p.core_ideas ?? p.description} />}
              <p className="text-xs text-faint">이 사상가가 나온 기출 문항의 AI 분석을 자동으로 모은 것입니다.</p>
              <PhilosopherNotebook name={p.name} nb={notebook} />
            </div>
          )}

          {tab === "pattern" && <EntityPattern kind="philosopher" id={p.id} />}

          {tab === "questions" &&
            (questions.length === 0 ? (
              <Empty>관련 기출이 없습니다.</Empty>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {questions.map((q) => (
                  <QuestionCard key={q.id} q={q} hideAnswer />
                ))}
              </div>
            ))}
        </div>
        <aside className="space-y-6">
          <section className="card p-4">
            <SectionTitle>주요 개념</SectionTitle>
            {concepts.length ? (
              <div className="flex flex-wrap gap-1.5">
                {concepts.map((c) =>
                  c.id ? (
                    <Tag key={c.id} href={`/concepts/${c.id}`}>
                      {c.name} {c.count > 0 && <span className="ml-1 text-xs text-faint">{c.count}</span>}
                    </Tag>
                  ) : (
                    <Badge key={c.name}>{c.name}</Badge>
                  ),
                )}
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

function CoreIdeas({ text }: { text: string | null }) {
  return (
    <section className="card p-4">
      <SectionTitle>핵심 사상</SectionTitle>
      {text ? <p className="prose-study">{text}</p> : <p className="text-sm text-faint">아직 정리되지 않았습니다.</p>}
    </section>
  );
}
