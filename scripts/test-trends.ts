/**
 * 출제 패턴 / 예측 점수 계산을 합성 데이터로 점검한다.  npm run test:trends
 */
import { analyzePatterns, type QuestionFacts } from "../src/lib/trends/patterns.ts";
import { buildTopics } from "../src/lib/trends/scoring.ts";

let n = 0;
const P = (id: string, name: string, role = "main") => ({ id, name, role });
const C = (id: string, name: string, philosopherId: string | null = null) => ({ id, name, philosopherId });
function q(year: number, ph: ReturnType<typeof P>[], cs: ReturnType<typeof C>[], formats: QuestionFacts["formats"], extra: Partial<QuestionFacts> = {}): QuestionFacts {
  n++;
  return { id: `q${n}`, ref: `${year} A ${n}번`, year, section: "A", questionType: "서술형", area: "동양윤리", philosophers: ph, concepts: cs, sources: [], formats, studyConcepts: [], extensions: [], confusablePhilosophers: [], ...extra };
}
const wang = P("w", "왕수인"), zhu = P("z", "주희", "comparison"), kant = P("k", "칸트"), mill = P("m", "밀", "comparison"), meng = P("me", "맹자");
const facts: QuestionFacts[] = [
  q(2016, [meng], [C("c-sd", "사단")], ["definition"]),
  q(2017, [meng], [C("c-sd", "사단")], ["identification"]),
  q(2017, [kant], [C("c-ci", "정언명령")], ["definition"]),
  q(2018, [wang, zhu], [C("c-yj", "양지", "w"), C("c-gm", "격물치지", "z")], ["comparison"]),
  q(2020, [kant], [C("c-ci", "정언명령")], ["source"], { sources: [{ id: "s-gr", title: "윤리형이상학 정초", location: "1장", quoted: "선의지 외에는 무제한적으로 선하다고 할 수 있는 것은 없다" }] }),
  q(2021, [wang], [C("c-yj", "양지")], ["definition"], { confusablePhilosophers: ["주희", "이황"] }),
  q(2023, [kant, mill], [C("c-ci", "정언명령", "k"), C("c-ut", "공리", "m")], ["comparison"]),
  q(2024, [wang, zhu], [C("c-yj", "양지"), C("c-jh", "지행합일")], ["comparison", "source"], {
    extensions: [{ topic: "사욕 제거와 치양지", format: "application", relatedConcepts: ["양지"], relatedPhilosophers: ["왕수인"] }],
  }),
  q(2026, [P("l", "이황")], [C("c-sc", "사단칠정")], ["identification"]),
];
const known = new Map([["왕수인", new Set(["양지", "치양지", "심즉리", "지행합일"])], ["칸트", new Set(["정언명령", "선의지", "의무"])]]);
const r = analyzePatterns(facts, [{ sourceId: "s-gr", location: "2장" }], known);
const w = r.philosophers.find((p) => p.name === "왕수인")!;
const check = (label: string, ok: boolean, detail = "") => console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
check("왕수인 3회, 연도", w.total === 3 && w.years.join() === "2018,2021,2024", `${w.total} ${w.years}`);
check("왕수인 평균 간격 3년, 3년 주기", w.avgInterval === 3 && w.cycle === "약 3년 주기", `${w.avgInterval} ${w.cycle}`);
check("왕수인 미출제 개념 = 심즉리, 치양지", w.unexaminedConcepts.join() === "심즉리,치양지", w.unexaminedConcepts.join());
check("왕수인 하위 패턴: 주희와 비교 2 / 단독 1", JSON.stringify(w.subPatterns[0].items.map((i) => [i.label, i.count])) === JSON.stringify([["주희와 비교", 2], ["단독 출제", 1]]), JSON.stringify(w.subPatterns[0].items));
check("최근 5년(2022~2026) 왕수인 1회", w.recent5 === 1, String(w.recent5));
const pair = r.global.comparisonPairs[0];
check("가장 많은 비교 조합 = 왕수인·주희 2회", pair.total === 2 && [pair.a, pair.b].sort().join() === "왕수인,주희", `${pair.a}/${pair.b} ${pair.total}`);
check("하락: 맹자 (2회, 최근 5년 0)", r.global.declining.some((d) => d.name === "맹자"), r.global.declining.map((d) => d.name).join());
const ci = r.concepts.find((c) => c.name === "정언명령")!;
check("정언명령 3회, 3년 주기", ci.total === 3 && ci.cycle === "약 3년 주기", `${ci.total} ${ci.cycle}`);
const yj = r.concepts.find((c) => c.name === "양지")!;
check("양지: 아직 안 쓰인 확장 방식(적용) 감지", yj.unusedExtensions.some((e) => e.format === "application"), JSON.stringify(yj.unusedExtensions));
const ciPh = ci.philosophers.map((x) => x.label).join();
check("정언명령의 관련 사상가 = 칸트만 (밀 비교 문항 제외)", ciPh === "칸트", ciPh);
const kp = r.philosophers.find((p) => p.name === "칸트")!.subPatterns[0].items.map((i) => i.label);
check("조사: 밀과 비교 / 주희와 비교", kp.includes("밀과 비교") && w.subPatterns[0].items[0].label === "주희와 비교", kp.join());
const src = r.sources[0];
check("원전 미출제 부분(2장) 감지", src.unusedPassages.join() === "2장", src.unusedPassages.join());

const topics = buildTopics(r, facts);
console.log("\nTOP 8 예측 주제");
for (const t of topics.slice(0, 8)) console.log(`${t.score.toString().padStart(3)}  ${t.title.padEnd(16)} ${JSON.stringify(t.factors)}`);
const kantGood = topics.find((t) => t.title === "칸트 - 선의지");
check("칸트 - 선의지(미출제 핵심 개념) 후보 생성", Boolean(kantGood), kantGood ? String(kantGood.score) : "");
check("이황 vs 왕수인 (혼동되지만 미비교) 후보", topics.some((t) => t.kind === "comparison" && t.title.includes("이황") && t.title.includes("왕수인")));
check("왕수인 - 격물치지(주희 개념) 주제 없음", !topics.some((t) => t.title === "왕수인 - 격물치지"));
check("밀 - 정언명령(칸트 개념) 주제 없음", !topics.some((t) => t.title === "밀 - 정언명령"));
const kd = topics.find((t) => t.title === "칸트 - 선의지")!;
check("미출제 개념은 미출제 기간 요소 제외", kd.factors.years_since_last_appearance === undefined);
check("모든 점수 0~100", topics.every((t) => t.score >= 0 && t.score <= 100));
const ids = [...new Set(topics.flatMap((t) => t.philosopherIds))];
check("사상가당 개념 주제 ≤2, 비교 주제 ≤1", ids.every((id) => topics.filter((t) => t.kind === "philosopher_concept" && t.philosopherIds.includes(id)).length <= 2 && topics.filter((t) => t.kind === "comparison" && t.philosopherIds.includes(id)).length <= 1));
const neverPair = topics.find((t) => t.title.includes("이황") && t.title.includes("왕수인"))!;
check("미비교 조합은 미출제 기간 제외", neverPair.factors.years_since_last_appearance === undefined);
