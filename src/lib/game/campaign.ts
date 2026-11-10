/**
 * 사상가 도장깨기 (순수 계산: 서버·화면·테스트가 같은 규칙)
 *  - 공개된 사상가마다 한 관. 순서: 분야(동양 → 한국 → 서양 → 사회사상) 안에서 태어난 해 순
 *  - 한 관 = 그 사상가 한 명(보스). 내 배틀 덱 3장과 자동 배틀 (3 vs 1, battle.ts)
 *  - 보스 레벨 = 관 번호 (매 관 오름), 등급은 일반 → 희귀 → 영웅 → 전설
 *  - 보스 능력치는 모든 사상가의 평균 기본 능력치로 계산 → 뒤 관이 언제나 앞 관보다 강함 (사상가마다 기본값이 달라도)
 *  - 앞 관을 모두 깨야 다음 관이 열린다
 */
import type { Fighter } from "./battle.ts";
import { DEFAULT_RARITY_MULT, type Rarity, type SkillEffect } from "./rules.ts";

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
  tradition: string;
  tier: number; // 0~4 (별 1~5개)
  rarity: Rarity;
  /** 보스 레벨 (= 관 번호, 매 관 오름) */
  level: number;
  /** 능력치 계산용 레벨 (1 → 카드 최대 레벨, 연속값) */
  statLevel: number;
  /** 보스 능력치 = 평균 기본 능력치 × 등급 배율 × 레벨 배율 × 보스 배율 (혼자 3장과 싸우므로 체력이 큼) */
  hpMul: number;
  atkMul: number;
  base: { atk: number; hp: number };
  /** 보스 사상가의 성향 모양 (공격형은 공격↑ 체력↓ …). 공격×체력 곱은 1 → 전체 강함은 그대로 */
  shape: { atk: number; hp: number };
}

/** 첫 관 클리어 보상 (017 전): 보스 사상가 강화 조각 */
export const STAGE_CLEAR_SHARDS = 3;
/**
 * 첫 관 클리어 보상 (017): 강화석. 1~10관 1개, 11~20관 2개, 21~30관 3개 …
 * 카드 한 장을 Lv.1 → 5 로 올리는 데 강화석 10개 (합성해도 레벨은 유지) → 10관마다 대략 카드 1~2장 분량
 */
export const stageStones = (no: number) => 1 + Math.floor((Math.max(1, no) - 1) / 10);

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

/** 보스 배율: 첫 관 → 마지막 관 (시뮬레이션으로 정함, scripts/test-duel.ts) */
export const BOSS_TUNE = { hp: [2.1, 2.25] as [number, number], atk: [0.85, 0.8] as [number, number] };
/** 진행도(0~1)에 따른 보스 등급: 앞 20% 일반 · 45% 까지 희귀 · 75% 까지 영웅 · 나머지 전설 */
const rarityAt = (t: number): Rarity => (t < 0.2 ? "common" : t < 0.45 ? "rare" : t < 0.75 ? "epic" : "legendary");

const lerp = ([a, b]: [number, number], t: number) => Math.round((a + (b - a) * t) * 100) / 100;

/** 모든 관 */
export function buildCampaign<T extends Pick<StageCard, "philosopherId" | "name" | "tradition"> & Partial<Pick<StageCard, "baseAtk" | "baseHp">>>(cards: T[], maxLevel: number, tune = BOSS_TUNE): CampaignStage[] {
  const ordered = orderStageCards(cards);
  const n = ordered.length;
  const withBase = cards.filter((c) => c.baseAtk && c.baseHp);
  const base = withBase.length
    ? { atk: withBase.reduce((s, c) => s + c.baseAtk!, 0) / withBase.length, hp: withBase.reduce((s, c) => s + c.baseHp!, 0) / withBase.length }
    : { atk: 40, hp: 300 };
  return ordered.map((boss, i) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const tier = Math.min(4, Math.floor(t * 5));
    // 성향 모양: 이 사상가 기본값 ÷ 평균, 곱이 1 이 되게 맞춤
    let shape = { atk: 1, hp: 1 };
    if (boss.baseAtk && boss.baseHp) {
      const a = boss.baseAtk / base.atk;
      const h = boss.baseHp / base.hp;
      const k = Math.sqrt(a * h);
      shape = { atk: a / k, hp: h / k };
    }
    return {
      index: i,
      no: i + 1,
      bossId: boss.philosopherId,
      tradition: boss.tradition,
      tier,
      rarity: rarityAt(t),
      level: i + 1,
      statLevel: 1 + t * (maxLevel - 1),
      hpMul: lerp(tune.hp, t),
      atkMul: lerp(tune.atk, t),
      base,
      shape,
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

/** 관 보스 능력치 (평균 기본값 기준이라 관 번호가 클수록 언제나 강함) */
export function stageBossStats(stage: CampaignStage, mult: Record<Rarity, number> = DEFAULT_RARITY_MULT) {
  const r = mult[stage.rarity] ?? 1;
  const lv = 1 + 0.12 * (stage.statLevel - 1); // statsAt 과 같은 레벨 배율 (연속값)
  const shape = stage.shape ?? { atk: 1, hp: 1 };
  return { atk: Math.round(stage.base.atk * r * lv * stage.atkMul * shape.atk), hp: Math.round(stage.base.hp * r * lv * stage.hpMul * shape.hp) };
}

/** 관 보스 → 배틀 참가자 */
export function stageBoss(stage: CampaignStage, c: StageCard, mult?: Record<Rarity, number>): Fighter {
  const st = stageBossStats(stage, mult);
  return { key: "foe-0", philosopherId: c.philosopherId, name: c.name, atk: st.atk, hp: st.hp, skillName: c.skillName, skillEffect: c.skillEffect, scale: stage.hpMul };
}
