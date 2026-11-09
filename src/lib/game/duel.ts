/**
 * 철학자 대난투 — 논쟁 대전 (턴제 카드 배틀) 규칙 엔진. 순수 계산 · 결정적 · 직렬화 가능.
 * 화면과 서버가 같은 코드를 쓴다: 서버는 (설정, 시드, 플레이어 행동 목록)을 처음부터 다시 계산해 승패를 확인한다.
 * 설계: docs/game-duel-design.md
 *
 * 용어: 논자(대표, 신념 35) · 사유력(자원, 턴마다 최대치 +1, 최대 7) · 필드(최대 4) · 수호 · 기절 · 공명
 */
import { seededRandom } from "./battle.ts";
import type { Rarity, SkillEffect } from "./rules.ts";

export type DuelSide = "me" | "foe";
export const other = (s: DuelSide): DuelSide => (s === "me" ? "foe" : "me");

export interface DuelRules {
  heroHp: number;
  maxMana: number;
  fieldSize: number;
  handSize: number;
  deckSize: number;
  turnLimit: number; // 양쪽 턴을 합친 수 (50 = 각자 25턴)
  atkDiv: number;
  hpDiv: number;
  cost: Record<Rarity, number>;
  /** 대전용 등급 보정: 높은 등급일수록 사유력 대비 능력치가 좋아야 '수집이 곧 힘' */
  rarityBoost: Record<Rarity, number>;
}

export const DEFAULT_DUEL_RULES: DuelRules = {
  heroHp: 35,
  maxMana: 7,
  fieldSize: 4,
  handSize: 7,
  deckSize: 12,
  turnLimit: 50,
  atkDiv: 12,
  hpDiv: 60,
  // 1,000판 시뮬레이션으로 정함 (scripts/test-duel.ts): 같은 덱 선공 ~50%, 높은 등급 덱이 대부분 이김
  cost: { common: 2, rare: 2, epic: 3, legendary: 4 },
  rarityBoost: { common: 1, rare: 1.2, epic: 1.45, legendary: 1.75 },
};

/** 관리자 조정값의 허용 범위 (화면 크기·한 판 길이를 지키는 선) */
export const DUEL_RULE_LIMITS = {
  heroHp: [10, 100],
  maxMana: [3, 10],
  fieldSize: [3, 5],
  handSize: [5, 10], // 처음 손패 4장 + 첫 뽑기
  deckSize: [8, 20],
  turnLimit: [20, 100],
  atkDiv: [4, 40],
  hpDiv: [20, 200],
  cost: [1, 10],
  rarityBoost: [0.5, 4],
} as const;

const RARITY_KEYS: Rarity[] = ["common", "rare", "epic", "legendary"];

/** 저장된 값(일부만 있거나 깨졌을 수 있음) → 완전한 규칙. 범위 밖이면 가장 가까운 허용값 */
export function normalizeDuelRules(raw: unknown): DuelRules {
  const d = DEFAULT_DUEL_RULES;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, [lo, hi]: readonly [number, number], fallback: number, int = true) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const c = Math.min(hi, Math.max(lo, n));
    return int ? Math.round(c) : Math.round(c * 100) / 100;
  };
  const per = (v: unknown, lim: readonly [number, number], fb: Record<Rarity, number>, int: boolean) => {
    const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    return Object.fromEntries(RARITY_KEYS.map((r) => [r, num(src[r], lim, fb[r], int)])) as Record<Rarity, number>;
  };
  const turnLimit = num(o.turnLimit, DUEL_RULE_LIMITS.turnLimit, d.turnLimit);
  return {
    heroHp: num(o.heroHp, DUEL_RULE_LIMITS.heroHp, d.heroHp),
    maxMana: num(o.maxMana, DUEL_RULE_LIMITS.maxMana, d.maxMana),
    fieldSize: num(o.fieldSize, DUEL_RULE_LIMITS.fieldSize, d.fieldSize),
    handSize: num(o.handSize, DUEL_RULE_LIMITS.handSize, d.handSize),
    deckSize: num(o.deckSize, DUEL_RULE_LIMITS.deckSize, d.deckSize),
    turnLimit: turnLimit % 2 ? turnLimit + 1 : turnLimit, // 양쪽 같은 턴 수
    atkDiv: num(o.atkDiv, DUEL_RULE_LIMITS.atkDiv, d.atkDiv, false),
    hpDiv: num(o.hpDiv, DUEL_RULE_LIMITS.hpDiv, d.hpDiv, false),
    cost: per(o.cost, DUEL_RULE_LIMITS.cost, d.cost, true),
    rarityBoost: per(o.rarityBoost, DUEL_RULE_LIMITS.rarityBoost, d.rarityBoost, false),
  };
}

/** 저장 전 확인: 문제가 있으면 이유, 없으면 null */
export function duelRulesError(r: DuelRules): string | null {
  const n = normalizeDuelRules(r);
  const names: Record<keyof DuelRules, string> = {
    heroHp: "논자 신념",
    maxMana: "최대 사유력",
    fieldSize: "필드 칸 수",
    handSize: "손패 최대",
    deckSize: "덱 크기",
    turnLimit: "제한 턴(짝수)",
    atkDiv: "공격 변환 계수",
    hpDiv: "체력 변환 계수",
    cost: "등급별 비용(정수)",
    rarityBoost: "등급별 보정",
  };
  for (const k of Object.keys(n) as (keyof DuelRules)[]) {
    if (JSON.stringify(n[k]) !== JSON.stringify(r[k])) return `${names[k]} 값이 허용 범위를 벗어났습니다.`;
  }
  if (RARITY_KEYS.some((x) => r.cost[x] > r.maxMana)) return "카드 비용은 최대 사유력보다 클 수 없습니다.";
  if (RARITY_KEYS.some((x, i) => i > 0 && r.cost[x] < r.cost[RARITY_KEYS[i - 1]])) return "비용은 일반 ≤ 희귀 ≤ 영웅 ≤ 전설 순이어야 합니다.";
  if (RARITY_KEYS.some((x, i) => i > 0 && r.rarityBoost[x] < r.rarityBoost[RARITY_KEYS[i - 1]])) return "등급 보정은 일반 ≤ 희귀 ≤ 영웅 ≤ 전설 순이어야 합니다.";
  return null;
}

const RI: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** 필살기 → 등장 효과 크기 (일반 → 전설) */
export const EFFECT_POWER = {
  strike: [2, 3, 4, 5], // 적 사상가 하나에게 피해
  sweep: [1, 1, 2, 2], // 적 사상가 전체에게 피해
  heal: [3, 4, 5, 6], // 아군 하나 또는 내 논자 회복
  guard: [0, 0, 1, 1], // 수호 + 체력 보너스
  stun: [0, 1, 2, 3], // 기절 + 피해
} as const satisfies Record<SkillEffect, readonly number[]>;

export const EFFECT_TEXT: Record<SkillEffect, (n: number) => string> = {
  strike: (n) => `등장 시: 적 사상가 하나에게 ${n} 피해`,
  sweep: (n) => `등장 시: 적 사상가 전체에게 ${n} 피해`,
  heal: (n) => `등장 시: 아군 하나 또는 내 논자 신념 ${n} 회복`,
  guard: (n) => `수호${n ? ` · 체력 +${n}` : ""}`,
  stun: (n) => `등장 시: 적 사상가 하나 기절${n ? ` + ${n} 피해` : ""}`,
};

/** 공명: 같은 분야 2명 이상 */
export const RESONANCE: Record<string, string> = {
  동양윤리: "턴 끝에 체력 1 회복",
  한국윤리: "체력 +1",
  서양윤리: "공격 +1",
  사회사상: "받는 피해 1 감소",
};

/** 덱에 넣는 카드 한 장 (보유 카드 → 대전용) */
export interface DuelCardDef {
  uid: string; // 이 대전 안에서의 고유 id
  cardId: string | null; // 보유 카드 id (상대는 null)
  philosopherId: string;
  name: string;
  tradition: string;
  rarity: Rarity;
  level: number;
  cost: number;
  atk: number;
  hp: number;
  effect: SkillEffect;
  skillName: string;
  artUrl: string | null;
}

/** 기존 능력치(공격력·체력) → 대전용 작은 숫자 */
export function toDuelCard(
  c: Omit<DuelCardDef, "cost" | "atk" | "hp"> & { statAtk: number; statHp: number },
  rules: DuelRules = DEFAULT_DUEL_RULES,
): DuelCardDef {
  const { statAtk, statHp, ...rest } = c;
  const k = rules.rarityBoost?.[c.rarity] ?? 1;
  return { ...rest, cost: rules.cost[c.rarity], atk: Math.max(1, Math.round((statAtk * k) / rules.atkDiv)), hp: Math.max(1, Math.round((statHp * k) / rules.hpDiv)) };
}

export const effectPower = (c: Pick<DuelCardDef, "effect" | "rarity">) => EFFECT_POWER[c.effect][RI[c.rarity]];
export const needsTarget = (e: SkillEffect) => e === "strike" || e === "stun" || e === "heal";

export interface Minion {
  uid: string;
  atk: number;
  hp: number;
  maxHp: number;
  guard: boolean;
  stun: number; // 1 이면 다음 내 턴에 공격 불가
  canAttack: boolean;
  resonated: boolean; // 한국윤리 공명 체력 보너스를 받았는지
}

export interface PlayerState {
  hero: number;
  maxMana: number;
  mana: number;
  deck: string[];
  hand: string[];
  field: Minion[];
  fatigue: number;
}

export interface DuelState {
  rules: DuelRules;
  cards: Record<string, DuelCardDef>;
  seed: string;
  rngCalls: number;
  turn: number; // 지금까지 시작된 턴 수 (양쪽 합)
  active: DuelSide;
  first: DuelSide;
  players: Record<DuelSide, PlayerState>;
  winner: DuelSide | "draw" | null;
  endReason: "hero" | "turns" | "concede" | null;
}

export type Target = { side: DuelSide; uid: string } | { side: DuelSide; hero: true };
export type DuelAction =
  | { t: "play"; uid: string; target?: Target }
  | { t: "attack"; attacker: string; target: Target }
  | { t: "end" }
  | { t: "concede" };

export type DuelEvent =
  | { t: "turn"; side: DuelSide; turn: number; mana: number }
  | { t: "draw"; side: DuelSide; uid: string | null; burned?: boolean }
  | { t: "fatigue"; side: DuelSide; dmg: number }
  | { t: "play"; side: DuelSide; uid: string }
  | { t: "effect"; side: DuelSide; uid: string; effect: SkillEffect; target?: Target; amount: number }
  | { t: "damage"; target: Target; amount: number }
  | { t: "heal"; target: Target; amount: number }
  | { t: "stun"; target: Target }
  | { t: "attack"; side: DuelSide; attacker: string; target: Target }
  | { t: "death"; side: DuelSide; uid: string }
  | { t: "resonance"; side: DuelSide; tradition: string }
  | { t: "end"; winner: DuelSide | "draw"; reason: "hero" | "turns" | "concede" };

// ---------------------------------------------------------------------
// 도구
// ---------------------------------------------------------------------
function rand(s: DuelState): number {
  const r = seededRandom(`${s.seed}:${s.rngCalls}`)();
  s.rngCalls++;
  return r;
}
function shuffle(s: DuelState, xs: string[]): string[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const sideOf = (s: DuelState, uid: string): DuelSide | null =>
  s.players.me.field.some((m) => m.uid === uid) ? "me" : s.players.foe.field.some((m) => m.uid === uid) ? "foe" : null;
export const minionOf = (s: DuelState, side: DuelSide, uid: string) => s.players[side].field.find((m) => m.uid === uid) ?? null;
const resonating = (s: DuelState, side: DuelSide, tradition: string) =>
  Boolean(RESONANCE[tradition]) && s.players[side].field.filter((m) => s.cards[m.uid].tradition === tradition).length >= 2;
/** 공명이 반영된 공격력 (서양윤리 +1) */
export function attackOf(s: DuelState, side: DuelSide, m: Minion): number {
  const tr = s.cards[m.uid].tradition;
  return m.atk + (tr === "서양윤리" && resonating(s, side, tr) ? 1 : 0);
}
export const isResonating = (s: DuelState, side: DuelSide, uid: string) => resonating(s, side, s.cards[uid].tradition);
/** 지금 켜진 공명 분야 (필드에 같은 분야 2명 이상) */
export const activeResonances = (s: DuelState, side: DuelSide) => Object.keys(RESONANCE).filter((tr) => resonating(s, side, tr));

// ---------------------------------------------------------------------
// 시작
// ---------------------------------------------------------------------
export function createDuel(setup: { me: DuelCardDef[]; foe: DuelCardDef[]; seed: string; rules?: DuelRules }): { state: DuelState; events: DuelEvent[] } {
  const rules = setup.rules ?? DEFAULT_DUEL_RULES;
  const cards: Record<string, DuelCardDef> = {};
  for (const c of [...setup.me, ...setup.foe]) {
    if (cards[c.uid]) throw new Error(`카드 uid 중복: ${c.uid}`);
    cards[c.uid] = c;
  }
  const p = (): PlayerState => ({ hero: rules.heroHp, maxMana: 0, mana: 0, deck: [], hand: [], field: [], fatigue: 0 });
  const s: DuelState = { rules, cards, seed: setup.seed, rngCalls: 0, turn: 0, active: "me", first: "me", players: { me: p(), foe: p() }, winner: null, endReason: null };
  s.first = rand(s) < 0.5 ? "me" : "foe";
  s.players.me.deck = shuffle(s, setup.me.map((c) => c.uid));
  s.players.foe.deck = shuffle(s, setup.foe.map((c) => c.uid));
  const events: DuelEvent[] = [];
  // 처음 손패: 선공 3장, 후공 4장
  for (const side of ["me", "foe"] as DuelSide[]) for (let i = 0; i < (side === s.first ? 3 : 4); i++) draw(s, side, events);
  s.active = s.first;
  startTurn(s, events);
  return { state: s, events };
}

function draw(s: DuelState, side: DuelSide, ev: DuelEvent[]) {
  const pl = s.players[side];
  const uid = pl.deck.shift();
  if (!uid) {
    pl.fatigue++;
    pl.hero -= pl.fatigue;
    ev.push({ t: "fatigue", side, dmg: pl.fatigue });
    return;
  }
  if (pl.hand.length >= s.rules.handSize) {
    ev.push({ t: "draw", side, uid, burned: true });
    return;
  }
  pl.hand.push(uid);
  ev.push({ t: "draw", side, uid });
}

function startTurn(s: DuelState, ev: DuelEvent[]) {
  const side = s.active;
  const pl = s.players[side];
  s.turn++;
  pl.maxMana = Math.min(s.rules.maxMana, pl.maxMana + 1);
  // 후공 보상: 후공의 첫 턴에만 사유력 +1
  pl.mana = pl.maxMana + (side !== s.first && pl.maxMana === 1 ? 1 : 0);
  for (const m of pl.field) m.canAttack = m.stun === 0;
  ev.push({ t: "turn", side, turn: s.turn, mana: pl.mana });
  draw(s, side, ev);
  checkEnd(s, ev);
}

// ---------------------------------------------------------------------
// 피해 · 회복 · 사망
// ---------------------------------------------------------------------
function damage(s: DuelState, t: Target, amount: number, ev: DuelEvent[]) {
  if (amount <= 0) return;
  if ("hero" in t) {
    s.players[t.side].hero -= amount;
    ev.push({ t: "damage", target: t, amount });
    return;
  }
  const m = minionOf(s, t.side, t.uid);
  if (!m) return;
  const tr = s.cards[m.uid].tradition;
  const dmg = Math.max(0, amount - (tr === "사회사상" && resonating(s, t.side, tr) ? 1 : 0));
  m.hp -= dmg;
  ev.push({ t: "damage", target: t, amount: dmg });
}

function heal(s: DuelState, t: Target, amount: number, ev: DuelEvent[]) {
  if ("hero" in t) {
    const pl = s.players[t.side];
    const got = Math.min(amount, s.rules.heroHp - pl.hero);
    pl.hero += got;
    ev.push({ t: "heal", target: t, amount: got });
    return;
  }
  const m = minionOf(s, t.side, t.uid);
  if (!m) return;
  const got = Math.min(amount, m.maxHp - m.hp);
  m.hp += got;
  ev.push({ t: "heal", target: t, amount: got });
}

function cleanup(s: DuelState, ev: DuelEvent[]) {
  for (const side of ["me", "foe"] as DuelSide[]) {
    const pl = s.players[side];
    for (const m of pl.field.filter((x) => x.hp <= 0)) ev.push({ t: "death", side, uid: m.uid });
    pl.field = pl.field.filter((x) => x.hp > 0);
  }
  checkEnd(s, ev);
}

function checkEnd(s: DuelState, ev: DuelEvent[]) {
  if (s.winner) return;
  const a = s.players.me.hero <= 0;
  const b = s.players.foe.hero <= 0;
  if (a || b) {
    s.winner = a && b ? "draw" : a ? "foe" : "me";
    s.endReason = "hero";
    ev.push({ t: "end", winner: s.winner, reason: "hero" });
  }
}

/** 한국윤리 공명: 공명이 생기면 그 분야 사상가 모두 체력 +1 (한 번만) */
function applyResonance(s: DuelState, side: DuelSide, ev: DuelEvent[]) {
  const pl = s.players[side];
  for (const tr of Object.keys(RESONANCE)) {
    if (!resonating(s, side, tr)) continue;
    const fresh = pl.field.filter((m) => s.cards[m.uid].tradition === tr && !m.resonated);
    if (!fresh.length) continue;
    for (const m of fresh) {
      m.resonated = true;
      if (tr === "한국윤리") {
        m.hp++;
        m.maxHp++;
      }
    }
    ev.push({ t: "resonance", side, tradition: tr });
  }
}

// ---------------------------------------------------------------------
// 행동
// ---------------------------------------------------------------------
/** 행동 검사: 문제가 있으면 이유, 없으면 null */
export function illegal(s: DuelState, side: DuelSide, a: DuelAction): string | null {
  if (s.winner) return "대전이 끝났습니다";
  if (a.t === "concede") return null;
  if (s.active !== side) return "상대의 턴입니다";
  const pl = s.players[side];
  if (a.t === "end") return null;
  if (a.t === "play") {
    if (!pl.hand.includes(a.uid)) return "손에 없는 카드입니다";
    const c = s.cards[a.uid];
    if (c.cost > pl.mana) return "사유력이 부족합니다";
    if (pl.field.length >= s.rules.fieldSize) return "필드가 가득 찼습니다";
    if (a.target) {
      if (!needsTarget(c.effect)) return "대상이 필요 없는 카드입니다";
      if (c.effect === "heal") {
        if (a.target.side !== side || (!("hero" in a.target) && !minionOf(s, side, a.target.uid))) return "아군이나 내 논자를 고르세요";
      } else if (a.target.side === side || "hero" in a.target || !minionOf(s, a.target.side, a.target.uid)) return "적 사상가를 고르세요";
    }
    return null;
  }
  // 공격
  const m = minionOf(s, side, a.attacker);
  if (!m) return "내 필드의 사상가가 아닙니다";
  if (!m.canAttack) return m.stun ? "기절해서 공격할 수 없습니다" : "이번 턴에는 공격할 수 없습니다";
  if (attackOf(s, side, m) <= 0) return "공격력이 없습니다";
  const foe = other(side);
  if (a.target.side !== foe) return "상대를 공격하세요";
  const guards = s.players[foe].field.filter((x) => x.guard);
  if ("hero" in a.target) return guards.length ? "수호 사상가를 먼저 공격해야 합니다" : null;
  const t = minionOf(s, foe, a.target.uid);
  if (!t) return "대상이 없습니다";
  if (guards.length && !t.guard) return "수호 사상가를 먼저 공격해야 합니다";
  return null;
}

/** 행동 적용 (새 상태를 돌려준다, 입력은 바꾸지 않음) */
export function applyAction(state: DuelState, side: DuelSide, a: DuelAction): { state: DuelState; events: DuelEvent[] } {
  const why = illegal(state, side, a);
  if (why) throw new Error(why);
  const s = structuredClone(state);
  const ev: DuelEvent[] = [];
  const pl = s.players[side];
  if (a.t === "concede") {
    s.winner = other(side);
    s.endReason = "concede";
    ev.push({ t: "end", winner: s.winner, reason: "concede" });
    return { state: s, events: ev };
  }
  if (a.t === "play") {
    const c = s.cards[a.uid];
    pl.mana -= c.cost;
    pl.hand = pl.hand.filter((u) => u !== a.uid);
    const power = effectPower(c);
    const m: Minion = { uid: c.uid, atk: c.atk, hp: c.hp, maxHp: c.hp, guard: false, stun: 0, canAttack: false, resonated: false };
    if (c.effect === "guard") {
      m.guard = true;
      m.hp += power;
      m.maxHp += power;
    }
    pl.field.push(m);
    ev.push({ t: "play", side, uid: c.uid });
    // 등장 효과
    if (c.effect === "sweep") {
      ev.push({ t: "effect", side, uid: c.uid, effect: c.effect, amount: power });
      for (const x of [...s.players[other(side)].field]) damage(s, { side: other(side), uid: x.uid }, power, ev);
    } else if (c.effect === "strike" && a.target) {
      ev.push({ t: "effect", side, uid: c.uid, effect: c.effect, target: a.target, amount: power });
      damage(s, a.target, power, ev);
    } else if (c.effect === "stun" && a.target && !("hero" in a.target)) {
      ev.push({ t: "effect", side, uid: c.uid, effect: c.effect, target: a.target, amount: power });
      const t = minionOf(s, a.target.side, a.target.uid);
      if (t) {
        t.stun = 1;
        t.canAttack = false;
        ev.push({ t: "stun", target: a.target });
      }
      damage(s, a.target, power, ev);
    } else if (c.effect === "heal" && a.target) {
      ev.push({ t: "effect", side, uid: c.uid, effect: c.effect, target: a.target, amount: power });
      heal(s, a.target, power, ev);
    } else if (c.effect === "guard") {
      ev.push({ t: "effect", side, uid: c.uid, effect: c.effect, amount: power });
    }
    applyResonance(s, side, ev);
    cleanup(s, ev);
    return { state: s, events: ev };
  }
  if (a.t === "attack") {
    const m = minionOf(s, side, a.attacker)!;
    const atk = attackOf(s, side, m);
    m.canAttack = false;
    ev.push({ t: "attack", side, attacker: m.uid, target: a.target });
    if ("hero" in a.target) damage(s, a.target, atk, ev);
    else {
      const t = minionOf(s, a.target.side, a.target.uid)!;
      const back = attackOf(s, a.target.side, t);
      damage(s, a.target, atk, ev);
      damage(s, { side, uid: m.uid }, back, ev);
    }
    cleanup(s, ev);
    return { state: s, events: ev };
  }
  // 턴 종료: 동양윤리 공명 회복, 이번 턴 기절 해제 → 상대 턴
  for (const m of pl.field) {
    const tr = s.cards[m.uid].tradition;
    if (tr === "동양윤리" && resonating(s, side, tr) && m.hp < m.maxHp) heal(s, { side, uid: m.uid }, 1, ev);
    if (m.stun && !m.canAttack) m.stun = 0;
  }
  if (s.turn >= s.rules.turnLimit) {
    const a1 = s.players.me.hero;
    const b1 = s.players.foe.hero;
    s.winner = a1 === b1 ? "draw" : a1 > b1 ? "me" : "foe";
    s.endReason = "turns";
    ev.push({ t: "end", winner: s.winner, reason: "turns" });
    return { state: s, events: ev };
  }
  s.active = other(side);
  startTurn(s, ev);
  return { state: s, events: ev };
}

/**
 * 기절 처리 규칙: 기절한 사상가는 '자기 다음 턴' 동안 공격하지 못한다.
 * startTurn 에서 canAttack = (stun === 0) 으로 막고, 그 턴이 끝날 때(end) stun 을 지운다.
 * 상대 턴에 기절당하면 stun=1 로 남아 있다가 내 턴 시작에 적용된다.
 */

// ---------------------------------------------------------------------
// 다시 계산 (서버 확인용)
// ---------------------------------------------------------------------
export type Chooser = (s: DuelState, side: DuelSide) => DuelAction;

/**
 * 처음부터 다시 진행: 내(me) 턴에는 기록된 행동을, 상대(foe) 턴에는 컴퓨터(chooser)의 행동을 쓴다.
 * 기록이 모자라 끝나지 않았으면 finished=false. 규칙에 어긋난 기록이면 오류.
 */
export function replayDuel(
  setup: { me: DuelCardDef[]; foe: DuelCardDef[]; seed: string; rules?: DuelRules },
  mine: DuelAction[],
  foeChooser: Chooser,
  maxSteps = 2000,
): { state: DuelState; finished: boolean; used: number } {
  let { state } = createDuel(setup);
  let i = 0;
  for (let step = 0; step < maxSteps && !state.winner; step++) {
    if (state.active === "me") {
      const a = mine[i];
      if (!a) return { state, finished: false, used: i };
      i++;
      state = applyAction(state, "me", a).state;
    } else {
      state = applyAction(state, "foe", foeChooser(state, "foe")).state;
    }
  }
  // 대전이 끝난 뒤 남은 '항복'은 무시하지 않는다: 끝나기 전에만 의미가 있음
  return { state, finished: Boolean(state.winner), used: i };
}
