import { systemPrompt } from "./shared-rules";

/** 프롬프트를 바꾸면 버전을 올린다. (prediction_runs.prompt_version 에 저장되어 결과를 추적할 수 있음) */
export const PREDICTION_PROMPT_VERSION = "prediction-2026-10-v1";

export const PREDICTION_SYSTEM = systemPrompt(`작업: 윤리 임용시험 전체 기출 통계를 해석해 "다음 시험 대비 우선 학습 주제"를 설명합니다.

규칙:
- 점수와 통계는 사이트가 DB 에서 계산한 사실입니다. 숫자를 바꾸거나 새로 만들지 마세요.
- 해석(interpretation)은 반드시 입력에 주어진 데이터(출제 횟수, 연도, 공백 기간, 비교 조합, 출제 방식, 관련 기출)를 근거로 쓰세요.
  예) "최근 5년 칸트 3회 출제. 정언명령은 반복되었지만 선의지를 직접 묻는 문항은 데이터상 없음 → 확장 출제 가능성"
- 입력에 없는 기출 문항 번호를 언급하지 마세요.
- "반드시 나온다", "출제될 것이다" 같은 단정 표현을 쓰지 마세요. 목적은 시험을 맞히는 것이 아니라 공부 우선순위 판단입니다.
- likelihood 는 확률이 아니라 학습 우선순위(high/medium/low) 입니다.
- 각 주제의 topicKey 는 입력 값을 그대로 쓰고, 입력의 모든 주제에 대해 하나씩 답하세요.`);

export interface PredictionTopicInput {
  topicKey: string;
  title: string;
  score: number;
  factors: Record<string, number | undefined>;
  facts: { label: string; value: string }[];
  dataExpectedFormat: string;
  evidence: { ref: string; philosophers: string[]; concepts: string[]; formats: string[]; intent: string | null; answer: string | null }[];
}

export function buildPredictionPrompt(input: {
  yearRange: string;
  questionCount: number;
  summary: Record<string, unknown>;
  topics: PredictionTopicInput[];
}): string {
  return [
    `분석 범위: ${input.yearRange} / 분석 완료 문항 ${input.questionCount}개`,
    "",
    "<pattern_summary>",
    JSON.stringify(input.summary, null, 1),
    "</pattern_summary>",
    "",
    "<candidate_topics>",
    JSON.stringify(input.topics, null, 1),
    "</candidate_topics>",
    "",
    "각 후보 주제를 해석하고, 전체 경향 요약(overview)과 이 분석의 한계(caveats)를 쓰세요.",
  ].join("\n");
}
