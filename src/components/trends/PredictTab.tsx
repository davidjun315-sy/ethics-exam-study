import Link from "next/link";
import { DataError, load } from "@/components/DataError";
import { Badge, Empty } from "@/components/ui";
import { isAdmin } from "@/lib/admin-guard";
import { isAIConfigured } from "@/lib/ai/provider";
import { listPractice, type PracticeRow } from "@/lib/data/predictions";
import { listQuestionSummaries } from "@/lib/data/queries";
import { getDataFingerprint, getLatestRun, getPatterns, type PredictionTopicRow } from "@/lib/data/trends";
import { formatDate } from "@/lib/format";
import { buildTopics, FACTOR_HELP, FACTOR_LABEL, type FactorKey } from "@/lib/trends/scoring";
import { LEVEL_LABEL } from "@/lib/types";
import { PracticeAdmin, PredictAdmin } from "./PredictAdmin";

export const DISCLAIMER =
  "출제 예상은 과거 기출의 반복성과 출제 공백, 개념 분포 등을 기반으로 한 학습 우선순위 분석이며 실제 시험 출제를 보장하지 않습니다.";

const FACTOR_ORDER: FactorKey[] = [
  "historical_frequency",
  "recent_frequency",
  "years_since_last_appearance",
  "concept_gap",
  "source_gap",
  "comparison_gap",
  "trend_score",
];

function FactorBars({ factors }: { factors: PredictionTopicRow["factors"] }) {
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {FACTOR_ORDER.filter((k) => factors[k] !== undefined && factors[k] !== null).map((k) => (
        <li key={k} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-xs" title={FACTOR_HELP[k]}>
          <span className="text-muted">{FACTOR_LABEL[k]}</span>
          <span className="h-2 rounded bg-surface-2">
            <span className="block h-2 rounded bg-navy/80" style={{ width: `${factors[k]}%` }} />
          </span>
          <span className="text-right tabular-nums">{factors[k]}</span>
        </li>
      ))}
    </ul>
  );
}

function TopicCard({
  t,
  refs,
  practice,
  admin,
  aiConfigured,
  compact,
}: {
  t: PredictionTopicRow;
  refs: Map<string, string>;
  practice: PracticeRow[];
  admin: boolean;
  aiConfigured: boolean;
  compact?: boolean;
}) {
  const study = t.ai_study_concepts?.length ? t.ai_study_concepts : t.study_concepts;
  return (
    <article className="card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="w-8 text-xl font-bold text-faint tabular-nums">{t.rank}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-ink">{t.ai_title ?? t.title}</h3>
          {t.ai_title && t.ai_title !== t.title && <p className="text-xs text-faint">계산된 주제: {t.title}</p>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge tone="navy">{t.kind === "comparison" ? "비교 조합" : "사상가 · 개념"}</Badge>
            {t.ai_likelihood && <Badge tone={t.ai_likelihood === "high" ? "warn" : "neutral"}>AI 판단 우선순위 {LEVEL_LABEL[t.ai_likelihood as "high"]}</Badge>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-navy tabular-nums">{Math.round(t.score)}</div>
          <div className="text-xs text-faint">추천 점수 / 100</div>
        </div>
      </div>

      {!compact && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-line p-3">
            <h4 className="mb-2 text-xs font-bold text-navy">데이터 근거 (DB 에서 계산한 사실)</h4>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-2 gap-y-1 text-sm">
              {t.facts.map((f, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted">{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
              <dt className="text-muted">근거 기출</dt>
              <dd className="flex flex-wrap gap-1">
                {t.evidence_question_ids.length
                  ? t.evidence_question_ids.map((id) =>
                      refs.has(id) ? (
                        <Link key={id} href={`/questions/${id}`} className="rounded border border-line px-1.5 text-xs hover:border-navy hover:text-navy">
                          {refs.get(id)}
                        </Link>
                      ) : null,
                    )
                  : "-"}
              </dd>
              <dt className="text-muted">출제 방식</dt>
              <dd>{t.expected_format}</dd>
            </dl>
            <h4 className="mb-1 mt-3 text-xs font-bold text-navy">점수 요소</h4>
            <FactorBars factors={t.factors} />
          </section>
          <section className="rounded-lg border border-line bg-surface-2/50 p-3">
            <h4 className="mb-2 text-xs font-bold text-navy">AI 해석</h4>
            {t.ai_interpretation ? (
              <div className="space-y-2 text-sm">
                <p className="prose-study">{t.ai_interpretation}</p>
                {t.ai_expected_format && (
                  <p>
                    <span className="font-semibold text-muted">예상 출제 방식 </span>
                    {t.ai_expected_format}
                  </p>
                )}
                {t.ai_cautions?.length > 0 && <p className="text-xs text-warn">주의: {t.ai_cautions.join(" / ")}</p>}
              </div>
            ) : (
              <p className="text-sm text-faint">아직 AI 해석이 없습니다. 점수와 데이터 근거만으로도 우선순위를 판단할 수 있습니다.</p>
            )}
            <h4 className="mb-1 mt-3 text-xs font-bold text-navy">함께 공부할 것</h4>
            <div className="flex flex-wrap gap-1">
              {study.map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
            </div>
          </section>
        </div>
      )}

      {!compact && practice.length > 0 && (
        <section className="mt-4 space-y-3">
          <h4 className="text-xs font-bold text-navy">예상 연습문제 ({practice.length})</h4>
          {practice.map((p) => (
            <details key={p.id} className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold">{p.question.slice(0, 80)}</summary>
              <div className="mt-2 space-y-2 text-[15px]">
                <p className="prose-study rounded bg-surface-2 p-3">{p.passage}</p>
                {p.passage_note && <p className="text-xs text-faint">{p.passage_note}</p>}
                <p className="font-semibold">{p.question}</p>
                {p.conditions.length > 0 && (
                  <ul className="list-disc pl-5 text-sm">
                    {p.conditions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary className="cursor-pointer text-sm text-navy">모범답안 · 채점 기준 보기</summary>
                  <p className="prose-study mt-1">{p.model_answer}</p>
                  <p className="mt-1 text-sm">
                    <span className="text-muted">필수 키워드 </span>
                    {p.required_keywords.join(", ")}
                  </p>
                  {p.scoring_points.length > 0 && <p className="text-sm text-muted">채점: {p.scoring_points.join(" / ")}</p>}
                  <p className="mt-1 text-sm">
                    <span className="text-muted">출제 근거 </span>
                    {p.rationale}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1 text-xs">
                    관련 기출:
                    {p.related_question_ids.map((id) =>
                      refs.has(id) ? (
                        <Link key={id} href={`/questions/${id}`} className="text-navy underline">
                          {refs.get(id)}
                        </Link>
                      ) : null,
                    )}
                  </p>
                  <p className="text-xs text-faint">AI 가 만든 연습문제입니다 ({p.model ?? p.provider}). 실제 기출이 아닙니다.</p>
                </details>
              </div>
            </details>
          ))}
        </section>
      )}
      {!compact && admin && (
        <div className="mt-3">
          <PracticeAdmin topicId={t.id} aiConfigured={aiConfigured} />
        </div>
      )}
    </article>
  );
}

export async function PredictTab() {
  const { data, error } = await load(async () => {
    const [latest, fingerprint, admin] = await Promise.all([getLatestRun(), getDataFingerprint(), isAdmin()]);
    let preview: PredictionTopicRow[] | null = null;
    if (!latest) {
      // 아직 저장된 실행이 없으면 즉석 계산 결과를 보여준다 (저장하지 않음)
      const { patterns, facts } = await getPatterns();
      preview = buildTopics(patterns, facts, { limit: 30 }).map((t, i) => ({
        id: t.key,
        run_id: "",
        rank: i + 1,
        topic_key: t.key,
        kind: t.kind,
        title: t.title,
        philosopher_ids: t.philosopherIds,
        concept_ids: t.conceptIds,
        source_ids: t.sourceIds,
        score: t.score,
        factors: t.factors,
        facts: t.facts,
        evidence_question_ids: t.evidenceQuestionIds,
        expected_format: t.expectedFormat,
        study_concepts: t.studyConcepts,
        ai_title: null,
        ai_interpretation: null,
        ai_expected_format: null,
        ai_study_concepts: [],
        ai_likelihood: null,
        ai_cautions: [],
      }));
    }
    const topics = latest?.topics ?? preview ?? [];
    const ids = [...new Set(topics.flatMap((t) => t.evidence_question_ids))];
    const practice = latest ? await listPractice(latest.run.id) : [];
    const summaries = await listQuestionSummaries({ ids: [...new Set([...ids, ...practice.flatMap((p) => p.related_question_ids)])] });
    const refs = new Map(summaries.map((s) => [s.id, `${s.exam.exam_year} ${s.exam.section ?? ""} ${s.label}번`.replace(/\s+/g, " ")]));
    return { latest, preview, topics, fingerprint, admin, refs, practice, aiConfigured: isAIConfigured() };
  });
  if (error || !data) return <DataError error={error} />;
  const { latest, topics, fingerprint, admin, refs, practice, aiConfigured } = data;
  const stale = latest ? latest.run.fingerprint !== fingerprint : true;
  const practiceByTopic = new Map<string, PracticeRow[]>();
  practice.forEach((p) => practiceByTopic.set(p.topic_id, [...(practiceByTopic.get(p.topic_id) ?? []), p]));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-warn/40 bg-warn-soft/50 p-4 text-sm">
        <p className="font-semibold text-warn">⚠ {DISCLAIMER}</p>
        <p className="mt-1 text-muted">
          목적은 시험을 맞히는 것이 아니라 <b>무엇을 우선 공부할지</b> 판단하는 것입니다. 추천 점수(0~100)는 출제 확률이 아니라, 아래 점수 요소를 가중 평균한 학습 우선순위입니다.
          개별 문항 화면의 &lsquo;향후 출제&rsquo;(그 문항의 개념이 어떻게 변형될 수 있는가)와는 다른 기능입니다.
        </p>
      </div>

      {latest ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            계산: {formatDate(latest.run.created_at)} · {latest.run.year_from}~{latest.run.year_to}학년도 · 시험 {latest.run.exam_count}개 · 분석 문항 {latest.run.question_count}개 · 점수 규칙 {latest.run.scoring_version}
          </span>
          {latest.run.ai_at && (
            <span>
              · AI 해석 {formatDate(latest.run.ai_at)} ({latest.run.ai_method === "manual" ? latest.run.ai_model : `${latest.run.ai_provider}/${latest.run.ai_model}`}, {latest.run.prompt_version})
            </span>
          )}
          {stale && <Badge tone="warn">전체 분석 업데이트 필요 — 이후 시험·분석이 추가·수정되었습니다</Badge>}
        </div>
      ) : (
        <p className="text-sm text-muted">아직 저장된 전체 분석이 없어 현재 데이터로 즉석 계산한 결과를 보여줍니다.</p>
      )}

      {admin && <PredictAdmin runId={latest?.run.id ?? null} stale={stale} aiConfigured={aiConfigured} />}

      {latest?.run.ai_output?.overview && (
        <section className="card p-4">
          <h3 className="mb-1 text-sm font-bold text-navy">AI 종합 해석</h3>
          <p className="prose-study">{latest.run.ai_output.overview}</p>
          {latest.run.ai_output.caveats?.length ? <p className="mt-2 text-xs text-warn">한계: {latest.run.ai_output.caveats.join(" / ")}</p> : null}
        </section>
      )}

      {topics.length === 0 ? (
        <Empty>분석 완료된 문항이 쌓이면 우선 학습 주제가 계산됩니다.</Empty>
      ) : (
        <>
          <h2 className="text-lg font-bold">다음 시험 대비 우선 학습 주제 TOP 10</h2>
          <div className="space-y-4">
            {topics.slice(0, 10).map((t) => (
              <TopicCard key={t.id} t={t} refs={refs} practice={practiceByTopic.get(t.id) ?? []} admin={admin && Boolean(latest)} aiConfigured={aiConfigured} />
            ))}
          </div>
          {topics.length > 10 && (
            <details className="card p-4">
              <summary className="cursor-pointer font-semibold">11위 이하 ({topics.length - 10}개)</summary>
              <div className="mt-3 space-y-3">
                {topics.slice(10).map((t) => (
                  <TopicCard key={t.id} t={t} refs={refs} practice={practiceByTopic.get(t.id) ?? []} admin={admin && Boolean(latest)} aiConfigured={aiConfigured} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
      <details className="text-sm text-muted">
        <summary className="cursor-pointer">점수는 어떻게 계산되나요?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {FACTOR_ORDER.map((k) => (
            <li key={k}>
              <b>{FACTOR_LABEL[k]}</b>: {FACTOR_HELP[k]}
            </li>
          ))}
          <li>사상가·개념 주제: 역사적 빈도 20%, 최근 빈도 15%, 미출제 기간 20%, 개념 확장 25%, 원전 공백 10%, 최근 추세 10%</li>
          <li>비교 주제: 역사적 빈도 20%, 최근 빈도 10%, 미출제 기간 20%, 비교 조합 공백 35%, 최근 추세 15%</li>
          <li>데이터가 없는 요소는 빼고 나머지 가중치로 다시 나눕니다. AI 해석은 점수에 영향을 주지 않습니다.</li>
        </ul>
      </details>
    </div>
  );
}
