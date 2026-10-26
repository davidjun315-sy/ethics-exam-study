import { describeQuestion, systemPrompt, type QuestionContext } from "./shared-rules";

/** 출제자의 의도 / 문제풀이 개념정리 / 이 문항에서 확장될 수 있는 출제 */
export const DEEP_ANALYSIS_GUIDE = `심화 분석 지침:
[examinerIntent — 출제자의 의도]
- 문제 내용을 요약하지 말고 "출제자가 왜 이 문제를 냈는가"를 쓰세요.
- 확인하려는 핵심 능력이 무엇인지, 단순 암기인지, 사상가 구별 능력인지, 원전 이해인지, 개념의 정확한 의미를 묻는지,
  두 사상을 비교하게 하는지, 제시문에서 특정 표현을 찾아내게 하는지 판단해 formats 에 고르세요.
- 답안에서 정확하게 써야 하는 개념어(requiredTerms)와, 수험생이 빠지도록 노린 오개념(trapPoints)을 쓰세요.
- evidence 에는 판단의 근거가 된 발문 구조, 제시문 표현(그대로 인용), <작성 방법> 조건을 쓰세요. 근거 없는 추측은 쓰지 마세요.
  예) "왕수인의 양지 개념 자체를 암기했는지를 묻기보다는, 주희의 격물치지와 왕수인의 치양지를 구별할 수 있는지를 평가하려는 문항이다."
[studyConcepts — 이 문제를 풀기 위해 알아야 하는 개념]
- 사전식 정의가 아니라 이 문제를 실제로 풀 수 있는 수준으로 정리하세요. 이것만 읽어도 이 문제의 핵심 이론을 복습할 수 있어야 합니다.
- importance: required(반드시 알아야 함) / supporting(알면 더 정확히 이해) / comparison(다른 사상가와 혼동하기 쉬워 함께 비교).
- 각 개념마다 정의, 시험 포인트, 이 문제와의 연결, 자주 혼동하는 개념, 구별법을 쓰세요.
[futureExtensions — 이 문항에서 확장될 수 있는 출제]
- 다음 시험 전체를 예측하지 마세요. "이 문항의 사상가·개념이 앞으로 어떤 방식으로 변형·확장 출제될 수 있는가"만 쓰세요.
  예) 왕수인-양지 문항 → 주희 격물치지와 비교 / 지행합일과 연결 / 사욕 제거와 양지 실현 관계 / 『전습록』 원전 제시 / 이황·이이 심성론과 차이
- 3~6개. 각 항목에 예상 주제, 출제 방식, 근거(이 문항의 어떤 요소에서 확장되는지), 관련 개념·사상가·원전, 가능성, 학습 중요도를 쓰세요.
- 존재하지 않는 원전이나 기출을 만들어내지 마세요. 관련 기존 기출은 사이트가 DB 에서 직접 찾아 연결하므로 쓰지 않아도 됩니다.`;

export const QUESTION_ANALYSIS_SYSTEM = systemPrompt(`작업: 기출 문항 하나를 분석해 지정된 JSON 스키마로 출력합니다.

분석 지침:
- 사상가 판별이 가장 중요합니다. 사상가 이름만 쓰지 말고, 제시문 속 "결정적 표현"(decisiveExpressions)을 그대로 인용하고,
  혼동하기 쉬운 유사 사상가와의 "구별 포인트"(similarPhilosophers[].distinguishingPoint)를 구체적으로 쓰세요.
  예) 왕수인 — 결정적 표현: "마음 밖에 이치가 없다", "양지를 보존한다" / 유사 사상가: 주희 — 주희는 격물궁리로 사물의 이치를 탐구하지만 왕수인은 마음의 양지를 강조한다.
- 제시문이 (가), (나) 등으로 나뉘면 각각의 사상가를 따로 판별하세요. 사상가를 특정할 수 없으면 confidence 를 낮게 두고 needsReview 를 true 로 하세요.
- 개념(concepts)은 문항 풀이에 실제로 필요한 핵심 개념만, 표준 용어로 쓰세요. (예: 심즉리, 양지, 치양지, 지행합일)
- 원전(sources)은 제시문의 출전을 추정합니다. 원전을 모르면 빈 배열이 아니라 status=unknown 항목 하나로 "모른다"는 사실을 남기세요.
- 정답(answer)은 기입형이면 정답 어구를, 서술형이면 각 요구 사항에 대한 답을 요약하세요. 하위 문항(①, ②, (1), (2) 등)이 있으면 subAnswers 에 나누어 쓰세요.
- 모범답안(modelAnswer)은 실제 임용 답안지에 쓰듯 간결한 문장으로 작성하세요.
- requiredKeywords 는 채점자가 찾을 핵심 키워드, scoringPoints 는 채점 기준 형식으로 쓰세요.
- difficulty 는 임용 수험생 기준 상/중/하 입니다.
- confidence.overall 은 전체 분석에 대한 확신도입니다.

${DEEP_ANALYSIS_GUIDE}`);

export function buildQuestionAnalysisPrompt(q: QuestionContext): string {
  return `${describeQuestion(q)}\n\n위 문항을 분석하세요.`;
}

/** 부분 재분석 (비용 절감). 기존 분석을 참고 정보로 함께 제공한다. */
export const PARTIAL_INSTRUCTIONS = {
  answer: "정답과 답안 관련 항목(정답, 하위 문항 정답, 정답 근거, 모범답안, 필수 키워드, 채점 포인트)만 다시 분석하세요.",
  philosophers:
    "사상가 판별과 개념 연결만 다시 분석하세요. 사상가별 결정적 표현, 유사 사상가와 구별 포인트를 특히 꼼꼼하게 쓰세요.",
  explanation: "문제 의도, 핵심 단서, 제시문 분석, 풀이 과정, 해설, 오답 분석 항목만 다시 작성하세요.",
  deep: "심화 분석 항목(출제자의 의도 examinerIntent, 문제풀이 개념정리 studyConcepts, 이 문항에서 확장될 수 있는 출제 futureExtensions)만 작성하세요.",
} as const;

export function buildPartialPrompt(
  q: QuestionContext,
  scope: keyof typeof PARTIAL_INSTRUCTIONS,
  existingSummary: string | null,
): string {
  return [
    describeQuestion(q),
    "",
    existingSummary
      ? `참고: 기존 분석 요약 (틀렸을 수 있으므로 그대로 믿지 말고 검증하세요)\n<existing_analysis>\n${existingSummary}\n</existing_analysis>`
      : "",
    "",
    PARTIAL_INSTRUCTIONS[scope],
  ].join("\n");
}
