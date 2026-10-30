/** 분석 자료 내보내기 (Markdown) 점검.  npm run test:export */
import { romanize, combinedFile, indexFile, philosopherFile, philosopherUpdatedAt, questionMarkdown, questionsOf, type ExportPhilosopher, type ExportQuestion } from "../src/lib/export/markdown.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};

const analysis = (updatedAt: string, extra: Partial<ExportQuestion["analysis"] & object> = {}) => ({
  area: "동양윤리", school: "양명학", questionType: "서술형", difficulty: "중", answer: "치양지", answerExplanation: null, questionIntent: null,
  commonMistakes: ["주희의 격물치지와 혼동"], status: "analyzed", version: 3, updatedAt,
  details: {
    modelAnswer: "㉠은 치양지이다.",
    itemExplanations: [{ label: "㉠", answer: "치양지", sourcePart: "(가) 둘째 문장 「양지를 넓힌다」", explanation: "왕수인은 양지를 실현하는 것을 치양지라 했다." }],
    examinerIntent: { summary: "양명학 핵심 개념 확인", formats: [], itemIntents: [{ label: "㉠", intent: "치양지를 아는지" }] },
    passageCommentary: [{ part: "(가)", quote: "마음 밖에 이치가 없다", commentary: "심즉리를 말한다." }],
    conceptMap: [{ philosopher: "왕수인", focus: "치양지", focusGist: "양지의 실현", branches: [{ relation: "근거", keyword: "심즉리", gist: "마음 = 이치", inQuestion: true }] }],
    studyConcepts: [{ name: "치양지", importance: "required", philosopher: "왕수인", definition: "양지를 실현함", examPoint: "격물치지와 구별", connectionToQuestion: "", confusableWith: ["격물치지"], distinction: "주희는 사물의 이치 탐구" }],
    futureExtensions: [{ topic: "왕수인 - 지행합일", format: "definition", relatedConcepts: [], relatedPhilosophers: [], importance: "high", conceptSummary: "앎과 행함은 하나", expectedQuestion: "다음 제시문을 읽고…\n<작성 방법>\n○ ㉠을 쓸 것.", expectedAnswer: "지행합일이다." }],
  },
  ...extra,
}) as ExportQuestion["analysis"];

const qs: ExportQuestion[] = [
  { id: "q1", ref: "2018 A 1번", year: 2018, order: 1, score: 4, text: "(가) 마음 밖에 이치가 없다.\n( ㉠ )", updatedAt: "2026-01-01T00:00:00Z",
    philosophers: [{ id: "wang", name: "왕수인", role: "main" }, { id: "zhu", name: "주희", role: "comparison" }], analysis: analysis("2026-03-01T00:00:00Z"),
    sources: [{ title: "전습록", location: "상권", philosopher: "왕수인", overview: "왕수인의 어록", related: null, relation: "심즉리 근거", quoted: "心外無理", status: "likely" }] },
  { id: "q2", ref: "2024 B 3번", year: 2024, order: 100003, score: null, text: "칸트 문제", updatedAt: "2026-01-02T00:00:00Z",
    philosophers: [{ id: "kant", name: "칸트", role: "main" }, { id: "wang", name: "왕수인", role: "mentioned" }], analysis: null, sources: [] },
];
const ps: ExportPhilosopher[] = [
  { id: "wang", name: "왕수인", tradition: "동양윤리", school: "양명학", era: "명", coreIdeas: "심즉리", note: {
    updatedAt: "2026-05-01T00:00:00Z",
    content: { overview: { oneLine: "마음이 곧 이치", summary: "양명학의 창시자", keywords: ["심즉리", "치양지"] }, outline: [{ title: "1. 심즉리", items: [{ keyword: "심즉리", gist: "마음 = 이치", sub: [] }] }],
      sections: [{ title: "1. 심즉리", intro: null, concepts: [{ name: "심즉리", originalTerm: "心卽理", definition: "마음이 곧 이치", explanation: "주희 비판", keyPoints: ["마음 밖에 이치 없음"], examPoints: [], confusions: [{ with: "성즉리", distinction: "주희" }], relatedQuestionRefs: ["2018 A 1번"] }] }],
      identification: { decisiveExpressions: ["마음 밖에 이치가 없다"], tips: [] }, comparisons: [{ other: "주희", common: null, differences: [{ aspect: "이치", mine: "마음에", theirs: "사물에" }], relatedQuestionRefs: [] }],
      traps: [], answerTips: ["치양지 정확히"], futureTopics: [], studyOrder: [], caveats: [] } } },
  { id: "kant", name: "칸트", tradition: "서양윤리", school: null, era: null, coreIdeas: null, note: null },
  { id: "zhu", name: "주희", tradition: "동양윤리", school: null, era: null, coreIdeas: null, note: null },
];
const now = new Date("2026-10-30T03:00:00Z");

const md = questionMarkdown(qs[0]);
check("문항: 제목·사상가 역할·배점", md.startsWith("### 2018 A 1번 (4점) — 왕수인(주요), 주희(비교)"));
check("문항: 원문 인용", md.includes("> (가) 마음 밖에 이치가 없다.\n> ( ㉠ )"));
for (const s of ["**모범답안**", "**요구 사항별 해설**", "근거: (가) 둘째 문장", "**출제 의도**", "㉠: 치양지를 아는지", "**원문 해설**", "**개념 정리**", "근거 → 심즉리", "구별: 격물치지 — ", "**오답 분석**", "**원전**", "『전습록』 상권", "(유력)", "원전 해설: 왕수인의 어록", "**향후 출제 (AI 예상)**", "예상 답안: 지행합일이다."])
  check(`문항: ${s} 포함`, md.includes(s));
check("옵션: 원문 빼기", !questionMarkdown(qs[0], { questionText: false, future: true }).includes("**문제 원문**"));
check("옵션: 향후 출제 빼기", !questionMarkdown(qs[0], { questionText: true, future: false }).includes("향후 출제"));
check("분석 없는 문항 안내", questionMarkdown(qs[1]).includes("아직 AI 분석이 없습니다"));
check("파일에서는 분석 전 문항을 번호만 한 줄로", philosopherFile(ps[1], qs, { questionText: true, future: true }, now).includes("_아직 분석 전인 문항 (1): 2024 B 3번_") && !philosopherFile(ps[1], qs, { questionText: true, future: true }, now).includes("### 2024 B 3번"));

check("사상가 문항: 주요 먼저, 언급도 포함", questionsOf("wang", qs).map((q) => `${q.ref}/${q.role}`).join() === "2018 A 1번/main,2024 B 3번/mentioned");
check("사상가 최종 변경 = 노트·문항·분석 중 최신", philosopherUpdatedAt(ps[0], qs) === "2026-05-01T00:00:00Z" && philosopherUpdatedAt(ps[1], qs) === "2026-01-02T00:00:00Z");

const pf = philosopherFile(ps[0], qs, { questionText: true, future: true }, now);
check("사상가 파일: 채팅 AI 안내·내보낸 시각", pf.includes("채팅 AI 에게") && pf.includes("2026. 10. 30."));
check("사상가 파일: 개념 정리 → 기출 순서", pf.indexOf("## AI 개념 정리") < pf.indexOf("## 기출 문항 (2)") && pf.includes("**심즉리** (心卽理)") && pf.includes("왕수인 vs 주희"));
check("사상가 파일: 개념 정리 없는 사상가", !philosopherFile(ps[1], qs, { questionText: true, future: true }, now).includes("## AI 개념 정리"));

const all = combinedFile("전체", ps, qs, { questionText: true, future: true }, now);
check("전체 파일: 문항은 한 번씩", (all.match(/### 2018 A 1번/g) ?? []).length === 1 && all.includes("분석 전인 문항 (1): 2024 B 3번"));
check("전체 파일: 섹터별 목차", all.includes("- **동양윤리**: 왕수인(2), 주희(1)") && all.includes("- **서양윤리**: 칸트(1)"));
const idx = indexFile([ps[0]], qs, new Map([["wang", "동양윤리_왕수인.md"]]), now, "2026-04-01T00:00:00Z");
check("묶음 안내: 변경분 안내·파일 목록", idx.includes("이후 바뀐 사상가 1명만") && idx.includes("동양윤리_왕수인.md — 왕수인, 문항 2개, 개념 정리 포함"));
check("파일 이름 로마자", romanize("칸트") === "kanteu" && romanize("왕수인") === "wangsuin" && romanize("아리스토텔레스") === "ariseutotelreseu" && romanize("J. S. 밀") === "j-s-mil", [romanize("칸트"), romanize("왕수인"), romanize("아리스토텔레스"), romanize("J. S. 밀")].join());

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
