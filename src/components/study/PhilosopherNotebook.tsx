import Link from "next/link";
import type { ReactNode } from "react";
import type { Cited, PhilosopherNotebook as Notebook } from "@/lib/study/notebook";
import { FORMAT_LABEL, IMPORTANCE_LABEL, LEVEL_LABEL, ROLE_LABEL, type PhilosopherRole } from "@/lib/types";
import { Badge, Empty } from "@/components/ui";

function Refs({ refs }: { refs: Cited["refs"] }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {refs.map((r) => (
        <Link key={r.id} href={`/questions/${r.id}`} className="rounded bg-surface-2 px-1.5 text-[11px] text-muted hover:text-navy">
          {r.ref}
        </Link>
      ))}
    </span>
  );
}

function CitedList({ items, quote }: { items: Cited[]; quote?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-faint">없음</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((c, i) => (
        <li key={i} className="text-[15px] leading-7">
          {quote ? `“${c.text}”` : c.text}
          <Refs refs={c.refs} />
        </li>
      ))}
    </ul>
  );
}

function Section({ id, step, title, children, note }: { id: string; step?: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section id={id} className="card scroll-mt-20 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        {step && <span className="text-xs font-bold text-faint">{step}</span>}
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        {note && <span className="text-xs text-faint">{note}</span>}
      </div>
      {children}
    </section>
  );
}

export const NOTEBOOK_SECTIONS = [
  { id: "identify", label: "판별 포인트" },
  { id: "concepts", label: "개념 정리" },
  { id: "intent", label: "출제 의도·함정" },
  { id: "questions", label: "문항별 분석" },
  { id: "extensions", label: "확장 출제" },
] as const;

/**
 * 사상가 공부 노트. 이 사상가가 나온 모든 기출 문항의 AI 분석을 모아
 * 판별 → 개념 → 출제 의도·함정 → 문항별 정리 → 확장 출제 순서로 보여준다.
 */
export function PhilosopherNotebook({ name, nb }: { name: string; nb: Notebook }) {
  if (nb.timeline.length === 0) return <Empty>분석 완료된 기출 문항이 쌓이면 공부 노트가 만들어집니다.</Empty>;
  return (
    <div className="space-y-4">
      <nav className="sticky top-14 z-10 -mx-1 flex flex-wrap gap-1 rounded-lg border border-line bg-surface/95 p-1 backdrop-blur">
        {NOTEBOOK_SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            {s.label}
          </a>
        ))}
        <span className="ml-auto self-center px-2 text-xs text-faint">
          분석 문항 {nb.timeline.length}개{nb.deepCount < nb.timeline.length ? ` · 심화 분석 ${nb.deepCount}개` : ""}
        </span>
      </nav>

      <Section id="identify" step="①" title={`${name}을(를) 알아보는 법`} note="기출 제시문에서 이 사상가로 판별하게 한 근거">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-bold text-navy">결정적 표현</h3>
            <CitedList items={nb.expressions} quote />
          </div>
          <div>
            <h3 className="mb-1 text-xs font-bold text-navy">혼동하기 쉬운 사상가와 구별법</h3>
            {nb.distinctions.length === 0 ? (
              <p className="text-sm text-faint">없음</p>
            ) : (
              <div className="space-y-3">
                {nb.distinctions.map((d) => (
                  <div key={d.other} className="rounded border border-line p-3">
                    <div className="mb-1 font-semibold">{name} vs {d.other}</div>
                    <CitedList items={d.points} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {nb.reasonings.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-muted">문항별 판별 근거 ({nb.reasonings.length})</summary>
            <div className="mt-2">
              <CitedList items={nb.reasonings} />
            </div>
          </details>
        )}
      </Section>

      <Section id="concepts" step="②" title={`${name}의 개념 정리`} note="여러 기출의 개념 정리를 개념별로 합친 것">
        {nb.concepts.length === 0 ? (
          <p className="text-sm text-faint">정리된 개념이 없습니다.</p>
        ) : (
          (["required", "supporting", "comparison"] as const).map((level) => {
            const list = nb.concepts.filter((c) => c.importance === level);
            if (!list.length) return null;
            return (
              <div key={level} className="mb-4 last:mb-0">
                <h3 className="mb-2 text-sm font-bold">
                  {level === "required" ? "핵심 개념" : IMPORTANCE_LABEL[level]} <span className="font-normal text-faint">({list.length})</span>
                </h3>
                <div className="space-y-2">
                  {list.map((c) => (
                    <details key={c.name} open={level === "required"} className="rounded-lg border border-line p-3">
                      <summary className="cursor-pointer">
                        <span className="font-bold text-navy">{c.name}</span>
                        <span className="ml-2 text-xs text-muted">
                          {c.askedIn.length ? `출제 ${c.askedIn.length}문항` : "아직 출제 안 됨"}
                          {c.questions.length > c.askedIn.length ? ` · 정리 ${c.questions.length}문항` : ""}
                        </span>
                        {c.id && (
                          <Link href={`/concepts/${c.id}`} className="ml-2 text-xs text-navy underline">
                            개념 페이지
                          </Link>
                        )}
                      </summary>
                      <dl className="mt-2 grid gap-x-3 gap-y-2 text-[15px] sm:grid-cols-[7.5rem_1fr]">
                        <dt className="text-sm text-muted">정의</dt>
                        <dd className="prose-study">
                          {c.definition ?? <span className="text-faint">없음</span>}
                          {c.definitionFrom && <span className="ml-1 text-[11px] text-faint">({c.definitionFrom})</span>}
                        </dd>
                        {c.examPoints.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">시험 포인트</dt>
                            <dd>
                              <CitedList items={c.examPoints} />
                            </dd>
                          </>
                        )}
                        {c.distinctions.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">구별법</dt>
                            <dd>
                              <CitedList items={c.distinctions} />
                            </dd>
                          </>
                        )}
                        {c.confusableWith.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">혼동 개념</dt>
                            <dd>{c.confusableWith.join(", ")}</dd>
                          </>
                        )}
                        {c.connections.length > 0 && (
                          <>
                            <dt className="text-sm text-muted">기출과의 연결</dt>
                            <dd>
                              <CitedList items={c.connections} />
                            </dd>
                          </>
                        )}
                        <dt className="text-sm text-muted">출제된 기출</dt>
                        <dd>{c.askedIn.length ? <Refs refs={c.askedIn} /> : <span className="text-sm text-faint">없음 (다른 문항의 개념 정리에서 언급됨)</span>}</dd>
                        {c.questions.length > c.askedIn.length && (
                          <>
                            <dt className="text-sm text-muted">언급된 기출</dt>
                            <dd>
                              <Refs refs={c.questions.filter((q) => !c.askedIn.some((a) => a.id === q.id))} />
                            </dd>
                          </>
                        )}
                      </dl>
                    </details>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Section>

      <Section id="intent" step="③" title="출제자는 무엇을 물었나" note={`${name}이(가) 주요·비교 사상가인 문항 기준`}>
        {nb.deepCount === 0 ? (
          <p className="text-sm text-faint">출제 의도가 분석된 문항이 없습니다. (관리자: 문항별 &apos;심화 분석&apos;)</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs font-bold text-navy">자주 확인한 능력</h3>
              <CitedList items={nb.skills} />
              {nb.formats.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {nb.formats.map((f) => (
                    <Badge key={f.format} tone="navy">
                      {FORMAT_LABEL[f.format] ?? f.format} {f.count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-warn/40 bg-warn-soft/30 p-3">
              <h3 className="mb-1 text-xs font-bold text-warn">자주 노린 함정 · 오개념</h3>
              <CitedList items={nb.traps} />
            </div>
          </div>
        )}
      </Section>

      <Section id="questions" step="④" title="문항별 분석 요약" note="정답은 눌러야 보입니다">
        <div className="divide-y divide-line">
          {nb.timeline.map((q) => (
            <div key={q.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/questions/${q.id}`} className="font-bold text-navy hover:underline">
                  {q.ref}
                </Link>
                <Badge tone={q.role === "main" ? "navy" : "neutral"}>{ROLE_LABEL[q.role as PhilosopherRole] ?? q.role}</Badge>
                {q.intent?.formats.map((f) => <Badge key={f}>{FORMAT_LABEL[f] ?? f}</Badge>)}
              </div>
              {q.intent?.summary && <p className="prose-study mt-1 text-[15px]">{q.intent.summary}</p>}
              {q.ownConcepts.length > 0 && <p className="mt-1 text-sm text-muted">개념: {q.ownConcepts.map((c) => c.name).join(", ")}</p>}
              <details className="mt-1">
                <summary className="cursor-pointer text-sm text-navy">정답 · 필수 키워드 보기</summary>
                <div className="mt-1 space-y-1 text-[15px]">
                  <p>
                    <span className="font-semibold text-muted">정답 </span>
                    {q.answer ?? "-"}
                  </p>
                  {q.requiredKeywords.length > 0 && (
                    <p className="flex flex-wrap gap-1">
                      {q.requiredKeywords.map((k) => (
                        <Badge key={k} tone="navy">
                          {k}
                        </Badge>
                      ))}
                    </p>
                  )}
                  {q.modelAnswer && <p className="prose-study text-muted">{q.modelAnswer}</p>}
                </div>
              </details>
            </div>
          ))}
        </div>
      </Section>

      <Section id="extensions" step="⑤" title="앞으로 확장될 수 있는 출제" note="각 기출 분석의 '향후 출제'를 모은 것 (AI 판단)">
        {nb.extensions.length === 0 ? (
          <p className="text-sm text-faint">없음</p>
        ) : (
          <ul className="space-y-2">
            {nb.extensions.map((e) => (
              <li key={e.topic} className="rounded border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.topic}</span>
                  <Badge tone="navy">{FORMAT_LABEL[e.format] ?? e.format}</Badge>
                  <Badge>중요도 {LEVEL_LABEL[e.importance as "high"] ?? e.importance}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{e.possibleQuestionType}</p>
                <p className="mt-0.5 text-sm">
                  {e.rationale}
                  <Refs refs={e.from} />
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-faint">
          모든 기출을 종합한 우선순위는{" "}
          <Link href="/trends?tab=predict" className="underline">
            출제분석 → 출제 예측
          </Link>
          에서 볼 수 있습니다.
        </p>
      </Section>
    </div>
  );
}
