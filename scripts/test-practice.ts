/** 기출 기반 연습문제 생성 · 채점 점검.  npm run test:practice */
import { buildPracticeAiPrompt, PracticeAiSchema, toAiPracticeItems } from "../src/lib/quiz/practice-ai.ts";
import { validatePasted } from "../src/lib/ai/lenient.ts";
import { buildMission, type Candidate } from "../src/lib/quiz/mission.ts";
import { inScope } from "../src/lib/quiz/srs.ts";
import { blankMark, buildPracticeItems, chosung, gradePractice, maskName, publicPayload, sameTerm, splitMistake, type ChoicePayload, type ClassifyPayload, type MultiPayload } from "../src/lib/quiz/practice.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};

// 2026 B 8번(주희) 분석을 줄인 예시
const src = {
  questionId: "q-2026-b8",
  questionText: "○ 이(理)는 오로지 ( ㉠ )일 뿐이다. 도리는 모두 같은데, 그 ( ㉡ )이/가 같지 않기에 …\n○ ㉢격물은 … ㉣치지는 …\n<작성 방법>\n○ 괄호 안의 ㉠, ㉡에 해당하는 용어를 순서대로 쓸 것.",
  needsReview: false,
  commonMistakes: [
    "㉠에 ‘태극’을 씀 — 뜻은 통하나 이일분수의 짝으로는 ‘하나’가 정확하다.",
    "㉡에 ‘기(氣)’를 씀 — 차이의 원인을 기로 볼 수는 있지만, 제시문의 빈칸은 이일분수의 ‘분’이다.",
    "㉢·㉣을 ‘격물이 먼저이고 치지가 나중인 별개의 단계’로 씀 — 주희는 하나의 일의 두 측면으로 본다.",
  ],
  details: {
    itemExplanations: [
      { label: "㉠", answer: "하나(一)", sourcePart: "첫째 제시문: “이(理)는 오로지 ( ㉠ )일 뿐이다.” / 둘째 제시문: “천지의 이(理)는 ( ㉠ )일 뿐이다.”", explanation: "주희의 이일분수에서 ‘이일’, 곧 이는 하나라는 명제이다." },
      { label: "㉡", answer: "분(分)", sourcePart: "첫째 제시문: “도리는 모두 같은데, 그 ( ㉡ )이/가 같지 않기에 임금과 신하에게는 임금과 신하의 이(理)가 있다.”", explanation: "‘분수(分殊)’의 ‘분’이다." },
      { label: "작성 방법 2 (㉢과 ㉣의 관계)", answer: "격물과 치지는 하나의 일을 두 측면에서 말한 것으로, 격물은 과정이고 치지는 그 결과이다.", sourcePart: "셋째 제시문: “㉢ 격물(格物)은 단지 하나의 사물에서 한 사물의 이(理)를 남김없이 궁구하는 것이다.”", explanation: "주희는 격물과 치지를 하나의 일로 본다." },
    ],
    passageCommentary: [
      { part: "첫째 제시문", quote: "이(理)는 오로지 ( ㉠ )일 뿐이다. 도리는 모두 같은데, 그 ( ㉡ )이/가 같지 않기에", commentary: "…" },
      { part: "셋째 제시문", quote: "㉢ 격물(格物)은 단지 하나의 사물에서 한 사물의 이(理)를 남김없이 궁구하는 것이다.", commentary: "…" },
      { part: "넷째 제시문", quote: "㉤ 열 가지 일 가운데 일곱이나 여덟 가지를 궁구하여 얻고 나면, 나머지는 그 부류에 맞추어 소통할 수 있다.", commentary: "…" },
    ],
    studyConcepts: [
      { name: "이일분수(理一分殊)", importance: "required", philosopher: "주희", definition: "이는 근원적으로 하나이지만 드러나는 몫(분)은 각기 다르다는 명제이다.", examPoint: "월인만천 비유", connectionToQuestion: "", confusableWith: ["이통기국"], distinction: "이통기국은 이이의 명제이다." },
      { name: "격물치지(格物致知)", importance: "required", philosopher: "주희", definition: "주희는 사물에 나아가 그 이치를 궁구하여 앎을 지극히 한다고 본다.", examPoint: "", connectionToQuestion: "", confusableWith: [], distinction: "" },
      { name: "활연관통", importance: "required", philosopher: "주희", definition: "궁구를 오래 쌓은 끝에 모든 이치가 꿰뚫리는 경지이다.", examPoint: "", connectionToQuestion: "", confusableWith: ["돈오"], distinction: "" },
      { name: "왕수인의 격물", importance: "comparison", philosopher: "왕수인", definition: "격물을 마음의 바르지 않음을 바로잡는 것으로 본다.", examPoint: "", connectionToQuestion: "", confusableWith: [], distinction: "" },
    ],
    confusableConcepts: [{ name: "이일분수와 이통기국", reason: "이통기국은 이이의 명제이다." }],
  },
} as Parameters<typeof buildPracticeItems>[0];

const items = buildPracticeItems(src);
const byKey = new Map(items.map((i) => [i.key, i]));
const ladderA = byKey.get("d:q-2026-b8:ladder:㉠")!;

check("도구: 빈칸 기호 · 초성 · 같은 말 · 실수 나누기", blankMark("작성 방법 1 - ㉠") === "㉠" && chosung("하나(一)") === "ㅎㄴ" && chosung("치양지") === "ㅊㅇㅈ" && chosung("一") === "" && sameTerm("하나(一)", "하나") && splitMistake("㉠에 ‘태극’을 씀 — 이유").reason === "이유");
check("사상가 이름 가리기 (조사 맞춤)", maskName("주희는 격물을 … 주희의 입장", "주희") === "이 사상가는 격물을 … 이 사상가의 입장");

check("빈칸 개념 고르기가 만들어짐 (㉠)", Boolean(ladderA) && ladderA.format === "choice");
{
  const p = ladderA.payload as ChoicePayload;
  check("정답 위치가 실제 정답을 가리킴", p.options[p.answer] === "하나(一)");
  check("오답 보기: 실제 많이 틀리는 답 '태극' 포함", p.options.includes("태극"));
  check("오답 보기: 같은 문항의 다른 빈칸 정답 '분' 포함", p.options.some((o) => sameTerm(o, "분")));
  check("오답 보기에 정답과 같은 말이 없음", p.options.filter((o) => sameTerm(o, "하나")).length === 1);
  check("보기 4~5개", p.options.length >= 4 && p.options.length <= 5);
  check("풀이 화면에는 정답·해설 없음", !("answer" in publicPayload(p)) && !JSON.stringify(publicPayload(p)).includes("이일분수에서"));
}
{
  const hint = byKey.get("d:q-2026-b8:hint:㉠")!;
  check("초성 힌트 빈칸 (기입형, 자동 채점)", hint.format === "fill" && hint.prompt!.includes("ㅎㄴ") && hint.acceptedAnswers.includes("하나"));
}
{
  const ev = byKey.get("d:q-2026-b8:evidence:㉠")!;
  const p = ev.payload as ChoicePayload;
  check("근거 구절: 정답 구절이 정답 위치", p.options[p.answer].includes("오로지"));
  check("근거 구절: 보기에 빈칸 기호가 없음 (기호 맞추기 방지)", p.options.every((o) => !/[㉠-㉻]/.test(o)));
  check("근거 구절: 같은 빈칸이 든 다른 근거는 오답 보기에서 제외", !p.options.some((o, i) => i !== p.answer && o.includes("천지의")));
}
{
  const cl = items.find((i) => i.type === "classify")!;
  const p = cl.payload as ClassifyPayload;
  check("입장 분류: 두 사상가 그룹", Boolean(cl) && p.groups.includes("주희") && p.groups.includes("왕수인"));
  check("입장 분류: 진술에 사상가 이름이 드러나지 않음", p.statements.every((s) => !s.text.includes("주희") && !s.text.includes("왕수인")));
}
{
  const dg = items.find((i) => i.type === "diagnose")!;
  const p = dg.payload as MultiPayload;
  check("감점 포인트: 자주 하는 실수가 정답(골라야 할 것)", p.answers.length === 3 && p.answers.every((i) => /태극|기\(氣\)|별개의 단계/.test(p.options[i])));
  check("감점 포인트: 맞는 서술도 섞임", p.options.length > p.answers.length);
}
check("키가 서로 다름 (㉠·㉡ 구분)", new Set(items.map((i) => i.key)).size === items.length);
check("키가 안정적 (다시 만들어도 같은 키·같은 보기 순서)", JSON.stringify(buildPracticeItems(src).map((i) => [i.key, i.payload])) === JSON.stringify(items.map((i) => [i.key, i.payload])));
check("요구 사항별 해설이 없으면 만들지 않음", buildPracticeItems({ ...src, details: {} }).length === 0);
check("분석 '검토 필요'면 검토 사유가 붙음", buildPracticeItems({ ...src, needsReview: true }).every((i) => i.reviewReasons.length > 0));

// 형식이 어긋난 분석 (운영 데이터에서 발견: 빠진 근거·해설, 문자열이 아닌 값)
{
  const bad = {
    questionId: "q-bad",
    questionText: null,
    needsReview: false,
    commonMistakes: [{ text: "객체로 저장된 실수" }, null, "㉠에 ‘태극’을 씀 — 이유", 3] as unknown as string[],
    details: {
      itemExplanations: [
        { label: "㉠", answer: "하나(一)" },
        { label: "㉡", answer: "분(分)", sourcePart: null, explanation: undefined },
        { label: undefined, answer: "x" },
        null,
      ],
      passageCommentary: [{ part: "가" }, { quote: null }, null],
      studyConcepts: [{ name: "이일분수", philosopher: "주희" }, { name: "격물", philosopher: "왕수인", definition: 5 }, { definition: "이름 없음" }],
      confusableConcepts: [{ name: "이일분수와 이통기국" }, {}],
    },
  } as unknown as Parameters<typeof buildPracticeItems>[0];
  let ok = true;
  let n = 0;
  try {
    n = buildPracticeItems(bad).length;
  } catch (e) {
    ok = false;
    console.log(e);
  }
  check("빠진 항목·형식이 다른 분석에서도 오류 없이 만듦 (가능한 것만)", ok && n > 0, `${n}개`);
  check("분석이 비었거나 형식이 완전히 다르면 0개 (오류 없음)", buildPracticeItems({ ...bad, details: { itemExplanations: "x" } as never }).length === 0 && buildPracticeItems({ ...bad, details: null as never }).length === 0);
}

// 채점
const ch: ChoicePayload = { type: "ladder", mode: "choice", stem: "", options: ["a", "b", "c", "d"], answer: 2, notes: [], explanation: "", grounds: "" };
check("하나 고르기 채점", gradePractice(ch, "2") === "correct" && gradePractice(ch, "1") === "wrong" && gradePractice(ch, "x") === "wrong");
const mu: MultiPayload = { type: "diagnose", mode: "multi", stem: "", options: ["a", "b", "c", "d"], answers: [0, 2], notes: [], explanation: "", grounds: "" };
check("모두 고르기 채점: 정확히=정답, 일부만=부분, 틀린 것 섞임=오답", gradePractice(mu, "[2,0]") === "correct" && gradePractice(mu, "[0]") === "partial" && gradePractice(mu, "[0,1]") === "wrong" && gradePractice(mu, "[]") === "wrong");
const cp: ClassifyPayload = { type: "classify", mode: "classify", stem: "", groups: ["A", "B"], statements: [0, 1, 1, 0, 1].map((g) => ({ text: "", group: g, note: null })), explanation: "", grounds: "" };
check("입장 분류 채점: 전부=정답, 60% 이상=부분, 미만=오답, 개수 다르면 오답", gradePractice(cp, "[0,1,1,0,1]") === "correct" && gradePractice(cp, "[0,1,1,0,0]") === "partial" && gradePractice(cp, "[1,0,0,1,1]") === "wrong" && gradePractice(cp, "[0,1]") === "wrong");

// 채팅 AI 붙여넣기 (② 원문 해석 · ⑤ 채점 요소)
{
  const prompt = buildPracticeAiPrompt({ ref: "2026 B 8번", questionText: src.questionText, details: src.details, commonMistakes: src.commonMistakes });
  check("AI 프롬프트: 이 기출의 분석만 담음 (원문·요구 사항·자주 하는 실수)", prompt.includes("이(理)는 오로지") && prompt.includes("㉠에 ‘태극’을 씀") && prompt.includes("자료 안의 내용만"));
  const pasted = "```json\n" + JSON.stringify({
    interpret: [
      { passagePart: "둘째 제시문", stem: "‘각자의 분 역시 다르지 않을 수 없다’의 해석은?", options: ["차등적 사랑의 근거", "겸애의 근거", "이가 사람마다 다름", "이통기국"], answer: 0, notes: ["정답", "묵자", "이일 부정", "이이"], explanation: "이일분수" },
      { passagePart: "x", stem: "잘못된 문제", options: ["a1", "b1", "c1", "d1"], answer: 7, notes: [], explanation: "" },
    ],
    elements: [
      { requirement: "작성 방법 3", stem: "반드시 들어갈 요소를 모두 고르시오", options: ["점진적 축적", "유추", "활연관통", "모든 사물 궁구", "돈오"], answers: [2, 0, 1], notes: ["", "", ""], explanation: "핵심 요소" },
      { requirement: "작성 방법 2", stem: "전부 정답인 잘못된 문제", options: ["a1", "b1", "c1", "d1"], answers: [0, 1, 2, 3], notes: [], explanation: "" },
    ],
  }) + "\n```";
  const { items, skipped } = toAiPracticeItems("q-2026-b8", validatePasted(PracticeAiSchema, pasted));
  check("AI 결과: 맞는 문제 2개 저장, 틀린 문제 2개는 이유와 함께 제외", items.length === 2 && skipped.length === 2, skipped.join(" / "));
  const el = items.find((i) => i.payload.type === "elements")!.payload as MultiPayload;
  check("AI 결과: 채점 요소 정답 정렬·보기별 해설 길이 맞춤", JSON.stringify(el.answers) === "[0,1,2]" && el.notes.length === 5);
  check("AI 결과: 키는 문항별로 고정 (다시 붙여넣으면 덮어씀)", items[0].key === "d:q-2026-b8:ai:interpret:1");
}

// 학습 단계 · 미션 구성
check("학습 단계: 연습+실전은 연습·기출·예상 모두, 실전만은 연습 제외, 개념 다지기는 연습만", inScope("practice", "both", "mixed") && inScope("exam", "both", "mixed") && !inScope("practice", "both", "real") && !inScope("exam", "both", "practice") && inScope("practice", "exam", "practice"));
check("학습 단계: 출제 범위가 'AI 예상문제'면 연습문제(기출 기반)는 제외", !inScope("practice", "expected", "mixed"));
check("학습 단계 기본값(예전 호출)은 실전만", !inScope("practice", "both") && inScope("exam", "both"));
{
  const C = (id: string, kind: Candidate["kind"], q: string, gated = false): Candidate => ({ id, kind, questionId: q, area: `영역${q}`, philosophers: [], difficulty: 2, gated });
  const cands = [
    ...Array.from({ length: 6 }, (_, i) => C(`p${i}`, "practice", `q${i}`)),
    ...Array.from({ length: 6 }, (_, i) => C(`e${i}`, "exam", `q${i + 10}`)),
    ...Array.from({ length: 3 }, (_, i) => C(`x${i}`, "expected", `q${i + 20}`)),
  ];
  const m = buildMission({ candidates: cands, progress: new Map(), settings: { total: 10, exam: 2, expected: 2, review: 2, practice: 4 }, today: "2026-11-06", seed: "t" });
  const kinds = m.itemIds.map((id) => id[0]);
  check("미션: 연습 4 · 기출 · 예상이 섞임", kinds.filter((k) => k === "p").length >= 4 && kinds.includes("e") && kinds.includes("x"), kinds.join(""));
  const gated = buildMission({
    candidates: [C("g", "exam", "qa", true), C("n", "exam", "qb", false)],
    progress: new Map(),
    settings: { total: 1, exam: 1, expected: 0, review: 0, practice: 0 },
    today: "2026-11-06",
    seed: "s",
  });
  check("미션: 연습문제를 아직 못 맞힌 기출의 실전 문제는 뒤로", gated.itemIds[0] === "n");
}

console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
