/**
 * 문항 "개념 정리" 탭의 키워드 구조도. (순수 계산)
 * 구조도가 없는 이전 분석은 개념 정리(studyConcepts)에서 사상가별로 만든다:
 * 핵심 개념(required) 중 첫 번째를 중심으로, 나머지를 중요도 순으로 가지에 둔다.
 */
import type { ConceptMap, StudyConcept } from "../ai/schemas";

const RELATION: Record<StudyConcept["importance"], string> = { required: "핵심", supporting: "보조", comparison: "비교" };
const RANK: Record<StudyConcept["importance"], number> = { required: 0, supporting: 1, comparison: 2 };
const short = (t: string) => {
  const first = t.split(/[.。!?]\s|\n/)[0].trim();
  return first.length > 22 ? `${first.slice(0, 20)}…` : first;
};

export function deriveConceptMap(concepts: StudyConcept[], fallbackPhilosopher: string | null): ConceptMap[] {
  const groups = new Map<string, StudyConcept[]>();
  for (const c of concepts) {
    const p = c.philosopher?.trim() || fallbackPhilosopher || "개념";
    groups.set(p, [...(groups.get(p) ?? []), c]);
  }
  return [...groups.entries()].map(([philosopher, list]) => {
    const sorted = [...list].sort((a, b) => RANK[a.importance] - RANK[b.importance]);
    const [focus, ...rest] = sorted;
    return {
      philosopher,
      focus: focus.name,
      focusGist: short(focus.definition ?? ""),
      branches: rest.map((c) => ({ relation: RELATION[c.importance], keyword: c.name, gist: short(c.definition ?? ""), inQuestion: c.importance === "required" })),
    };
  });
}

/** 저장된 구조도가 있으면 그대로, 없으면 개념 정리에서 만든다 */
export function questionConceptMap(stored: ConceptMap[] | undefined, concepts: StudyConcept[] | undefined, mainPhilosopher: string | null) {
  if (stored?.length) return { maps: stored, derived: false };
  return { maps: concepts?.length ? deriveConceptMap(concepts, mainPhilosopher) : [], derived: true };
}
