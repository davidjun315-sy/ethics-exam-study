/**
 * 다음 시험 대비 우선 학습 주제 점수 (prediction score, 0~100).
 *
 * 실제 출제 확률이 아니라 "과거 기출의 반복성·출제 공백·개념 분포"로 계산한 학습 우선순위 점수다.
 * 모든 요소는 DB 에서 계산된 사실에서만 나오며, AI 해석은 이 결과에 덧붙일 뿐 점수를 바꾸지 않는다.
 */
import type { PatternResult, PhilosopherPattern, QuestionFacts } from "./patterns";

export const SCORING_VERSION = "2026-10-v1";

export type FactorKey =
  | "historical_frequency"
  | "recent_frequency"
  | "years_since_last_appearance"
  | "concept_gap"
  | "source_gap"
  | "comparison_gap"
  | "trend_score";

export const FACTOR_LABEL: Record<FactorKey, string> = {
  historical_frequency: "역사적 빈도",
  recent_frequency: "최근 빈도",
  years_since_last_appearance: "미출제 기간",
  concept_gap: "개념 확장 가능성",
  source_gap: "원전 공백",
  comparison_gap: "비교 조합 공백",
  trend_score: "최근 추세",
};

export const FACTOR_HELP: Record<FactorKey, string> = {
  historical_frequency: "전체 기간 출제 횟수 (가장 많이 나온 사상가 = 100)",
  recent_frequency: "최근 5개 학년도 출제 횟수 (가장 많은 사상가 = 100)",
  years_since_last_appearance: "마지막 출제 후 지난 기간 ÷ 평소 재출제 간격. 평소 간격만큼 지났으면 높음",
  concept_gap: "사상가는 자주 나왔는데 이 개념은 그 사상가 문항에서 아직(또는 오래) 안 나온 정도",
  source_gap: "이 사상가 원전이 최근 쓰이지 않았거나 원전 DB 의 미출제 부분이 있는 정도",
  comparison_gap: "혼동하기 쉬운 조합인데 아직 비교 출제되지 않았거나 오래된 정도",
  trend_score: "최근 3년 출제 비율이 전체 평균보다 높은 정도 (50 = 평균)",
};

export type TopicKind = "philosopher_concept" | "comparison";

export interface TopicFact {
  label: string;
  value: string;
}

export interface Topic {
  key: string;
  kind: TopicKind;
  title: string;
  philosopherIds: string[];
  conceptIds: string[];
  sourceIds: string[];
  score: number;
  factors: Partial<Record<FactorKey, number>>;
  /** DB 에서 계산된 사실 (AI 해석과 구분해서 표시) */
  facts: TopicFact[];
  evidenceQuestionIds: string[];
  /** 데이터 기반 예상 출제 방식 (기존 출제 방식 분포에서) */
  expectedFormat: string;
  studyConcepts: string[];
}

const WEIGHTS: Record<TopicKind, Partial<Record<FactorKey, number>>> = {
  philosopher_concept: {
    historical_frequency: 0.2,
    recent_frequency: 0.15,
    years_since_last_appearance: 0.2,
    concept_gap: 0.25,
    source_gap: 0.1,
    trend_score: 0.1,
  },
  comparison: {
    historical_frequency: 0.2,
    recent_frequency: 0.1,
    years_since_last_appearance: 0.2,
    comparison_gap: 0.35,
    trend_score: 0.15,
  },
};

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function combine(kind: TopicKind, factors: Partial<Record<FactorKey, number>>): number {
  let sum = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(WEIGHTS[kind]) as [FactorKey, number][]) {
    const v = factors[k];
    if (v === undefined || v === null || Number.isNaN(v)) continue; // 데이터가 없는 요소는 제외하고 가중치를 다시 나눈다
    sum += v * w;
    wsum += w;
  }
  return wsum ? clamp(sum / wsum) : 0;
}

/** 마지막 출제 후 경과 연수를 평소 간격과 비교한 점수 */
function gapScore(yearsSince: number | null, avgInterval: number | null, span: number): number | undefined {
  if (yearsSince === null) return undefined;
  const typical = avgInterval ?? Math.max(2, span / 3);
  return clamp((yearsSince / typical) * 70);
}

function trendScore(p: { recent3: number; total: number }, span: number): number {
  const overallPerYear = p.total / Math.max(1, span);
  const recentPerYear = p.recent3 / 3;
  if (overallPerYear === 0) return 50;
  return clamp(50 + 25 * (recentPerYear / overallPerYear - 1));
}

function topFormats(qs: QuestionFacts[]): string {
  const m = new Map<string, number>();
  qs.forEach((q) => q.formats.forEach((f) => m.set(f, (m.get(f) ?? 0) + 1)));
  const labels: Record<string, string> = {
    identification: "사상가 판별",
    definition: "개념 정의",
    comparison: "비교",
    source: "원전 제시",
    expression: "표현 찾기",
    application: "적용",
    critique: "비판",
    descriptive: "서술",
    memorization: "암기",
  };
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return sorted.length ? `기존 출제 방식: ${sorted.map(([f, n]) => `${labels[f] ?? f} ${n}회`).join(", ")}` : "기존 출제 방식 데이터 없음";
}

export function buildTopics(
  patterns: PatternResult,
  facts: QuestionFacts[],
  options: { maxPhilosophers?: number; limit?: number } = {},
): Topic[] {
  const { window: w } = patterns.global;
  const span = Math.max(1, (w.years.at(-1) ?? w.latest) - (w.years[0] ?? w.latest) + 1);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const phils = patterns.philosophers.slice(0, options.maxPhilosophers ?? 40);
  const maxTotal = Math.max(1, ...phils.map((p) => p.total));
  const maxRecent = Math.max(1, ...phils.map((p) => p.recent5));
  const sourceById = new Map(patterns.sources.map((s) => [s.id, s]));
  const topics: Topic[] = [];

  const sourceGapFor = (p: PhilosopherPattern): number | undefined => {
    const srcs = p.sources.map((s) => sourceById.get(s.key)).filter(Boolean);
    if (srcs.length === 0) return undefined;
    const since = Math.min(...srcs.map((s) => s!.yearsSinceLast ?? 0));
    const unused = srcs.reduce((n, s) => n + s!.unusedPassages.length, 0);
    return clamp((since / Math.max(2, span / 3)) * 60 + Math.min(40, unused * 10));
  };

  // ---- 사상가 - 개념 주제 ----
  for (const p of phils) {
    const qs = p.questionIds.map((id) => byId.get(id)!).filter(Boolean);
    const historical = (p.total / maxTotal) * 100;
    const recent = (p.recent5 / maxRecent) * 100;
    const trend = trendScore(p, span);
    const source = sourceGapFor(p);
    const conceptCandidates: { name: string; id: string | null; examinedQs: QuestionFacts[] }[] = [
      ...p.concepts.map((c) => ({ name: c.label, id: c.key as string | null, examinedQs: qs.filter((q) => q.concepts.some((x) => x.id === c.key)) })),
      ...p.unexaminedConcepts.map((name) => ({ name, id: null, examinedQs: [] as QuestionFacts[] })),
    ];
    for (const c of conceptCandidates) {
      const cYears = [...new Set(c.examinedQs.map((q) => q.year))].sort();
      const cLast = cYears.at(-1) ?? null;
      const cSince = cLast === null ? null : w.latest - cLast;
      // 사상가가 자주 나올수록, 이 개념이 그 사상가 문항에서 덜/오래전에 나왔을수록 높다
      const conceptGap =
        c.examinedQs.length === 0
          ? 55 + 45 * (p.total / maxTotal)
          : clamp(((cSince ?? 0) / Math.max(2, p.avgInterval ?? span / 3)) * 50 + (c.examinedQs.length === 1 ? 15 : 0));
      // 이 사상가 문항에서 이 개념이 마지막으로 나온 뒤 지난 기간. 한 번도 안 나온 개념은 "개념 확장 가능성"에서 반영하므로 제외한다.
      const gap = cLast === null ? undefined : gapScore(cSince, p.avgInterval, span);
      const factors: Topic["factors"] = {
        historical_frequency: clamp(historical),
        recent_frequency: clamp(recent),
        years_since_last_appearance: gap,
        concept_gap: clamp(conceptGap),
        source_gap: source,
        trend_score: trend,
      };
      const evidence = c.examinedQs.length ? c.examinedQs : qs;
      const facts: TopicFact[] = [
        { label: `${p.name} 전체 출제`, value: `${p.total}회 (${p.years.join(", ")})` },
        { label: `${p.name} 최근 5년`, value: `${p.recent5}회` },
        { label: `${p.name} 마지막 출제`, value: p.lastYear ? `${p.lastYear} (${p.yearsSinceLast}년 전)` : "-" },
        { label: "평균 재출제 간격", value: p.avgInterval ? `${p.avgInterval}년` : "1회 출제 (간격 없음)" },
        c.examinedQs.length
          ? { label: `'${c.name}' 출제 (${p.name} 문항 중)`, value: `${c.examinedQs.length}회, 마지막 ${cLast}` }
          : { label: `'${c.name}' 출제 (${p.name} 문항 중)`, value: "아직 없음 (문항 분석의 개념 정리·확장 출제에서 언급된 개념)" },
      ];
      topics.push({
        key: `pc:${p.id}:${c.id ?? c.name}`,
        kind: "philosopher_concept",
        title: `${p.name} - ${c.name}`,
        philosopherIds: [p.id],
        conceptIds: c.id ? [c.id] : [],
        sourceIds: p.sources.slice(0, 2).map((s) => s.key),
        score: combine("philosopher_concept", factors),
        factors,
        facts,
        evidenceQuestionIds: evidence.map((q) => q.id).slice(0, 8),
        expectedFormat: topFormats(evidence),
        studyConcepts: [c.name, ...p.concepts.filter((x) => x.label !== c.name).slice(0, 4).map((x) => x.label)],
      });
    }
  }

  // ---- 비교 조합 주제 ----
  const philByName = new Map(patterns.philosophers.map((p) => [p.name, p]));
  const pairByKey = new Map(patterns.global.comparisonPairs.map((pp) => [[pp.a, pp.b].sort().join("|"), pp]));
  const candidatePairs = new Map<string, { a: PhilosopherPattern; b: PhilosopherPattern; confusedIn: string[] }>();
  for (const f of facts)
    for (const main of f.philosophers.filter((p) => p.role === "main"))
      for (const other of f.confusablePhilosophers) {
        const a = philByName.get(main.name);
        const b = philByName.get(other);
        if (!a || !b || a.id === b.id) continue;
        const key = [a.name, b.name].sort().join("|");
        const cur = candidatePairs.get(key) ?? { a, b, confusedIn: [] };
        cur.confusedIn.push(f.ref);
        candidatePairs.set(key, cur);
      }
  for (const pp of patterns.global.comparisonPairs) {
    const key = [pp.a, pp.b].sort().join("|");
    const a = philByName.get(pp.a);
    const b = philByName.get(pp.b);
    if (a && b && !candidatePairs.has(key)) candidatePairs.set(key, { a, b, confusedIn: [] });
  }
  for (const [key, { a, b, confusedIn }] of candidatePairs) {
    const pair = pairByKey.get(key);
    const hist = ((a.total + b.total) / 2 / maxTotal) * 100;
    const recent = ((a.recent5 + b.recent5) / 2 / maxRecent) * 100;
    const comparisonGap = !pair
      ? clamp(60 + 10 * Math.min(4, confusedIn.length))
      : clamp(((pair.yearsSinceLast ?? 0) / Math.max(2, pair.avgInterval ?? span / 3)) * 50 + (pair.total === 1 ? 10 : 0));
    const factors: Topic["factors"] = {
      historical_frequency: clamp(hist),
      recent_frequency: clamp(recent),
      // 한 번도 함께 나온 적 없는 조합은 "미출제 기간"을 계산할 수 없으므로 제외한다 (비교 조합 공백에서 반영)
      years_since_last_appearance: pair ? gapScore(pair.yearsSinceLast, pair.avgInterval, span) : undefined,
      comparison_gap: comparisonGap,
      trend_score: Math.round((trendScore(a, span) + trendScore(b, span)) / 2),
    };
    const evidenceIds = pair ? pair.questionIds : [...new Set([...a.questionIds.slice(0, 3), ...b.questionIds.slice(0, 3)])];
    topics.push({
      key: `cmp:${[a.id, b.id].sort().join(":")}`,
      kind: "comparison",
      title: `${a.name} vs ${b.name} 비교`,
      philosopherIds: [a.id, b.id],
      conceptIds: [],
      sourceIds: [],
      score: combine("comparison", factors),
      factors,
      facts: [
        { label: "두 사상가 함께 출제", value: pair ? `${pair.total}회 (${pair.years.join(", ")})` : "아직 없음" },
        { label: `${a.name} / ${b.name} 출제`, value: `${a.total}회 / ${b.total}회` },
        ...(confusedIn.length ? [{ label: "혼동 사상가로 분석된 문항", value: [...new Set(confusedIn)].slice(0, 5).join(", ") }] : []),
      ],
      evidenceQuestionIds: evidenceIds.slice(0, 8),
      expectedFormat: topFormats(evidenceIds.map((id) => byId.get(id)!).filter(Boolean)),
      studyConcepts: [...a.concepts.slice(0, 3), ...b.concepts.slice(0, 3)].map((c) => c.label),
    });
  }

  // 점수순 + 한 사상가가 목록을 독점하지 않도록: 사상가-개념 주제는 사상가당 2개, 비교 주제는 사상가당 1개
  const sorted = topics.sort((x, y) => y.score - x.score);
  const perPhil = new Map<string, number>();
  const perPhilCmp = new Map<string, number>();
  const picked: Topic[] = [];
  for (const t of sorted) {
    const used = t.kind === "comparison" ? perPhilCmp : perPhil;
    const cap = t.kind === "comparison" ? 1 : 2;
    if (Math.max(...t.philosopherIds.map((id) => used.get(id) ?? 0)) >= cap) continue;
    t.philosopherIds.forEach((id) => used.set(id, (used.get(id) ?? 0) + 1));
    picked.push(t);
    if (picked.length >= (options.limit ?? 30)) break;
  }
  return picked;
}
