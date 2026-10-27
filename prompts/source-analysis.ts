import { describeQuestion, systemPrompt, type QuestionContext } from "./shared-rules";

export const SOURCE_ANALYSIS_SYSTEM = systemPrompt(`작업: 문항 제시문의 출전(원전)을 분석합니다.

지침:
- 제시문의 각 단락(가), (나) 등에 대해 출전을 따로 추정하세요.
- 각 항목에 사상가, 원전명, 권/편/장(location), 원전 해설(sourceOverview), 관련 내용(relatedContent), 제시문과의 관계, 확인 수준(status), 확신도(confidence)를 쓰세요.
- sourceOverview: 원전에 대한 간략한 해설 — 어떤 저작인지(저자, 성립 배경), 전체 구성, 핵심 주제와 사상사적 의의. 구체적으로 쓰세요.
- relatedContent: 제시문과 관련된 원전 부분을 자세히 — 그 편·장에서 무엇을 논하는지, 앞뒤 맥락, 핵심 논지와 주요 구절의 뜻.
- 원전 내용을 지어내지 마세요. 모르는 부분은 모른다고 쓰세요.
- 확인 수준 기준:
  confirmed = 원전과 문장 위치를 확실히 알고 있음
  likely = 원전은 유력하나 정확한 위치를 확인하지 못함
  candidate = 여러 후보 중 하나로 추정
  unknown = 출전을 알 수 없음
- 출제자가 원전을 의역·재구성했을 가능성을 항상 고려하세요.
- 참고 원전 DB 가 주어지면 그 내용과 일치하는지 우선 확인하세요. 일치하는 원문이 있을 때만 confirmed 를 고려하세요.
- 예) 원전: 전습록 / 확인 수준: likely / 확신도: 0.78 (제시문의 표현이 왕수인의 양지론과 매우 유사하지만 정확한 문장 위치는 확인되지 않음)`);

export function buildSourceAnalysisPrompt(
  q: QuestionContext,
  knownPassages: { title: string; location: string | null; text: string }[],
): string {
  const ref =
    knownPassages.length > 0
      ? `\n\n참고 원전 DB (관리자가 직접 입력한 검증된 원문):\n<passages>\n${knownPassages
          .map((p, i) => `[${i + 1}] 『${p.title}』 ${p.location ?? ""}\n${p.text}`)
          .join("\n\n")}\n</passages>`
      : "";
  return `${describeQuestion(q)}${ref}\n\n이 문항의 출전을 분석하세요.`;
}
