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
    "노자", "장자", "묵자", "한비자", "고자", "양주", "석가모니", "붓다", "용수", "혜능", "간디",
  ],
  한국윤리: [
    // 불교 · 고려 이전
    "원효", "의상", "의천", "지눌", "보조", "혜초", "균여", "일연", "도선", "휴정", "서산대사", "기화", "김시습",
    // 성리학 · 조선
    "정도전", "권근", "서경덕", "이언적", "조광조", "이황", "퇴계", "이이", "율곡", "기대승", "조식", "성혼", "송시열", "김장생", "한원진", "이간", "정제두", "하곡",
    // 실학 · 근대
    "유형원", "이익", "성호", "안정복", "홍대용", "박지원", "연암", "박제가", "정약용", "다산", "정약전", "최한기", "김정희", "이제마",
    "이항로", "기정진", "최익현", "유인석", "최제우", "수운", "최시형", "해월", "손병희", "강일순", "나철", "박중빈", "한용운", "박은식", "신채호", "안창호", "도산", "김구", "안중근", "함석헌", "장지연", "정인보",
  ],
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

/** 이름 정리: 공백 · 괄호 부연 · 『책 이름』 을 뗌 (예: 이황(퇴계) → 이황) */
const plainName = (n: string) => n.replace(/[(（[].*?[)）\]]/g, "").replace(/[『「].*?[』」]/g, "").replace(/\s+/g, "");

/**
 * 분류 순서: 한국 사상가 이름 → 분야 값 → 이름.
 * 한국 사상가는 분야 값이 '동양윤리'·'성리학'·'불교'처럼 적혀 있어도 한국윤리로 (예: 이황 · 이이 · 원효)
 */
export function classifyPhilosopher(p: { name: string; tradition: string | null }): Tradition | typeof UNCLASSIFIED {
  const name = plainName(p.name);
  if (KNOWN_BY_NAME.get(name) === "한국윤리") return "한국윤리";
  const byTradition = classifyTradition(p.tradition);
  if (byTradition !== UNCLASSIFIED) return byTradition;
  return KNOWN_BY_NAME.get(name) ?? UNCLASSIFIED;
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
