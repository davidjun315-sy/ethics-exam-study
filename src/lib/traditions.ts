/**
 * 사상가 분야(챕터) 분류. philosophers.tradition 은 AI 가 자유롭게 적은 값이라
 * "동양 윤리", "중국 유학", "서양 근대 윤리" 처럼 표기가 제각각이므로 임용 출제 영역으로 묶는다.
 */
export const TRADITIONS = ["동양윤리", "한국윤리", "서양윤리", "사회사상", "도덕교육론"] as const;
export type Tradition = (typeof TRADITIONS)[number];
export const UNCLASSIFIED = "미분류";

const RULES: [Tradition, RegExp][] = [
  ["한국윤리", /한국|조선|고려|신라|삼국/],
  ["도덕교육론", /교육|발달|심리/],
  ["사회사상", /사회|정치|국가|민주|자유주의|공동체주의|마르크스|아나키/],
  ["동양윤리", /동양|중국|유가|유교|유학|성리|양명|도가|도교|불교|불가|묵가|법가|인도|힌두|선종/],
  ["서양윤리", /서양|그리스|근대|현대|중세|영미|분석|칸트|공리|덕\s*윤리|메타/],
];

// tradition 이 비어 있을 때 쓰는 임용 단골 사상가 목록 (분야 값이 저장되면 그 값이 우선)
const KNOWN: Record<Tradition, string[]> = {
  동양윤리: [
    "공자", "맹자", "순자", "주희", "주자", "왕수인", "왕양명", "정이", "정호", "장재", "주돈이", "육구연", "육상산", "대진", "왕부지",
    "노자", "장자", "묵자", "한비자", "고자", "양주", "석가모니", "붓다", "용수", "혜능", "원효", "지눌", "의상", "간디",
  ],
  한국윤리: ["이황", "이이", "기대승", "정약용", "정제두", "박지원", "최한기", "서경덕", "조식", "성혼", "송시열", "한원진", "이간", "최제우", "최시형", "안창호", "정도전", "휴정", "보조"],
  서양윤리: [
    "소크라테스", "플라톤", "아리스토텔레스", "에피쿠로스", "에픽테토스", "세네카", "아우구스티누스", "아퀴나스", "토마스 아퀴나스", "흄", "칸트", "벤담", "밀",
    "시지윅", "무어", "로스", "프랭크퍼트", "헤어", "매킨타이어", "맥킨타이어", "니체", "사르트르", "레비나스", "요나스", "싱어", "레건", "테일러", "레오폴드",
    "스피노자", "데카르트", "스미스", "애덤 스미스", "허치슨", "섀프츠베리", "스토아", "길리건", "나딩스", "슬로트", "스캔런", "고티에",
  ],
  사회사상: [
    "홉스", "로크", "루소", "몽테스키외", "롤스", "노직", "왈처", "샌델", "마르크스", "엥겔스", "하버마스", "벌린", "하이에크", "드워킨", "킴리카", "밀러",
    "아렌트", "토크빌", "페팃", "센", "누스바움", "포퍼", "마키아벨리", "소로",
  ],
  도덕교육론: ["콜버그", "피아제", "뒤르켐", "레스트", "리코나", "블라시", "호프만", "반두라", "프로이트", "에릭슨", "투리엘", "하이트", "듀이", "라스", "윌슨", "피터스", "셀만"],
};
const KNOWN_BY_NAME = new Map(Object.entries(KNOWN).flatMap(([t, names]) => names.map((n) => [n.replace(/\s+/g, ""), t as Tradition])));

/** 분야 값 → 이름 순으로 분류 */
export function classifyPhilosopher(p: { name: string; tradition: string | null }): Tradition | typeof UNCLASSIFIED {
  const byTradition = classifyTradition(p.tradition);
  if (byTradition !== UNCLASSIFIED) return byTradition;
  return KNOWN_BY_NAME.get(p.name.replace(/\s+/g, "")) ?? UNCLASSIFIED;
}

export function classifyTradition(tradition: string | null | undefined): Tradition | typeof UNCLASSIFIED {
  const t = tradition?.replace(/\s+/g, "") ?? "";
  if (!t) return UNCLASSIFIED;
  const exact = TRADITIONS.find((x) => x === t);
  if (exact) return exact;
  return RULES.find(([, re]) => re.test(t))?.[0] ?? UNCLASSIFIED;
}

/** 챕터 순서대로 묶는다. 미분류는 맨 뒤 */
export function groupByTradition<T extends { name: string; tradition: string | null }>(items: T[]): { chapter: string; items: T[] }[] {
  const order = [...TRADITIONS, UNCLASSIFIED] as string[];
  const groups = new Map<string, T[]>(order.map((c) => [c, []]));
  for (const it of items) groups.get(classifyPhilosopher(it))!.push(it);
  return order.map((chapter) => ({ chapter, items: groups.get(chapter)! })).filter((g) => g.items.length > 0);
}
