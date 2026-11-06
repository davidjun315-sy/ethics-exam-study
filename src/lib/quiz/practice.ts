/**
 * 기출 기반 연습문제 (개념 다지기) 생성 · 채점. (순수 계산, AI 호출 없음)
 *
 * 실제 기출 1문항의 저장된 분석만 쓴다. 새 지식을 보태지 않는다.
 *   - 요구 사항별 해설(정답·근거 구절·해설), 원문 해설(단락별 인용), 개념 정리(사상가별 정의·혼동 개념),
 *     오답 분석(혼동 개념), question_analysis.common_mistakes(자주 하는 실수)
 * 만드는 유형 (기출의 정답 개념과 채점 요소만 다룬다 → 기본 개념 암기보다 어렵고, 보기·단계라는 발판이 있어 실전보다 쉽다)
 *   ladder   : 빈칸 정답 고르기 — 오답 보기 = 실제로 많이 틀리는 답·혼동 개념·같은 문항의 다른 빈칸
 *   hint     : 초성 힌트 기입 (빈칸 사다리 2단계, 다음 단계가 실제 기출 기입형)
 *   evidence : 정답의 근거가 되는 제시문 구절 고르기
 *   classify : 진술을 사상가별 입장으로 분류
 *   diagnose : 답안 작성에서 감점되는(잘못된) 것 모두 고르기 — 자주 하는 실수
 * 보기 순서는 문제 키로 정해지는 의사난수로 섞는다 (동기화해도 같은 순서 → 학습 기록 유지).
 */
import type { AnalysisDetails } from "../types";
import { answerVariants, isShortAnswer, normalizeAnswer, seedAcceptedAnswers } from "./grade.ts";
import { hashText } from "./split.ts";

export type PracticeType = "ladder" | "hint" | "evidence" | "classify" | "diagnose" | "interpret" | "elements";

export const PRACTICE_TYPE_NAMES: Record<PracticeType, string> = {
  ladder: "빈칸 개념 고르기",
  hint: "초성 힌트 빈칸",
  evidence: "근거 구절 찾기",
  classify: "입장 분류",
  diagnose: "감점 포인트 찾기",
  interpret: "원문 해석",
  elements: "채점 요소 고르기",
};

export interface ChoicePayload {
  type: PracticeType;
  mode: "choice";
  stem: string;
  options: string[];
  answer: number;
  notes: (string | null)[]; // 보기별 해설 (오답인 이유 등)
  explanation: string;
  grounds: string; // 근거 (어느 분석 항목에서 왔는지)
}
export interface MultiPayload {
  type: PracticeType;
  mode: "multi";
  stem: string;
  options: string[];
  answers: number[];
  notes: (string | null)[];
  explanation: string;
  grounds: string;
}
export interface ClassifyPayload {
  type: PracticeType;
  mode: "classify";
  stem: string;
  groups: string[];
  statements: { text: string; group: number; note: string | null }[];
  explanation: string;
  grounds: string;
}
export interface HintPayload {
  type: "hint";
  mode: "fill";
  hint: string;
  explanation: string;
  grounds: string;
}
export type PracticePayload = ChoicePayload | MultiPayload | ClassifyPayload | HintPayload;

export interface PracticeSource {
  questionId: string;
  questionText: string | null;
  details: AnalysisDetails;
  commonMistakes: string[];
  needsReview: boolean; // 분석이 '검토 필요' 상태
}

export interface PracticeItem {
  key: string;
  type: PracticeType;
  label: string; // 관리자용: "㉠ · 빈칸 개념 고르기"
  format: "choice" | "multi" | "classify" | "fill";
  answer: string | null; // fill(초성 힌트)만
  acceptedAnswers: string[];
  prompt: string | null;
  payload: PracticePayload;
  difficulty: 1 | 2 | 3;
  reviewReasons: string[];
  sourceHash: string;
  sortOrder: number;
}

// ---------------------------------------------------------------------
// 도구
// ---------------------------------------------------------------------
const CIRCLED = /[㉠-㉻ⓐ-ⓩ]/;
const norm = (s: string) => normalizeAnswer(s);
/** 키용 레이블: 공백만 지운다 (㉠·㉡ 를 구분해야 하므로 정답 정규화를 쓰지 않음) */
const keyPart = (label: string) => label.replace(/\s+/g, "");
/** 같은 말인가 (괄호 병기·띄어쓰기 무시): "하나(一)" ≈ "하나" ≈ "一" */
export function sameTerm(a: string, b: string): boolean {
  const va = new Set(answerVariants(a).map(norm).filter(Boolean));
  return answerVariants(b).some((v) => va.has(norm(v)));
}

function rng(seed: string) {
  let a = parseInt(hashText(seed), 36) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 키로 정해지는 섞기 → 원래 위치 목록을 돌려준다 */
function shuffleIdx(n: number, seed: string): number[] {
  const r = rng(seed);
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** 레이블에서 빈칸 기호: "작성 방법 1 - ㉠" → "㉠", "정답" → "" */
export function blankMark(label: string): string {
  return label.match(CIRCLED)?.[0] ?? label.match(/\([가-힣]\)/)?.[0] ?? "";
}

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
/** 초성: "하나(一)" → "ㅎㄴ", "치양지" → "ㅊㅇㅈ". 한글이 없으면 "" */
export function chosung(term: string): string {
  const main = term.replace(/\s*[(（][^)）]*[)）]\s*/g, "").trim();
  let out = "";
  for (const ch of main) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
    else if (/\s/.test(ch)) out += " ";
    else if (/[·・,]/.test(ch)) out += ch;
  }
  return /[ㄱ-ㅎ]/.test(out) ? out.trim() : "";
}

/** 인용부호 안의 표현들: ‘태극’, '기', “…” */
function quoted(s: string): string[] {
  return [...s.matchAll(/[‘'"“「『]([^’'"”」』]{1,40})[’'"”」』]/g)].map((m) => m[1].trim()).filter(Boolean);
}

/** "A — 이유" → { claim: "A", reason: "이유" } */
export function splitMistake(s: string): { claim: string; reason: string | null } {
  const m = s.match(/^(.*?)\s+[—–-]{1,2}\s+(.+)$/);
  return m ? { claim: m[1].trim(), reason: m[2].trim() } : { claim: s.trim(), reason: null };
}

function firstSentences(s: string, max = 260): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다. "), cut.lastIndexOf("다."));
  return (end > 80 ? cut.slice(0, end + 1) : cut) + (end > 80 ? "" : "…");
}

/** 근거 인용 꺼내기: '갑: “…” / 을: “…”' → 인용들 */
function allQuotes(sourcePart: string): string[] {
  return [...sourcePart.matchAll(/[“"「]([^”"」]{6,})[”"」]/g)].map((m) => m[1].trim());
}
/** 보기에서는 빈칸 기호를 지운다 (기호 맞추기로 풀리지 않게) */
const blankless = (s: string) => s.replace(/\(\s*[㉠-㉻ⓐ-ⓩ]\s*\)/g, "(   )").replace(/[㉠-㉻ⓐ-ⓩ]\s*/g, "");
const clip = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);
const shingles = (s: string) => {
  const t = norm(s);
  const out = new Set<string>();
  for (let i = 0; i + 8 <= t.length; i++) out.add(t.slice(i, i + 8));
  return out;
};
function overlaps(a: string, b: string): boolean {
  const sa = shingles(a);
  for (const x of shingles(b)) if (sa.has(x)) return true;
  return false;
}

// 해설에서 '이 표현도 정답으로 인정' 같은 말이 있는 보기는 오답으로 쓰지 않는다
const ALSO_OK = /(정답으로 인정|인정된다|인정한다|도 정답|허용|무방|가능하다)/;
function alsoAccepted(term: string, explanation: string): boolean {
  return explanation.split(/(?<=[.다])\s+|\n/).some((sent) => sent.includes(term) && ALSO_OK.test(sent));
}

/** 진술에서 사상가 이름을 가린다 (조사 맞춤): "주희는" → "이 사상가는" */
export function maskName(text: string, name: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`${esc}(은|는)`, "g"), "이 사상가는")
    .replace(new RegExp(`${esc}(이|가)(?![가-힣])`, "g"), "이 사상가가")
    .replace(new RegExp(`${esc}(을|를)`, "g"), "이 사상가를")
    .replace(new RegExp(`${esc}(과|와)`, "g"), "이 사상가와")
    .replace(new RegExp(`${esc}의`, "g"), "이 사상가의")
    .split(name)
    .join("이 사상가");
}

// ---------------------------------------------------------------------
// 생성
// ---------------------------------------------------------------------
export function buildPracticeItems(src: PracticeSource): PracticeItem[] {
  const d = src.details ?? {};
  const items = d.itemExplanations ?? [];
  if (!items.length) return [];
  const out: PracticeItem[] = [];
  const base = src.needsReview ? ["원본 분석이 '검토 필요' 상태입니다"] : [];
  const qid = src.questionId;
  const terms = items.filter((x) => isShortAnswer(x.answer));
  const mistakes = (src.commonMistakes ?? []).map(splitMistake);
  const concepts = d.studyConcepts ?? [];
  let order = 0;

  // ① 빈칸 개념 고르기 + 초성 힌트 (빈칸 사다리 1·2단계)
  for (const it of terms) {
    const mark = blankMark(it.label);
    const term = it.answer.trim();
    const pool: { text: string; note: string | null; rank: number }[] = [];
    // a. 자주 하는 실수에서 이 빈칸에 잘못 쓰는 답
    for (const m of mistakes) {
      if (mark && !m.claim.includes(mark)) continue;
      for (const q of quoted(m.claim)) pool.push({ text: q, note: m.reason, rank: 0 });
    }
    // b. 같은 문항의 다른 빈칸 정답
    for (const o of terms) if (o !== it) pool.push({ text: o.answer.trim(), note: `${blankMark(o.label) || o.label}의 정답입니다.`, rank: 1 });
    // c. 이 개념과 혼동하는 개념
    for (const c of concepts) {
      if (!sameTerm(c.name, term)) continue;
      for (const x of c.confusableWith ?? []) pool.push({ text: x, note: c.distinction || null, rank: 2 });
    }
    for (const c of d.confusableConcepts ?? []) {
      const sides = c.name.split(/\s*(?:와|과|vs\.?|·|\/)\s*/).filter(Boolean);
      if (sides.length === 2 && sides.some((s) => sameTerm(s, term))) {
        const other = sides.find((s) => !sameTerm(s, term))!;
        pool.push({ text: other, note: c.reason, rank: 2 });
      }
    }
    // d. 이 문항의 다른 핵심 개념
    for (const c of concepts) pool.push({ text: c.name, note: c.philosopher ? `${c.philosopher}의 개념: ${firstSentences(c.definition, 90)}` : null, rank: 3 });

    const seen: string[] = [term];
    const distractors: { text: string; note: string | null }[] = [];
    for (const p of pool.sort((a, b) => a.rank - b.rank)) {
      const t = p.text.replace(/^[㉠-㉻]\s*/, "").trim();
      if (!t || t.length > 18 || seen.some((s) => sameTerm(s, t))) continue;
      if (alsoAccepted(t, it.explanation)) continue;
      seen.push(t);
      distractors.push({ text: t, note: p.note });
      if (distractors.length >= 4) break;
    }
    const where = mark ? `( ${mark} )` : "빈칸";
    if (distractors.length >= 3) {
      const key = `d:${qid}:ladder:${keyPart(it.label)}`;
      const opts = [{ text: term, note: null as string | null }, ...distractors];
      const idx = shuffleIdx(opts.length, key);
      const options = idx.map((i) => opts[i].text);
      out.push({
        key,
        type: "ladder",
        label: `${mark || it.label} · ${PRACTICE_TYPE_NAMES.ladder}`,
        format: "choice",
        answer: null,
        acceptedAnswers: [],
        prompt: null,
        payload: {
          type: "ladder",
          mode: "choice",
          stem: `제시문의 ${where}에 들어갈 용어로 가장 적절한 것은?`,
          options,
          answer: idx.indexOf(0),
          notes: idx.map((i) => opts[i].note),
          explanation: firstSentences(it.explanation, 420),
          grounds: `요구 사항별 해설 ${it.label} · 오답 보기: 자주 하는 실수·혼동 개념`,
        },
        difficulty: 1,
        reviewReasons: [...base],
        sourceHash: hashText(`ladder|${term}|${options.join("|")}|${it.explanation}`),
        sortOrder: order++,
      });
    }
    const cho = chosung(term);
    if (cho) {
      out.push({
        key: `d:${qid}:hint:${keyPart(it.label)}`,
        type: "hint",
        label: `${mark || it.label} · ${PRACTICE_TYPE_NAMES.hint}`,
        format: "fill",
        answer: term,
        acceptedAnswers: seedAcceptedAnswers(term),
        prompt: `제시문의 ${where}에 들어갈 용어를 쓰시오. (초성 힌트: ${cho})`,
        payload: { type: "hint", mode: "fill", hint: cho, explanation: firstSentences(it.explanation, 420), grounds: `요구 사항별 해설 ${it.label}` },
        difficulty: 2,
        reviewReasons: [...base],
        sourceHash: hashText(`hint|${term}|${cho}`),
        sortOrder: order++,
      });
    }
  }

  // ④ 근거 구절 찾기 — 빈칸 정답의 근거가 되는 구절. 같은 빈칸이 들어 있는 구절(=역시 근거)은 오답 보기에서 뺀다
  const quotes = [
    ...(d.passageCommentary ?? []).map((p) => p.quote),
    ...items.flatMap((x) => allQuotes(x.sourcePart ?? "")),
  ]
    .map((q) => q.replace(/\s+/g, " ").trim())
    .filter((q) => q.length >= 10);
  for (const it of terms) {
    const rights = allQuotes(it.sourcePart ?? "");
    const right = rights[0];
    if (!right) continue;
    const mark = blankMark(it.label);
    const wrong: string[] = [];
    for (const q of quotes) {
      if (rights.some((r) => overlaps(q, r)) || (mark && q.includes(mark)) || wrong.some((w) => overlaps(w, q))) continue;
      wrong.push(q);
      if (wrong.length >= 3) break;
    }
    if (wrong.length < 2) continue;
    const key = `d:${qid}:evidence:${keyPart(it.label)}`;
    const opts = [right, ...wrong].map((q) => `“${clip(blankless(q), 72)}”`);
    const idx = shuffleIdx(opts.length, key);
    out.push({
      key,
      type: "evidence",
      label: `${mark || it.label} · ${PRACTICE_TYPE_NAMES.evidence}`,
      format: "choice",
      answer: null,
      acceptedAnswers: [],
      prompt: null,
      payload: {
        type: "evidence",
        mode: "choice",
        stem: `${mark ? `( ${mark} )` : "빈칸"}의 정답이 ‘${it.answer.trim()}’임을 가장 직접적으로 알려 주는 제시문 구절은? (보기에서는 빈칸 기호를 지웠습니다)`,
        options: idx.map((i) => opts[i]),
        answer: idx.indexOf(0),
        notes: idx.map((i) => (i === 0 ? null : "다른 빈칸이나 다른 요구 사항의 근거입니다.")),
        explanation: `근거: ${it.sourcePart}\n\n${firstSentences(it.explanation, 360)}`,
        grounds: `요구 사항별 해설 ${it.label}의 근거 · 원문 해설`,
      },
      difficulty: 2,
      reviewReasons: [...base],
      sourceHash: hashText(`evidence|${right}|${opts.join("|")}`),
      sortOrder: order++,
    });
  }

  // ③ 입장 분류 (사상가가 둘 이상일 때)
  const byPh = new Map<string, typeof concepts>();
  for (const c of concepts) if (c.philosopher && c.definition) byPh.set(c.philosopher, [...(byPh.get(c.philosopher) ?? []), c]);
  const groups = [...byPh.keys()].filter((p) => byPh.get(p)!.length >= 1);
  if (groups.length >= 2) {
    const names = groups.slice(0, 3);
    const statements: { text: string; group: number; note: string | null }[] = [];
    for (const [gi, p] of names.entries()) {
      for (const c of byPh.get(p)!.slice(0, 3)) {
        // 다른 사상가 이름이 들어간 진술은 헷갈리므로 빼고, 자기 이름은 가린다
        if (names.some((o) => o !== p && c.definition.includes(o))) continue;
        const text = firstSentences(maskName(c.definition, p), 150);
        statements.push({ text, group: gi, note: `${c.name} (${p})${c.examPoint ? ` — ${c.examPoint}` : ""}` });
      }
    }
    const perGroup = names.map((_, gi) => statements.filter((s) => s.group === gi).length);
    if (statements.length >= 4 && perGroup.every((n) => n >= 1)) {
      const key = `d:${qid}:classify`;
      const idx = shuffleIdx(statements.length, key);
      out.push({
        key,
        type: "classify",
        label: PRACTICE_TYPE_NAMES.classify,
        format: "classify",
        answer: null,
        acceptedAnswers: [],
        prompt: null,
        payload: {
          type: "classify",
          mode: "classify",
          stem: `다음 진술을 각 사상가의 입장으로 분류하시오.`,
          groups: names,
          statements: idx.map((i) => statements[i]),
          explanation: "각 진술은 이 기출의 개념 정리에 나온 사상가별 핵심 개념입니다.",
          grounds: "개념 정리 (사상가별 개념·정의)",
        },
        difficulty: 2,
        reviewReasons: [...base],
        sourceHash: hashText(`classify|${statements.map((s) => s.text + s.group).join("|")}`),
        sortOrder: order++,
      });
    }
  }

  // ⑥ 감점 포인트 찾기 (자주 하는 실수 2개 이상 + 맞는 서술 1개 이상)
  const wrongClaims = mistakes.filter((m) => m.claim.length >= 4).slice(0, 4);
  const rightClaims = terms.slice(0, 2).map((t) => {
    const mark = blankMark(t.label);
    return { claim: `${mark || "빈칸"}에 ‘${t.answer.trim()}’을/를 씀`, reason: null as string | null };
  });
  if (wrongClaims.length >= 2 && rightClaims.length >= 1) {
    const key = `d:${qid}:diagnose`;
    const opts = [...wrongClaims.map((m) => ({ ...m, wrong: true })), ...rightClaims.map((m) => ({ ...m, wrong: false }))];
    const idx = shuffleIdx(opts.length, key);
    out.push({
      key,
      type: "diagnose",
      label: PRACTICE_TYPE_NAMES.diagnose,
      format: "multi",
      answer: null,
      acceptedAnswers: [],
      prompt: null,
      payload: {
        type: "diagnose",
        mode: "multi",
        stem: "이 기출의 답안을 쓸 때 감점되는(잘못된) 것을 모두 고르시오.",
        options: idx.map((i) => opts[i].claim),
        answers: idx.map((i, pos) => (opts[i].wrong ? pos : -1)).filter((p) => p >= 0),
        notes: idx.map((i) => (opts[i].wrong ? (opts[i].reason ?? "자주 하는 실수입니다.") : "맞는 답입니다.")),
        explanation: "자주 하는 실수는 실제 채점에서 감점되는 대표적인 오답입니다.",
        grounds: "오답 분석 · 자주 하는 실수",
      },
      difficulty: 2,
      reviewReasons: [...base],
      sourceHash: hashText(`diagnose|${opts.map((o) => o.claim).join("|")}`),
      sortOrder: order++,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// 채점 (서버)
// ---------------------------------------------------------------------
export type PracticeResult = "correct" | "partial" | "wrong";

function parseNums(answer: string): number[] | null {
  try {
    const v = JSON.parse(answer);
    if (typeof v === "number") return [v];
    if (Array.isArray(v) && v.every((x) => Number.isInteger(x))) return v as number[];
  } catch {}
  return null;
}

/** 연습문제 채점. answer: choice "2" · multi "[0,3]" · classify "[0,1,1,0]" (진술 순서대로 그룹 번호) */
export function gradePractice(p: PracticePayload, answer: string): PracticeResult {
  const nums = parseNums(answer);
  if (!nums) return "wrong";
  if (p.mode === "choice") return nums.length === 1 && nums[0] === p.answer ? "correct" : "wrong";
  if (p.mode === "multi") {
    const pick = new Set(nums);
    const right = new Set(p.answers);
    const wrongPicks = [...pick].filter((x) => !right.has(x)).length;
    const hits = [...pick].filter((x) => right.has(x)).length;
    if (wrongPicks === 0 && hits === right.size) return "correct";
    if (wrongPicks === 0 && hits > 0) return "partial";
    return "wrong";
  }
  if (p.mode === "classify") {
    if (nums.length !== p.statements.length) return "wrong";
    const ok = p.statements.filter((s, i) => nums[i] === s.group).length;
    if (ok === p.statements.length) return "correct";
    return ok / p.statements.length >= 0.6 ? "partial" : "wrong";
  }
  return "wrong";
}

/** 풀이 화면용 (정답·해설 제거) */
export function publicPayload(p: PracticePayload): Record<string, unknown> {
  if (p.mode === "choice" || p.mode === "multi") return { type: p.type, mode: p.mode, stem: p.stem, options: p.options, pickCount: p.mode === "multi" ? null : 1 };
  if (p.mode === "classify") return { type: p.type, mode: p.mode, stem: p.stem, groups: p.groups, statements: p.statements.map((s) => s.text) };
  return { type: p.type, mode: p.mode, hint: p.hint };
}
