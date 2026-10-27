/** 사상가 개념 정리 노트 검사 로직 점검.  npm run test:notes */
import { validatePasted } from "../src/lib/ai/lenient.ts";
import { PhilosopherStudyNoteSchema } from "../src/lib/ai/schemas.ts";
import { buildPhilosopherNotebook, type NotebookQuestion } from "../src/lib/study/notebook.ts";
import { buildNoteInput, noteConceptCount, noteFreshness, noteOutline, sanitizeNoteRefs } from "../src/lib/study/notes.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};

// 채팅 AI 답: 앞뒤 설명 + 코드 블록, 일부 키 누락, 문자열로 온 배열, 잘못된 ref
const pasted = `네, 정리했습니다.
\`\`\`json
{
  "overview": { "oneLine": "마음이 곧 이치", "summary": "요약", "keywords": "심즉리" },
  "sections": [
    { "title": "1. 출발점", "concepts": [
      { "name": "심즉리", "definition": "마음이 곧 이치", "explanation": "설명", "relatedQuestionRefs": ["2024 A 3", "2030 B 9번"] },
      { "name": "양지", "definition": "선천적 판단", "explanation": "설명", "keyPoints": ["a"], "relatedQuestionRefs": ["2018 A 1번", "2018A1번"] }
    ] }
  ],
  "traps": [{ "trap": "격물치지와 혼동", "correction": "주희 개념", "relatedQuestionRefs": ["2099 A 1번"] }]
}
\`\`\`
궁금한 점 있으면 말씀하세요.`;
const note = validatePasted(PhilosopherStudyNoteSchema, pasted);
check("앞뒤 설명문이 있어도 JSON 추출 + 빠진 키 기본값", note.comparisons.length === 0 && note.identification.tips.length === 0);
check("문자열 keywords 는 배열로", note.overview.keywords.length === 1 && note.overview.keywords[0] === "심즉리");
check("빠진 개념 필드 기본값 (originalTerm null, confusions [])", note.sections[0].concepts[0].originalTerm === null && note.sections[0].concepts[0].confusions.length === 0);

const valid = ["2018 A 1번", "2024 A 3번"];
const { note: clean, dropped } = sanitizeNoteRefs(note, valid);
check("띄어쓰기·'번' 차이는 실제 ref 로 맞춤", clean.sections[0].concepts[0].relatedQuestionRefs.join() === "2024 A 3번");
check("같은 ref 중복 제거", clean.sections[0].concepts[1].relatedQuestionRefs.join() === "2018 A 1번");
check("없는 ref 는 지우고 보고", dropped.includes("2030 B 9번") && dropped.includes("2099 A 1번") && clean.traps[0].relatedQuestionRefs.length === 0, dropped.join());
check("개념 수", noteConceptCount(clean) === 2);

let threw = "";
try {
  validatePasted(PhilosopherStudyNoteSchema, "JSON 없음");
} catch (e) {
  threw = (e as Error).message;
}
check("JSON 이 없으면 한국어 오류", threw.includes("JSON"), threw);

const f = noteFreshness(["a", "b"], ["b", "c", "d"]);
check("노트 이후 분석된 문항 / 빠진 문항", f.added.join() === "c,d" && f.removed.join() === "a");

const q: NotebookQuestion = {
  id: "a", ref: "2018 A 1번", year: 2018, role: "main", answer: "양지".repeat(200), modelAnswer: null, requiredKeywords: ["양지"],
  intent: { summary: "의도", skillsTested: ["구별"], formats: ["definition"], requiredTerms: [], trapPoints: ["함정"], evidence: [] },
  studyConcepts: [{ name: "양지", philosopher: "왕수인", importance: "required", definition: "정의", examPoint: "포인트", connectionToQuestion: "연결", confusableWith: [], distinction: "" }],
  extensions: [], reasoning: { decisiveExpressions: ["마음 밖에 이치가 없다"] }, ownConcepts: [{ id: "c1", name: "양지" }],
};
const nb = buildPhilosopherNotebook({ name: "왕수인", aliases: [] }, [q], new Map());
const input = buildNoteInput({ name: "왕수인", aliases: [], originalName: null, tradition: null, school: null, era: null, coreIdeas: null }, nb);
check("프롬프트 입력: 문항 ref·개념·함정 포함", input.questions[0].ref === "2018 A 1번" && input.concepts[0].askedIn[0] === "2018 A 1번" && input.traps[0] === "함정");
check("긴 정답은 잘라서 보냄", (input.questions[0].answer ?? "").length <= 201);

const derived = noteOutline(clean);
check("구조도가 없으면 단원·개념에서 자동 생성", derived.derived && derived.outline[0].items.map((i) => i.keyword).join() === "심즉리,양지" && derived.outline[0].items[0].gist === "마음이 곧 이치");
const own = noteOutline({ ...clean, outline: [{ title: "1. 출발점", items: [{ keyword: "심즉리", gist: "마음 = 이치", sub: ["心卽理"] }] }] });
check("AI 가 만든 구조도는 그대로 사용", !own.derived && own.outline[0].items[0].gist === "마음 = 이치");
check("빈 구조도 단원만 있으면 자동 생성으로", noteOutline({ ...clean, outline: [{ title: "x", items: [] }] }).derived);

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
