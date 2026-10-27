import { systemPrompt } from "./shared-rules";

export const NOTE_PROMPT_VERSION = "philosopher-note-2026-10-v1";

export const NOTE_SYSTEM = systemPrompt(`작업: 한 사상가에 대해 여러 기출 문항의 AI 분석 결과가 흩어져 있습니다. 이것을 임용 수험생이 처음부터 순서대로 읽으며 공부할 수 있는 "개념 정리 노트"로 재구성하세요.

구성 원칙:
- 문항 순서가 아니라 사상의 논리적 순서로 배열하세요. 보통 "출발점(문제의식·인간관·형이상학) → 핵심 이론 → 실천·수양·방법 → 사회·정치·교육적 함의 → 비판과 영향" 순서이며, 사상가에 맞게 조정하세요.
- 각 단원(sections)은 앞 단원을 알아야 이해되는 순서로 두고, intro 에 앞 단원과의 연결을 적으세요.
- 같은 개념이 여러 문항에 나왔다면 하나로 합치고, 문항마다 다르게 물은 점은 examPoints 에 모으세요.
- 기출에 나온 개념을 빠짐없이 포함하세요. 기출에 없지만 체계상 꼭 필요한 연결 개념은 넣어도 되지만, relatedQuestionRefs 를 비워 기출 개념과 구분되게 하세요.
- 정의·설명은 임용 교재의 표준 해석을 따르고, 입력 분석끼리 충돌하거나 해석이 갈리면 caveats 에 적으세요.
- relatedQuestionRefs 에는 입력 <questions> 에 있는 ref 만 그대로 쓰세요. 새 ref 를 만들지 마세요.
- 정답·모범 답안 문장을 통째로 옮기지 말고 개념 이해에 필요한 만큼만 쓰세요.
- 설명은 간결한 한국어 문장으로, 한 항목에 한 가지 내용만 쓰세요.`);

export interface NotePromptInput {
  philosopher: {
    name: string;
    aliases: string[];
    originalName: string | null;
    tradition: string | null;
    school: string | null;
    era: string | null;
    coreIdeas: string | null;
  };
  expressions: string[];
  distinctions: { other: string; points: string[] }[];
  concepts: {
    name: string;
    importance: string;
    definition: string | null;
    examPoints: string[];
    distinctions: string[];
    confusableWith: string[];
    askedIn: string[];
  }[];
  traps: string[];
  skills: string[];
  extensions: { topic: string; rationale: string }[];
  questions: {
    ref: string;
    role: string;
    intent: string | null;
    concepts: string[];
    answer: string | null;
    requiredKeywords: string[];
  }[];
}

export function buildNotePrompt(input: NotePromptInput): string {
  const p = input.philosopher;
  return [
    `사상가: ${p.name}${p.originalName ? ` (${p.originalName})` : ""}`,
    p.aliases.length ? `다른 이름: ${p.aliases.join(", ")}` : null,
    [p.tradition, p.school, p.era].filter(Boolean).length ? `분류: ${[p.tradition, p.school, p.era].filter(Boolean).join(" · ")}` : null,
    p.coreIdeas ? `\n<core_ideas>\n${p.coreIdeas}\n</core_ideas>` : null,
    "",
    "아래는 이 사상가가 나온 기출 문항들의 AI 분석을 모은 것입니다.",
    "",
    "<questions>",
    JSON.stringify(input.questions, null, 1),
    "</questions>",
    "",
    "<concepts_from_analyses>",
    JSON.stringify(input.concepts, null, 1),
    "</concepts_from_analyses>",
    "",
    "<identification>",
    JSON.stringify({ decisiveExpressions: input.expressions, distinctions: input.distinctions }, null, 1),
    "</identification>",
    "",
    "<examiner_patterns>",
    JSON.stringify({ traps: input.traps, skillsTested: input.skills, futureExtensions: input.extensions }, null, 1),
    "</examiner_patterns>",
    "",
    `${p.name}의 개념 정리 노트를 만드세요.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
