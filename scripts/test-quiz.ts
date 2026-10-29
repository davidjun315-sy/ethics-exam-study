/** 윤리 퀴즈 로직 점검 (분리 · 채점 · 복습 · 경험치 · 미션 배정).  npm run test:quiz */
import { isCorrectFill, isShortAnswer, normalizeAnswer, seedAcceptedAnswers } from "../src/lib/quiz/grade.ts";
import { buildMission, buildPractice, spaceOut, type Candidate, type ProgressLite } from "../src/lib/quiz/mission.ts";
import { expectedFromAnalysis, requirementLines, splitQuestion, type SplitInput } from "../src/lib/quiz/split.ts";
import { addDays, answerXp, currentStreak, kstDay, levelForXp, newBadges, NEW_PROGRESS, nextReview, streakAfterCompletion } from "../src/lib/quiz/srs.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};

// ---------------- 분리 ----------------
const text = `(가)는 갑, (나)는 을의 주장이다.
(가) 마음 밖에 이치가 없다. 마음의 본체는 저절로 알지 않음이 없으니 ( ㉠ )이다.
(나) 사물에 나아가 그 이치를 궁구한다. 이를 ( ㉡ )(이)라 한다.

<작성 방법>
○ 괄호 안의 ㉠에 해당하는 개념을 쓸 것.
○ 괄호 안의 ㉡에 해당하는 개념을 쓸 것.
○ 갑과 을의 입장 차이를 이(理)의 소재를 중심으로
  서술할 것.`;
const base: SplitInput = {
  questionId: "Q1", questionLabel: "3", questionText: text, questionType: "서술형", examYear: 2024, answer: "㉠ 양지 ㉡ 격물치지",
  difficulty: "중", area: "동양윤리", philosophers: ["왕수인", "주희"], concepts: ["양지"],
  details: {
    itemExplanations: [
      { label: "㉠", answer: "양지(良知)", sourcePart: "", explanation: "" },
      { label: "㉡", answer: "격물치지", sourcePart: "", explanation: "" },
      { label: "작성 방법 3", answer: "갑은 이치가 마음에 있다고 보지만(심즉리) 을은 사물에 있다고 본다(성즉리).", sourcePart: "", explanation: "" },
    ],
  },
};
check("작성 방법 줄 추출 (줄바꿈 이어 붙이기)", requirementLines(text).length === 3 && requirementLines(text)[2].endsWith("서술할 것."), requirementLines(text)[2]);
const items = splitQuestion(base);
check("4점 문항 → 3개 문제", items.length === 3);
check("㉠ 기입형 자동 채점, 원문 발문 그대로", items[0].format === "fill" && items[0].grading === "auto" && items[0].prompt === "○ 괄호 안의 ㉠에 해당하는 개념을 쓸 것.");
check("㉠ 인정 표현: 양지 / 良知 / 양지(良知)", ["양지", "良知", "양지(良知)"].every((x) => items[0].acceptedAnswers.includes(x)), items[0].acceptedAnswers.join(","));
check("작성 방법 3 → 서술형 자기평가", items[2].format === "essay" && items[2].grading === "self" && items[2].prompt?.includes("서술할 것") === true);
check("분리가 분명하면 검수 사유 없음", items.every((i) => i.reviewReasons.length === 0), items.map((i) => i.reviewReasons.join("/")).join(" | "));
check("키는 원본 문항 + 레이블 (중복 생성 방지)", items[0].key === "q:Q1:㉠" && items[2].key === "q:Q1:작성방법3");
check("원문이 같으면 지문(hash)도 같음", splitQuestion(base)[0].sourceHash === items[0].sourceHash);
check("정답이 바뀌면 지문이 바뀜", splitQuestion({ ...base, details: { itemExplanations: [{ ...base.details.itemExplanations![0], answer: "치양지" }] } })[0].sourceHash !== items[0].sourceHash);

const noLines = splitQuestion({ ...base, questionText: "다음 글의 ㉠, ㉡에 들어갈 말을 쓰시오. ( ㉠ ) ( ㉡ )", questionType: "기입형" });
check("작성 방법이 없으면 발문을 못 찾아 검수 대상", noLines.length === 3 && noLines[0].reviewReasons.some((r) => r.includes("발문")));
check("요구 사항별 해설이 없는 분석은 문제로 만들지 않음", splitQuestion({ ...base, details: {} }).length === 0 && splitQuestion({ ...base, details: { subAnswers: [{ label: "㉠", answer: "양지" }] } }).length === 0);
const leak = splitQuestion({ ...base, details: { itemExplanations: [{ label: "㉠", answer: "개념", sourcePart: "", explanation: "" }] } });
check("발문에 정답이 보이면 검수 대상", leak[0].reviewReasons.some((r) => r.includes("드러날")));
const fillLong = splitQuestion({ ...base, questionType: "기입형", details: { itemExplanations: [{ label: "㉠", answer: "이치는 마음 밖에 있지 않고 마음 그 자체가 이치라는 주장", sourcePart: "", explanation: "" }] } });
check("기입형인데 정답이 길면 자기평가 + 검수 사유", fillLong[0].grading === "self" && fillLong[0].reviewReasons.length > 0);

const ex = expectedFromAnalysis("Q1", { topic: "왕수인 - 지행합일", philosopher: "왕수인", concept: "지행합일", expectedQuestion: "다음 글을 읽고…\n<작성 방법>\n○ 밑줄 친 주장을 서술할 것.", expectedAnswer: "앎과 행함은 본래 하나이며 참된 앎은 실천으로 드러난다는 지행합일을 뜻한다.", conceptSummary: "요약" });
check("예상 문제 → 서술형 자기평가", ex !== null && ex.format === "essay" && ex.kind === "expected" && ex.key.startsWith("x:Q1:"));
check("문제나 정답이 없는 예상 문제는 제외", expectedFromAnalysis("Q1", { topic: "t", expectedQuestion: "", expectedAnswer: "a" }) === null);

// ---------------- 채점 ----------------
check("띄어쓰기·문장부호 무시", isCorrectFill(" 격물 치지. ", ["격물치지"]));
check("괄호 병기 어느 쪽이든", isCorrectFill("良知", seedAcceptedAnswers("양지(良知)")) && isCorrectFill("양지 (良知)", ["양지"]));
check("레이블 붙여 써도 인정", isCorrectFill("㉠ 양지", ["양지"]));
check("비슷한 말은 자동으로 인정하지 않음", !isCorrectFill("양지능력", ["양지"]) && !isCorrectFill("치양지", ["양지"]));
check("빈 답은 오답", !isCorrectFill("   ", ["양지"]));
check("'또는' 으로 나열된 정답 모두 인정", isCorrectFill("인", seedAcceptedAnswers("인(仁) 또는 어짊")) && isCorrectFill("어짊", seedAcceptedAnswers("인(仁) 또는 어짊")));
check("짧은 답 판별", isShortAnswer("치양지") && !isShortAnswer("갑은 이치가 마음에 있다고 보지만 을은 사물에 있다고 본다."));
check("정규화: 따옴표·공백 제거", normalizeAnswer(" ‘사 단’ ") === "사단");

// ---------------- 복습 · 경험치 ----------------
const today = "2026-10-28";
let p = nextReview(NEW_PROGRESS, "correct", today);
check("처음 맞힘 → 1일 뒤", p.dueOn === "2026-10-29" && p.mastery === 1);
p = nextReview(p, "correct", "2026-10-29");
check("두 번 연속 → 3일 뒤", p.dueOn === "2026-11-01" && p.streak === 2);
const p3 = nextReview(p, "correct", "2026-11-01");
check("세 번 연속 → 간격이 더 늘어남", p3.intervalDays > 3 && p3.mastery === 3, String(p3.intervalDays));
const pw = nextReview(p3, "wrong", "2026-11-10");
check("틀림 → 오늘 다시, 숙련도 하락", pw.dueOn === "2026-11-10" && pw.mastery === 2 && pw.streak === 0);
const pp = nextReview(p3, "partial", "2026-11-10");
check("일부만 → 2일 뒤", pp.dueOn === "2026-11-12");
check("같은 날 같은 문제는 경험치 0", answerXp({ ...NEW_PROGRESS, lastXpDay: today }, "correct", today) === 0);
check("틀렸던 문제를 맞히면 추가 보상", answerXp({ ...NEW_PROGRESS, lastResult: "wrong" }, "correct", today) === 15);
check("레벨: 0→1, 100→2, 299→2, 300→3", levelForXp(0).level === 1 && levelForXp(100).level === 2 && levelForXp(299).level === 2 && levelForXp(300).level === 3);
check("연속 학습: 어제 완료 → +1, 이틀 전 → 1부터", streakAfterCompletion("2026-10-27", 4, today) === 5 && streakAfterCompletion("2026-10-25", 4, today) === 1 && streakAfterCompletion(today, 4, today) === 4);
check("화면 연속 일수: 그제 이후 끊김", currentStreak("2026-10-27", 5, today) === 5 && currentStreak("2026-10-26", 5, today) === 0);
check("7일 배지", newBadges(7, []).join() === "streak-7" && newBadges(8, ["streak-7"]).length === 0);
check("한국 시간 날짜 (UTC 15시 = 다음 날 0시)", kstDay(new Date("2026-10-27T15:00:00Z")) === "2026-10-28" && kstDay(new Date("2026-10-27T14:59:00Z")) === "2026-10-27");
check("날짜 더하기 (월 넘김)", addDays("2026-10-30", 3) === "2026-11-02");

// ---------------- 미션 배정 ----------------
const areas = ["동양윤리", "서양윤리", "사회사상", "도덕교육론"];
const cands: Candidate[] = [];
for (let q = 0; q < 12; q++) for (let k = 0; k < 2; k++) cands.push({ id: `e${q}-${k}`, kind: "exam", questionId: `q${q}`, area: areas[q % 4], philosophers: [], difficulty: ((q % 3) + 1) as 1 | 2 | 3 });
for (let x = 0; x < 4; x++) cands.push({ id: `x${x}`, kind: "expected", questionId: `q${x}`, area: areas[x % 4], philosophers: [], difficulty: 2 });
const prog = new Map<string, ProgressLite>([
  ["e0-0", { lastResult: "wrong", dueOn: today, mastery: 0, lastAt: "2026-10-27T00:00:00Z" }],
  ["e1-0", { lastResult: "partial", dueOn: "2026-10-27", mastery: 1, lastAt: "2026-10-25T00:00:00Z" }],
  ["e2-0", { lastResult: "correct", dueOn: "2026-11-30", mastery: 2, lastAt: "2026-10-27T00:00:00Z" }],
]);
const settings = { total: 10, exam: 6, expected: 2, review: 2 };
const m = buildMission({ candidates: cands, progress: prog, settings, today, level: "advanced", seed: "owner:" + today });
check("하루 10문제", m.itemIds.length === 10);
check("복습 2 (틀린 문제·일부만 우선)", m.slots.filter((s) => s === "review").length === 2 && m.itemIds.includes("e0-0") && m.itemIds.includes("e1-0"));
check("새 기출 6 + 예상 2", m.slots.filter((s) => s === "exam").length === 6 && m.slots.filter((s) => s === "expected").length === 2);
const qOf = (id: string) => cands.find((c) => c.id === id)!.questionId;
check("같은 원문에서 나온 문제는 한 미션에 하나", new Set(m.itemIds.map(qOf)).size === m.itemIds.length);
const mAreas = m.itemIds.map((id) => cands.find((c) => c.id === id)!.area);
check("영역 고르게 (4개 영역 모두)", new Set(mAreas).size === 4);
check("같은 영역이 연달아 나오지 않음", mAreas.every((a, i) => i === 0 || a !== mAreas[i - 1]), mAreas.join(","));
check("같은 날·같은 학습자면 같은 미션", buildMission({ candidates: cands, progress: prog, settings, today, level: "advanced", seed: "owner:" + today }).itemIds.join() === m.itemIds.join());
const few = buildMission({ candidates: cands.filter((c) => c.kind === "exam").slice(0, 12), progress: new Map(), settings, today, level: "basic", seed: "s" });
check("예상 문제가 없으면 다른 문제로 채움", few.itemIds.length === 10 && few.slots.includes("fill"));
const expertProg = new Map<string, ProgressLite>([["e0-0", { lastResult: "correct", dueOn: today, mastery: 4, lastAt: null }]]);
const ex2 = buildMission({ candidates: cands, progress: expertProg, settings, today, level: "expert", seed: "e" });
check("전문가: 익힌 쉬운 문제(하)는 복습에서 제외", !ex2.itemIds.includes("e0-0"));
const basic = buildMission({ candidates: cands, progress: new Map(), settings, today, level: "basic", seed: "b" });
const avgDiff = (ids: string[]) => ids.reduce((n, id) => n + cands.find((c) => c.id === id)!.difficulty, 0) / ids.length;
check("입문은 전문가보다 쉬운 문제 위주", avgDiff(basic.itemIds) < avgDiff(buildMission({ candidates: cands, progress: new Map(), settings, today, level: "expert", seed: "b" }).itemIds));

const wrongs = buildPractice({ candidates: cands, progress: prog, today, n: 10, seed: "w", which: "wrong" });
check("오답 복습은 틀림·일부만 문제만", wrongs.length === 2 && wrongs.every((id) => ["e0-0", "e1-0"].includes(id)));
const fresh = buildPractice({ candidates: cands, progress: prog, today, n: 5, seed: "f", which: "new" });
check("자유 학습 '새 문제'는 안 푼 문제만", fresh.length === 5 && fresh.every((id) => !prog.has(id)));
check("간격 띄우기: 같은 원문 연속 방지", spaceOut([{ area: "a", questionId: "1" }, { area: "a", questionId: "1" }, { area: "b", questionId: "2" }]).map((x) => x.questionId).join() === "1,2,1");

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
