import { describeQuestion, systemPrompt, type QuestionContext } from "./shared-rules";

/**
 * 문항 분석 작성 지침 (화면 순서: 답안 → 출제 의도 → 원문 해설 → 개념 정리 → 원전 → 향후 출제).
 * 자세히 쓸 곳(★)과 짧게 쓸 곳을 구분해, 수험생에게 필요한 내용만 정확하게 담게 한다.
 */
export const DEEP_ANALYSIS_GUIDE = `작성 원칙:
- 필요한 내용만 정확하게 쓰세요. 같은 내용을 여러 항목에 반복하지 말고, 일반론이나 군더더기 문장(“~가 중요하다”, “~를 잘 알아야 한다”)은 쓰지 마세요.
- ★ 표시 항목은 이 분석의 핵심입니다. 분량을 아끼지 말고 구체적으로 쓰세요. 나머지 항목은 짧게 쓰세요.
- 설명할 때는 제시문 원문 표현을 “ ”로 그대로 인용해 근거로 삼으세요.

[① 답안]
- modelAnswer: 임용 답안지에 그대로 옮겨 쓸 수 있는 모범답안. 모든 요구 사항(빈칸, 하위 문항, <작성 방법>의 각 조건)을 빠짐없이 완결된 문장으로.
- ★ itemExplanations: 요구 사항마다 하나씩, 문항에 나온 순서대로.
  · sourcePart: 정답의 근거가 되는 제시문 부분의 위치(예: (가) 둘째 문장, 학생 B의 말)와 그 원문 인용.
  · explanation: 왜 이것이 정답인지 자세히. 인용한 원문 표현을 하나씩 짚으며, 그것이 사상가의 어떤 이론에서 나온 내용인지,
    원전의 어느 부분(편·장을 알면 함께)에 해당하는지 연결하세요. 다른 답이 될 수 없는 이유도 쓰세요. 여러 문단으로 써도 됩니다.
- explanation: 문항 전체 해설. 요구 사항들이 서로 어떻게 연결되는지만 짧게 (요구 사항별 해설과 중복 금지).
- 오답 분석: confusablePhilosophers / confusableConcepts 는 이 문항에서 실제로 혼동될 만한 것만, 왜 혼동되고 어떻게 구별하는지.
  commonMistakes 는 수험생이 쓰기 쉬운 틀린 답과 그것이 틀린 이유를 한 항목에 함께.
- answer(정답 한 줄 요약), requiredKeywords(채점 키워드)는 내부 채점용이므로 짧게.

[② 출제 의도]
- ★ examinerIntent.summary: 이 문제가 출제된 이유. 출제자가 왜 이 사상가·개념·제시문을 골랐는지, 문항 전체로 무엇을 확인하려 했는지를
  문제 구조와 제시문을 근거로 구체적으로 쓰세요. 문제 내용을 요약하지 마세요.
  예) "왕수인의 양지 개념 자체의 암기보다, 주희의 격물치지와 왕수인의 치양지를 구별할 수 있는지를 보려는 문항이다."
- ★ itemIntents: 요구 사항(빈칸·하위 문항·작성 방법 조건)마다 어떤 의도로 냈는지.
- skillsTested 는 짧은 어구로, formats 는 해당하는 문제 유형을 모두.

[③ 원문 해설]
- ★ passageCommentary: 제시문을 앞에서부터 의미 단위로 나눠((가)/(나), 문단, 대화의 각 발언, <작성 방법> 등) 부분마다
  원문(quote)과 풀이(commentary)를 쓰세요. 풀이에는 어려운 용어의 뜻, 문장이 말하는 내용, 사상 안에서의 의미를
  처음 공부하는 사람도 이해할 수 있게 자세히 풀어 쓰세요. 빈칸(㉠ 등)이 있는 부분은 빈칸에 들어갈 말과 연결해 설명하세요.

[④ 개념 정리 — 키워드 구조도 → 개념별 설명]
- ★ conceptMap: 사상가마다 하나. 이 문항에서 출제된 핵심 개념을 focus(중심)에 두고, 그 사상가의 관련 개념 3~7개를 branches 로
  사상 체계의 흐름 순서대로 연결하세요. relation 은 중심 개념과의 관계(근거, 전제, 실현 방법, 결과, 대비 등)를 2~6자로,
  gist 는 15자 안팎의 어구로 쓰세요. 문장으로 쓰지 마세요. 이 문항에 직접 나온 개념은 inQuestion=true.
- ★ studyConcepts: 구조도에 나온 개념마다 하나씩, 중심 개념 → 관련 개념 순서로. 너무 짧거나 길지 않게:
  정의 1~2문장, 시험 포인트 1문장, 이 문제와의 연결 1문장, 구별법 1문장. 개념명은 구조도와 똑같이 쓰세요.
- 사상가 판별(philosophers)은 아래 분석 지침을 따르세요.

[⑤ 원전]
- ★ sourceOverview: 원전에 대한 간략한 해설 — 어떤 저작인지(저자, 성립 배경), 전체 구성, 핵심 주제와 사상사적 의의.
- ★ relatedContent: 제시문과 관련된 원전 부분을 자세히 — 그 편·장에서 무엇을 논하는지, 앞뒤 맥락, 핵심 논지와 주요 구절의 뜻.
- 원전·위치가 불확실하면 status 를 낮추고 location 을 null 로 두세요. 원전 내용을 지어내지 마세요.

[⑥ 향후 출제]
- ★ futureExtensions 2~3개. 막연한 주제가 아니라 "사상가의 구체적인 개념"(예: 왕수인 - 지행합일)을 정하고,
  · conceptSummary: 그 개념의 핵심 내용과 이 문항에서 왜 그 개념으로 확장될 수 있는지.
  · expectedQuestion: 실제 임용 형식의 예상 문제 전문 — 원전 내용을 바탕으로 재구성한 제시문, 발문, <작성 방법> 조건, 배점.
    기존 기출 문장을 그대로 베끼지 마세요.
  · expectedAnswer: 그 예상 문제의 모범답안 (완결된 문장).
- 존재하지 않는 원전이나 기출을 만들어내지 마세요. 관련 기존 기출은 사이트가 DB 에서 직접 찾아 연결합니다.`;

export const QUESTION_ANALYSIS_SYSTEM = systemPrompt(`작업: 기출 문항 하나를 분석해 지정된 JSON 스키마로 출력합니다.

분석 지침:
- 사상가 판별이 가장 중요합니다. 사상가 이름만 쓰지 말고, 제시문 속 "결정적 표현"(decisiveExpressions)을 그대로 인용하고,
  혼동하기 쉬운 유사 사상가와의 "구별 포인트"(similarPhilosophers[].distinguishingPoint)를 구체적으로 쓰세요.
- 제시문이 (가), (나) 등으로 나뉘면 각각의 사상가를 따로 판별하세요. 사상가를 특정할 수 없으면 confidence 를 낮게 두고 needsReview 를 true 로 하세요.
- 개념(concepts)은 문항 풀이에 실제로 필요한 핵심 개념만, 표준 용어로 쓰세요. (예: 심즉리, 양지, 치양지, 지행합일)
- 원전(sources)은 제시문의 출전을 추정합니다. 원전을 모르면 빈 배열이 아니라 status=unknown 항목 하나로 "모른다"는 사실을 남기세요.
- difficulty 는 임용 수험생 기준 상/중/하 입니다. confidence.overall 은 전체 분석에 대한 확신도입니다.

${DEEP_ANALYSIS_GUIDE}`);

export function buildQuestionAnalysisPrompt(q: QuestionContext): string {
  return `${describeQuestion(q)}\n\n위 문항을 분석하세요.`;
}

/** 부분 재분석 (비용 절감). 기존 분석을 참고 정보로 함께 제공한다. */
export const PARTIAL_INSTRUCTIONS = {
  answer: "① 답안 항목(모범답안, 요구 사항별 해설, 전체 해설, 정답 요약, 채점 키워드)만 다시 작성하세요. 요구 사항별 해설은 원문을 인용하며 자세히 쓰세요.",
  philosophers:
    "사상가 판별과 개념 연결만 다시 분석하세요. 사상가별 결정적 표현, 유사 사상가와 구별 포인트를 특히 꼼꼼하게 쓰세요.",
  explanation: "③ 원문 해설(passageCommentary)과 오답 분석(혼동 사상가·혼동 개념·자주 하는 실수)만 다시 작성하세요.",
  deep: "② 출제 의도(examinerIntent), ④ 개념 정리(conceptMap 키워드 구조도 + studyConcepts 개념별 설명), ⑥ 향후 출제(futureExtensions — 구체적 개념, 예상 문제, 예상 답안)만 작성하세요.",
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
