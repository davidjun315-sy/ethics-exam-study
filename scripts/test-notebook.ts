/** 사상가 공부 노트 합치기 로직 점검.  npm run test:notebook */
import { buildPhilosopherNotebook, normalizeText, type NotebookQuestion } from "../src/lib/study/notebook.ts";

const sc = (name: string, philosopher: string | null, importance: "required" | "supporting" | "comparison", point: string) => ({
  name, philosopher, importance, definition: `${name} 정의 ${point}`, examPoint: point, connectionToQuestion: "연결", confusableWith: ["격물치지"], distinction: "구별법",
});
const base = { modelAnswer: null, requiredKeywords: [], extensions: [], ownConcepts: [] };
const qs: NotebookQuestion[] = [
  { ...base, id: "a", ref: "2018 A 1번", year: 2018, role: "main", answer: "양지",
    intent: { summary: "주희와 구별", skillsTested: ["사상가 구별"], formats: ["comparison"], itemIntents: [], trapPoints: ["격물치지와 혼동"], evidence: [] },
    studyConcepts: [sc("양지", "왕수인", "required", "선천적 도덕 판단 능력"), sc("격물치지", "주희", "comparison", "주희 개념")],
    reasoning: { decisiveExpressions: ["마음 밖에 이치가 없다"], similarPhilosophers: [{ name: "주희", distinguishingPoint: "주희는 격물궁리, 왕수인은 양지" }] } },
  { ...base, id: "b", ref: "2021 A 1번", year: 2021, role: "main", answer: "치양지",
    intent: { summary: "치양지 의미", skillsTested: ["사상가 구별"], formats: ["definition"], itemIntents: [], trapPoints: ["격물치지와 혼동."], evidence: [] },
    studyConcepts: [sc("양지", "왕수인(왕양명)", "supporting", "선천적 도덕 판단 능력"), sc("치양지", null, "required", "양지 실현")],
    reasoning: { decisiveExpressions: ["마음 밖에 이치가 없다", "양지를 보존"], similarPhilosophers: [{ name: "주희", distinguishingPoint: "주희는 성즉리" }] } },
  { ...base, id: "c", ref: "2024 A 3번", year: 2024, role: "comparison", answer: "x", intent: null,
    studyConcepts: [sc("심즉리", null, "required", "비교 문항이라 자동 포함 안 됨")], reasoning: {}, ownConcepts: [{ id: "c-sj", name: "심즉리" }] },
];
const nb = buildPhilosopherNotebook({ name: "왕수인", aliases: ["왕양명"] }, qs, new Map([[normalizeText("양지"), { id: "c-yj", definition: "개념 DB 정의" }]]));
const check = (label: string, ok: boolean, d = "") => console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
const names = nb.concepts.map((c) => c.name);
check("주희의 격물치지는 왕수인 개념에서 제외", !names.includes("격물치지"), names.join());
check("별칭(왕수인(왕양명))도 같은 사상가로 인식, 양지 2문항", nb.concepts.find((c) => c.name === "양지")?.questions.length === 2);
check("양지 중요도는 가장 높은 required", nb.concepts.find((c) => c.name === "양지")?.importance === "required");
check("사상가 미지정 + main 문항 개념(치양지) 포함", names.includes("치양지"));
check("비교 문항의 미지정 개념 정리는 제외하되 개념 태그(심즉리)는 포함", names.includes("심즉리") && !nb.concepts.find((c) => c.name === "심즉리")!.examPoints.length);
check("개념 DB 정의 우선", nb.concepts.find((c) => c.name === "양지")?.definitionFrom === "개념 DB");
check("같은 시험 포인트는 합치고 출처 2개", nb.concepts.find((c) => c.name === "양지")!.examPoints[0].refs.length === 2);
check("결정적 표현 중복 합침 (마음 밖에… 2회)", nb.expressions[0].text === "마음 밖에 이치가 없다" && nb.expressions[0].refs.length === 2);
check("함정: 마침표 차이만 있으면 하나로", nb.traps.length === 1 && nb.traps[0].refs.length === 2, JSON.stringify(nb.traps));
check("구별법: 주희 아래 2개 포인트", nb.distinctions[0].other === "주희" && nb.distinctions[0].points.length === 2);
check("비교 역할 문항(출제 의도 없음)은 함정 집계 제외 / 심화 2문항", nb.deepCount === 2);
check("출제(태그) vs 언급 구분: 심즉리 출제 1 / 양지 출제 0", nb.concepts.find((c) => c.name === "심즉리")!.askedIn.length === 1 && nb.concepts.find((c) => c.name === "양지")!.askedIn.length === 0);
check("문항 최신순", nb.timeline.map((q) => q.year).join() === "2024,2021,2018");
