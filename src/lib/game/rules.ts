/**
 * 철학자 대난투 규칙 (순수 계산 · npm run test:game).
 * 학습 지표(XP·복습·숙련도)와 완전히 분리된 게임 전용 수치다.
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_NAMES: Record<Rarity, string> = { common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" };

/** 새 카드를 준비할 때 등급별 기본 능력치 제안 (관리자가 바꿀 수 있음) */
export const RARITY_BASE: Record<Rarity, { atk: number; hp: number }> = {
  common: { atk: 40, hp: 300 },
  rare: { atk: 46, hp: 340 },
  epic: { atk: 53, hp: 380 },
  legendary: { atk: 60, hp: 420 },
};

export type SkillEffect = "strike" | "sweep" | "heal" | "guard" | "stun";
export const SKILL_EFFECTS: Record<SkillEffect, { name: string; desc: string }> = {
  strike: { name: "일격", desc: "적 하나에게 공격력의 220% 피해" },
  sweep: { name: "광역", desc: "적 전체에게 공격력의 100% 피해" },
  heal: { name: "회복", desc: "체력이 가장 낮은 아군의 최대 체력 35% 회복" },
  guard: { name: "수호", desc: "아군 전체가 다음 피해를 절반만 받음" },
  stun: { name: "기절", desc: "적 하나에게 140% 피해 + 다음 행동 1회 봉쇄" },
};

export const MAX_LEVEL_DEFAULT = 5;

/** 레벨마다 공격력·체력 +12% (Lv.5 = 기본의 148%) */
export function statsAt(base: { atk: number; hp: number }, level: number): { atk: number; hp: number } {
  const m = 1 + 0.12 * (Math.max(1, level) - 1);
  return { atk: Math.round(base.atk * m), hp: Math.round(base.hp * m) };
}

/** level → level+1 에 필요한 강화 조각·코인 (확정 성공) */
export function upgradeCost(level: number): { shards: number; coins: number } {
  const coins = [0, 50, 100, 150, 250, 350, 450, 550, 650, 750][level] ?? 750 + (level - 9) * 100;
  return { shards: level, coins };
}

export function canUpgrade(c: { level: number; shards: number }, coins: number, maxLevel: number) {
  if (c.level >= maxLevel) return { ok: false, reason: "최대 레벨" as const };
  const cost = upgradeCost(c.level);
  if (c.shards < cost.shards) return { ok: false, reason: "조각 부족" as const, cost };
  if (coins < cost.coins) return { ok: false, reason: "코인 부족" as const, cost };
  return { ok: true as const, cost };
}

// ---------------------------------------------------------------------
// 학습 코인
// ---------------------------------------------------------------------
export interface CoinRules {
  fill_correct: number;
  essay_correct: number;
  essay_partial: number;
  wrong: number;
  mission: number;
  reconquer: number;
  daily_cap: number;
  essay_min_chars: number;
}
export const DEFAULT_COIN_RULES: CoinRules = {
  fill_correct: 20,
  essay_correct: 30,
  essay_partial: 15,
  wrong: 5,
  mission: 50,
  reconquer: 15,
  daily_cap: 600,
  essay_min_chars: 30,
};

/**
 * 한 문제 풀이의 코인.
 * - 경험치를 받는 풀이에만 (같은 문제는 하루 한 번) → 같은 문제 반복으로 무한히 얻지 못함
 * - 자기평가 악용 방지: 자기평가 문제는 답안을 써야(서술형 essay_min_chars 자, 기입형 2자 이상) 정답·부분 코인, 아니면 해설 확인 코인만
 *   (자동 채점 기입형은 서버가 판정하므로 제한 없음)
 * - 하루 상한(daily_cap)은 DB 함수가 지급 시점에 적용
 */
export function quizCoins(
  a: { format: "fill" | "essay"; selfGraded: boolean; result: "correct" | "partial" | "wrong"; answerLength: number; xpAwarded: boolean; reconquered: boolean },
  rules: CoinRules = DEFAULT_COIN_RULES,
): { base: number; reconquer: number; reason: string } {
  if (!a.xpAwarded) return { base: 0, reconquer: 0, reason: "오늘 이미 보상을 받은 문제" };
  const need = a.format === "essay" ? rules.essay_min_chars : 2;
  if (a.selfGraded && a.result !== "wrong" && a.answerLength < need) {
    return { base: rules.wrong, reconquer: 0, reason: `자기평가 문제는 답안을 ${need}자 이상 써야 정답 코인을 받습니다` };
  }
  const base =
    a.result === "wrong"
      ? rules.wrong
      : a.format === "fill"
        ? a.result === "correct"
          ? rules.fill_correct
          : rules.essay_partial
        : a.result === "correct"
          ? rules.essay_correct
          : rules.essay_partial;
  return { base, reconquer: a.reconquered && a.result === "correct" ? rules.reconquer : 0, reason: "" };
}

/** 확률 표시용: 공개 카드가 있는 등급만으로 다시 나눈 비율 (DB 함수와 같은 계산) */
export function effectiveRates(rates: Partial<Record<Rarity, number>>, available: Rarity[]): Record<Rarity, number> {
  const out = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const total = available.reduce((n, r) => n + Math.max(0, rates[r] ?? 0), 0);
  if (total <= 0) return out;
  for (const r of available) out[r] = Math.max(0, rates[r] ?? 0) / total;
  return out;
}
