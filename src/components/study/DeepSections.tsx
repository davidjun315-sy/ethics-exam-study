import Link from "next/link";
import type { QuestionDetail } from "@/lib/data/queries";
import type { MatchedQuestion } from "@/lib/data/related";
import { FORMAT_LABEL, LEVEL_LABEL, type AnalysisDetails } from "@/lib/types";
import { Badge, Empty } from "@/components/ui";
import { normalizeText } from "@/lib/study/notebook";
import { questionConceptMap } from "@/lib/study/concept-map";
import { Block, List } from "./AnalysisSections";

const IMPORTANCE_RANK = { required: 0, supporting: 1, comparison: 2 } as const;

/**
 * 출제 의도 (왜 이 문제가 나왔나) / 개념 정리 (구조도 → 개념별 설명) / 향후 출제 (확장될 개념과 예상 문제)
 */

function NotYet({ isAdmin, questionId }: { isAdmin: boolean; questionId: string }) {
  return (
    <Empty>
      이 문항은 이전 버전으로 분석되어 이 항목이 아직 없습니다.
      {isAdmin && (
        <>
          {" "}
          <Link href={`/admin/questions/${questionId}`} className="text-navy underline">
            관리자 화면에서 &apos;심화 분석&apos;을 실행
          </Link>
          하면 추가됩니다.
        </>
      )}
    </Empty>
  );
}

const levelTone = (v: "high" | "medium" | "low") => (v === "high" ? "warn" : v === "medium" ? "navy" : "neutral");

export function IntentTab({ d, isAdmin }: { d: QuestionDetail; isAdmin: boolean }) {
  const intent = (d.analysis?.details as AnalysisDetails | undefined)?.examinerIntent;
  if (!intent) return <NotYet isAdmin={isAdmin} questionId={d.question.id} />;
  return (
    <div className="space-y-3">
      <Block title="이 문제가 나온 이유">
        <p className="prose-study">{intent.summary}</p>
        {intent.formats.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {intent.formats.map((f) => (
              <Badge key={f} tone="navy">
                {FORMAT_LABEL[f] ?? f}
              </Badge>
            ))}
          </div>
        )}
      </Block>
      {intent.itemIntents && intent.itemIntents.length > 0 && (
        <Block title="요구 사항별 출제 의도">
          <ul className="space-y-2">
            {intent.itemIntents.map((it, i) => (
              <li key={i} className="flex gap-2">
                <span className="h-fit shrink-0 rounded bg-navy-soft px-2 py-0.5 text-xs font-bold text-navy">{it.label}</span>
                <span className="prose-study">{it.intent}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
      {intent.skillsTested && intent.skillsTested.length > 0 && (
        <Block title="확인하려는 능력">
          <List items={intent.skillsTested} />
        </Block>
      )}
    </div>
  );
}

export function FutureTab({
  d,
  isAdmin,
  matches,
}: {
  d: QuestionDetail;
  isAdmin: boolean;
  matches: MatchedQuestion[][];
}) {
  const ext = (d.analysis?.details as AnalysisDetails | undefined)?.futureExtensions;
  return (
    <div className="space-y-3">
      <p className="rounded bg-surface-2 px-3 py-2 text-xs text-muted">
        이 문항 하나를 바탕으로 한 확장 가능성입니다. 모든 기출을 종합한 다음 시험 대비 우선순위는{" "}
        <Link href="/trends?tab=predict" className="text-navy underline">
          출제분석 → 출제 예측
        </Link>
        에서 볼 수 있습니다.
      </p>
      {!ext ? (
        <NotYet isAdmin={isAdmin} questionId={d.question.id} />
      ) : ext.length === 0 ? (
        <Empty>확장 출제 항목이 없습니다.</Empty>
      ) : (
        ext.map((e, i) => (
          <section key={i} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-faint">{i + 1}</span>
              <h3 className="font-bold text-ink">
                {e.concept ? (
                  <>
                    {e.philosopher && <span className="text-muted">{e.philosopher} · </span>}
                    <span className="text-navy">{e.concept}</span>
                  </>
                ) : (
                  e.topic
                )}
              </h3>
              <Badge tone="navy">{FORMAT_LABEL[e.format] ?? e.format}</Badge>
              <Badge tone={levelTone(e.importance)}>중요도 {LEVEL_LABEL[e.importance]}</Badge>
            </div>
            {(e.conceptSummary ?? e.rationale) && <p className="prose-study mt-2">{e.conceptSummary ?? e.rationale}</p>}
            {e.expectedQuestion ? (
              <div className="mt-3">
                <div className="text-xs font-semibold text-muted">예상 문제</div>
                <div className="prose-study mt-1 whitespace-pre-wrap rounded border border-line bg-surface-2 p-3 text-[15px]">{e.expectedQuestion}</div>
                {e.expectedAnswer && (
                  <details className="mt-2 rounded border border-navy/30 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-navy">예상 답안 보기</summary>
                    <p className="prose-study mt-2 whitespace-pre-wrap">{e.expectedAnswer}</p>
                  </details>
                )}
              </div>
            ) : (
              e.possibleQuestionType && <p className="mt-2 text-sm text-muted">예상 출제 방식: {e.possibleQuestionType}</p>
            )}
            <dl className="mt-3 grid gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
              {e.relatedSources && e.relatedSources.length > 0 && (
                <>
                  <dt className="text-muted">관련 원전</dt>
                  <dd>{e.relatedSources.map((s) => `『${s}』`).join(", ")}</dd>
                </>
              )}
              <dt className="text-muted">관련 기존 기출</dt>
              <dd>
                {matches[i]?.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {matches[i].map((m) => (
                      <Link
                        key={m.id}
                        href={`/questions/${m.id}`}
                        title={`겹치는 항목: ${m.matched.join(", ")}`}
                        className="rounded border border-line px-2 py-0.5 hover:border-navy hover:text-navy"
                      >
                        {m.ref}
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span className="text-faint">같은 개념·사상가가 나온 다른 기출이 없습니다.</span>
                )}
              </dd>
            </dl>
          </section>
        ))
      )}
      <p className="text-xs text-faint">예상 문제·답안과 중요도는 AI 가 만든 것이며, 관련 기존 기출은 사이트 DB 에서 개념·사상가가 실제로 겹치는 문항입니다.</p>
    </div>
  );
}

const IMPORTANCE_TONE = { required: "navy", supporting: "neutral", comparison: "warn" } as const;
const IMPORTANCE_SHORT = { required: "핵심", supporting: "보조", comparison: "비교" } as const;

/** 개념 정리: 키워드 구조도(사상가별, 이 문항의 핵심 개념 중심) → 개념별 설명 */
export function ConceptsTab({ d, isAdmin }: { d: QuestionDetail; isAdmin: boolean }) {
  const x = (d.analysis?.details ?? {}) as AnalysisDetails;
  const main = d.philosophers.find((p) => p.role === "main")?.philosophers.name ?? null;
  const { maps, derived } = questionConceptMap(x.conceptMap, x.studyConcepts, main);
  const concepts = [...(x.studyConcepts ?? [])].sort((a, b) => IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]);
  if (maps.length === 0 && concepts.length === 0) return <NotYet isAdmin={isAdmin} questionId={d.question.id} />;
  const philosopherId = new Map(d.philosophers.map((p) => [p.philosophers.name, p.philosopher_id]));
  const conceptId = new Map(d.concepts.map((c) => [normalizeText(c.concepts.name), c.concept_id]));
  const anchorOf = (name: string) => `qc-${normalizeText(name)}`;
  const explained = new Set(concepts.map((c) => normalizeText(c.name)));
  const KeywordLink = ({ name, className }: { name: string; className: string }) =>
    explained.has(normalizeText(name)) ? (
      <a href={`#${anchorOf(name)}`} className={`${className} hover:underline`}>{name}</a>
    ) : (
      <span className={className}>{name}</span>
    );

  return (
    <div className="space-y-4">
      {maps.length > 0 && (
        <section className="rounded-lg border border-navy/30 bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h3 className="text-sm font-bold text-navy">키워드 구조도</h3>
            <span className="text-[11px] text-faint">{derived ? "개념 정리에서 자동으로 만든 구조도" : "이 문항의 핵심 개념을 중심으로 · 키워드를 누르면 설명으로 이동"}</span>
          </div>
          <div className="space-y-3">
            {maps.map((m, i) => (
              <div key={i} className="rounded-lg bg-surface-2/70 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {philosopherId.get(m.philosopher) ? (
                    <Link href={`/philosophers/${philosopherId.get(m.philosopher)}`} className="text-xs font-semibold text-muted hover:text-navy">{m.philosopher}</Link>
                  ) : (
                    <span className="text-xs font-semibold text-muted">{m.philosopher}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-baseline gap-2 rounded-md bg-navy px-3 py-2 text-white dark:text-[#0f141c]">
                  <KeywordLink name={m.focus} className="text-base font-bold" />
                  {m.focusGist && <span className="text-sm opacity-80">{m.focusGist}</span>}
                </div>
                {m.branches.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-navy/30 pl-3">
                    {m.branches.map((b, j) => (
                      <li key={j} className="flex flex-wrap items-baseline gap-x-2 text-[14px] leading-6">
                        <span className="w-16 shrink-0 text-right text-xs text-faint">{b.relation} ─</span>
                        <KeywordLink name={b.keyword} className={`font-bold ${b.inQuestion ? "text-navy" : "text-ink"}`} />
                        {b.gist && <span className="text-muted">{b.gist}</span>}
                        {b.inQuestion && <span className="rounded bg-navy-soft px-1 text-[10px] text-navy">기출</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {concepts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-navy">개념별 설명</h3>
          {concepts.map((c, i) => {
            const id = conceptId.get(normalizeText(c.name));
            return (
              <article key={`${c.name}-${i}`} id={anchorOf(c.name)} className="scroll-mt-24 rounded-lg border border-line bg-surface p-4">
                <header className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-navy">{c.name}</span>
                  {c.philosopher && <span className="text-sm text-muted">{c.philosopher}</span>}
                  <Badge tone={IMPORTANCE_TONE[c.importance]}>{IMPORTANCE_SHORT[c.importance]}</Badge>
                  {id && (
                    <Link href={`/concepts/${id}`} className="ml-auto text-xs text-navy hover:underline">
                      이 개념이 나온 기출 →
                    </Link>
                  )}
                </header>
                <p className="prose-study mt-2 font-medium">{c.definition}</p>
                <dl className="mt-2 grid gap-x-3 gap-y-1 text-[14px] leading-6 sm:grid-cols-[6.5rem_1fr]">
                  {c.examPoint && (
                    <>
                      <dt className="text-xs font-semibold text-muted sm:pt-0.5">시험 포인트</dt>
                      <dd>{c.examPoint}</dd>
                    </>
                  )}
                  {c.connectionToQuestion && (
                    <>
                      <dt className="text-xs font-semibold text-muted sm:pt-0.5">이 문제에서</dt>
                      <dd>{c.connectionToQuestion}</dd>
                    </>
                  )}
                  {(c.distinction || c.confusableWith.length > 0) && (
                    <>
                      <dt className="text-xs font-semibold text-warn sm:pt-0.5">구별</dt>
                      <dd>
                        {c.confusableWith.length > 0 && <span className="font-semibold">vs {c.confusableWith.join(", ")}</span>}
                        {c.confusableWith.length > 0 && c.distinction && " — "}
                        {c.distinction}
                      </dd>
                    </>
                  )}
                </dl>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
