/**
 * 사상의 탑 (순수 규칙: 서버 · 화면 · 테스트 공통).
 *
 * 한 층 = 적 사상가 한 명. 그 사상가 기출 문제를 풀어 맞히면 내 팀이 공격, 틀리면 적이 공격.
 * 올라갈수록 문제가 어려워지고(개념 → 부분 기출 하·중·상 → 완전 기출 서술형) 적도 강해진다.
 * 10층마다 보스층 (문제 더 많이 · 비교 문항 우선). 층을 깨면 강화 3개 중 하나를 고른다.
 * 내 팀 체력이 0이 되면 도전 끝. 하루 3번 (그날 출석하면 +1).
 */
import type { Rarity } from "./rules.ts";

export const TOWER_DAILY_TRIES = 3;
export const TOWER_ATTEND_BONUS = 1;
export const TOWER_TEAM_SIZE = 3;
/** 정답 한 번의 기본 피해 (적 체력은 이것의 몇 배 = 맞혀야 하는 문제 수) */
export const HIT = 100;
/** 빠른 정답 (이 초 안) → 피해 +20% (서술형은 제외) */
export const QUICK_SEC = 20;
export const COMBO_STEP = 0.1;
export const COMBO_MAX = 0.5;

export type TowerTier = 1 | 2 | 3 | 4;
export interface TierInfo {
  tier: TowerTier;
  name: string;
  floors: string;
  /** 이 구간 문제 설명 (화면) */
  questions: string;
  enemy: Rarity;
}
export const TIERS: Record<TowerTier, TierInfo> = {
  1: { tier: 1, name: "기초의 회랑", floors: "1~10층", questions: "개념 다지기 · 기출 하", enemy: "common" },
  2: { tier: 2, name: "논증의 계단", floors: "11~20층", questions: "부분 기출 중", enemy: "rare" },
  3: { tier: 3, name: "비판의 첨탑", floors: "21~30층", questions: "부분 기출 상 · 정답률 낮은 문항", enemy: "epic" },
  4: { tier: 4, name: "성찰의 정상", floors: "31층~", questions: "어려운 기출 · 완전 기출 서술형(AI 채점)", enemy: "legendary" },
};

export const tierOf = (floor: number): TowerTier => (floor <= 10 ? 1 : floor <= 20 ? 2 : floor <= 30 ? 3 : 4);
export const isBossFloor = (floor: number) => floor % 10 === 0;

/** 이 층에서 맞혀야 하는 문제 수 (적 체력 = 이것 × HIT). 일반 3 · 보스 5, 31층부터 일반 4 · 보스 6 */
export function hitsToClear(floor: number): number {
  if (isBossFloor(floor)) return floor > 30 ? 6 : 5;
  return floor > 30 ? 4 : 3;
}
export const enemyMaxHp = (floor: number) => hitsToClear(floor) * HIT;

/** 틀렸을 때 적의 공격 (내 팀 체력 100 기준). 올라갈수록 · 보스일수록 아프다 */
export function enemyHit(floor: number): number {
  // 31층부터는 층마다 더 가파르게 (정상은 정말 어렵게)
  const base = 16 + floor * 0.9 + Math.max(0, floor - 30) * 1.6;
  return Math.round(isBossFloor(floor) ? base * 1.3 : base);
}

/**
 * 카드 팀 보정 (문제 실력이 주, 카드는 보조): 팀 공격력이 그 층의 기준보다 높으면 피해 ↑ (0.75~1.4배)
 * 기준: 일반 Lv.1 세 장(공격 합 ≈ 120)에서 층마다 3%씩
 */
export function teamPowerMult(teamAtk: number, floor: number): number {
  const ref = 120 * (1 + 0.03 * (floor - 1));
  return clamp(teamAtk / ref, 0.75, 1.4);
}
/** 내 팀 최대 체력 (100 기준, 카드 체력이 높을수록 ↑ · 0.85~1.5배) */
export function teamMaxHp(teamHp: number): number {
  return Math.round(100 * clamp(teamHp / 900, 0.85, 1.5));
}

export type Verdict = "correct" | "partial" | "wrong";
export interface TowerBuffs {
  /** 공격 강화 (영구, 겹침): 피해 +비율 */
  power: number;
  /** 다음 오답 한 번 막기 */
  shield: number;
  /** 힌트권 (보기 하나 지우기 · 첫 글자) */
  hints: number;
}
export const NO_BUFFS: TowerBuffs = { power: 0, shield: 0, hints: 0 };

export interface RunState {
  floor: number;
  hp: number;
  maxHp: number;
  enemyHp: number;
  enemyMax: number;
  combo: number;
  buffs: TowerBuffs;
  /** 이번 도전에서 맞힌 / 푼 문제 */
  correct: number;
  answered: number;
}

/** 정답 피해 */
export function damageFor(v: Verdict, s: { teamAtk: number; floor: number; combo: number; power: number; quick: boolean }): number {
  if (v === "wrong") return 0;
  const comboMult = 1 + Math.min(COMBO_MAX, s.combo * COMBO_STEP);
  const m = teamPowerMult(s.teamAtk, s.floor) * comboMult * (1 + s.power) * (s.quick ? 1.2 : 1);
  return Math.round(HIT * m * (v === "partial" ? 0.5 : 1));
}

export interface AnswerOutcome {
  state: RunState;
  dealt: number;
  taken: number;
  shieldUsed: boolean;
  floorCleared: boolean;
  dead: boolean;
}

/** 한 문제 결과를 도전 상태에 반영 (순수) */
export function applyAnswer(s: RunState, v: Verdict, ctx: { teamAtk: number; quick: boolean }): AnswerOutcome {
  const next: RunState = { ...s, buffs: { ...s.buffs }, answered: s.answered + 1 };
  let dealt = 0;
  let taken = 0;
  let shieldUsed = false;
  if (v === "wrong") {
    next.combo = 0;
    if (next.buffs.shield > 0) {
      next.buffs.shield -= 1;
      shieldUsed = true;
    } else {
      taken = enemyHit(s.floor);
      next.hp = Math.max(0, s.hp - taken);
    }
  } else {
    dealt = damageFor(v, { teamAtk: ctx.teamAtk, floor: s.floor, combo: s.combo, power: s.buffs.power, quick: ctx.quick });
    next.enemyHp = Math.max(0, s.enemyHp - dealt);
    next.combo = v === "correct" ? s.combo + 1 : 0;
    if (v === "correct") next.correct += 1;
  }
  return { state: next, dealt, taken, shieldUsed, floorCleared: next.enemyHp <= 0, dead: next.hp <= 0 };
}

export function startState(teamHpSum: number): RunState {
  const maxHp = teamMaxHp(teamHpSum);
  return { floor: 1, hp: maxHp, maxHp, enemyHp: enemyMaxHp(1), enemyMax: enemyMaxHp(1), combo: 0, buffs: { ...NO_BUFFS }, correct: 0, answered: 0 };
}

/** 다음 층으로 (체력 · 강화 유지, 적 새로) */
export function nextFloor(s: RunState): RunState {
  const floor = s.floor + 1;
  return { ...s, floor, enemyHp: enemyMaxHp(floor), enemyMax: enemyMaxHp(floor) };
}

// ---------------------------------------------------------------------
// 층 사이 강화 (3개 중 1개)
// ---------------------------------------------------------------------
export type BuffId = "heal" | "power" | "shield" | "hint";
export const BUFFS: Record<BuffId, { name: string; desc: string }> = {
  heal: { name: "숨 고르기", desc: "체력 35% 회복" },
  power: { name: "논증 단련", desc: "정답 피해 +15% (도전 끝까지 · 겹침)" },
  shield: { name: "반론 대비", desc: "다음 오답 한 번의 공격을 막음" },
  hint: { name: "스승의 귀띔", desc: "힌트권 +1 (보기 하나 지우기 · 첫 글자 보기)" },
};

/** 강화 후보 3개 (체력이 낮으면 회복을 꼭 넣음 · 같은 씨앗이면 같은 결과) */
export function buffChoices(s: RunState, seed: number): BuffId[] {
  const all: BuffId[] = ["heal", "power", "shield", "hint"];
  const order = [...all].sort((a, b) => hash(`${seed}:${a}`) - hash(`${seed}:${b}`));
  let pick = order.slice(0, 3);
  if (s.hp / s.maxHp < 0.5 && !pick.includes("heal")) pick = ["heal", ...pick.slice(0, 2)];
  return pick;
}

export function applyBuff(s: RunState, b: BuffId): RunState {
  const buffs = { ...s.buffs };
  let hp = s.hp;
  if (b === "heal") hp = Math.min(s.maxHp, hp + Math.round(s.maxHp * 0.35));
  if (b === "power") buffs.power = Math.round((buffs.power + 0.15) * 100) / 100;
  if (b === "shield") buffs.shield += 1;
  if (b === "hint") buffs.hints += 1;
  return { ...s, hp, buffs };
}

// ---------------------------------------------------------------------
// 보상
// ---------------------------------------------------------------------
/** 층을 깰 때 코인: 5 + 층 (보스 ×3) */
export const floorCoins = (floor: number) => (5 + floor) * (isBossFloor(floor) ? 3 : 1);
/** 보스층을 깰 때 강화석: 10층 1 · 20층 2 · 30층 3 … */
export const floorStones = (floor: number) => (isBossFloor(floor) ? floor / 10 : 0);
/** 처음으로 30층을 깨면 영웅 확정 뽑기권 한 장 (평생 한 번) */
export const EPIC_TICKET_FLOOR = 30;

/** 하루 도전 횟수 */
export const triesFor = (attendedToday: boolean) => TOWER_DAILY_TRIES + (attendedToday ? TOWER_ATTEND_BONUS : 0);

// ---------------------------------------------------------------------
// 문제 고르기 (층 구간별 후보 → 적 사상가 문제 우선)
// ---------------------------------------------------------------------
export interface TowerItem {
  id: string;
  kind: "exam" | "expected" | "practice";
  full: boolean;
  difficulty: 1 | 2 | 3;
  /** 서버가 자동 채점할 수 있음 (기입형 · 고르기 · 분류) */
  auto: boolean;
  philosophers: string[];
  /** 다른 회원 정답률 (풀이 3번 이상일 때만, 0~1) */
  rate: number | null;
  /** 같은 기출에서 나온 문제 묶음 (원본 기출 id · 없으면 문제 id). 한 기출에서 문제가 10개 가까이 나오므로 묶음 단위로 겹치지 않게 */
  group?: string;
}

/** 이 구간에 맞는 문제인가 (서술형은 4구간 완전 기출만 · AI 채점이 될 때) */
export function fitsTier(it: TowerItem, tier: TowerTier, essayOk: boolean): boolean {
  if (!it.auto) return tier === 4 && essayOk && it.full;
  if (it.full) return false;
  if (tier === 1) return it.kind === "practice" || it.difficulty === 1;
  if (tier === 2) return it.kind !== "practice" && it.difficulty === 2;
  if (tier === 3) return it.kind !== "practice" && (it.difficulty === 3 || (it.difficulty === 2 && it.rate !== null && it.rate < 0.5));
  return it.kind !== "practice" && it.difficulty >= 2;
}

/**
 * 다음 문제: 이 층 사상가 문제 → 같은 구간 아무 문제 → 아래 구간 순으로, 이번 도전에 안 나온 것.
 * 4구간은 서술형을 한 층에 하나까지 (보스층은 둘), 3구간 이상 보스층은 사상가 둘 이상 나오는 비교 문항 우선.
 */
export function pickItem(
  items: TowerItem[],
  o: {
    floor: number;
    names: string[];
    used: Set<string>;
    essayOk: boolean;
    essaysThisFloor: number;
    seed: number;
    /** 이번 도전에서 이미 나온 기출 묶음 */
    usedGroups?: Set<string>;
    /** 최근 며칠 사이 이 학습자가 푼 기출 묶음 (다른 도전 · 퀴즈 포함) */
    recent?: Set<string>;
  },
): TowerItem | null {
  const tier = tierOf(o.floor);
  const boss = isBossFloor(o.floor);
  const essayCap = boss ? 2 : 1;
  const g = (it: TowerItem) => it.group ?? it.id;
  const free = items.filter((it) => !o.used.has(it.id) && (it.auto || o.essaysThisFloor < essayCap));
  const mine = (it: TowerItem) => it.philosophers.some((p) => o.names.includes(p));
  const rank = (list: TowerItem[]) =>
    [...list].sort((a, b) => {
      if (boss && tier >= 3) {
        const d = Number(b.philosophers.length > 1) - Number(a.philosophers.length > 1);
        if (d) return d;
      }
      return hash(`${o.seed}:${a.id}`) - hash(`${o.seed}:${b.id}`);
    });
  const choose = (pool: TowerItem[]): TowerItem | null => {
    for (let t = tier; t >= 1; t--) {
      const fit = pool.filter((it) => fitsTier(it, t as TowerTier, o.essayOk));
      const own = fit.filter(mine);
      if (own.length) return rank(own)[0];
      // 사상가 문제가 없으면 같은 구간 문제 (적 사상가와 무관해도 난이도는 지킨다)
      if (t === tier && fit.length) return rank(fit)[0];
    }
    return null;
  };
  // 새 기출 우선: 이번 도전에도 최근에도 안 나온 기출 → 이번 도전에 안 나온 기출 → 아무 문제
  const notThisRun = free.filter((it) => !o.usedGroups?.has(g(it)));
  const fresh = notThisRun.filter((it) => !o.recent?.has(g(it)));
  const hit = choose(fresh) ?? choose(notThisRun) ?? choose(free);
  if (hit) return hit;
  const any = free.filter((it) => it.auto);
  return any.length ? rank(any)[0] : null;
}

/** 이 층의 적: 빈출 순으로 쌓은 사상가 목록에서 층 번호대로 (위로 갈수록 자주 나오는 사상가 · 끝나면 처음부터 다시) */
export function enemyForFloor<T extends { philosopherId: string }>(byFreqAsc: T[], floor: number, seed?: number): T | null {
  if (!byFreqAsc.length) return null;
  // 낮은 층 = 덜 나온 사상가, 보스층 = 자주 나온 사상가
  if (isBossFloor(floor)) return byFreqAsc[byFreqAsc.length - 1 - ((floor / 10 - 1) % byFreqAsc.length)];
  const base = (floor - 1 - Math.floor(floor / 10)) % byFreqAsc.length;
  if (seed === undefined) return byFreqAsc[base];
  // 도전마다 다른 상대: 빈출 순서 근처(±3)에서 고름 → 난이도 흐름은 그대로, 같은 층이라도 매번 다른 사상가
  const off = (hash(`${seed}:enemy:${floor}`) % 7) - 3;
  return byFreqAsc[Math.min(byFreqAsc.length - 1, Math.max(0, base + off))];
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
