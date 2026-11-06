/**
 * 연습문제 ② 원문 해석 · ⑤ 채점 요소 고르기 — 채팅 AI(붙여넣기)로 만든다.
 * 규칙으로 만들기 어려운 '그럴듯한 오답 해석'과 '서술형 채점 요소'만 AI 에 맡기고,
 * 프롬프트에는 그 기출의 저장된 분석만 넣는다 (새 지식을 만들지 않게). 결과는 '승인 대기'로 저장한다.
 */
import { z } from "zod";
import type { AnalysisDetails } from "../types";
import { hashText } from "./split.ts";
import type { ChoicePayload, MultiPayload } from "./practice.ts";

const Opt = z.string().min(2).max(200);

export const PracticeAiSchema = z.object({
  interpret: z
    .array(
      z.object({
        passagePart: z.string().describe("해석을 묻는 제시문 부분 (원문 해설의 구분 이름)"),
        stem: z.string().min(5).describe("발문 (예: (가)의 ‘마음 밖에 이치가 없다’에 대한 해석으로 가장 적절한 것은?)"),
        options: z.array(Opt).min(4).max(5),
        answer: z.number().int().min(0).describe("정답 보기 번호 (0부터)"),
        notes: z.array(z.string()).describe("보기별 해설: 정답 근거 / 오답이면 어느 사상가·어떤 실수의 해석인지"),
        explanation: z.string().describe("정답 해설 (원문 해설·요구 사항별 해설 근거)"),
      }),
    )
    .max(4),
  elements: z
    .array(
      z.object({
        requirement: z.string().describe("서술형 요구 사항 레이블 (요구 사항별 해설의 label 그대로)"),
        stem: z.string().min(5),
        options: z.array(Opt).min(4).max(6),
        answers: z.array(z.number().int().min(0)).min(1).describe("반드시 들어가야 할 채점 요소 보기 번호들 (0부터)"),
        notes: z.array(z.string()),
        explanation: z.string(),
      }),
    )
    .max(4),
});
export type PracticeAi = z.infer<typeof PracticeAiSchema>;

export interface PracticeAiContext {
  ref: string;
  questionText: string | null;
  details: AnalysisDetails;
  commonMistakes: string[];
}

const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

export function buildPracticeAiPrompt(c: PracticeAiContext): string {
  const d = c.details ?? {};
  const items = (d.itemExplanations ?? []).map((x) => `### ${x.label}\n정답: ${x.answer}\n근거: ${x.sourcePart}\n해설: ${x.explanation}`).join("\n\n");
  const passage = (d.passageCommentary ?? []).map((p) => `### ${p.part}\n원문: ${p.quote}\n해설: ${p.commentary}`).join("\n\n");
  const concepts = (d.studyConcepts ?? []).map((x) => `- ${x.name}${x.philosopher ? ` (${x.philosopher})` : ""}: ${x.definition}${x.distinction ? ` / 구별: ${x.distinction}` : ""}`).join("\n");
  const confPh = (d.confusablePhilosophers ?? []).map((x) => `${x.name}: ${x.reason}`);
  const confCo = (d.confusableConcepts ?? []).map((x) => `${x.name}: ${x.reason}`);
  return `당신은 도덕·윤리 기출 학습용 '연습문제'를 만드는 출제 위원입니다.
아래는 ${c.ref} 기출의 원문과 이미 검토된 분석입니다. **이 자료 안의 내용만** 써서 연습문제를 만드세요. 자료에 없는 사실·인용·해석을 새로 만들지 마세요.

목표 난이도: 기본 개념 암기보다 어렵고, 실제 서술형보다 쉬운 중간 단계. 실제 기출의 정답 개념과 채점 요소만 다룹니다.

## 만들 문제
1. interpret (원문 해석, 2~3개): 제시문의 핵심 구절을 하나 골라 "이 구절의 해석으로 가장 적절한 것은?"을 묻는 4~5지선다.
   - 정답: 원문 해설·요구 사항별 해설로 뒷받침되는 해석
   - 오답: '혼동 사상가'의 실제 입장으로 읽은 해석, '혼동 개념', '자주 하는 실수'에서 만든 그럴듯하지만 틀린 해석. 엉뚱한 보기 금지
   - stem 에 해석할 원문 구절을 따옴표로 인용
2. elements (채점 요소 고르기, 서술형 요구 사항마다 1개, 없으면 빈 배열): "「요구 사항」을 서술할 때 반드시 들어가야 할 요소를 모두 고르시오"
   - 정답 요소 2~3개: 모범답안·요구 사항별 해설의 핵심 요소
   - 오답 요소 2~3개: 다른 사상가의 그럴듯한 요소, 자주 하는 실수, 조건 위반(예: 지정 용어를 쓰지 않음)
   - requirement 에는 요구 사항별 해설의 레이블을 그대로
3. notes: 보기 수와 같은 길이. 정답 보기는 근거, 오답 보기는 "누구의 입장/어떤 실수인지"
4. 보기는 한 문장, 120자 이내, 정답이 길이·말투로 티 나지 않게. 정답 위치를 섞을 것

## 출력 (JSON 만, 코드 블록 하나)
\`\`\`json
{"interpret":[{"passagePart":"","stem":"","options":["","","",""],"answer":0,"notes":["","","",""],"explanation":""}],
 "elements":[{"requirement":"","stem":"","options":["","","","",""],"answers":[0,2],"notes":["","","","",""],"explanation":""}]}
\`\`\`

---
## 문제 원문
${c.questionText ?? "(원문 없음)"}

## 요구 사항별 해설
${items || "(없음)"}

## 모범답안
${d.modelAnswer ?? "(없음)"}

## 원문 해설
${passage || "(없음)"}

## 개념 정리
${concepts || "(없음)"}

## 오답 분석
혼동 사상가
${list(confPh) || "(없음)"}
혼동 개념
${list(confCo) || "(없음)"}
자주 하는 실수
${list(c.commonMistakes) || "(없음)"}
`;
}

export interface AiPracticeItem {
  key: string;
  label: string;
  format: "choice" | "multi";
  payload: ChoicePayload | MultiPayload;
  sourceHash: string;
}

/** 붙여넣은 결과 검증 → 저장할 연습문제. 형식이 어긋난 문제는 이유와 함께 뺀다 */
export function toAiPracticeItems(questionId: string, ai: PracticeAi): { items: AiPracticeItem[]; skipped: string[] } {
  const items: AiPracticeItem[] = [];
  const skipped: string[] = [];
  const fixNotes = (notes: string[], n: number) => Array.from({ length: n }, (_, i) => (notes[i]?.trim() ? notes[i].trim() : null));
  const uniq = (xs: string[]) => new Set(xs.map((x) => x.replace(/\s+/g, ""))).size === xs.length;
  ai.interpret.forEach((x, i) => {
    if (x.answer >= x.options.length) return skipped.push(`원문 해석 ${i + 1}: 정답 번호가 보기 범위를 벗어남`);
    if (!uniq(x.options)) return skipped.push(`원문 해석 ${i + 1}: 같은 보기가 있음`);
    const payload: ChoicePayload = {
      type: "interpret",
      mode: "choice",
      stem: x.stem.trim(),
      options: x.options.map((o) => o.trim()),
      answer: x.answer,
      notes: fixNotes(x.notes, x.options.length),
      explanation: x.explanation.trim(),
      grounds: `원문 해설 ${x.passagePart} · 혼동 사상가·자주 하는 실수 (채팅 AI 제작, 관리자 검수)`,
    };
    items.push({ key: `d:${questionId}:ai:interpret:${i + 1}`, label: `${x.passagePart} · 원문 해석`, format: "choice", payload, sourceHash: hashText(JSON.stringify(payload)) });
  });
  ai.elements.forEach((x, i) => {
    const answers = [...new Set(x.answers)].sort((a, b) => a - b);
    if (answers.some((a) => a >= x.options.length)) return skipped.push(`채점 요소 ${i + 1}: 정답 번호가 보기 범위를 벗어남`);
    if (answers.length >= x.options.length) return skipped.push(`채점 요소 ${i + 1}: 모든 보기가 정답임 (오답 요소 필요)`);
    if (!uniq(x.options)) return skipped.push(`채점 요소 ${i + 1}: 같은 보기가 있음`);
    const payload: MultiPayload = {
      type: "elements",
      mode: "multi",
      stem: x.stem.trim(),
      options: x.options.map((o) => o.trim()),
      answers,
      notes: fixNotes(x.notes, x.options.length),
      explanation: x.explanation.trim(),
      grounds: `요구 사항별 해설 ${x.requirement} · 모범답안 (채팅 AI 제작, 관리자 검수)`,
    };
    items.push({ key: `d:${questionId}:ai:elements:${i + 1}`, label: `${x.requirement} · 채점 요소`, format: "multi", payload, sourceHash: hashText(JSON.stringify(payload)) });
  });
  return { items, skipped };
}
