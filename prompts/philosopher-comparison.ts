import { systemPrompt } from "./shared-rules";

export const PHILOSOPHER_COMPARISON_SYSTEM = systemPrompt(`작업: 두 사상가를 임용시험 대비 관점에서 비교합니다.

지침:
- aspects 는 반드시 다음 순서로 작성하세요: 인간관, 본성론, 도덕 원리, 수양론, 정치관. 해당 사상가에게 적용하기 어려운 항목은 "해당 없음 또는 직접적 논의 없음"이라고 쓰세요.
- distinguishingExpressions 에는 임용 제시문에서 두 사상가를 구별하게 해 주는 대표 표현을 쓰고, 어느 쪽(A/B) 표현인지 표시하세요.
- 대표 원전(sourcesA, sourcesB)은 실제로 존재하는 저작만 쓰세요.
- 해석이 갈리는 부분은 caveats 에 적으세요.`);

export function buildComparisonPrompt(
  a: { name: string; school: string | null },
  b: { name: string; school: string | null },
  relatedQuestionSummaries: string[],
): string {
  const related =
    relatedQuestionSummaries.length > 0
      ? `\n\n두 사상가가 함께 등장한 기출 (참고):\n${relatedQuestionSummaries.map((s) => `- ${s}`).join("\n")}`
      : "";
  return `사상가 A: ${a.name}${a.school ? ` (${a.school})` : ""}\n사상가 B: ${b.name}${
    b.school ? ` (${b.school})` : ""
  }${related}\n\n두 사상가를 비교하세요.`;
}
