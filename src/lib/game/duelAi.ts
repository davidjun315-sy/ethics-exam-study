/**
 * 논쟁 대전 — 컴퓨터 상대. 단순하고 예측 가능한 규칙, 같은 상태면 항상 같은 행동 (서버가 다시 계산해 확인할 수 있게).
 *  1. 치명타 확인: 수호가 없고 공격 합이 상대 신념 이상이면 모두 논자 공격
 *  2. 카드 내기: 이번 턴 사유력을 가장 많이 쓰는 조합에서 비싼 카드부터
 *     등장 효과 대상 — 일격: 처치 가능한 가장 강한 적 → 가장 강한 적 / 기절: 공격력 가장 높은 적 / 회복: 가장 다친 아군 → 내 논자
 *  3. 공격: 수호 우선 → 처치하고 살아남는 교환 → (어려움) 손해 없는 맞교환 → 논자
 * 난이도: 쉬움은 치명타를 놓치고 40% 확률로 아무 카드·대상이나 고른다. 어려움은 맞교환까지 계산한다.
 */
import { seededRandom } from "./battle.ts";
import type { Difficulty } from "./battle.ts";
import { attackOf, effectPower, illegal, other, type DuelAction, type DuelSide, type DuelState, type Minion, type Target } from "./duel.ts";

const value = (s: DuelState, side: DuelSide, m: Minion) => attackOf(s, side, m) * 1.5 + m.hp + (m.guard ? 1 : 0) + s.cards[m.uid].cost * 0.5;

function aiRand(s: DuelState, side: DuelSide, salt: string) {
  const pl = s.players[side];
  return seededRandom(`${s.seed}:ai:${s.turn}:${pl.mana}:${pl.hand.length}:${pl.field.map((m) => m.uid + m.canAttack).join(",")}:${salt}`)();
}

/** 손패에서 이번 턴에 낼 카드 (사유력을 가장 많이 쓰는 조합의 가장 비싼 카드) */
function bestPlay(s: DuelState, side: DuelSide): string | null {
  const pl = s.players[side];
  const room = s.rules.fieldSize - pl.field.length;
  if (room <= 0) return null;
  const hand = pl.hand.filter((u) => s.cards[u].cost <= pl.mana);
  if (!hand.length) return null;
  let best: string[] = [];
  let bestCost = -1;
  const n = Math.min(hand.length, 7);
  for (let mask = 1; mask < 1 << n; mask++) {
    const pick = hand.filter((_, i) => mask & (1 << i));
    if (pick.length > room) continue;
    const cost = pick.reduce((t, u) => t + s.cards[u].cost, 0);
    if (cost > pl.mana) continue;
    // 같은 비용이면 공격+체력 합이 큰 조합
    const stat = pick.reduce((t, u) => t + s.cards[u].atk + s.cards[u].hp, 0) / 100;
    if (cost + stat > bestCost) {
      bestCost = cost + stat;
      best = pick;
    }
  }
  if (!best.length) return null;
  return [...best].sort((a, b) => s.cards[b].cost - s.cards[a].cost || s.cards[b].atk - s.cards[a].atk || a.localeCompare(b))[0];
}

function effectTarget(s: DuelState, side: DuelSide, uid: string): Target | undefined {
  const c = s.cards[uid];
  const foe = other(side);
  const enemies = s.players[foe].field;
  const power = effectPower(c);
  if (c.effect === "strike") {
    if (!enemies.length) return undefined;
    const kill = enemies.filter((m) => m.hp <= power).sort((a, b) => value(s, foe, b) - value(s, foe, a))[0];
    const t = kill ?? [...enemies].sort((a, b) => attackOf(s, foe, b) - attackOf(s, foe, a) || a.uid.localeCompare(b.uid))[0];
    return { side: foe, uid: t.uid };
  }
  if (c.effect === "stun") {
    if (!enemies.length) return undefined;
    const t = [...enemies].sort((a, b) => attackOf(s, foe, b) - attackOf(s, foe, a) || b.hp - a.hp || a.uid.localeCompare(b.uid))[0];
    return { side: foe, uid: t.uid };
  }
  if (c.effect === "heal") {
    const hurt = [...s.players[side].field].filter((m) => m.maxHp - m.hp >= 2).sort((a, b) => b.maxHp - b.hp - (a.maxHp - a.hp))[0];
    if (hurt) return { side, uid: hurt.uid };
    return { side, hero: true };
  }
  return undefined;
}

function attackChoice(s: DuelState, side: DuelSide, m: Minion, level: Difficulty): Target {
  const foe = other(side);
  const enemies = s.players[foe].field;
  const guards = enemies.filter((x) => x.guard);
  const atk = attackOf(s, side, m);
  const canKill = (t: Minion) => atk >= t.hp;
  const survives = (t: Minion) => attackOf(s, foe, t) < m.hp;
  if (level === "easy" && aiRand(s, side, `rand:${m.uid}`) < 0.4) {
    const pool: Target[] = guards.length ? guards.map((g) => ({ side: foe, uid: g.uid })) : [{ side: foe, hero: true }, ...enemies.map((e) => ({ side: foe, uid: e.uid }))];
    return pool[Math.floor(aiRand(s, side, `pick:${m.uid}`) * pool.length)];
  }
  if (guards.length) {
    const t = guards.filter(canKill).sort((a, b) => value(s, foe, b) - value(s, foe, a))[0] ?? [...guards].sort((a, b) => a.hp - b.hp)[0];
    return { side: foe, uid: t.uid };
  }
  const good = enemies.filter((t) => canKill(t) && survives(t)).sort((a, b) => value(s, foe, b) - value(s, foe, a))[0];
  if (good) return { side: foe, uid: good.uid };
  if (level === "hard") {
    const even = enemies.filter((t) => canKill(t) && value(s, foe, t) >= value(s, side, m)).sort((a, b) => value(s, foe, b) - value(s, foe, a))[0];
    if (even) return { side: foe, uid: even.uid };
  }
  // 상대 필드가 강하면(공격 합이 내 신념의 절반 이상) 가장 위협적인 적을 먼저
  const threat = enemies.reduce((t, e) => t + attackOf(s, foe, e), 0);
  if (threat * 2 >= s.players[side].hero) {
    const t = enemies.filter(canKill).sort((a, b) => attackOf(s, foe, b) - attackOf(s, foe, a))[0];
    if (t) return { side: foe, uid: t.uid };
  }
  return { side: foe, hero: true };
}

/** 다음 행동 하나 (턴이 끝날 때까지 반복해서 부른다) */
export function chooseDuelAction(s: DuelState, side: DuelSide, level: Difficulty = "normal"): DuelAction {
  if (s.winner || s.active !== side) return { t: "end" };
  const pl = s.players[side];
  const foe = other(side);
  const ready = pl.field.filter((m) => m.canAttack && attackOf(s, side, m) > 0);
  // 1. 치명타 (쉬움은 보지 못함)
  const noGuard = !s.players[foe].field.some((m) => m.guard);
  if (level !== "easy" && noGuard && ready.length && ready.reduce((t, m) => t + attackOf(s, side, m), 0) >= s.players[foe].hero) {
    return { t: "attack", attacker: ready[0].uid, target: { side: foe, hero: true } };
  }
  // 2. 카드 내기 (먼저 내서 공명·수호·효과를 살린다)
  let play = bestPlay(s, side);
  if (play && level === "easy" && aiRand(s, side, "play") < 0.4) {
    // 쉬움: 낼 수 있는 카드 중 아무거나
    const can = s.players[side].hand.filter((u) => s.cards[u].cost <= pl.mana);
    play = can[Math.floor(aiRand(s, side, "which") * can.length)] ?? play;
  }
  if (play) {
    const a: DuelAction = { t: "play", uid: play, target: effectTarget(s, side, play) };
    if (!illegal(s, side, a)) return a;
    const b: DuelAction = { t: "play", uid: play };
    if (!illegal(s, side, b)) return b;
  }
  // 3. 공격 (공격력 높은 사상가부터)
  const attacker = [...ready].sort((a, b) => attackOf(s, side, b) - attackOf(s, side, a) || a.uid.localeCompare(b.uid))[0];
  if (attacker) {
    const a: DuelAction = { t: "attack", attacker: attacker.uid, target: attackChoice(s, side, attacker, level) };
    if (!illegal(s, side, a)) return a;
  }
  return { t: "end" };
}

/** 컴퓨터 턴 전체 (화면에서 재생용): 턴이 넘어가거나 대전이 끝날 때까지의 행동 목록 */
export function playAiTurn(s: DuelState, side: DuelSide, level: Difficulty, apply: (s: DuelState, a: DuelAction) => DuelState): { state: DuelState; actions: DuelAction[] } {
  const actions: DuelAction[] = [];
  let st = s;
  for (let i = 0; i < 40 && !st.winner && st.active === side; i++) {
    const a = chooseDuelAction(st, side, level);
    actions.push(a);
    st = apply(st, a);
    if (a.t === "end") break;
  }
  return { state: st, actions };
}
