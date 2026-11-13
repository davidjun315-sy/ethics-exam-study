/**
 * 빈출 사상가 보정 (순수 계산: 서버 · 화면 · 테스트 공통).
 * 사상가 정복 보상이 높고 얻기 어려운 사상가(기출에 자주 나와 문제가 많은 사상가)일수록 카드 기본 능력치가 높다.
 *  - 보상 등급 = 완전 기출 정복 보상(10문항↑ 전설)과 부분 기출 정복 보상(10↑ 일반 · 20↑ 희귀 · 30↑ 영웅) 중 높은 쪽
 *  - 같은 전설 사상가라도 완전 기출이 많을수록 조금 더 (최대 +20%)
 *  - 보상 등급이 아직 없는 사상가도 완전 기출 문항 수만큼 조금 (최대 2.7%)
 * 도장깨기 관 순서도 같은 빈출 기준 (적게 나온 사상가 → 많이 나온 사상가).
 */
import { conquestRarity, fullConquestRarity, type ConquestRarity } from "../quiz/fun-core.ts";

const ORDER: ConquestRarity[] = ["common", "rare", "epic", "legendary"];
/** 보상 등급별 기본 능력치 보정 */
export const PRESTIGE_BONUS: Record<ConquestRarity, number> = { common: 0.03, rare: 0.06, epic: 0.1, legendary: 0.15 };
export const PRESTIGE_MAX = 0.2;

export interface Prestige {
  /** 연결된 완전 기출 문항 수 (연계 문항 포함) */
  full: number;
  /** 윤리 퀴즈 부분 기출 문제 수 */
  part: number;
  /** 정복 보상 등급 (둘 중 높은 쪽, 없으면 null) */
  rarity: ConquestRarity | null;
  /** 기본 능력치 보정 (0.15 = +15%) */
  bonus: number;
}

export function prestigeOf(full: number, part: number): Prestige {
  const a = fullConquestRarity(full), b = conquestRarity(part);
  const rarity = [a, b].filter((x): x is ConquestRarity => Boolean(x)).sort((x, y) => ORDER.indexOf(y) - ORDER.indexOf(x))[0] ?? null;
  // 보상 등급이 없어도 자주 나온 만큼 조금 (완전 기출 1문항당 0.3%, 일반 등급 3% 보다 작게)
  let bonus = rarity ? PRESTIGE_BONUS[rarity] : Math.min(0.027, full * 0.003);
  if (rarity === "legendary") bonus = Math.min(PRESTIGE_MAX, bonus + Math.max(0, full - 10) * 0.005);
  return { full, part, rarity, bonus: Math.round(bonus * 1000) / 1000 };
}

/** 빈출 정도 (관 순서용): 완전 기출 문항 수 → 부분 기출 문제 수 */
export const frequencyOf = (p: Prestige | null | undefined) => (p ? p.full * 1000 + p.part : 0);

/** 기본 능력치에 보정 적용 */
export const withPrestige = (base: { atk: number; hp: number }, p: Prestige | null | undefined) => (p?.bonus ? { atk: Math.round(base.atk * (1 + p.bonus)), hp: Math.round(base.hp * (1 + p.bonus)) } : base);
