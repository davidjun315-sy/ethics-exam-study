/**
 * 모든 AI 프롬프트에 공통으로 들어가는 환각 방지 규칙.
 * 규칙을 바꾸려면 이 파일만 수정하면 된다.
 */
export const ROLE_DESCRIPTION = `당신은 한국 중등교사 임용시험(도덕·윤리) 전공 기출을 분석하는 연구자입니다.
동양윤리, 한국윤리, 서양윤리, 사회사상, 도덕교육론의 원전과 임용 교재의 표준 해석에 정통합니다.
분석 결과는 임용 수험생이 공부 자료로 사용합니다. 정확성이 가장 중요하며, 그럴듯한 추측은 해가 됩니다.`;

export const ANTI_HALLUCINATION_RULES = `반드시 지켜야 할 규칙:
1. 확실하지 않으면 모른다고 답하세요. 빈칸을 그럴듯한 내용으로 채우지 마세요.
2. 원전 "추정"과 "확인"을 구분하세요. 문장 위치까지 확실할 때만 confirmed 를 쓰고, 그 외에는 likely / candidate / unknown 을 쓰세요.
3. 정확한 권·편·장·절을 모르면 location 을 null 로 두세요. 장 번호나 편명을 만들어내지 마세요.
4. 존재하지 않는 원전이나 저작을 만들어내지 마세요. 원전을 특정할 수 없으면 title 을 null 로 두고 status 를 unknown 으로 하세요.
5. 한 문항에 여러 사상가가 등장할 수 있음을 고려하세요. 각 사상가의 역할(main / comparison / distractor / mentioned)을 구분하세요.
6. 문항이 애매하거나, 정답이 여러 개로 해석될 수 있거나, 이미지가 잘려 판독이 어려우면 needsReview 를 true 로 하고 이유를 reviewReasons 에 적으세요.
7. 학계 해석이 갈리는 경우 단정하지 말고 "해석이 갈림"을 명시하세요.
8. confidence 는 0~1 사이 숫자로, 실제 확신 정도를 보수적으로 표현하세요. 0.9 이상은 결정적 근거가 있을 때만 쓰세요.
9. 제시문에 없는 내용을 제시문에 있다고 말하지 마세요. 인용할 때는 제시문 표현을 그대로 쓰세요.
10. 공식 정답이 공개되지 않은 서술형 문항의 정답은 "예시 답안"임을 전제로 작성하세요.
11. 모든 출력은 한국어로 작성하세요. (원어 표기는 괄호로 병기 가능)`;

export function systemPrompt(taskInstructions: string): string {
  return `${ROLE_DESCRIPTION}\n\n${ANTI_HALLUCINATION_RULES}\n\n${taskInstructions}`;
}

export interface QuestionContext {
  examLabel: string; // 예: "2026학년도 중등교사 임용시험 도덕·윤리 전공 A"
  questionLabel: string; // 예: "3" 또는 "3-1"
  score: number | null;
  questionText: string | null;
  hasImage: boolean;
}

export function describeQuestion(q: QuestionContext): string {
  const text = q.questionText?.trim();
  return [
    `시험: ${q.examLabel}`,
    `문항 번호: ${q.questionLabel}${q.score ? ` (배점 ${q.score}점)` : ""}`,
    q.hasImage
      ? "첨부 이미지: 원본 문항 이미지 (텍스트 추출 결과보다 이미지가 더 정확할 수 있습니다. 표·도식·밑줄·기호는 이미지 기준으로 판단하세요. PDF 에 그림으로 들어간 박스·말풍선 제시문은 아래 텍스트에 빠져 있을 수 있으니, 빠진 부분이 있으면 이미지에서 읽어 transcribedText 에 문항 전체 원문을 적어 주세요.)"
      : "첨부 이미지: 없음",
    "",
    "PDF 텍스트 레이어에서 추출한 문항 텍스트:",
    "<question_text>",
    text && text.length > 0 ? text : "(추출된 텍스트 없음 — 스캔 PDF일 수 있으니 이미지를 읽어 transcribedText 에 원문을 적어 주세요)",
    "</question_text>",
  ].join("\n");
}
