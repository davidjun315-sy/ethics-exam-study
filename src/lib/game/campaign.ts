/**
 * 논쟁 대전 — 사상가 도장깨기 (순수 계산: 서버·화면·테스트가 같은 규칙)
 *  - 공개된 사상가마다 한 관. 순서: 분야(동양 → 한국 → 서양 → 사회사상) 안에서 태어난 해 순
 *  - 한 관 = 보스 사상가 + 함께 나오는 사상가 3명 (같은 분야·가까운 순서). 덱은 [보스, 1, 2, 3] 을 돌아가며 채움
 *  - 뒤 관일수록 등급·레벨·컴퓨터 실력이 오른다. 앞 관을 모두 깨야 다음 관이 열린다
 */
import type { Difficulty } from "./battle.ts";
import { toDuelCard, type DuelCardDef, type DuelRules } from "./duel.ts";
import { DEFAULT_RARITY_MULT, statsFor, type Rarity, type SkillEffect } from "./rules.ts";

export interface StageCard {
  philosopherId: string;
  name: string;
  tradition: string;
  baseAtk: number;
  baseHp: number;
  skillEffect: SkillEffect;
  skillName: string;
  artUrl: string | null;
}

export interface CampaignStage {
  index: number; // 0부터
  no: number; // 1관, 2관 …
  bossId: string;
  allyIds: string[];
  tradition: string;
  tier: number; // 0~4
  level: number;
  bossLevel: number;
  bossRarity: Rarity;
  allyRarities: Rarity[];
  ai: Difficulty;
  /** 상대 능력치 배율: 앞 관은 약하게 (같은 분야 덱이라 공명이 늘 켜지므로) */
  power: number;
}

/** 첫 관 클리어 보상: 보스 사상가 강화 조각 */
export const STAGE_CLEAR_SHARDS = 3;

const TRADITION_ORDER = ["동양윤리", "한국윤리", "서양윤리", "사회사상"];

/** 태어난 해 (대략, 기원전은 음수). 표에 없으면 분야 맨 뒤 (이름순) */
const BORN: Record<string, number> = {
  // 동양
  석가모니: -563, 붓다: -563, 공자: -551, 묵자: -470, 노자: -460, 양주: -440, 맹자: -372, 장자: -369, 순자: -310, 한비자: -280, 동중서: -179,
  혜능: 638, 주돈이: 1017, 장재: 1020, 정호: 1032, 정이: 1033, 주희: 1130, 육구연: 1139, 왕수인: 1472, 왕양명: 1472, 이지: 1527, 황종희: 1610, 대진: 1724,
  // 한국
  원효: 617, 의상: 625, 지눌: 1158, 정도전: 1342, 서경덕: 1489, 이황: 1501, 조식: 1501.5, 기대승: 1527, 성혼: 1535, 이이: 1536, 정제두: 1649, 이익: 1681,
  홍대용: 1731, 박지원: 1737, 박제가: 1750, 정약용: 1762, 최한기: 1803, 최제우: 1824, 박은식: 1859, 안창호: 1878,
  // 서양
  소크라테스: -470, 플라톤: -428, 아리스토텔레스: -384, 에피쿠로스: -341, 제논: -334, 세네카: -4, 에픽테토스: 50, 아우구스티누스: 354, 아퀴나스: 1225,
  마키아벨리: 1469, 홉스: 1588, 데카르트: 1596, 스피노자: 1632, 로크: 1632.5, 흄: 1711, 루소: 1712, 스미스: 1723, 칸트: 1724, 벤담: 1748, 헤겔: 1770,
  쇼펜하우어: 1788, 밀: 1806, 키르케고르: 1813, 마르크스: 1818, 니체: 1844, 듀이: 1859, 슈바이처: 1875, 레오폴드: 1887, 하이데거: 1889, 피아제: 1896,
  요나스: 1903, 사르트르: 1905, 레비나스: 1906, 아렌트: 1906.5, 네스: 1912, 롤스: 1921, 콜버그: 1927, 하버마스: 1929, 나딩스: 1929.5, 매킨타이어: 1929.7,
  테일러: 1931, 왈처: 1935, 길리건: 1936, 노직: 1938, 레건: 1938.5, 싱어: 1946, 호네트: 1949, 샌델: 1953,
};

export function bornYear(name: string): number {
  const n = name.replace(/\s/g, "");
  if (BORN[n] !== undefined) return BORN[n];
  const key = Object.keys(BORN).find((k) => k.length >= 2 && n.includes(k));
  return key ? BORN[key] : 9999;
}

/** 관 순서대로 정렬 */
export function orderStageCards<T extends Pick<StageCard, "philosopherId" | "name" | "tradition">>(cards: T[]): T[] {
  const ti = (t: string) => {
    const i = TRADITION_ORDER.indexOf(t);
    return i < 0 ? TRADITION_ORDER.length : i;
  };
  return [...cards].sort((a, b) => ti(a.tradition) - ti(b.tradition) || bornYear(a.name) - bornYear(b.name) || a.name.localeCompare(b.name) || a.philosopherId.localeCompare(b.philosopherId));
}

const POWER_START = 0.55;
const POWER_END = 0.75;
const POWER_FULL_AT = 1.0;

const TIERS: { boss: Rarity; allies: Rarity[] }[] = [
  { boss: "rare", allies: ["common", "common", "common"] },
  { boss: "rare", allies: ["common", "rare", "common"] },
  { boss: "epic", allies: ["rare", "rare", "common"] },
  { boss: "epic", allies: ["rare", "epic", "rare"] },
  { boss: "legendary", allies: ["epic", "epic", "rare"] },
];

/** 모든 관 (보스·동료·난이도) */
export function buildCampaign<T extends Pick<StageCard, "philosopherId" | "name" | "tradition">>(cards: T[], maxLevel: number): CampaignStage[] {
  const ordered = orderStageCards(cards);
  const n = ordered.length;
  return ordered.map((boss, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const tier = Math.min(TIERS.length - 1, Math.floor(t * TIERS.length));
    // 동료: 같은 분야 → 가까운 순서 → 앞 관(이미 만난 사상가) 우선
    const allies = ordered
      .map((c, j) => ({ c, j }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => (a.c.tradition === boss.tradition ? 0 : 1) - (b.c.tradition === boss.tradition ? 0 : 1) || Math.abs(a.j - i) - Math.abs(b.j - i) || a.j - b.j)
      .slice(0, 3)
      .map(({ c }) => c.philosopherId);
    const level = Math.max(1, Math.min(maxLevel, 1 + Math.round(t * (maxLevel - 1) * 0.75)));
    return {
      index: i,
      no: i + 1,
      bossId: boss.philosopherId,
      allyIds: allies,
      tradition: boss.tradition,
      tier,
      level,
      bossLevel: Math.min(maxLevel, level + (tier >= 2 ? 1 : 0)),
      bossRarity: TIERS[tier].boss,
      allyRarities: TIERS[tier].allies,
      ai: t < 0.34 ? "easy" : t < 0.67 ? "normal" : "hard",
      power: Math.round(Math.min(POWER_END, POWER_START + (POWER_END - POWER_START) * (t / POWER_FULL_AT)) * 100) / 100,
    };
  });
}

export type StageStatus = "cleared" | "current" | "locked";

/** 앞 관을 모두 깨야 열림. 깬 관은 다시 도전 가능 (보상은 처음 한 번) */
export function stageStatuses(stages: CampaignStage[], cleared: Set<string>): StageStatus[] {
  let open = true;
  return stages.map((s) => {
    if (cleared.has(s.bossId)) return "cleared";
    if (open) {
      open = false;
      return "current";
    }
    return "locked";
  });
}

export const canPlayStage = (stages: CampaignStage[], cleared: Set<string>, bossId: string) => {
  const i = stages.findIndex((s) => s.bossId === bossId);
  return i >= 0 && stageStatuses(stages, cleared)[i] !== "locked";
};

/** 관의 상대 덱: [보스, 동료1, 동료2, 동료3] 을 돌아가며 덱 크기만큼 */
export function stageDeck(stage: CampaignStage, byId: Map<string, StageCard>, rules: DuelRules, mult: Record<Rarity, number> = DEFAULT_RARITY_MULT): DuelCardDef[] {
  const slots = [stage.bossId, ...stage.allyIds];
  const out: DuelCardDef[] = [];
  for (let k = 0; k < rules.deckSize; k++) {
    const slot = k % slots.length;
    const c = byId.get(slots[slot]);
    if (!c) continue;
    const isBoss = slot === 0;
    const rarity = isBoss ? stage.bossRarity : stage.allyRarities[(slot - 1) % stage.allyRarities.length];
    const level = isBoss ? stage.bossLevel : stage.level;
    const st0 = statsFor({ atk: c.baseAtk, hp: c.baseHp }, rarity, level, mult);
    const st = { atk: st0.atk * stage.power, hp: st0.hp * stage.power };
    out.push(
      toDuelCard(
        { uid: `f${k}`, cardId: null, philosopherId: c.philosopherId, name: c.name, tradition: c.tradition, rarity, level, effect: c.skillEffect, skillName: c.skillName, artUrl: c.artUrl, statAtk: st.atk, statHp: st.hp },
        rules,
      ),
    );
  }
  return out;
}
