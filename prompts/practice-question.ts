import { systemPrompt } from "./shared-rules";

export const PRACTICE_PROMPT_VERSION = "practice-2026-10-v1";

export const PRACTICE_SYSTEM = systemPrompt(`작업: 출제 경향을 바탕으로 윤리 임용시험 형식의 새 연습문제를 만듭니다.

규칙:
- 기존 기출의 제시문·발문 문장을 그대로 복제하지 마세요. 출제 경향(주제, 출제 방식, 개념 조합)만 반영해 새로 구성하세요.
- 원전 문장을 직접 인용한다고 표시하지 마세요. 원전 내용을 바탕으로 재구성했다면 passageNote 에 그렇게 밝히세요.
- 실제 임용 형식(기입형 2점 또는 서술형 4점, <작성 방법> 조건)을 따르세요.
- relatedQuestionRefs 는 입력에 주어진 관련 기출 ref 중에서만 고르세요.
- 해석이 갈리는 내용을 정답으로 단정하지 마세요.`);

export function buildPracticePrompt(input: {
  title: string;
  expectedFormat: string;
  studyConcepts: string[];
  facts: { label: string; value: string }[];
  evidence: { ref: string; philosophers: string[]; concepts: string[]; formats: string[]; intent: string | null; answer: string | null }[];
}): string {
  return [
    `주제: ${input.title}`,
    `예상 출제 방식: ${input.expectedFormat}`,
    `함께 공부할 개념: ${input.studyConcepts.join(", ")}`,
    "",
    "<data_facts>",
    input.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n"),
    "</data_facts>",
    "",
    "<related_questions>",
    JSON.stringify(input.evidence, null, 1),
    "</related_questions>",
    "",
    "이 주제로 새 연습문제 1개를 만드세요.",
  ].join("\n");
}
