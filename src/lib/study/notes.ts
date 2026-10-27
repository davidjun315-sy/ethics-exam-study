/**
 * 사상가 개념 정리 노트 보조 함수. (순수 계산)
 * - 공부 노트(기출 분석 모음) → 채팅 AI 에 보낼 입력
 * - 붙여넣은 노트의 기출 ref 검사
 * - 저장된 노트가 최신 분석을 반영하는지
 */
import type { NotePromptInput } from "../../../prompts/philosopher-notes";
import type { PhilosopherStudyNote } from "../ai/schemas";
import type { PhilosopherNotebook } from "./notebook";

const cut = (s: string | null | undefined, n: number) => {
  const t = s?.trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const texts = (list: { text: string }[], max: number, len = 200) => list.slice(0, max).map((c) => cut(c.text, len)!);

export function buildNoteInput(
  philosopher: NotePromptInput["philosopher"],
  nb: PhilosopherNotebook,
): NotePromptInput {
  return {
    philosopher,
    expressions: texts(nb.expressions, 30, 120),
    distinctions: nb.distinctions.slice(0, 12).map((d) => ({ other: d.other, points: texts(d.points, 5) })),
    concepts: nb.concepts.slice(0, 60).map((c) => ({
      name: c.name,
      importance: c.importance,
      definition: cut(c.definition, 300),
      examPoints: texts(c.examPoints, 6),
      distinctions: texts(c.distinctions, 4),
      confusableWith: c.confusableWith.slice(0, 8),
      askedIn: (c.askedIn.length ? c.askedIn : c.questions).map((q) => q.ref),
    })),
    traps: texts(nb.traps, 20),
    skills: texts(nb.skills, 15),
    extensions: nb.extensions.slice(0, 10).map((e) => ({ topic: e.topic, rationale: cut(e.rationale, 200)! })),
    questions: nb.timeline.map((q) => ({
      ref: q.ref,
      role: q.role,
      intent: cut(q.intent?.summary, 300),
      concepts: q.ownConcepts.map((c) => c.name),
      answer: cut(q.answer, 200),
      requiredKeywords: q.requiredKeywords.slice(0, 10),
    })),
  };
}

const normRef = (r: string) => r.replace(/\s+/g, "").replace(/번$/, "");

/**
 * AI 가 쓴 기출 ref 를 실제 문항 ref 로 맞춘다. 띄어쓰기·"번" 차이는 허용하고, 없는 ref 는 지운다.
 * 반환: 정리된 노트와 지운 ref 목록
 */
export function sanitizeNoteRefs(note: PhilosopherStudyNote, validRefs: string[]): { note: PhilosopherStudyNote; dropped: string[] } {
  const byNorm = new Map(validRefs.map((r) => [normRef(r), r]));
  const dropped = new Set<string>();
  const fix = (list: string[]) => {
    const out: string[] = [];
    for (const r of list) {
      const hit = byNorm.get(normRef(r));
      if (!hit) dropped.add(r);
      else if (!out.includes(hit)) out.push(hit);
    }
    return out;
  };
  const clean: PhilosopherStudyNote = {
    ...note,
    sections: note.sections.map((s) => ({ ...s, concepts: s.concepts.map((c) => ({ ...c, relatedQuestionRefs: fix(c.relatedQuestionRefs) })) })),
    comparisons: note.comparisons.map((c) => ({ ...c, relatedQuestionRefs: fix(c.relatedQuestionRefs) })),
    traps: note.traps.map((t) => ({ ...t, relatedQuestionRefs: fix(t.relatedQuestionRefs) })),
  };
  return { note: clean, dropped: [...dropped] };
}

/** 노트가 비어 있는지 (단원·개념이 하나도 없으면 저장하지 않는다) */
export function noteConceptCount(note: PhilosopherStudyNote): number {
  return note.sections.reduce((n, s) => n + s.concepts.length, 0);
}

/** 노트를 만든 뒤 새로 분석된 문항 / 빠진 문항 */
export function noteFreshness(basedOn: string[], currentIds: string[]) {
  const base = new Set(basedOn);
  const cur = new Set(currentIds);
  return {
    added: currentIds.filter((id) => !base.has(id)),
    removed: basedOn.filter((id) => !cur.has(id)),
  };
}
