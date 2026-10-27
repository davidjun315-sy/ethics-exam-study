/**
 * 사상가별 공부 노트: 여러 기출 문항의 AI 분석을 사상가 단위로 모아 정리한다. (순수 계산)
 *
 * - 판별 포인트: 결정적 표현, 혼동 사상가와의 구별 포인트, 판별 근거
 * - 이 사상가의 개념: 문항마다 흩어진 "개념 정리"를 개념 이름으로 합침
 * - 문항별 분석 요약, 자주 노린 함정, 확장 출제 방향
 */
import type { QuestionFormat, StoredExaminerIntent, StoredFutureExtension, StudyConcept } from "../ai/schemas";

export interface NotebookQuestion {
  id: string;
  ref: string;
  year: number;
  role: string; // 이 사상가의 역할 (main / comparison / distractor / mentioned)
  answer: string | null;
  modelAnswer: string | null;
  requiredKeywords: string[];
  intent: StoredExaminerIntent | null;
  studyConcepts: StudyConcept[];
  extensions: StoredFutureExtension[];
  reasoning: {
    decisiveExpressions?: string[];
    similarPhilosophers?: { name: string; distinguishingPoint: string }[];
    reasoning?: string;
  };
  /** 문항에 연결된 개념 중 이 사상가의 개념 (question_concepts.philosopher_id 가 이 사상가이거나, 지정이 없고 이 사상가가 main) */
  ownConcepts: { id: string; name: string }[];
}

export interface Cited {
  text: string;
  refs: { id: string; ref: string }[];
}

export interface NotebookConcept {
  name: string;
  id: string | null;
  importance: "required" | "supporting" | "comparison";
  definition: string | null;
  definitionFrom: "개념 DB" | "문항 분석" | null;
  examPoints: Cited[];
  connections: Cited[];
  confusableWith: string[];
  distinctions: Cited[];
  /** 이 개념이 언급된 모든 문항 (개념 정리 + 개념 태그) */
  questions: { id: string; ref: string }[];
  /** 실제로 이 개념이 출제된 문항 (문항에 개념 태그로 연결됨) */
  askedIn: { id: string; ref: string }[];
}

export interface PhilosopherNotebook {
  expressions: Cited[];
  distinctions: { other: string; points: Cited[] }[];
  reasonings: Cited[];
  concepts: NotebookConcept[];
  traps: Cited[];
  skills: Cited[];
  formats: { format: QuestionFormat; count: number }[];
  extensions: { topic: string; format: QuestionFormat; possibleQuestionType: string; rationale: string; importance: string; from: { id: string; ref: string }[] }[];
  timeline: NotebookQuestion[];
  deepCount: number; // 심화 분석(출제 의도 등)이 있는 문항 수
}

const norm = (s: string) => s.replace(/[\s"'“”‘’「」『』.,·()[\]~-]/g, "").toLowerCase();
const IMPORTANCE_RANK = { required: 0, supporting: 1, comparison: 2 } as const;

/** 같은 뜻의 문장을 하나로 합치고 출처 문항을 모은다 */
function citer() {
  const m = new Map<string, Cited>();
  return {
    add(text: string | null | undefined, q: { id: string; ref: string }) {
      const t = text?.trim();
      if (!t) return;
      const k = norm(t);
      if (!k) return;
      const cur = m.get(k) ?? { text: t, refs: [] };
      if (!cur.refs.some((r) => r.id === q.id)) cur.refs.push({ id: q.id, ref: q.ref });
      m.set(k, cur);
    },
    list(): Cited[] {
      return [...m.values()].sort((a, b) => b.refs.length - a.refs.length);
    },
  };
}

export function matchesPhilosopher(value: string | null | undefined, name: string, aliases: string[]): boolean {
  if (!value) return false;
  const v = norm(value);
  return [name, ...aliases].some((n) => {
    const k = norm(n);
    return k.length > 0 && (v === k || v.includes(k));
  });
}

export function buildPhilosopherNotebook(
  philosopher: { name: string; aliases: string[] },
  questions: NotebookQuestion[],
  conceptDb: Map<string, { id: string; definition: string | null }>,
): PhilosopherNotebook {
  const qs = [...questions].sort((a, b) => b.year - a.year || a.ref.localeCompare(b.ref));
  const expressions = citer();
  const reasonings = citer();
  const traps = citer();
  const skills = citer();
  const distinctions = new Map<string, ReturnType<typeof citer>>();
  const formats = new Map<QuestionFormat, number>();
  const concepts = new Map<
    string,
    {
      name: string;
      importance: NotebookConcept["importance"];
      definitions: string[];
      examPoints: ReturnType<typeof citer>;
      connections: ReturnType<typeof citer>;
      distinctions: ReturnType<typeof citer>;
      confusable: Set<string>;
      questions: Map<string, string>;
      asked: Map<string, string>;
    }
  >();
  const ext = new Map<string, PhilosopherNotebook["extensions"][number]>();

  const conceptEntry = (name: string, importance: NotebookConcept["importance"]) => {
    const k = norm(name);
    const cur =
      concepts.get(k) ??
      {
        name,
        importance,
        definitions: [],
        examPoints: citer(),
        connections: citer(),
        distinctions: citer(),
        confusable: new Set<string>(),
        questions: new Map<string, string>(),
        asked: new Map<string, string>(),
      };
    if (IMPORTANCE_RANK[importance] < IMPORTANCE_RANK[cur.importance]) cur.importance = importance;
    concepts.set(k, cur);
    return cur;
  };

  for (const q of qs) {
    const cite = { id: q.id, ref: q.ref };
    const counted = q.role === "main" || q.role === "comparison";
    (q.reasoning.decisiveExpressions ?? []).forEach((e) => expressions.add(e, cite));
    reasonings.add(q.reasoning.reasoning, cite);
    for (const s of q.reasoning.similarPhilosophers ?? []) {
      if (!s.name?.trim()) continue;
      const c = distinctions.get(s.name.trim()) ?? citer();
      c.add(s.distinguishingPoint, cite);
      distinctions.set(s.name.trim(), c);
    }
    // 출제 의도·함정은 이 사상가가 주요/비교 사상가인 문항만 (오답 유도로만 나온 문항은 제외)
    if (counted && q.intent) {
      // 함정(trapPoints)은 v2 분석에만 있다
      (q.intent.trapPoints ?? []).forEach((t) => traps.add(t, cite));
      (q.intent.skillsTested ?? []).forEach((t) => skills.add(t, cite));
      q.intent.formats.forEach((f) => formats.set(f, (formats.get(f) ?? 0) + 1));
    }
    // 이 사상가의 개념: 개념 정리에서 사상가가 이 사상가로 표시된 것 + (표시가 없으면) 이 사상가가 main 인 문항의 필수/보조 개념
    for (const sc of q.studyConcepts) {
      const mine = matchesPhilosopher(sc.philosopher, philosopher.name, philosopher.aliases) || (!sc.philosopher && q.role === "main" && sc.importance !== "comparison");
      if (!mine) continue;
      const e = conceptEntry(sc.name, sc.importance);
      if (sc.definition?.trim()) e.definitions.push(sc.definition.trim());
      e.examPoints.add(sc.examPoint, cite);
      e.connections.add(sc.connectionToQuestion, cite);
      e.distinctions.add(sc.distinction, cite);
      sc.confusableWith.forEach((x) => x.trim() && e.confusable.add(x.trim()));
      e.questions.set(q.id, q.ref);
    }
    // 개념 정리가 없는(이전 버전) 문항도 연결된 개념 태그는 모은다
    for (const c of q.ownConcepts) {
      const e = conceptEntry(c.name, "required");
      e.questions.set(q.id, q.ref);
      e.asked.set(q.id, q.ref);
    }
    for (const x of q.extensions) {
      if (!x.relatedPhilosophers.some((n) => matchesPhilosopher(n, philosopher.name, philosopher.aliases))) continue;
      const k = norm(x.topic);
      // v3: 개념 설명 + 예상 문제 / v2: 출제 방식 + 근거
      const cur = ext.get(k) ?? {
        topic: x.topic,
        format: x.format,
        possibleQuestionType: x.possibleQuestionType ?? (x.concept ? `${x.philosopher ?? ""} ${x.concept}`.trim() : ""),
        rationale: x.rationale ?? x.conceptSummary ?? "",
        importance: x.importance,
        from: [] as { id: string; ref: string }[],
      };
      if (!cur.from.some((f) => f.id === q.id)) cur.from.push(cite);
      ext.set(k, cur);
    }
  }

  const conceptList: NotebookConcept[] = [...concepts.values()].map((c) => {
    const db = conceptDb.get(norm(c.name));
    // 개념 DB 에 정리된 정의가 있으면 우선, 없으면 문항 분석 중 가장 자세한 정의
    const analysisDef = [...c.definitions].sort((a, b) => b.length - a.length)[0] ?? null;
    return {
      name: c.name,
      id: db?.id ?? null,
      importance: c.importance,
      definition: db?.definition ?? analysisDef,
      definitionFrom: db?.definition ? "개념 DB" : analysisDef ? "문항 분석" : null,
      examPoints: c.examPoints.list(),
      connections: c.connections.list(),
      confusableWith: [...c.confusable],
      distinctions: c.distinctions.list(),
      questions: [...c.questions.entries()].map(([id, ref]) => ({ id, ref })),
      askedIn: [...c.asked.entries()].map(([id, ref]) => ({ id, ref })),
    };
  });
  conceptList.sort(
    (a, b) =>
      IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] ||
      b.askedIn.length - a.askedIn.length ||
      b.questions.length - a.questions.length ||
      a.name.localeCompare(b.name),
  );

  return {
    expressions: expressions.list(),
    distinctions: [...distinctions.entries()]
      .map(([other, c]) => ({ other, points: c.list() }))
      .sort((a, b) => b.points.reduce((n, p) => n + p.refs.length, 0) - a.points.reduce((n, p) => n + p.refs.length, 0)),
    reasonings: reasonings.list(),
    concepts: conceptList,
    traps: traps.list(),
    skills: skills.list(),
    formats: [...formats.entries()].map(([format, count]) => ({ format, count })).sort((a, b) => b.count - a.count),
    extensions: [...ext.values()].sort((a, b) => b.from.length - a.from.length),
    timeline: qs,
    deepCount: qs.filter((q) => q.intent).length,
  };
}

export { norm as normalizeText };
