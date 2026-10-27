import Link from "next/link";
import type { ReactNode } from "react";
import type { PhilosopherStudyNote as Note } from "@/lib/ai/schemas";
import { Badge } from "@/components/ui";

function Refs({ refs, refMap }: { refs: string[]; refMap: Record<string, string> }) {
  if (!refs.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {refs.map((r) =>
        refMap[r] ? (
          <Link key={r} href={`/questions/${refMap[r]}`} className="rounded bg-surface-2 px-1.5 text-[11px] text-muted hover:text-navy">
            {r}
          </Link>
        ) : (
          <span key={r} className="rounded bg-surface-2 px-1.5 text-[11px] text-faint">{r}</span>
        ),
      )}
    </span>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-[15px] leading-7 marker:text-faint">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Block({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section id={id} className="card scroll-mt-20 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {note && <span className="text-xs text-faint">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** 사상가 개념 정리 노트 (채팅 AI 로 기출 분석을 재구성해 관리자가 붙여넣은 것) */
export function PhilosopherStudyNote({ name, note, refMap }: { name: string; note: Note; refMap: Record<string, string> }) {
  const nav = [
    { id: "note-overview", label: "큰 그림" },
    ...note.sections.map((s, i) => ({ id: `note-s${i + 1}`, label: s.title })),
    note.identification.decisiveExpressions.length + note.identification.tips.length > 0 && { id: "note-identify", label: "판별법" },
    note.comparisons.length > 0 && { id: "note-compare", label: "비교" },
    note.traps.length > 0 && { id: "note-traps", label: "함정" },
    note.answerTips.length + note.futureTopics.length > 0 && { id: "note-exam", label: "답안·확장" },
  ].filter(Boolean) as { id: string; label: string }[];

  return (
    <div className="space-y-4">
      <nav className="sticky top-14 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface/95 p-1 backdrop-blur">
        {nav.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            {s.label}
          </a>
        ))}
      </nav>

      <section id="note-overview" className="card scroll-mt-20 border-navy/30 p-4">
        <p className="text-lg font-bold leading-8 text-navy">{note.overview.oneLine}</p>
        {note.overview.summary && <p className="prose-study mt-2">{note.overview.summary}</p>}
        {note.overview.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {note.overview.keywords.map((k) => (
              <Badge key={k} tone="navy">{k}</Badge>
            ))}
          </div>
        )}
        {note.studyOrder.length > 0 && (
          <div className="mt-4 rounded-lg bg-surface-2 p-3">
            <h3 className="mb-1 text-xs font-bold text-navy">추천 공부 순서</h3>
            <ol className="list-decimal space-y-0.5 pl-5 text-[15px] leading-7 marker:font-semibold marker:text-navy">
              {note.studyOrder.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {note.sections.map((s, si) => (
        <section key={si} id={`note-s${si + 1}`} className="card scroll-mt-20 p-4">
          <h2 className="text-base font-bold text-ink">{s.title}</h2>
          {s.intro && <p className="mt-1 text-[15px] leading-7 text-muted">{s.intro}</p>}
          <div className="mt-3 space-y-3">
            {s.concepts.map((c, ci) => (
              <article key={ci} className="rounded-lg border border-line p-3">
                <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-bold text-faint">{si + 1}-{ci + 1}</span>
                  <h3 className="font-bold text-navy">{c.name}</h3>
                  {c.originalTerm && <span className="text-sm text-muted">{c.originalTerm}</span>}
                  {c.relatedQuestionRefs.length > 0 ? (
                    <span className="text-xs text-muted">
                      기출
                      <Refs refs={c.relatedQuestionRefs} refMap={refMap} />
                    </span>
                  ) : (
                    <span className="text-xs text-faint">연결 개념</span>
                  )}
                </header>
                {c.definition && <p className="mt-2 rounded bg-navy-soft/50 px-3 py-2 text-[15px] font-medium leading-7">{c.definition}</p>}
                {c.explanation && <p className="prose-study mt-2">{c.explanation}</p>}
                {c.keyPoints.length > 0 && (
                  <div className="mt-2">
                    <h4 className="mb-0.5 text-xs font-bold text-navy">요점</h4>
                    <Bullets items={c.keyPoints} />
                  </div>
                )}
                {c.examPoints.length > 0 && (
                  <div className="mt-2">
                    <h4 className="mb-0.5 text-xs font-bold text-navy">기출에서는</h4>
                    <Bullets items={c.examPoints} />
                  </div>
                )}
                {c.confusions.length > 0 && (
                  <div className="mt-2">
                    <h4 className="mb-0.5 text-xs font-bold text-warn">헷갈리기 쉬운 것</h4>
                    <ul className="space-y-1 text-[15px] leading-7">
                      {c.confusions.map((x, i) => (
                        <li key={i}>
                          <span className="font-semibold">vs {x.with}</span> — {x.distinction}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {nav.some((n) => n.id === "note-identify") && (
        <Block id="note-identify" title={`${name}을(를) 알아보는 법`}>
          <div className="grid gap-4 lg:grid-cols-2">
            {note.identification.decisiveExpressions.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold text-navy">결정적 표현</h3>
                <Bullets items={note.identification.decisiveExpressions.map((e) => `“${e}”`)} />
              </div>
            )}
            {note.identification.tips.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold text-navy">판별 요령</h3>
                <Bullets items={note.identification.tips} />
              </div>
            )}
          </div>
        </Block>
      )}

      {note.comparisons.length > 0 && (
        <Block id="note-compare" title="비교 정리">
          <div className="space-y-4">
            {note.comparisons.map((c, i) => (
              <div key={i}>
                <div className="mb-1 flex flex-wrap items-baseline gap-1">
                  <h3 className="font-semibold">{name} vs {c.other}</h3>
                  <Refs refs={c.relatedQuestionRefs} refMap={refMap} />
                </div>
                {c.common && <p className="mb-1 text-sm text-muted">공통점: {c.common}</p>}
                {c.differences.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] border-collapse text-[14px]">
                      <thead>
                        <tr className="bg-surface-2 text-left">
                          <th className="w-28 border border-line px-2 py-1 font-medium text-muted">쟁점</th>
                          <th className="border border-line px-2 py-1 font-semibold text-navy">{name}</th>
                          <th className="border border-line px-2 py-1 font-semibold">{c.other}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.differences.map((d, j) => (
                          <tr key={j} className="align-top">
                            <td className="border border-line px-2 py-1 text-muted">{d.aspect}</td>
                            <td className="border border-line px-2 py-1">{d.mine}</td>
                            <td className="border border-line px-2 py-1">{d.theirs}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Block>
      )}

      {note.traps.length > 0 && (
        <Block id="note-traps" title="출제자가 노린 함정">
          <ul className="space-y-2">
            {note.traps.map((t, i) => (
              <li key={i} className="rounded-lg border border-warn/40 bg-warn-soft/30 p-3 text-[15px] leading-7">
                <p>
                  <span className="font-bold text-warn">✕ </span>
                  {t.trap}
                  <Refs refs={t.relatedQuestionRefs} refMap={refMap} />
                </p>
                <p>
                  <span className="font-bold text-ok">○ </span>
                  {t.correction}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {note.answerTips.length + note.futureTopics.length > 0 && (
        <Block id="note-exam" title="답안 작성 · 확장 출제">
          <div className="grid gap-4 lg:grid-cols-2">
            {note.answerTips.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold text-navy">서술형 답안 요령</h3>
                <Bullets items={note.answerTips} />
              </div>
            )}
            {note.futureTopics.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold text-navy">확장될 수 있는 주제 <span className="font-normal text-faint">(AI 판단)</span></h3>
                <ul className="space-y-1.5 text-[15px] leading-7">
                  {note.futureTopics.map((f, i) => (
                    <li key={i}>
                      <span className="font-semibold">{f.topic}</span> <span className="text-muted">— {f.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Block>
      )}

      {note.caveats.length > 0 && (
        <section className="rounded-lg border border-line p-3 text-sm text-muted">
          <h3 className="mb-1 font-bold">확인이 필요한 부분</h3>
          <Bullets items={note.caveats} />
        </section>
      )}
    </div>
  );
}
