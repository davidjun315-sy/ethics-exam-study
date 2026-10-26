import Link from "next/link";
import type { QuestionDetail } from "@/lib/data/queries";
import type { MatchedQuestion } from "@/lib/data/related";
import { FORMAT_LABEL, IMPORTANCE_LABEL, LEVEL_LABEL, type AnalysisDetails } from "@/lib/types";
import { Badge, Empty, Tag } from "@/components/ui";
import { Block, List } from "./AnalysisSections";

/**
 * 심화 분석 화면: 왜 이 문제가 나왔는가 → 무엇을 알아야 하는가 → 다음에는 어떻게 변형될 수 있는가
 */

function NotYet({ isAdmin, questionId }: { isAdmin: boolean; questionId: string }) {
  return (
    <Empty>
      이 문항은 이전 버전으로 분석되어 출제 의도·개념 정리·향후 출제 항목이 아직 없습니다.
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
      <p className="text-xs text-muted">① 왜 이 문제가 나왔는가</p>
      <Block title="출제자의 의도">
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
      <Block title="확인하려는 핵심 능력">
        <List items={intent.skillsTested} />
      </Block>
      <Block title="답안에 정확히 써야 하는 개념어">
        {intent.requiredTerms.length ? (
          <div className="flex flex-wrap gap-1.5">
            {intent.requiredTerms.map((t) => (
              <Badge key={t} tone="navy">
                {t}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-faint">없음</p>
        )}
      </Block>
      <Block title="노린 오개념 · 함정" tone="warn">
        <List items={intent.trapPoints} />
      </Block>
      <Block title="판단 근거 (문제 구조 · 제시문)">
        <List items={intent.evidence} />
      </Block>
    </div>
  );
}

export function StudyConceptsTab({ d, isAdmin }: { d: QuestionDetail; isAdmin: boolean }) {
  const concepts = (d.analysis?.details as AnalysisDetails | undefined)?.studyConcepts;
  const conceptId = new Map(d.concepts.map((c) => [c.concepts.name, c.concept_id]));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">② 이 문제를 풀기 위해 알아야 하는 개념 — 이 영역만 읽어도 이 문제의 핵심 이론을 복습할 수 있습니다.</p>
      {!concepts ? (
        <NotYet isAdmin={isAdmin} questionId={d.question.id} />
      ) : (
        (["required", "supporting", "comparison"] as const).map((level) => {
          const list = concepts.filter((c) => c.importance === level);
          if (list.length === 0) return null;
          return (
            <section key={level}>
              <h3 className="mb-2 text-sm font-bold text-ink">
                {IMPORTANCE_LABEL[level]} <span className="font-normal text-faint">({list.length})</span>
              </h3>
              <div className="space-y-2">
                {list.map((c, i) => {
                  const id = conceptId.get(c.name);
                  return (
                    <details key={`${c.name}-${i}`} open={level === "required"} className="rounded-lg border border-line bg-surface p-4">
                      <summary className="cursor-pointer">
                        <span className="font-bold text-navy">{c.name}</span>
                        {c.philosopher && <span className="ml-2 text-sm text-muted">{c.philosopher}</span>}
                        {id && (
                          <Link href={`/concepts/${id}`} className="ml-2 text-xs text-navy underline">
                            관련 기출 보기
                          </Link>
                        )}
                      </summary>
                      <dl className="mt-3 grid gap-x-3 gap-y-2 text-[15px] sm:grid-cols-[8rem_1fr]">
                        <dt className="text-sm text-muted">정의</dt>
                        <dd className="prose-study">{c.definition}</dd>
                        <dt className="text-sm text-muted">시험 포인트</dt>
                        <dd className="prose-study">{c.examPoint}</dd>
                        <dt className="text-sm text-muted">이 문제와의 연결</dt>
                        <dd className="prose-study">{c.connectionToQuestion}</dd>
                        <dt className="text-sm text-muted">자주 혼동하는 개념</dt>
                        <dd>{c.confusableWith.length ? c.confusableWith.join(", ") : "-"}</dd>
                        <dt className="text-sm text-muted">구별법</dt>
                        <dd className="prose-study">{c.distinction || "-"}</dd>
                      </dl>
                    </details>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
      {d.concepts.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-ink">이 문항에 연결된 개념 태그</h3>
          <div className="flex flex-wrap gap-1.5">
            {d.concepts.map((c) => (
              <Tag key={c.concept_id} href={`/concepts/${c.concept_id}`}>
                {c.concepts.name}
              </Tag>
            ))}
          </div>
        </section>
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
      <p className="text-xs text-muted">③ 이 문항의 개념이 앞으로 어떻게 변형·확장 출제될 수 있는가</p>
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
              <h3 className="font-bold text-ink">{e.topic}</h3>
              <Badge tone="navy">{FORMAT_LABEL[e.format] ?? e.format}</Badge>
              <Badge tone={levelTone(e.likelihood)}>가능성 {LEVEL_LABEL[e.likelihood]}</Badge>
              <Badge tone={levelTone(e.importance)}>중요도 {LEVEL_LABEL[e.importance]}</Badge>
            </div>
            <dl className="mt-3 grid gap-x-3 gap-y-2 text-[15px] sm:grid-cols-[8rem_1fr]">
              <dt className="text-sm text-muted">예상 출제 방식</dt>
              <dd className="prose-study">{e.possibleQuestionType}</dd>
              <dt className="text-sm text-muted">예상 근거</dt>
              <dd className="prose-study">{e.rationale}</dd>
              <dt className="text-sm text-muted">관련 개념 · 사상가</dt>
              <dd>{[...e.relatedConcepts, ...e.relatedPhilosophers].join(", ") || "-"}</dd>
              {e.relatedSources.length > 0 && (
                <>
                  <dt className="text-sm text-muted">관련 원전</dt>
                  <dd>{e.relatedSources.map((s) => `『${s}』`).join(", ")}</dd>
                </>
              )}
              <dt className="text-sm text-muted">관련 기존 기출</dt>
              <dd>
                {matches[i]?.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {matches[i].map((m) => (
                      <Link
                        key={m.id}
                        href={`/questions/${m.id}`}
                        title={`겹치는 항목: ${m.matched.join(", ")}`}
                        className="rounded border border-line px-2 py-0.5 text-sm hover:border-navy hover:text-navy"
                      >
                        {m.ref}
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span className="text-sm text-faint">DB 에서 같은 개념·사상가가 나온 다른 기출을 찾지 못했습니다.</span>
                )}
              </dd>
            </dl>
          </section>
        ))
      )}
      <p className="text-xs text-faint">가능성·중요도는 AI 의 판단이며, 관련 기존 기출은 사이트 DB 에서 개념·사상가가 실제로 겹치는 문항입니다.</p>
    </div>
  );
}
