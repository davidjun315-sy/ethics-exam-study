import { buildQuestionAnalysisPrompt, QUESTION_ANALYSIS_SYSTEM } from "./question-analysis";
import type { QuestionContext } from "./shared-rules";

/**
 * 채팅 AI(Claude / ChatGPT / Gemini 채팅 화면)에 붙여넣는 "셀프 분석" 프롬프트.
 * API 분석과 같은 규칙과 같은 JSON 양식을 쓰므로 결과를 그대로 사이트에 저장할 수 있다.
 */
export function buildManualAnalysisPrompt(q: QuestionContext, jsonSchema: unknown, imageUrl: string | null): string {
  return [
    "아래 지시에 따라 임용시험 기출 문항 하나를 분석해 주세요.",
    "",
    "<instructions>",
    QUESTION_ANALYSIS_SYSTEM,
    "</instructions>",
    "",
    buildQuestionAnalysisPrompt(q),
    "",
    imageUrl
      ? `원본 문항 이미지: ${imageUrl}\n(이미지를 함께 첨부했다면 이미지를 기준으로 판단하세요. 링크를 열 수 없으면 위 텍스트로 분석하세요.)`
      : "",
    "",
    "출력 형식:",
    "- 설명 없이 아래 JSON Schema 를 만족하는 JSON 객체 하나만 출력하세요.",
    "- ```json 코드 블록 하나로 감싸 주세요.",
    "- 모든 키를 빠짐없이 포함하세요. 해당 없는 배열은 [], 모르는 값은 null 로 두세요.",
    "- confidence 값은 0~1 사이 숫자로 쓰세요.",
    "",
    "<json_schema>",
    JSON.stringify(jsonSchema),
    "</json_schema>",
  ].join("\n");
}
