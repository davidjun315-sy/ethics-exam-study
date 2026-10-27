import Link from "next/link";
import type { ReactNode } from "react";
import type { QuestionDetail, QuestionSummary } from "@/lib/data/queries";
import { isLowConfidence, questionRef } from "@/lib/format";
import { Badge, ConfidenceBadge, Empty, RoleBadge, VerificationBadge } from "@/components/ui";

export function Block({ title, children, tone }: { title: string; children: ReactNode; tone?: "warn" }) {
  return (
    <section className={`rounded-lg border p-4 ${tone === "warn" ? "border-warn/40 bg-warn-soft/40" : "border-line bg-surface"}`}>
      <h3 className="mb-2 text-sm font-bold text-navy">{title}</h3>
      <div className="text-[15px] leading-7 text-ink">{children}</div>
    </section>
  );
}

export function List({ items, ordered }: { items?: string[] | null; ordered?: boolean }) {
  if (!items || items.length === 0) return <p className="text-sm text-faint">없음</p>;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </Tag>
  );
}

function Text({ value }: { value?: string | null }) {
  return value ? <p className="prose-study">{value}</p> : <p className="text-sm text-faint">없음</p>;
}

function Confusions({ title, items }: { title: string; items?: { name: string; reason: string }[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-muted">{title}</div>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((c, i) => (
          <li key={i}>
            <b>{c.name}</b> — {c.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ③ 원문 해설: 제시문을 부분별로 나눠 풀이 */
export function PassageTab({ d }: { d: QuestionDetail }) {
  const a = d.analysis;
  if (!a) return <Empty>아직 AI 분석이 없습니다.</Empty>;
  const parts = a.details?.passageCommentary;
  if (!parts?.length) {
    // 이전 형식 분석: 제시문 분석 문단만 보여 준다
    return a.details?.passageAnalysis ? (
      <Block title="제시문 분석">
        <Text value={a.details.passageAnalysis} />
      </Block>
    ) : (
      <Empty>원문 해설이 없습니다. 다시 분석하면 제시문을 부분별로 풀이한 원문 해설이 만들어집니다.</Empty>
    );
  }
  return (
    <div className="space-y-3">
      {parts.map((p, i) => (
        <section key={i} className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-2 flex items-baseline gap-2 text-sm font-bold text-navy">
            <span className="text-faint">{i + 1}</span>
            {p.part}
          </h3>
          {p.quote && <blockquote className="prose-study mb-2 border-l-4 border-navy/40 bg-surface-2 px-3 py-2 font-serif text-[15px]">{p.quote}</blockquote>}
          <p className="prose-study">{p.commentary}</p>
        </section>
      ))}
    </div>
  );
}

export function PhilosophersTab({ d }: { d: QuestionDetail }) {
  if (d.philosophers.length === 0) return <Empty>연결된 사상가가 없습니다.</Empty>;
  return (
    <div className="space-y-3">
      {d.philosophers.map((link) => {
        const p = link.philosophers;
        const r = link.reasoning ?? {};
        return (
          <section key={link.philosopher_id} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/philosophers/${p.id}`} className="text-lg font-bold text-navy hover:underline">
                {p.name}
              </Link>
              {p.original_name && <span className="text-sm text-muted">{p.original_name}</span>}
              <RoleBadge role={link.role} />
              <ConfidenceBadge label="확신도" value={link.confidence} />
              {link.is_manual && <Badge tone="ok">관리자 확인</Badge>}
            </div>
            <div className="mt-1 text-sm text-muted">{[p.tradition, p.school, p.era].filter(Boolean).join(" · ")}</div>
            {r.decisiveExpressions && r.decisiveExpressions.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-muted">결정적 표현</div>
                <ul className="mt-1 space-y-1">
                  {r.decisiveExpressions.map((e, i) => (
                    <li key={i} className="rounded bg-navy-soft/60 px-2 py-1 text-[15px]">
                      “{e}”
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.reasoning && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-muted">판별 근거</div>
                <p className="prose-study mt-1">{r.reasoning}</p>
              </div>
            )}
            {r.similarPhilosophers && r.similarPhilosophers.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-semibold text-muted">유사 사상가와 구별 포인트</div>
                <ul className="mt-1 space-y-2">
                  {r.similarPhilosophers.map((s, i) => (
                    <li key={i} className="rounded border border-line px-3 py-2">
                      <b>{s.name}</b>
                      <p className="mt-0.5 text-[15px]">{s.distinguishingPoint}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
      {d.analysis?.details?.relatedThinkers && d.analysis.details.relatedThinkers.length > 0 && (
        <Block title="관련 사상가">
          <div className="flex flex-wrap gap-2">
            {d.analysis.details.relatedThinkers.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}

export function SourcesTab({ d }: { d: QuestionDetail }) {
  const a = d.analysis;
  return (
    <div className="space-y-3">
      {a && (
        <div className="flex flex-wrap items-center gap-2">
          <ConfidenceBadge label="원전 확신도" value={a.source_confidence} />
          {isLowConfidence(a.source_confidence) && <Badge tone="warn">⚠ 검토 필요 — 원전 추정이 불확실합니다</Badge>}
        </div>
      )}
      {d.sources.length === 0 ? (
        <Empty>원전 분석 결과가 없습니다.</Empty>
      ) : (
        d.sources.map((s) => {
          const low = s.verification_status === "unknown" || s.verification_status === "candidate" || isLowConfidence(s.confidence);
          return (
            <section key={s.id} className={`rounded-lg border p-4 ${low ? "border-warn/40 bg-warn-soft/30" : "border-line bg-surface"}`}>
              <div className="flex flex-wrap items-center gap-2">
                {s.source_id && s.sources ? (
                  <Link href={`/sources/${s.source_id}`} className="text-lg font-bold text-navy hover:underline">
                    『{s.sources.title}』
                  </Link>
                ) : (
                  <span className="text-lg font-bold text-muted">{s.title_raw ? `『${s.title_raw}』` : "원전 미상"}</span>
                )}
                <VerificationBadge status={s.verification_status} />
                <ConfidenceBadge label="확신도" value={s.confidence} />
                {s.is_manual && <Badge tone="ok">관리자 확인</Badge>}
              </div>
              <dl className="mt-3 grid gap-x-3 sm:grid-cols-[6.5rem_1fr] gap-y-1.5 text-[15px]">
                <dt className="text-sm text-muted">사상가</dt>
                <dd>{s.philosopher_name ?? "-"}</dd>
                <dt className="text-sm text-muted">장 / 편 / 권</dt>
                <dd>{s.location ?? <span className="text-faint">확인되지 않음</span>}</dd>
                {s.source_overview && (
                  <>
                    <dt className="text-sm text-muted">원전 해설</dt>
                    <dd className="prose-study">{s.source_overview}</dd>
                  </>
                )}
                <dt className="text-sm text-muted">관련 내용</dt>
                <dd className="prose-study">{s.related_content ?? "-"}</dd>
                <dt className="text-sm text-muted">제시문과의 관계</dt>
                <dd className="prose-study">{s.relation_to_question ?? "-"}</dd>
                {s.quoted_text && (
                  <>
                    <dt className="text-sm text-muted">출제된 문장</dt>
                    <dd className="prose-study">“{s.quoted_text}”</dd>
                  </>
                )}
              </dl>
            </section>
          );
        })
      )}
      {d.passages.length > 0 && (
        <Block title="원전 DB 의 원문 / 번역문">
          <div className="space-y-3">
            {d.passages.map((p) => (
              <div key={p.id} className="rounded border border-line p-3">
                <div className="text-sm font-semibold">
                  『{p.source_title}』 {[p.volume, p.chapter, p.section].filter(Boolean).join(" ")}
                </div>
                {p.original_text && <p className="prose-study mt-1 font-serif">{p.original_text}</p>}
                {p.translation && <p className="prose-study mt-1 text-muted">{p.translation}</p>}
                {p.citation && <p className="mt-1 text-xs text-faint">출처: {p.citation}</p>}
              </div>
            ))}
          </div>
        </Block>
      )}
      <p className="text-xs text-faint">
        확인 수준: confirmed(확인됨) · likely(유력) · candidate(후보) · unknown(미확인). AI 가 제시한 출처는 원전 DB 와 대조되기 전까지 확정이 아닙니다.
      </p>
    </div>
  );
}

/** ① 답안: 모범답안 → 요구 사항별 해설 → 전체 해설 → 오답 분석 */
export function AnswerSection({ d }: { d: QuestionDetail }) {
  const a = d.analysis;
  if (!a) return <Empty>아직 AI 분석이 없습니다.</Empty>;
  const x = a.details ?? {};
  const items = x.itemExplanations ?? [];
  const hasWrong = Boolean(x.confusablePhilosophers?.length || x.confusableConcepts?.length || a.common_mistakes.length);
  return (
    <div className="space-y-3">
      <Block title="모범답안">
        <Text value={x.modelAnswer ?? a.answer} />
      </Block>
      {items.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-navy">해설</h3>
          {items.map((it, i) => (
            <article key={i} className="rounded-lg border border-line bg-surface p-4">
              <header className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-navy px-2 py-0.5 text-xs font-bold text-white dark:text-[#0f141c]">{it.label}</span>
                <span className="font-bold text-ink">{it.answer}</span>
              </header>
              {it.sourcePart && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-muted">근거가 되는 제시문</div>
                  <blockquote className="prose-study mt-1 border-l-4 border-navy/40 bg-surface-2 px-3 py-2 font-serif text-[15px]">{it.sourcePart}</blockquote>
                </div>
              )}
              <p className="prose-study mt-2">{it.explanation}</p>
            </article>
          ))}
          {a.answer_explanation && (
            <Block title="전체 해설">
              <Text value={a.answer_explanation} />
            </Block>
          )}
        </section>
      ) : (
        <Block title="해설">
          {x.answerBasis && <p className="prose-study mb-2">{x.answerBasis}</p>}
          <Text value={a.answer_explanation} />
        </Block>
      )}
      {hasWrong && (
        <Block title="오답 분석" tone="warn">
          <div className="space-y-3">
            <Confusions title="혼동하기 쉬운 사상가" items={x.confusablePhilosophers} />
            <Confusions title="혼동하기 쉬운 개념" items={x.confusableConcepts} />
            {a.common_mistakes.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted">자주 하는 실수</div>
                <List items={a.common_mistakes} />
              </div>
            )}
          </div>
        </Block>
      )}
    </div>
  );
}

export function RelatedTab({ related }: { related: (QuestionSummary & { score: number; reasons: string[] })[] }) {
  if (related.length === 0) return <Empty>사상가·개념·원전이 겹치는 기출이 아직 없습니다.</Empty>;
  return (
    <ul className="space-y-2">
      {related.map((r) => (
        <li key={r.id}>
          <Link href={`/questions/${r.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-4 py-3 hover:border-navy/50">
            <span className="font-bold">{questionRef(r.exam, r.label)}</span>
            <span className="text-sm text-navy">{r.philosophers.filter((p) => p.role === "main").map((p) => p.name).join(" · ")}</span>
            <span className="ml-auto text-xs text-muted">공통: {r.reasons.slice(0, 5).join(", ")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
