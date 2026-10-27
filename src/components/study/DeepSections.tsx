import Link from "next/link";
import type { QuestionDetail } from "@/lib/data/queries";
import type { MatchedQuestion } from "@/lib/data/related";
import { FORMAT_LABEL, LEVEL_LABEL, type AnalysisDetails } from "@/lib/types";
import { Badge, Empty } from "@/components/ui";
import { Block, List } from "./AnalysisSections";

/**
 * 출제 의도 (왜 이 문제가 나왔나) / 향후 출제 (이 문항에서 확장될 개념과 예상 문제)
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
