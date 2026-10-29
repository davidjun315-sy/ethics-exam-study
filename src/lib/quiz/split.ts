/**
 * 기출 문항 → 퀴즈 세부 문제 분리. (순수 계산, AI 호출 없음)
 *
 * 문항별 AI 분석의 "요구 사항별 해설"(itemExplanations)만 쓴다. 요구 사항 하나 = 퀴즈 문제 하나.
 * 요구 사항별 해설이 없는 이전 형식 분석은 문제로 만들지 않는다 (재분석하면 들어온다).
 * 세부 발문은 원문의 <작성 방법> 조건 줄에서 해당 레이블(㉠ 등)이 들어 있는 줄을 그대로 가져온다.
 * 원문(question_text)은 바꾸지 않는다. 분리가 불분명하면 review_reasons 를 남겨 관리자 검수 대상으로 둔다.
 */
import type { AnalysisDetails } from "../types";
import { isShortAnswer, seedAcceptedAnswers } from "./grade.ts";

export interface SplitInput {
  questionId: string;
  questionLabel: string;
  questionText: string | null;
  questionType: string | null; // 기입형 / 서술형 …
  examYear: number;
  answer: string | null;
  difficulty: "상" | "중" | "하" | null;
  area: string | null;
  details: AnalysisDetails;
  philosophers: string[];
  concepts: string[];
}

export interface SplitItem {
  key: string;
  kind: "exam";
  label: string;
  format: "fill" | "essay";
  grading: "auto" | "self";
  prompt: string | null;
  answer: string;
  acceptedAnswers: string[];
  reviewReasons: string[];
  sourceHash: string;
  difficulty: 1 | 2 | 3;
  sortOrder: number;
}

const CIRCLED = /[㉠-㉻①-⑳ⓐ-ⓩ]/;

/** 문자열 지문 (변경 감지용) */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * 조건 목록의 <작성 방법> 머리글 위치. 발문에도 "<작성 방법>에 따라 서술하시오"처럼 같은 말이 나오므로
 * 마지막에 나오는 것을 조건 목록으로 본다.
 */
function lastHeader(text: string): { start: number; end: number } | null {
  const re = /<\s*작\s*성\s*방\s*법\s*>|【\s*작\s*성\s*방\s*법\s*】|\[\s*작\s*성\s*방\s*법\s*\]/g;
  let last: { start: number; end: number } | null = null;
  for (const m of text.matchAll(re)) last = { start: m.index!, end: m.index! + m[0].length };
  return last;
}

/** <작성 방법> 아래의 조건 줄들 (원문 그대로) */
export function requirementLines(text: string | null): string[] {
  if (!text) return [];
  const h = lastHeader(text);
  if (!h) return [];
  const lines: string[] = [];
  for (const raw of text.slice(h.end).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[○ㅇ◦•·∙▪■□\-–]/.test(line)) lines.push(line);
    else if (lines.length) lines[lines.length - 1] += ` ${line}`; // 줄바꿈으로 이어진 조건
  }
  return lines;
}

/** 요구 사항 레이블과 조건 줄을 맞춘다 */
function findPrompt(label: string, lines: string[], index: number, total: number): string | null {
  const l = label.trim();
  const circled = l.match(CIRCLED)?.[0];
  if (circled) {
    const hit = lines.find((x) => x.includes(circled));
    if (hit) return hit;
  }
  const paren = l.match(/\(([가-힣a-zA-Z0-9])\)/)?.[0];
  if (paren) {
    const hit = lines.find((x) => x.includes(paren));
    if (hit) return hit;
  }
  const num = l.match(/(?:작성\s*방법|조건)\s*(\d+)/)?.[1];
  if (num && lines[Number(num) - 1]) return lines[Number(num) - 1];
  // 레이블 없이 요구 사항 수와 조건 줄 수가 같으면 순서대로
  if (total > 1 && lines.length === total) return lines[index];
  return null;
}

const DESCRIPTIVE = /서술|설명|논하|밝힐|비판|제시하고|근거를|이유를/;

function decideFormat(questionType: string | null, prompt: string | null, answer: string): { format: "fill" | "essay"; grading: "auto" | "self" } {
  const short = isShortAnswer(answer);
  const fillType = /기입/.test(questionType ?? "");
  const asksDescription = prompt ? DESCRIPTIVE.test(prompt) : !fillType;
  if (short && (fillType || !asksDescription)) return { format: "fill", grading: "auto" };
  if (fillType && !short) return { format: "fill", grading: "self" }; // 기입형이지만 정답이 길거나 여러 표현 → 자기평가
  return { format: "essay", grading: "self" };
}

const normLabel = (s: string) => s.replace(/\s+/g, "") || "main";
const DIFF: Record<string, 1 | 2 | 3> = { 하: 1, 중: 2, 상: 3 };

export function splitQuestion(input: SplitInput): SplitItem[] {
  const d = input.details ?? {};
  const lines = requirementLines(input.questionText);
  const reqs = (d.itemExplanations ?? []).map((x) => ({ label: x.label, answer: x.answer }));
  const difficulty = DIFF[input.difficulty ?? "중"] ?? 2;
  if (reqs.length === 0) return [];

  // 1) 요구 사항마다 원문의 작성 방법 줄 찾기
  const seen = new Map<string, number>();
  const found = reqs.map((r, i) => {
    let label = r.label?.trim() || `${i + 1}`;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    const dup = n > 1;
    if (dup) label = `${label} (${n})`;
    return { label, answer: r.answer?.trim() ?? "", prompt: findPrompt(label, lines, i, reqs.length), dup };
  });

  // 2) 같은 작성 방법 줄을 가리키는 요구 사항은 한 문제로 (예: "㉢, ㉣의 의미를 순서대로 서술할 것")
  const groups: (typeof found)[] = [];
  for (const f of found) {
    const g = f.prompt ? groups.find((x) => x[0].prompt === f.prompt) : undefined;
    if (g) g.push(f);
    else groups.push([f]);
  }

  return groups.map((g, i) => {
    const reasons: string[] = [];
    const merged = g.length > 1;
    const label = g.map((x) => x.label).join(", ");
    const answer = merged ? g.map((x) => `${x.label} ${x.answer}`).join("\n") : g[0].answer;
    const prompt = g[0].prompt;
    if (g.some((x) => x.dup)) reasons.push("같은 레이블이 여러 번 나옵니다");
    if (g.some((x) => !x.answer)) reasons.push("정답이 없습니다");
    if (!prompt && found.length > 1) reasons.push("원문에서 이 요구 사항의 발문(작성 방법 조건)을 찾지 못했습니다");
    // 발문 안에 정답이 그대로 들어 있으면 문제를 풀 의미가 없다
    if (prompt && g.some((x) => x.answer.length >= 2 && prompt.replace(/\s/g, "").includes(x.answer.replace(/\s/g, "")))) reasons.push("발문에 정답이 드러날 수 있습니다");
    let { format, grading } = decideFormat(input.questionType, prompt, merged ? "" : answer);
    if (merged) {
      // 여러 칸을 한 번에 답하는 문제: 기입형이면 자기평가로 (칸별 자동 채점은 하지 않음)
      const allShort = g.every((x) => isShortAnswer(x.answer));
      format = allShort && !(prompt && DESCRIPTIVE.test(prompt)) ? "fill" : "essay";
      grading = "self";
    }
    if (!merged && format === "fill" && grading === "self") reasons.push("기입형이지만 정답이 길어 자기평가로 바꿨습니다");
    return {
      key: `q:${input.questionId}:${normLabel(label)}`,
      kind: "exam" as const,
      label,
      format,
      grading,
      prompt,
      answer,
      acceptedAnswers: grading === "auto" ? seedAcceptedAnswers(answer) : [],
      reviewReasons: reasons,
      sourceHash: hashText([label, answer, prompt ?? "", input.questionText ?? ""].join("|")),
      difficulty,
      sortOrder: i,
    };
  });
}

/**
 * 퀴즈 화면용 원문: 발문·제시문은 그대로 두고 <작성 방법> 아래에는 이 문제의 조건 줄만 남긴다.
 * (다른 요구 사항이 함께 보이면 한 화면에 여러 문제가 나오는 셈이므로)
 */
export function focusRequirement(text: string | null, prompt: string | null): string | null {
  if (!text || !prompt) return text;
  const h = lastHeader(text);
  if (!h) return text;
  return `${text.slice(0, h.end).trimEnd()}\n\n${prompt}`;
}

export interface ExpectedSource {
  topic: string;
  philosopher?: string;
  concept?: string;
  conceptSummary?: string;
  expectedQuestion?: string;
  expectedAnswer?: string;
  importance?: string;
}

export interface ExpectedItem {
  key: string;
  kind: "expected";
  label: string;
  format: "fill" | "essay";
  grading: "auto" | "self";
  passage: string;
  answer: string;
  modelAnswer: string;
  explanation: string;
  acceptedAnswers: string[];
  reviewReasons: string[];
  sourceHash: string;
  dedupeKey: string;
}

/** 중복 검사용 키: 문제 본문 앞부분 (공백·기호 제거) */
export function dedupeKey(text: string): string {
  return text.replace(/[\s"'“”‘’()（）<>〈〉.,·:;?!○ㅇ\-–—_]/g, "").slice(0, 80);
}

/** 기출 분석의 "향후 출제 — 예상 문제"를 퀴즈 문제로 (문제·답이 모두 있을 때만) */
export function expectedFromAnalysis(questionId: string, ext: ExpectedSource): ExpectedItem | null {
  const q = ext.expectedQuestion?.trim();
  const a = ext.expectedAnswer?.trim();
  if (!q || !a) return null; // 원문·정답이 없는 이전 형식은 출제하지 않는다
  const hash = hashText(`${ext.topic}|${q.slice(0, 120)}`);
  const short = isShortAnswer(a);
  return {
    key: `x:${questionId}:${hash}`,
    kind: "expected",
    label: [ext.philosopher, ext.concept].filter(Boolean).join(" · ") || ext.topic,
    format: short ? "fill" : "essay",
    grading: short ? "auto" : "self",
    passage: q,
    answer: a,
    modelAnswer: a,
    explanation: ext.conceptSummary?.trim() ?? "",
    acceptedAnswers: short ? seedAcceptedAnswers(a) : [],
    reviewReasons: [],
    sourceHash: hashText(`${q}|${a}|${ext.conceptSummary ?? ""}`),
    dedupeKey: dedupeKey(q),
  };
}
