/**
 * 논쟁 대전 균형 시뮬레이션 (순수 계산) — 관리자 화면에서 조정값을 저장하기 전에 컴퓨터끼리 대전시켜 본다.
 * 표준 사상가(공격 40 · 체력 300)로 만든 덱이라 실제 카드와 조금 다를 수 있다.
 */
import { seededRandom, type Difficulty } from "./battle.ts";
import { applyAction, createDuel, toDuelCard, type DuelCardDef, type DuelRules, type DuelState } from "./duel.ts";
import { chooseDuelAction } from "./duelAi.ts";
import { statsFor, type Rarity, type SkillEffect } from "./rules.ts";

const EFFECTS: SkillEffect[] = ["strike", "sweep", "heal", "guard", "stun"];
const TRADS = ["동양윤리", "한국윤리", "서양윤리", "사회사상"];
const MIX: Rarity[] = ["common", "common", "common", "common", "rare", "rare", "rare", "epic", "epic", "legendary"];

export function simCard(uid: string, rules: DuelRules, o: Partial<{ rarity: Rarity; level: number; effect: SkillEffect; tradition: string }> = {}): DuelCardDef {
  const rarity = o.rarity ?? "common";
  const level = o.level ?? 1;
  const st = statsFor({ atk: 40, hp: 300 }, rarity, level);
  return toDuelCard(
    { uid, cardId: null, philosopherId: `p-${uid}`, name: uid, tradition: o.tradition ?? "미분류", rarity, level, effect: o.effect ?? "strike", skillName: "필살기", artUrl: null, statAtk: st.atk, statHp: st.hp },
    rules,
  );
}

export function simDeck(prefix: string, seed: string, rules: DuelRules, o: { rarity?: Rarity; level?: number } = {}): DuelCardDef[] {
  const r = seededRandom(seed);
  return Array.from({ length: rules.deckSize }, (_, i) =>
    simCard(`${prefix}${i}`, rules, {
      rarity: o.rarity ?? MIX[Math.floor(r() * MIX.length)],
      level: o.level ?? 1 + Math.floor(r() * 3),
      effect: EFFECTS[Math.floor(r() * EFFECTS.length)],
      tradition: TRADS[Math.floor(r() * TRADS.length)],
    }),
  );
}

/** 컴퓨터끼리 한 판 */
export function simGame(me: DuelCardDef[], foe: DuelCardDef[], seed: string, rules: DuelRules, lv: { me: Difficulty; foe: Difficulty } = { me: "normal", foe: "normal" }) {
  let s: DuelState = createDuel({ me, foe, seed, rules }).state;
  let n = 0;
  while (!s.winner && n++ < 3000) {
    const side = s.active;
    s = applyAction(s, side, chooseDuelAction(s, side, lv[side])).state;
  }
  return s;
}

export interface BalanceReport {
  games: number;
  /** 같은 구성 덱끼리 선공 승률 (50% 근처가 좋음) */
  firstWin: number;
  /** 전설 덱 vs 일반 덱 승률 (높을수록 '수집이 곧 힘') */
  legendVsCommon: number;
  /** 어려움 vs 쉬움 (같은 덱) */
  hardVsEasy: number;
  /** 한 판 평균 길이 (양쪽 턴 합) */
  avgTurns: number;
  /** 제한 턴으로 끝난 비율 */
  timeout: number;
  stuck: number;
}

/** games 판씩 세 가지 대진. 브라우저에서 1~2초 */
export function simulateBalance(rules: DuelRules, games = 150): BalanceReport {
  let first = 0;
  let turns = 0;
  let timeout = 0;
  let stuck = 0;
  for (let i = 0; i < games; i++) {
    const s = simGame(simDeck("m", `bm${i}`, rules), simDeck("f", `bf${i}`, rules), `b${i}`, rules);
    if (!s.winner) stuck++;
    if (s.winner === s.first) first++;
    if (s.endReason === "turns") timeout++;
    turns += s.turn;
  }
  let legend = 0;
  for (let i = 0; i < games; i++) {
    const s = simGame(simDeck("m", `lm${i}`, rules, { rarity: "legendary", level: 1 }), simDeck("f", `lf${i}`, rules, { rarity: "common", level: 1 }), `l${i}`, rules);
    if (s.winner === "me") legend++;
  }
  let hard = 0;
  for (let i = 0; i < games; i++) {
    const d = simDeck("x", `h${i}`, rules);
    const s = simGame(d, d.map((c) => ({ ...c, uid: `y${c.uid}` })), `h${i}`, rules, { me: "hard", foe: "easy" });
    if (s.winner === "me") hard++;
  }
  return { games, firstWin: first / games, legendVsCommon: legend / games, hardVsEasy: hard / games, avgTurns: turns / games, timeout: timeout / games, stuck };
}
