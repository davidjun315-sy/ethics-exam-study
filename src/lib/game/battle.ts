/**
 * 자동 배틀 (순수 계산: 빠른 대전 3 vs 3 · 도장깨기 3 vs 보스 1). 같은 시드면 항상 같은 결과 → 서버가 결과를 정하고 화면은 기록을 재생만 한다.
 *
 * 규칙 (단순하게)
 * - 행동 순서: 내1 → 적1 → 내2 → 적2 → 내3 → 적3 → … (선공은 시드로 정한 동전 던지기, 쓰러진 카드는 건너뜀)
 * - 일반 공격: 살아 있는 적 중 하나(시드 난수)에게 공격력 90~110% 피해
 * - 필살기: 두 번째 행동에 처음, 이후 세 번째 행동마다 (strike · sweep · heal · guard · stun)
 *   단일 대상 필살기(strike · stun)는 체력이 가장 낮은 적을 노린다
 * - 수호막: 다음 피해 1회를 절반으로 / 기절: 다음 행동 1회를 쉼
 * - 행동이 90회를 넘으면 남은 체력 비율이 높은 쪽 승리
 */
import type { SkillEffect } from "./rules.ts";

export interface Fighter {
  key: string; // 화면 표시용 고유 키 (예: "me-0")
  philosopherId: string;
  name: string;
  atk: number;
  hp: number;
  skillName: string;
  skillEffect: SkillEffect;
  /** 도장깨기 보스: 체력 배율. 회복 필살기는 보통 카드 크기만큼만 (max / scale) */
  scale?: number;
}

export type Side = "me" | "foe";

export type BattleEvent =
  | { t: "attack"; actor: string; target: string; dmg: number; hp: number; shielded: boolean }
  | { t: "skill"; actor: string; name: string; effect: SkillEffect; hits: { target: string; dmg: number; hp: number; shielded: boolean }[]; heal?: { target: string; amount: number; hp: number }; guarded?: string[]; stunned?: string }
  | { t: "stunned"; actor: string }
  | { t: "faint"; target: string }
  | { t: "end"; winner: Side; reason: "ko" | "timeout" };

export interface BattleResult {
  first: Side;
  winner: Side;
  events: BattleEvent[];
  actions: number;
}

/** 문자열 시드 → 0~1 난수 */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_ACTIONS = 90;
/** 피해 배율: 한 판이 30~45회 행동(화면 재생 약 30~45초) 안에 끝나도록 */
const DMG = 1.6;
const SKILL_EVERY = 3;

interface Live extends Fighter {
  side: Side;
  cur: number;
  max: number;
  charge: number;
  shield: boolean;
  stun: boolean;
}

export function runBattle(me: Fighter[], foe: Fighter[], seed: string): BattleResult {
  const rand = seededRandom(seed);
  // charge 1 에서 시작 → 두 번째 행동에 첫 필살기 (앞 칸 카드도 필살기를 쓰고 쓰러지도록)
  const mk = (f: Fighter, side: Side): Live => ({ ...f, side, cur: f.hp, max: f.hp, charge: 1, shield: false, stun: false });
  const teams: Record<Side, Live[]> = { me: me.map((f) => mk(f, "me")), foe: foe.map((f) => mk(f, "foe")) };
  const events: BattleEvent[] = [];
  const alive = (s: Side) => teams[s].filter((x) => x.cur > 0);
  const other = (s: Side): Side => (s === "me" ? "foe" : "me");
  // 선공: 같은 덱끼리 싸우면 승률이 반반이 되도록
  const first: Side = rand() < 0.5 ? "me" : "foe";
  // 양쪽이 번갈아 행동. 수가 적은 쪽(예: 도장깨기 보스 1명)은 그만큼 자주 행동한다 → 양쪽 행동 횟수가 같음
  // (3 vs 3 은 예전 순서와 똑같음: 내1 적1 내2 적2 내3 적3)
  const order: Live[] = [];
  for (let i = 0; i < Math.max(me.length, foe.length); i++) {
    for (const s of [first, other(first)]) order.push(teams[s][i % teams[s].length]);
  }

  const hit = (target: Live, raw: number) => {
    let dmg = Math.max(1, Math.round(raw * DMG));
    const shielded = target.shield;
    if (shielded) {
      dmg = Math.max(1, Math.round(dmg / 2));
      target.shield = false;
    }
    target.cur = Math.max(0, target.cur - dmg);
    return { target: target.key, dmg, hp: target.cur, shielded };
  };
  const faintCheck = (ts: Live[]) => {
    for (const t of ts) if (t.cur === 0 && !events.some((e) => e.t === "faint" && e.target === t.key)) events.push({ t: "faint", target: t.key });
  };

  let actions = 0;
  let i = 0;
  while (alive("me").length && alive("foe").length && actions < MAX_ACTIONS) {
    const actor = order[i % order.length];
    i++;
    if (actor.cur <= 0) continue;
    actions++;
    if (actor.stun) {
      actor.stun = false;
      events.push({ t: "stunned", actor: actor.key });
      continue;
    }
    const enemies = alive(other(actor.side));
    const randomFoe = enemies[Math.floor(rand() * enemies.length)];
    const weakest = enemies.reduce((m, x) => (x.cur < m.cur ? x : m), enemies[0]);
    const roll = 0.9 + rand() * 0.2;
    actor.charge++;
    if (actor.charge >= SKILL_EVERY) {
      actor.charge = 0;
      const ev: Extract<BattleEvent, { t: "skill" }> = { t: "skill", actor: actor.key, name: actor.skillName, effect: actor.skillEffect, hits: [] };
      if (actor.skillEffect === "strike") ev.hits.push(hit(weakest, actor.atk * 2.2 * roll));
      else if (actor.skillEffect === "sweep") for (const e of enemies) ev.hits.push(hit(e, actor.atk * roll));
      else if (actor.skillEffect === "stun") {
        ev.hits.push(hit(weakest, actor.atk * 1.4 * roll));
        if (weakest.cur > 0) {
          weakest.stun = true;
          ev.stunned = weakest.key;
        }
      } else if (actor.skillEffect === "heal") {
        const allies = alive(actor.side);
        const low = allies.reduce((m, x) => (x.cur / x.max < m.cur / m.max ? x : m), allies[0]);
        const amount = Math.min(low.max - low.cur, Math.round((low.max / (low.scale ?? 1)) * 0.35));
        low.cur += amount;
        ev.heal = { target: low.key, amount, hp: low.cur };
      } else {
        const allies = alive(actor.side);
        for (const a of allies) a.shield = true;
        ev.guarded = allies.map((a) => a.key);
      }
      events.push(ev);
      faintCheck(enemies);
    } else {
      const h = hit(randomFoe, actor.atk * roll);
      events.push({ t: "attack", actor: actor.key, ...h });
      faintCheck([randomFoe]);
    }
  }

  let winner: Side;
  let reason: "ko" | "timeout" = "ko";
  if (!alive("foe").length) winner = "me";
  else if (!alive("me").length) winner = "foe";
  else {
    reason = "timeout";
    const ratio = (s: Side) => teams[s].reduce((n, x) => n + x.cur / x.max, 0);
    winner = ratio("me") >= ratio("foe") ? "me" : "foe";
  }
  events.push({ t: "end", winner, reason });
  return { first, winner, events, actions };
}

/** 필살기 게이지가 가득(다음 행동에 필살기)인 값 */
export const SKILL_READY = SKILL_EVERY - 1;

/**
 * 필살기 게이지 (화면 표시용, runBattle 과 같은 규칙): 처음 1, 행동마다 +1, 필살기를 쓰면 0. 기절로 쉰 행동은 그대로.
 * 값이 SKILL_READY 이면 다음 행동에 필살기.
 */
export function chargeAt(keys: string[], events: BattleEvent[], upto: number): Record<string, number> {
  const c: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 1]));
  for (const e of events.slice(0, upto)) {
    if (e.t === "attack") c[e.actor] = (c[e.actor] ?? 1) + 1;
    else if (e.t === "skill") c[e.actor] = 0;
  }
  return c;
}

/** 상대 레벨: 내 덱 평균 레벨 기준 (쉬움 -1 · 보통 0 · 어려움 +1, 1 이상) */
export function opponentLevel(myLevels: number[], difficulty: "easy" | "normal" | "hard", maxLevel: number): number {
  const avg = myLevels.reduce((n, l) => n + l, 0) / Math.max(1, myLevels.length);
  const off = difficulty === "easy" ? -1 : difficulty === "hard" ? 1 : 0;
  return Math.min(maxLevel, Math.max(1, Math.round(avg) + off));
}

export const DIFFICULTY_NAMES = { easy: "쉬움", normal: "보통", hard: "어려움" } as const;
export type Difficulty = keyof typeof DIFFICULTY_NAMES;
