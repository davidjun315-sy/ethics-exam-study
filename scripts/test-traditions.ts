/** 사상가 분야 분류 점검.  npm run test:traditions */
import { classifyPhilosopher, classifyTradition, groupByTradition } from "../src/lib/traditions.ts";

let failed = 0;
const cases: [string | null, string][] = [
  ["동양윤리", "동양윤리"], ["동양 윤리", "동양윤리"], ["중국 유학", "동양윤리"], ["불교", "동양윤리"], ["도가", "동양윤리"],
  ["한국윤리", "한국윤리"], ["조선 성리학", "한국윤리"], ["한국 불교", "한국윤리"],
  ["서양윤리", "서양윤리"], ["서양 근대 윤리", "서양윤리"], ["고대 그리스", "서양윤리"],
  ["사회사상", "사회사상"], ["정치철학", "사회사상"], ["현대 자유주의", "사회사상"],
  ["도덕교육론", "도덕교육론"], ["도덕 발달 심리학", "도덕교육론"],
  [null, "미분류"], ["", "미분류"], ["알 수 없음", "미분류"],
];
for (const [input, want] of cases) {
  const got = classifyTradition(input);
  if (got !== want) failed++;
  console.log(`${got === want ? "✓" : "✗"} ${JSON.stringify(input)} → ${got}${got === want ? "" : ` (기대: ${want})`}`);
}
const g = groupByTradition([{ name: "가나다", tradition: null }, { name: "x", tradition: "서양 윤리" }, { name: "y", tradition: "유가" }]).map((x) => x.chapter).join();
const ok = g === "동양윤리,서양윤리,미분류";
if (!ok) failed++;
console.log(`${ok ? "✓" : "✗"} 챕터 순서 (미분류는 맨 뒤) — ${g}`);
const named: [string, string | null, string][] = [["맹자", null, "동양윤리"], ["이황", null, "한국윤리"], ["롤스", null, "사회사상"], ["콜버그", null, "도덕교육론"], ["칸트", "", "서양윤리"], ["밀", "사회사상", "사회사상"]];
for (const [name, tradition, want] of named) {
  const got = classifyPhilosopher({ name, tradition });
  if (got !== want) failed++;
  console.log(`${got === want ? "✓" : "✗"} ${name}(${JSON.stringify(tradition)}) → ${got}`);
}
if (failed) process.exit(1);
