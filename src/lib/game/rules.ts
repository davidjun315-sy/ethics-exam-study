/**
 * 철학자 대난투 규칙 (순수 계산 · npm run test:game).
 * 학습 지표(XP·복습·숙련도)와 완전히 분리된 게임 전용 수치다.
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const RARITY_NAMES: Record<Rarity, string> = { common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" };

/** 사상가 기본 능력치 제안 (= 일반 Lv.1, 관리자가 사상가별로 바꿀 수 있음) */
export const DEFAULT_BASE = { atk: 40, hp: 300 };

/** 등급 배율 (관리자 설정 기본값). 등급이 오르면 같은 사상가·같은 레벨에서 능력치가 반드시 오른다 */
export const DEFAULT_RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.2, epic: 1.45, legendary: 1.75 };

export function nextRarity(r: Rarity): Rarity | null {
  const i = RARITIES.indexOf(r);
  return i >= 0 && i < RARITIES.length - 1 ? RARITIES[i + 1] : null;
}

/** 카드를 강화 조각으로 바꿀 때 얻는 조각 (등급이 높을수록 많이) — DB 함수와 같은 값 */
export const SHARDS_FOR_CARD: Record<Rarity, number> = { common: 1, rare: 2, epic: 4, legendary: 8 };

export type SkillEffect = "strike" | "sweep" | "heal" | "guard" | "stun";
export const SKILL_EFFECTS: Record<SkillEffect, { name: string; desc: string }> = {
  strike: { name: "일격", desc: "적 하나에게 공격력의 220% 피해" },
  sweep: { name: "광역", desc: "적 전체에게 공격력의 100% 피해" },
  heal: { name: "회복", desc: "체력이 가장 낮은 아군의 최대 체력 35% 회복" },
  guard: { name: "수호", desc: "아군 전체가 다음 피해를 절반만 받음" },
  stun: { name: "기절", desc: "적 하나에게 140% 피해 + 다음 행동 1회 봉쇄" },
};

/**
 * 사상가 성향 (필살기에 따라) — 기본 능력치를 나누는 방식. 공격 × 체력 의 곱은 거의 같게 (밸런스 유지)
 * 관리자가 기본값(40/300)을 그대로 두면 이 성향 + 사상가마다 다른 흔들림으로 자동 분배된다.
 */
export const ROLES: Record<SkillEffect, { name: string; atk: number; hp: number }> = {
  strike: { name: "공격형", atk: 1.35, hp: 0.78 },
  sweep: { name: "광역형", atk: 1.12, hp: 0.9 },
  stun: { name: "제압형", atk: 1.0, hp: 1.0 },
  heal: { name: "지원형", atk: 0.82, hp: 1.22 },
  guard: { name: "수호형", atk: 0.7, hp: 1.42 },
};

export const isDefaultBase = (atk: number, hp: number) => atk === DEFAULT_BASE.atk && hp === DEFAULT_BASE.hp;

function nameHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 자동 분배 능력치: 성향 배율 × 사상가마다 다른 흔들림(공격 ±14%, 그만큼 체력은 반대로) */
export function roleBase(name: string, effect: SkillEffect): { atk: number; hp: number } {
  const r = ROLES[effect] ?? ROLES.stun;
  const h = nameHash(name.replace(/\s/g, ""));
  const v = ((h % 1000) / 1000 - 0.5) * 0.28; // 공격 ±14% (체력은 반대로)
  const w = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.08; // 체력만 ±4% (같은 숫자가 나오지 않게)
  const atk = Math.max(1, Math.round(DEFAULT_BASE.atk * r.atk * (1 + v)));
  const hp = Math.max(10, Math.round(((DEFAULT_BASE.hp * r.hp) / (1 + v)) * (1 + w)));
  return { atk, hp };
}

export const MAX_LEVEL_DEFAULT = 5;

/** 레벨마다 공격력·체력 +12% (Lv.5 = 기본의 148%) */
export function statsAt(base: { atk: number; hp: number }, level: number): { atk: number; hp: number } {
  const m = 1 + 0.12 * (Math.max(1, level) - 1);
  return { atk: Math.round(base.atk * m), hp: Math.round(base.hp * m) };
}

/** 최종 능력치 = 사상가 기본 × 등급 배율 × 레벨 배율 */
export function statsFor(
  base: { atk: number; hp: number },
  rarity: Rarity,
  level: number,
  mult: Record<Rarity, number> = DEFAULT_RARITY_MULT,
): { atk: number; hp: number } {
  const r = mult[rarity] ?? 1;
  return statsAt({ atk: base.atk * r, hp: base.hp * r }, level);
}

/**
 * 합성 가능 여부 (화면 미리보기용 · 서버 DB 함수가 최종 확인)
 * 같은 사상가 · 같은 등급 n 장 (기준 1 + 재료 n-1), 전설은 더 못 올림, 재료는 잠금·대표 카드 불가
 * 예: 일반 콜버그 + 일반 콜버그 → 희귀 콜버그 (가능) / 일반 콜버그 + 일반 루소 (불가)
 */
type FusionCard = { cardId: string; rarity: Rarity; locked: boolean; philosopherId: string };

/** 기준 카드의 합성 재료 후보: 같은 사상가 · 같은 등급 · 잠기지 않음 · 대표 카드 아님 */
export function fusionMaterials<T extends FusionCard>(base: FusionCard, owned: T[], featuredId: string | null): T[] {
  return owned.filter((o) => o.cardId !== base.cardId && o.philosopherId === base.philosopherId && o.rarity === base.rarity && !o.locked && o.cardId !== featuredId);
}

/** 이 카드를 기준으로 지금 합성할 수 있는가 (전설 제외, 재료가 합성 장수-1 이상) */
export function canFuseCard(base: FusionCard, owned: FusionCard[], featuredId: string | null, fusionCount: number): boolean {
  return Boolean(nextRarity(base.rarity)) && fusionMaterials(base, owned, featuredId).length >= fusionCount - 1;
}

export function fusionProblem(
  base: { cardId: string; rarity: Rarity; philosopherId: string } | null,
  materials: { cardId: string; rarity: Rarity; locked: boolean; philosopherId: string }[],
  opts: { fusionCount: number; featuredId: string | null; coins: number; cost: number },
): string | null {
  if (!base) return "기준 카드를 고르세요";
  if (!nextRarity(base.rarity)) return "전설은 최고 등급입니다";
  if (materials.length !== opts.fusionCount - 1) return `재료 카드 ${opts.fusionCount - 1}장을 고르세요`;
  if (materials.some((m) => m.cardId === base.cardId) || new Set(materials.map((m) => m.cardId)).size !== materials.length) return "같은 카드를 두 번 쓸 수 없습니다";
  if (materials.some((m) => m.philosopherId !== base.philosopherId)) return "같은 사상가 카드끼리만 합성할 수 있습니다";
  if (materials.some((m) => m.rarity !== base.rarity)) return "같은 등급끼리만 합성할 수 있습니다";
  if (materials.some((m) => m.locked)) return "잠긴 카드는 재료로 쓸 수 없습니다";
  if (materials.some((m) => m.cardId === opts.featuredId)) return "대표 카드는 재료로 쓸 수 없습니다";
  if (opts.coins < opts.cost) return "코인이 부족합니다";
  return null;
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

/** 확률 표시용 비율. 모든 사상가가 모든 등급으로 나오므로 available 은 네 등급 전부 (DB 함수와 같은 계산) */
export function effectiveRates(rates: Partial<Record<Rarity, number>>, available: Rarity[] = RARITIES): Record<Rarity, number> {
  const out = { common: 0, rare: 0, epic: 0, legendary: 0 };
  const total = available.reduce((n, r) => n + Math.max(0, rates[r] ?? 0), 0);
  if (total <= 0) return out;
  for (const r of available) out[r] = Math.max(0, rates[r] ?? 0) / total;
  return out;
}
