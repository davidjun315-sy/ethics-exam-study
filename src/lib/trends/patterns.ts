/**
 * 전체 기출 출제 패턴 분석 (순수 계산, AI 호출 없음).
 *
 * 입력은 이미 구조화된 문항 분석 데이터(QuestionFacts)이며, PDF 원문을 다시 읽지 않는다.
 *   문항별 구조화 분석 → (여기) 사상가 / 개념 / 원전 / 연도별 집계 + 반복 패턴 → 출제 예측 점수(scoring.ts) → AI 해석
 *
 * 브라우저 / 서버 / Node 테스트 어디서나 돌 수 있도록 외부 의존성을 두지 않는다.
 */

import type { QuestionFormat } from "../ai/schemas";

export interface QuestionFacts {
  id: string;
  ref: string; // "2024 A 5번"
  year: number;
  section: string | null;
  questionType: string | null;
  area: string | null;
  philosophers: { id: string; name: string; role: string }[];
  /** philosopherId: 이 개념이 어느 사상가의 개념인지 (question_concepts.philosopher_id, 모르면 null) */
  concepts: { id: string; name: string; philosopherId?: string | null }[];
  sources: { id: string; title: string; location: string | null; quoted: string | null }[];
  formats: QuestionFormat[];
  /** 문항 분석의 "알아야 할 개념" (사상가 이름 포함) — 미출제 개념 후보 */
  studyConcepts: { name: string; philosopher: string | null }[];
  /** 문항 분석의 "이 문항에서 확장될 수 있는 출제" (AI 판단) */
  extensions: { topic: string; format: QuestionFormat; relatedConcepts: string[]; relatedPhilosophers: string[] }[];
  /** 혼동하기 쉬운 사상가 (AI 판단) — 아직 비교되지 않은 조합 후보 */
  confusablePhilosophers: string[];
}

export interface PassageInfo {
  sourceId: string;
  location: string; // "권 장 절"
}

export interface Window {
  latest: number;
  years: number[]; // 기출이 있는 학년도 (오름차순)
  recent3: number[]; // 최근 3개 학년도 범위 (latest-2 ~ latest)
  recent5: number[];
}

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface Appearance {
  total: number;
  years: number[]; // 출제된 학년도 (중복 제거, 오름차순)
  lastYear: number | null;
  firstYear: number | null;
  recent3: number;
  recent5: number;
  yearsSinceLast: number | null;
  avgInterval: number | null; // 재출제 평균 간격 (년)
  cycle: string | null; // "약 3년 주기" 처럼 간격이 일정할 때만
  questionIds: string[];
}

export interface PhilosopherPattern extends Appearance {
  id: string;
  name: string;
  concepts: CountItem[];
  repeatedConcepts: CountItem[];
  unexaminedConcepts: string[]; // 이 사상가의 주요 개념 중 아직 이 사상가 문항에 나온 적 없는 것
  coPhilosophers: CountItem[];
  sources: CountItem[];
  formats: CountItem[];
  questionTypes: CountItem[];
  /** "양지 단독 2회 / 주희와 비교 2회 / 원전 제시 1회" 같은 하위 출제 패턴 */
  subPatterns: { group: string; items: CountItem[] }[];
}

export interface ConceptPattern extends Appearance {
  id: string;
  name: string;
  philosophers: CountItem[];
  coConcepts: CountItem[];
  formats: CountItem[];
  /** AI 가 문항 분석에서 제안한 확장 출제 중, 아직 기출에 쓰인 적 없는 출제 방식 */
  unusedExtensions: { topic: string; format: QuestionFormat; fromQuestion: string }[];
}

export interface SourcePattern extends Appearance {
  id: string;
  title: string;
  locations: CountItem[];
  repeatedPhrases: CountItem[];
  concepts: CountItem[];
  philosophers: CountItem[];
  unusedPassages: string[]; // 원전 DB 에 있지만 출제된 적 없는 부분
}

export interface PairPattern extends Appearance {
  key: string;
  a: string;
  b: string;
  aId: string;
  bId: string;
}

export interface GlobalPatterns {
  window: Window;
  analyzedCount: number;
  formatCounts: CountItem[];
  formatByPeriod: { format: QuestionFormat; recent5: number; before: number }[];
  comparisonPairs: PairPattern[];
  samePhilosopherDifferentConcepts: { philosopher: string; id: string; concepts: { name: string; years: number[] }[] }[];
  sameConceptDifferentPhilosophers: { concept: string; id: string; philosophers: { name: string; years: number[] }[] }[];
  cycles: { kind: "philosopher" | "concept"; id: string; name: string; cycle: string; years: number[] }[];
  rising: { kind: "philosopher" | "concept"; id: string; name: string; recent3: number; before: number }[];
  declining: { kind: "philosopher" | "concept"; id: string; name: string; before: number; lastYear: number }[];
}

export interface PatternResult {
  global: GlobalPatterns;
  philosophers: PhilosopherPattern[];
  concepts: ConceptPattern[];
  sources: SourcePattern[];
}

// ---------------------------------------------------------------------

const COUNTED_ROLES = new Set(["main", "comparison"]);

function counter() {
  const m = new Map<string, CountItem>();
  return {
    add(key: string, label: string, n = 1) {
      const cur = m.get(key) ?? { key, label, count: 0 };
      cur.count += n;
      m.set(key, cur);
    },
    list(): CountItem[] {
      return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    },
  };
}

export function makeWindow(facts: QuestionFacts[]): Window {
  const years = [...new Set(facts.map((f) => f.year))].sort((a, b) => a - b);
  const latest = years.at(-1) ?? new Date().getFullYear();
  const range = (n: number) => Array.from({ length: n }, (_, i) => latest - i);
  return { latest, years, recent3: range(3), recent5: range(5) };
}

export function appearance(items: { id: string; year: number }[], w: Window): Appearance {
  const years = [...new Set(items.map((i) => i.year))].sort((a, b) => a - b);
  const gaps = years.slice(1).map((y, i) => y - years[i]);
  const avg = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null;
  // 간격이 2번 이상 관찰되고 편차가 1년 이내면 "주기"로 본다.
  const cycle =
    gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) <= 1 && avg !== null && avg >= 1.5
      ? `약 ${Number.isInteger(avg) ? avg : avg.toFixed(1)}년 주기`
      : null;
  const last = years.at(-1) ?? null;
  return {
    total: new Set(items.map((i) => i.id)).size,
    years,
    lastYear: last,
    firstYear: years[0] ?? null,
    recent3: new Set(items.filter((i) => w.recent3.includes(i.year)).map((i) => i.id)).size,
    recent5: new Set(items.filter((i) => w.recent5.includes(i.year)).map((i) => i.id)).size,
    yearsSinceLast: last === null ? null : w.latest - last,
    avgInterval: avg === null ? null : Number(avg.toFixed(1)),
    cycle,
    questionIds: [...new Set(items.map((i) => i.id))],
  };
}

const formatLabel = (f: string) =>
  (
    ({
      identification: "사상가 판별",
      definition: "개념 정의",
      comparison: "사상 비교",
      source: "원전 이해",
      expression: "제시문 표현 찾기",
      application: "적용",
      critique: "비판·한계",
      descriptive: "서술·논증",
      memorization: "단순 암기",
    }) as Record<string, string>
  )[f] ?? f;

/**
 * 문항 안에서 이 개념을 "쓴" 사상가. 개념에 사상가가 지정되어 있으면 그 사상가만,
 * 없으면 문항의 주요·비교 사상가 전부. (예: 칸트·밀 비교 문항의 정언명령은 칸트 개념)
 */
function conceptOwners(q: QuestionFacts, conceptId: string) {
  const owner = q.concepts.find((c) => c.id === conceptId)?.philosopherId;
  const counted = q.philosophers.filter((p) => COUNTED_ROLES.has(p.role));
  if (owner) {
    const p = counted.find((x) => x.id === owner) ?? q.philosophers.find((x) => x.id === owner);
    return p ? [p] : counted;
  }
  return counted;
}

/** 받침이 있으면 "과", 없으면 "와" (예: 밀과, 주희와) */
function withParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "와";
  return code % 28 === 0 ? "와" : "과";
}

const normPhrase = (s: string) => s.replace(/[\s"'“”‘’「」『』.,·]/g, "");

export function analyzePatterns(facts: QuestionFacts[], passages: PassageInfo[] = [], knownConceptsByPhilosopher: Map<string, Set<string>> = new Map()): PatternResult {
  const w = makeWindow(facts);

  // ---------------- 사상가 ----------------
  const philIndex = new Map<string, { name: string; qs: QuestionFacts[] }>();
  for (const f of facts) {
    for (const p of f.philosophers) {
      if (!COUNTED_ROLES.has(p.role)) continue;
      const cur = philIndex.get(p.id) ?? { name: p.name, qs: [] };
      if (!cur.qs.includes(f)) cur.qs.push(f);
      philIndex.set(p.id, cur);
    }
  }
  const philosophers: PhilosopherPattern[] = [...philIndex.entries()].map(([id, { name, qs }]) => {
    const concepts = counter();
    const co = counter();
    const srcs = counter();
    const formats = counter();
    const types = counter();
    const partner = counter();
    const style = counter();
    const combo = counter();
    for (const q of qs) {
      // 비교 상대 사상가의 개념(예: 왕수인 문항 속 주희의 격물치지)은 이 사상가의 개념으로 세지 않는다.
      q.concepts.filter((c) => !c.philosopherId || c.philosopherId === id).forEach((c) => concepts.add(c.id, c.name));
      const others = q.philosophers.filter((x) => x.id !== id && COUNTED_ROLES.has(x.role));
      others.forEach((x) => co.add(x.id, x.name));
      q.sources.forEach((s) => srcs.add(s.id, s.title));
      q.formats.forEach((x) => formats.add(x, formatLabel(x)));
      if (q.questionType) types.add(q.questionType, q.questionType);
      if (others.length === 0) partner.add("solo", "단독 출제");
      others.forEach((x) => partner.add(`vs:${x.id}`, `${x.name}${withParticle(x.name)} 비교`));
      if (q.sources.length > 0 || q.formats.includes("source")) style.add("source", "원전 제시");
      q.formats.filter((x) => x !== "source").forEach((x) => style.add(x, formatLabel(x)));
      const main = q.concepts.filter((c) => !c.philosopherId || c.philosopherId === id).slice(0, 2).map((c) => c.name);
      if (main.length) combo.add(main.join("+"), main.length === 1 ? `${main[0]} 중심` : `${main.join(" + ")} 연결`);
    }
    const conceptList = concepts.list();
    const examined = new Set(conceptList.map((c) => c.label));
    const known = knownConceptsByPhilosopher.get(name) ?? new Set<string>();
    return {
      id,
      name,
      ...appearance(qs.map((q) => ({ id: q.id, year: q.year })), w),
      concepts: conceptList,
      repeatedConcepts: conceptList.filter((c) => c.count >= 2),
      unexaminedConcepts: [...known].filter((c) => !examined.has(c)).sort(),
      coPhilosophers: co.list(),
      sources: srcs.list(),
      formats: formats.list(),
      questionTypes: types.list(),
      subPatterns: [
        { group: "비교 방식", items: partner.list() },
        { group: "출제 방식", items: style.list() },
        { group: "개념 조합", items: combo.list() },
      ].filter((g) => g.items.length > 0),
    };
  });

  // ---------------- 개념 ----------------
  const conceptIndex = new Map<string, { name: string; qs: QuestionFacts[] }>();
  for (const f of facts)
    for (const c of f.concepts) {
      const cur = conceptIndex.get(c.id) ?? { name: c.name, qs: [] };
      if (!cur.qs.includes(f)) cur.qs.push(f);
      conceptIndex.set(c.id, cur);
    }
  const concepts: ConceptPattern[] = [...conceptIndex.entries()].map(([id, { name, qs }]) => {
    const ph = counter();
    const co = counter();
    const formats = counter();
    for (const q of qs) {
      conceptOwners(q, id).forEach((p) => ph.add(p.id, p.name));
      q.concepts.filter((c) => c.id !== id).forEach((c) => co.add(c.id, c.name));
      q.formats.forEach((x) => formats.add(x, formatLabel(x)));
    }
    const used = new Set(qs.flatMap((q) => q.formats));
    const unusedExtensions: ConceptPattern["unusedExtensions"] = [];
    const seen = new Set<string>();
    for (const f of facts)
      for (const e of f.extensions) {
        if (!e.relatedConcepts.includes(name) || used.has(e.format)) continue;
        const k = `${e.format}:${e.topic}`;
        if (seen.has(k)) continue;
        seen.add(k);
        unusedExtensions.push({ topic: e.topic, format: e.format, fromQuestion: f.ref });
      }
    return {
      id,
      name,
      ...appearance(qs.map((q) => ({ id: q.id, year: q.year })), w),
      philosophers: ph.list(),
      coConcepts: co.list(),
      formats: formats.list(),
      unusedExtensions: unusedExtensions.slice(0, 8),
    };
  });

  // ---------------- 원전 ----------------
  const srcIndex = new Map<string, { title: string; rows: { q: QuestionFacts; location: string | null; quoted: string | null }[] }>();
  for (const f of facts)
    for (const s of f.sources) {
      const cur = srcIndex.get(s.id) ?? { title: s.title, rows: [] };
      cur.rows.push({ q: f, location: s.location, quoted: s.quoted });
      srcIndex.set(s.id, cur);
    }
  const sources: SourcePattern[] = [...srcIndex.entries()].map(([id, { title, rows }]) => {
    const loc = counter();
    const phrase = counter();
    const cs = counter();
    const ph = counter();
    for (const r of rows) {
      if (r.location) loc.add(r.location, r.location);
      if (r.quoted && r.quoted.length >= 6) phrase.add(normPhrase(r.quoted).slice(0, 40), r.quoted.slice(0, 60));
    }
    for (const q of new Set(rows.map((r) => r.q))) {
      q.concepts.forEach((c) => cs.add(c.id, c.name));
      q.philosophers.filter((p) => COUNTED_ROLES.has(p.role)).forEach((p) => ph.add(p.id, p.name));
    }
    const usedLocations = new Set(rows.map((r) => r.location ?? "").filter(Boolean));
    const unusedPassages = passages
      .filter((p) => p.sourceId === id && p.location && ![...usedLocations].some((u) => u.includes(p.location) || p.location.includes(u)))
      .map((p) => p.location);
    return {
      id,
      title,
      ...appearance(rows.map((r) => ({ id: r.q.id, year: r.q.year })), w),
      locations: loc.list(),
      repeatedPhrases: phrase.list().filter((p) => p.count >= 2),
      concepts: cs.list(),
      philosophers: ph.list(),
      unusedPassages: [...new Set(unusedPassages)].slice(0, 20),
    };
  });

  // ---------------- 전체 반복 패턴 ----------------
  const fmt = counter();
  const fmtRecent = new Map<string, { recent5: number; before: number }>();
  for (const f of facts)
    for (const x of new Set(f.formats)) {
      fmt.add(x, formatLabel(x));
      const cur = fmtRecent.get(x) ?? { recent5: 0, before: 0 };
      if (w.recent5.includes(f.year)) cur.recent5++;
      else cur.before++;
      fmtRecent.set(x, cur);
    }

  const pairIndex = new Map<string, { a: string; b: string; aId: string; bId: string; items: { id: string; year: number }[] }>();
  for (const f of facts) {
    const ps = f.philosophers.filter((p) => COUNTED_ROLES.has(p.role)).sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const key = `${ps[i].id}|${ps[j].id}`;
        const cur = pairIndex.get(key) ?? { a: ps[i].name, b: ps[j].name, aId: ps[i].id, bId: ps[j].id, items: [] };
        cur.items.push({ id: f.id, year: f.year });
        pairIndex.set(key, cur);
      }
  }
  const comparisonPairs: PairPattern[] = [...pairIndex.entries()]
    .map(([key, v]) => ({ key, a: v.a, b: v.b, aId: v.aId, bId: v.bId, ...appearance(v.items, w) }))
    .sort((x, y) => y.total - x.total || (y.lastYear ?? 0) - (x.lastYear ?? 0));

  const samePhilosopherDifferentConcepts = philosophers
    .filter((p) => p.concepts.length >= 2 && p.total >= 2)
    .map((p) => ({
      philosopher: p.name,
      id: p.id,
      concepts: p.concepts.map((c) => ({
        name: c.label,
        years: [...new Set(philIndex.get(p.id)!.qs.filter((q) => q.concepts.some((x) => x.id === c.key)).map((q) => q.year))].sort(),
      })),
    }))
    .sort((a, b) => b.concepts.length - a.concepts.length);

  const sameConceptDifferentPhilosophers = concepts
    .filter((c) => c.philosophers.length >= 2)
    .map((c) => ({
      concept: c.name,
      id: c.id,
      philosophers: c.philosophers.map((p) => ({
        name: p.label,
        years: [...new Set(conceptIndex.get(c.id)!.qs.filter((q) => conceptOwners(q, c.id).some((x) => x.id === p.key)).map((q) => q.year))].sort(),
      })),
    }))
    .sort((a, b) => b.philosophers.length - a.philosophers.length);

  const both = [
    ...philosophers.map((p) => ({ kind: "philosopher" as const, id: p.id, name: p.name, a: p })),
    ...concepts.map((c) => ({ kind: "concept" as const, id: c.id, name: c.name, a: c })),
  ];
  const span = Math.max(1, (w.years.at(-1) ?? w.latest) - (w.years[0] ?? w.latest) + 1);
  const beforeSpan = Math.max(1, span - 3);
  const cycles = both
    .filter((x) => x.a.cycle)
    .map((x) => ({ kind: x.kind, id: x.id, name: x.name, cycle: x.a.cycle!, years: x.a.years }));
  // 최근 3년 연평균이 그 이전 연평균의 1.5배 이상이고 최근 2회 이상
  const rising = both
    .map((x) => ({ kind: x.kind, id: x.id, name: x.name, recent3: x.a.recent3, before: x.a.total - x.a.recent3 }))
    .filter((x) => x.recent3 >= 2 && x.recent3 / 3 >= 1.5 * (x.before / beforeSpan))
    .sort((a, b) => b.recent3 - a.recent3);
  // 이전에 2회 이상 나왔지만 최근 5년 0회
  const declining = both
    .filter((x) => x.a.recent5 === 0 && x.a.total >= 2)
    .map((x) => ({ kind: x.kind, id: x.id, name: x.name, before: x.a.total, lastYear: x.a.lastYear ?? 0 }))
    .sort((a, b) => b.before - a.before || a.lastYear - b.lastYear);

  return {
    global: {
      window: w,
      analyzedCount: facts.length,
      formatCounts: fmt.list(),
      formatByPeriod: [...fmtRecent.entries()].map(([format, v]) => ({ format: format as QuestionFormat, ...v })),
      comparisonPairs,
      samePhilosopherDifferentConcepts,
      sameConceptDifferentPhilosophers,
      cycles,
      rising,
      declining,
    },
    philosophers: philosophers.sort((a, b) => b.total - a.total || (b.lastYear ?? 0) - (a.lastYear ?? 0)),
    concepts: concepts.sort((a, b) => b.total - a.total || (b.lastYear ?? 0) - (a.lastYear ?? 0)),
    sources: sources.sort((a, b) => b.total - a.total || (b.lastYear ?? 0) - (a.lastYear ?? 0)),
  };
}

export { formatLabel };
