/**
 * 사상가별 전투 연출 (도장깨기 전장). 규칙과는 무관하고 보이는 모습만.
 *  - colors: [주색, 보조색, 빛]   motif: 스킬이 날아가는 모양   glyph: 사상을 상징하는 글자 (마법진·글자비에 씀)
 *  - 표에 없는 사상가는 이름으로 정해진(항상 같은) 조합을 고른다
 */
export type FxMotif = "beam" | "rain" | "pillar" | "orbs" | "slash" | "sigil";

export interface FxTheme {
  colors: [string, string, string];
  motif: FxMotif;
  glyph: string;
}

const T = (c1: string, c2: string, c3: string, motif: FxMotif, glyph: string): FxTheme => ({ colors: [c1, c2, c3], motif, glyph });

/** 대표 사상가 (임용 윤리 교과에 자주 나오는 인물) */
const THEMES: Record<string, FxTheme> = {
  // 동양
  공자: T("#ffd36b", "#ff9f43", "#fff3c4", "sigil", "仁"),
  맹자: T("#ff6b6b", "#ffb86b", "#ffe1c4", "slash", "義"),
  순자: T("#7fd0ff", "#4c7dff", "#d9f1ff", "rain", "禮"),
  노자: T("#9ff0bf", "#3fb68b", "#e4ffef", "orbs", "道"),
  장자: T("#b9a6ff", "#7fd0ff", "#efe9ff", "orbs", "遊"),
  묵자: T("#ffb36b", "#d9772b", "#ffe8cc", "rain", "兼"),
  한비자: T("#c0c6d0", "#6b7380", "#f1f3f6", "slash", "法"),
  석가모니: T("#ffe28a", "#ffffff", "#fff9e0", "pillar", "空"),
  붓다: T("#ffe28a", "#ffffff", "#fff9e0", "pillar", "空"),
  혜능: T("#ffe9a8", "#c8b6ff", "#ffffff", "pillar", "頓"),
  주희: T("#6bd6ff", "#3b6fd8", "#dff6ff", "beam", "理"),
  왕수인: T("#ff7ad6", "#b58bff", "#ffe0f5", "beam", "心"),
  왕양명: T("#ff7ad6", "#b58bff", "#ffe0f5", "beam", "心"),
  // 한국
  원효: T("#ffd36b", "#9ff0bf", "#fff6d6", "pillar", "和"),
  의상: T("#c8b6ff", "#7fd0ff", "#f1edff", "sigil", "一"),
  지눌: T("#9fd8ff", "#ffffff", "#ecf8ff", "pillar", "定"),
  이황: T("#7fe0a6", "#2f9e6e", "#e4fff0", "sigil", "敬"),
  이이: T("#ffb84d", "#ff6b6b", "#fff0d6", "orbs", "氣"),
  정약용: T("#7fd0ff", "#ffd36b", "#e8f7ff", "rain", "實"),
  정제두: T("#ff9ad5", "#ffd36b", "#ffe8f5", "beam", "良"),
  최한기: T("#9ff0bf", "#7fd0ff", "#eafff4", "orbs", "測"),
  // 서양
  소크라테스: T("#e8eef8", "#8fb4ff", "#ffffff", "beam", "ΓΝΩΘΙ"),
  플라톤: T("#b58bff", "#6bd6ff", "#efe6ff", "pillar", "ΙΔΕΑ"),
  아리스토텔레스: T("#ffd36b", "#7fe0a6", "#fff6d6", "sigil", "ΑΡΕΤΗ"),
  에피쿠로스: T("#ff9ad5", "#ffd36b", "#ffe8f5", "orbs", "ATARAXIA"),
  아우구스티누스: T("#ffe28a", "#ff8a65", "#fff7e0", "pillar", "AMOR"),
  아퀴나스: T("#ffe28a", "#9fd8ff", "#fffbe8", "pillar", "LEX"),
  홉스: T("#9aa4b5", "#ef6a5a", "#e9edf3", "slash", "LEVIATHAN"),
  로크: T("#7fe0a6", "#ffd36b", "#e9fff2", "beam", "LIBERTY"),
  루소: T("#9ff0bf", "#ffb86b", "#eefff4", "orbs", "VOLONTÉ"),
  흄: T("#c8b6ff", "#ff9ad5", "#f3eeff", "orbs", "SYMPATHY"),
  칸트: T("#8fb4ff", "#e8eef8", "#ffffff", "sigil", "PFLICHT"),
  벤담: T("#ffd36b", "#7fe0a6", "#fff7d6", "rain", "PLEASURE"),
  밀: T("#7fe0a6", "#ffd36b", "#eafff2", "rain", "UTILITY"),
  헤겔: T("#ff8a65", "#b58bff", "#ffe6dd", "beam", "GEIST"),
  마르크스: T("#ef4444", "#ffb86b", "#ffe1e1", "slash", "PRAXIS"),
  니체: T("#b58bff", "#ef4444", "#f2e9ff", "slash", "ÜBERMENSCH"),
  사르트르: T("#9aa4b5", "#ffd36b", "#eef1f5", "beam", "LIBERTÉ"),
  레비나스: T("#ffe9c4", "#9fd8ff", "#fffaf0", "pillar", "VISAGE"),
  요나스: T("#7fe0a6", "#6bd6ff", "#e8fff4", "sigil", "VERANTWORTUNG"),
  // 사회사상
  롤스: T("#6bd6ff", "#ffd36b", "#e3f8ff", "sigil", "JUSTICE"),
  노직: T("#ffd36b", "#ef6a5a", "#fff4d6", "slash", "ENTITLEMENT"),
  샌델: T("#9ff0bf", "#b58bff", "#eafff4", "orbs", "COMMON GOOD"),
  싱어: T("#7fe0a6", "#ffb86b", "#e9fff2", "rain", "EQUALITY"),
  하버마스: T("#8fb4ff", "#9ff0bf", "#eaf1ff", "beam", "DISKURS"),
  매킨타이어: T("#ffb86b", "#c8b6ff", "#fff0dd", "sigil", "VIRTUE"),
  길리건: T("#ff9ad5", "#9ff0bf", "#ffe8f5", "orbs", "CARE"),
  나딩스: T("#ff9ad5", "#ffd36b", "#ffe8f5", "orbs", "CARE"),
  콜버그: T("#8fb4ff", "#ffd36b", "#eaf1ff", "pillar", "STAGE"),
};

const FALLBACK_COLORS: [string, string, string][] = [
  ["#ffd36b", "#ff9f43", "#fff3c4"],
  ["#6bd6ff", "#3b6fd8", "#dff6ff"],
  ["#ff7ad6", "#b58bff", "#ffe0f5"],
  ["#7fe0a6", "#2f9e6e", "#e4fff0"],
  ["#ff6b6b", "#ffb86b", "#ffe1c4"],
  ["#b58bff", "#6bd6ff", "#efe6ff"],
];
const MOTIFS: FxMotif[] = ["beam", "rain", "pillar", "orbs", "slash", "sigil"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function fxTheme(name: string, skillName = ""): FxTheme {
  const n = name.replace(/\s/g, "");
  const hit = THEMES[n] ?? Object.entries(THEMES).find(([k]) => k.length >= 2 && n.includes(k))?.[1];
  if (hit) return hit;
  const h = hash(n);
  return { colors: FALLBACK_COLORS[h % FALLBACK_COLORS.length], motif: MOTIFS[(h >>> 4) % MOTIFS.length], glyph: (skillName.trim()[0] ?? n[0] ?? "✦").toUpperCase() };
}
