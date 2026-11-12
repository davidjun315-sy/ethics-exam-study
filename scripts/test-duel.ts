/** 논쟁 대전(턴제 카드 배틀) 엔진 · 컴퓨터 상대 · 균형 점검.  npm run test:duel */
import { applyAction, createDuel, DEFAULT_DUEL_RULES, replayDuel, toDuelCard, type DuelAction, type DuelCardDef, type DuelSide, type DuelState } from "../src/lib/game/duel.ts";
import { chooseDuelAction } from "../src/lib/game/duelAi.ts";
import { activeResonances, duelRulesError, normalizeDuelRules } from "../src/lib/game/duel.ts";
import { pickDuelDeck } from "../src/lib/game/duelDeck.ts";
import { simDeck, simGame, simulateBalance } from "../src/lib/game/duelSim.ts";
import { buildCampaign, canPlayStage, MINION_COUNT, stageBoss, stageBossStats, stageFoes, stageStatuses, stageStones, type StageCard } from "../src/lib/game/campaign.ts";
import { chargeAt, runBattle, SKILL_READY, type Fighter } from "../src/lib/game/battle.ts";
import { isDefaultBase, roleBase, upgradeCost } from "../src/lib/game/rules.ts";
import { seededRandom, type Difficulty } from "../src/lib/game/battle.ts";
import { statsFor, type Rarity, type SkillEffect } from "../src/lib/game/rules.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};
const throws = (f: () => unknown, msg: string) => {
  try {
    f();
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes(msg);
  }
};

const EFFECTS: SkillEffect[] = ["strike", "sweep", "heal", "guard", "stun"];
const TRADS = ["동양윤리", "한국윤리", "서양윤리", "사회사상"];
function card(uid: string, o: Partial<{ rarity: Rarity; level: number; effect: SkillEffect; tradition: string }> = {}): DuelCardDef {
  const rarity = o.rarity ?? "common";
  const level = o.level ?? 1;
  const st = statsFor({ atk: 40, hp: 300 }, rarity, level);
  return toDuelCard({ uid, cardId: null, philosopherId: `p-${uid}`, name: uid, tradition: o.tradition ?? "미분류", rarity, level, effect: o.effect ?? "strike", skillName: "필살기", artUrl: null, statAtk: st.atk, statHp: st.hp });
}
function deck(prefix: string, seed: string, o: { rarity?: Rarity | "mix"; level?: number } = {}): DuelCardDef[] {
  const r = seededRandom(seed);
  const rar: Rarity[] = ["common", "common", "common", "common", "rare", "rare", "rare", "epic", "epic", "legendary"];
  return Array.from({ length: 12 }, (_, i) =>
    card(`${prefix}${i}`, {
      rarity: o.rarity && o.rarity !== "mix" ? o.rarity : rar[Math.floor(r() * rar.length)],
      level: o.level ?? 1 + Math.floor(r() * 3),
      effect: EFFECTS[Math.floor(r() * EFFECTS.length)],
      tradition: TRADS[Math.floor(r() * TRADS.length)],
    }),
  );
}
const step = (s: DuelState, side: DuelSide, a: DuelAction) => applyAction(s, side, a).state;

/** 컴퓨터끼리 한 판 → 결과와 'me' 쪽 행동 기록 */
function aiGame(me: DuelCardDef[], foe: DuelCardDef[], seed: string, lv: { me: Difficulty; foe: Difficulty } = { me: "normal", foe: "normal" }) {
  let s = createDuel({ me, foe, seed }).state;
  const log: DuelAction[] = [];
  let n = 0;
  while (!s.winner && n++ < 3000) {
    const side = s.active;
    const a = chooseDuelAction(s, side, lv[side]);
    if (side === "me") log.push(a);
    s = step(s, side, a);
  }
  return { s, log, steps: n };
}

// ---------------- 카드 변환 ----------------
check("카드 변환: 일반 Lv.1 = 비용 2 · 3/5, 전설 Lv.1 = 비용 4 · 10/15", JSON.stringify([card("a").cost, card("a").atk, card("a").hp]) === "[2,3,5]" && JSON.stringify([card("b", { rarity: "legendary" }).cost, card("b", { rarity: "legendary" }).atk, card("b", { rarity: "legendary" }).hp]) === "[4,10,15]");
{
  const eff = ["common", "rare", "epic", "legendary"].map((r) => { const c = card(`e${r}`, { rarity: r as Rarity }); return (c.atk + c.hp) / c.cost; });
  check("높은 등급일수록 사유력 1당 능력치가 같거나 좋음 (전설 > 일반)", eff.every((v, i, a) => i === 0 || v >= a[i - 1]) && eff[3] > eff[0], eff.map((v) => v.toFixed(2)).join(" · "));
}
check("레벨업은 비용을 올리지 않고 능력치만 (일반 Lv.5 = 2 · 5/7)", JSON.stringify([card("c", { level: 5 }).cost, card("c", { level: 5 }).atk, card("c", { level: 5 }).hp]) === "[2,5,7]");

// ---------------- 시작 ----------------
{
  const { state: s } = createDuel({ me: deck("m", "d1"), foe: deck("f", "d2"), seed: "start" });
  const first = s.first;
  const second = first === "me" ? "foe" : "me";
  // 선공: 처음 3장 + 첫 턴 1장 = 4장 / 후공: 4장 (아직 턴 전)
  check("처음 손패: 선공 3장(+첫 턴 뽑기 1) · 후공 4장", s.players[first].hand.length === 4 && s.players[second].hand.length === 4);
  check("첫 턴 사유력 1 · 논자 신념 35", s.players[first].mana === 1 && s.players[first].hero === 35 && s.active === first);
  const s2 = step(s, first, { t: "end" });
  check("후공 보상: 후공 첫 턴 사유력 2 (1 + 1)", s2.players[second].mana === 2 && s2.players[second].hand.length === 5);
  check("같은 시드 → 같은 선공·같은 손패 (결정적)", JSON.stringify(createDuel({ me: deck("m", "d1"), foe: deck("f", "d2"), seed: "start" }).state) === JSON.stringify(s));
}

// ---------------- 규칙 ----------------
function setupFixed(meCards: DuelCardDef[], foeCards: DuelCardDef[]) {
  // 손패·필드를 직접 정한 상태 (규칙 점검용)
  const { state } = createDuel({ me: [...meCards, ...deck("mx", "x1")], foe: [...foeCards, ...deck("fx", "x2")], seed: "fixed" });
  const s = structuredClone(state);
  s.active = "me";
  s.first = "me";
  s.players.me.hand = meCards.map((c) => c.uid);
  s.players.foe.hand = foeCards.map((c) => c.uid);
  s.players.me.mana = s.players.me.maxMana = 7;
  return s;
}
{
  const a = card("A", { effect: "strike" });
  const g = card("G", { effect: "guard" });
  const b = card("B", { effect: "sweep" });
  let s = setupFixed([a, b], [g]);
  // 상대 필드에 수호 G
  s.players.foe.field.push({ uid: "G", atk: g.atk, hp: g.hp, maxHp: g.hp, guard: true, stun: 0, canAttack: false, resonated: false });
  s.players.foe.hand = [];
  s = step(s, "me", { t: "play", uid: "A", target: { side: "foe", uid: "G" } });
  check("일격(일반): 등장 시 적 하나에게 2 피해", s.players.foe.field[0].hp === g.hp - 2);
  check("낸 턴에는 공격할 수 없음", throws(() => step(s, "me", { t: "attack", attacker: "A", target: { side: "foe", uid: "G" } }), "이번 턴"));
  check("사유력이 부족하면 낼 수 없음", throws(() => step({ ...s, players: { ...s.players, me: { ...s.players.me, mana: 0 } } }, "me", { t: "play", uid: "B" }), "사유력"));
  check("상대 턴에는 행동할 수 없음", throws(() => step(s, "foe", { t: "end" }), "상대의 턴"));
  // 다음 내 턴: 수호가 있으면 논자 공격 불가
  s = step(s, "me", { t: "end" });
  s = step(s, "foe", { t: "end" });
  check("수호가 있으면 논자를 공격할 수 없음", throws(() => step(s, "me", { t: "attack", attacker: "A", target: { side: "foe", hero: true } }), "수호"));
  const hpA = s.players.me.field[0].hp;
  s = step(s, "me", { t: "attack", attacker: "A", target: { side: "foe", uid: "G" } });
  check("사상가끼리 공격: 서로 공격력만큼 피해", s.players.me.field[0].hp === hpA - g.atk);
}
{
  const st = card("S", { effect: "stun", rarity: "rare" });
  const v = card("V");
  let s = setupFixed([st], []);
  s.players.foe.field.push({ uid: "V", atk: v.atk, hp: 10, maxHp: 10, guard: false, stun: 0, canAttack: true, resonated: false });
  s.cards.V = v;
  s = step(s, "me", { t: "play", uid: "S", target: { side: "foe", uid: "V" } });
  check("기절(희귀): 기절 + 1 피해", s.players.foe.field[0].hp === 9 && s.players.foe.field[0].stun === 1);
  s = step(s, "me", { t: "end" });
  check("기절한 사상가는 자기 다음 턴에 공격 불가", throws(() => step(s, "foe", { t: "attack", attacker: "V", target: { side: "me", hero: true } }), "기절"));
  s = step(s, "foe", { t: "end" });
  s = step(s, "me", { t: "end" });
  check("그 다음 턴에는 다시 공격 가능", !throws(() => step(s, "foe", { t: "attack", attacker: "V", target: { side: "me", hero: true } }), ""));
}
{
  const w1 = card("W1", { tradition: "서양윤리", effect: "guard" });
  const w2 = card("W2", { tradition: "서양윤리", effect: "guard" });
  let s = setupFixed([w1, w2], []);
  s = step(s, "me", { t: "play", uid: "W1" });
  const before = s.players.me.field[0].atk;
  s = step(s, "me", { t: "play", uid: "W2" });
  const ev = applyAction(setupFixed([w1, w2], []), "me", { t: "play", uid: "W1" });
  check("서양윤리 공명: 2명 이상이면 공격 +1", ev.state.players.me.field.length === 1 && before === w1.atk && s.players.me.field.every((m) => m.atk === w1.atk));
  const k1 = card("K1", { tradition: "한국윤리", effect: "guard" });
  const k2 = card("K2", { tradition: "한국윤리", effect: "guard" });
  let k = setupFixed([k1, k2], []);
  k = step(step(k, "me", { t: "play", uid: "K1" }), "me", { t: "play", uid: "K2" });
  check("한국윤리 공명: 체력 +1 (한 번만)", k.players.me.field.every((m) => m.maxHp === k1.hp + 1));
}
{
  // 소진: 덱이 비면 뽑을 때마다 1, 2, 3 …
  let s = createDuel({ me: deck("m", "f1").slice(0, 4), foe: deck("f", "f2"), seed: "fat" }).state;
  let dmg = 0;
  for (let i = 0; i < 12 && !s.winner; i++) s = step(s, s.active, { t: "end" });
  dmg = 35 - s.players.me.hero;
  check("덱이 비면 소진 피해 (1, 2, 3 …)", s.players.me.fatigue >= 3 && dmg === (s.players.me.fatigue * (s.players.me.fatigue + 1)) / 2);
}
{
  // 턴 제한: 아무것도 안 하면 신념이 같은 쪽 무승부 / 많은 쪽 승리
  let s = createDuel({ me: deck("m", "t1"), foe: deck("f", "t2"), seed: "turns", rules: { ...DEFAULT_DUEL_RULES, turnLimit: 6 } }).state;
  for (let i = 0; i < 10 && !s.winner; i++) s = step(s, s.active, { t: "end" });
  check("턴 제한: 끝나면 신념 비교 (같으면 무승부)", s.winner === "draw" && s.endReason === "turns");
}
check("항복: 언제든 가능, 상대 승리", (() => {
  const s = createDuel({ me: deck("m", "c1"), foe: deck("f", "c2"), seed: "c" }).state;
  const r = applyAction(s, "me", { t: "concede" }).state;
  return r.winner === "foe" && r.endReason === "concede";
})());
check("입력 상태는 바뀌지 않음 (순수 함수)", (() => {
  const s = createDuel({ me: deck("m", "p1"), foe: deck("f", "p2"), seed: "pure" }).state;
  const snap = JSON.stringify(s);
  applyAction(s, s.active, { t: "end" });
  return JSON.stringify(s) === snap;
})());

// ---------------- 서버 확인 (다시 계산) ----------------
{
  const me = deck("m", "r1");
  const foe = deck("f", "r2");
  const g = aiGame(me, foe, "replay-1");
  const re = replayDuel({ me, foe, seed: "replay-1" }, g.log, (s, side) => chooseDuelAction(s, side, "normal"));
  check("다시 계산: 같은 기록 → 같은 승패·같은 최종 상태", re.finished && re.state.winner === g.s.winner && JSON.stringify(re.state) === JSON.stringify(g.s));
  const cut = replayDuel({ me, foe, seed: "replay-1" }, g.log.slice(0, 3), (s, side) => chooseDuelAction(s, side, "normal"));
  check("기록이 모자라면 '끝나지 않음'", !cut.finished);
  const forged = [...g.log];
  forged[0] = { t: "attack", attacker: "m0", target: { side: "foe", hero: true } };
  check("조작된 기록(규칙 위반)은 거절", throws(() => replayDuel({ me, foe, seed: "replay-1" }, forged, (s, side) => chooseDuelAction(s, side, "normal")), ""));
}

// ---------------- 균형 (컴퓨터끼리 1,000판) ----------------
{
  let firstWins = 0;
  let decided = 0;
  let turns = 0;
  let maxTurns = 0;
  let stuck = 0;
  for (let i = 0; i < 1000; i++) {
    const d = deck("m", `bal-${i}`);
    const mirror = d.map((c, k) => ({ ...c, uid: `f${k}`, philosopherId: `q${k}` }));
    const g = aiGame(d, mirror, `bal-seed-${i}`);
    if (g.steps >= 3000) stuck++;
    if (g.s.winner !== "draw") {
      decided++;
      if (g.s.winner === g.s.first) firstWins++;
    }
    turns += g.s.turn;
    maxTurns = Math.max(maxTurns, g.s.turn);
  }
  const rate = firstWins / decided;
  check("1,000판 모두 끝남 (무한 반복 없음)", stuck === 0);
  check("같은 덱끼리 선공 승률 40~60%", rate >= 0.4 && rate <= 0.6, `${(rate * 100).toFixed(1)}%`);
  check("한 판 길이 적당 (평균 양쪽 합 14~30턴)", turns / 1000 >= 14 && turns / 1000 <= 30, `평균 ${(turns / 1000).toFixed(1)}턴 · 최대 ${maxTurns}`);
}
{
  let w = 0;
  for (let i = 0; i < 200; i++) if (aiGame(deck("m", `lg-${i}`, { rarity: "legendary", level: 3 }), deck("f", `cm-${i}`, { rarity: "common", level: 1 }), `rar-${i}`).s.winner === "me") w++;
  check("수집이 곧 힘: 전설 Lv.3 덱이 일반 Lv.1 덱을 대부분 이김", w >= 170, `${w}/200`);
  let lv = 0;
  for (let i = 0; i < 200; i++) if (aiGame(deck("m", `l5-${i}`, { rarity: "mix", level: 5 }), deck("f", `l5-${i}`, { rarity: "mix", level: 1 }), `lvl-${i}`).s.winner === "me") lv++;
  check("레벨업 효과: 같은 구성 Lv.5 덱이 Lv.1 덱에 우세", lv >= 130, `${lv}/200`);
  let h = 0;
  for (let i = 0; i < 300; i++) {
    const d = deck("m", `hd-${i}`);
    const mirror = d.map((c, k) => ({ ...c, uid: `f${k}` }));
    if (aiGame(d, mirror, `hard-${i}`, { me: "hard", foe: "easy" }).s.winner === "me") h++;
  }
  check("컴퓨터 난이도: 같은 덱이면 어려움이 쉬움에 우세", h >= 165, `${h}/300`);
}

// ---------------- 관리자 조정값 (013) ----------------
{
  check("조정값 없음({}·null) → 기본값", JSON.stringify(normalizeDuelRules({})) === JSON.stringify(DEFAULT_DUEL_RULES) && JSON.stringify(normalizeDuelRules(null)) === JSON.stringify(DEFAULT_DUEL_RULES));
  const n = normalizeDuelRules({ heroHp: 999, fieldSize: 9, turnLimit: 41, cost: { epic: "x" }, rarityBoost: { legendary: 2 } });
  check("범위 밖 값은 허용 범위로 · 깨진 값은 기본값 · 일부만 있어도 나머지 기본", n.heroHp === 100 && n.fieldSize === 5 && n.turnLimit === 42 && n.cost.epic === 3 && n.rarityBoost.legendary === 2 && n.maxMana === 7);
  check("기본값은 저장 가능", duelRulesError(DEFAULT_DUEL_RULES) === null);
  check("비용 > 최대 사유력 거절", duelRulesError({ ...DEFAULT_DUEL_RULES, maxMana: 3 }) !== null);
  check("등급 순서가 거꾸로면 거절 (비용·보정)", duelRulesError({ ...DEFAULT_DUEL_RULES, cost: { common: 3, rare: 2, epic: 3, legendary: 4 } }) !== null && duelRulesError({ ...DEFAULT_DUEL_RULES, rarityBoost: { common: 1, rare: 1.5, epic: 1.2, legendary: 2 } }) !== null);
  check("범위 밖 값 거절 (필드 9칸)", duelRulesError({ ...DEFAULT_DUEL_RULES, fieldSize: 9 }) !== null);
  // 바꾼 규칙으로도 대전이 끝까지 진행되고, 같은 기록이면 서버 재계산도 같다
  const custom = normalizeDuelRules({ heroHp: 25, maxMana: 8, fieldSize: 5, deckSize: 15, handSize: 8, turnLimit: 40 });
  let ok = true;
  for (let i = 0; i < 40; i++) {
    const me = simDeck("m", `c${i}`, custom);
    const foe = simDeck("f", `cf${i}`, custom);
    const s = simGame(me, foe, `cs${i}`, custom);
    if (!s.winner || me.length !== 15 || s.players.me.field.length > 5 || s.players.foe.field.length > 5) ok = false;
  }
  check("바꾼 규칙(필드 5 · 덱 15 · 신념 25)으로 40판 모두 끝나고 필드 상한 지킴", ok);
  {
    let s = createDuel({ me: simDeck("m", "rp", custom), foe: simDeck("f", "rpf", custom), seed: "rp", rules: custom }).state;
    const log: DuelAction[] = [];
    while (!s.winner) {
      const a = chooseDuelAction(s, s.active, "normal");
      if (s.active === "me") log.push(a);
      s = step(s, s.active, a);
    }
    const r = replayDuel({ me: simDeck("m", "rp", custom), foe: simDeck("f", "rpf", custom), seed: "rp", rules: custom }, log, (st, side) => chooseDuelAction(st, side, "normal"));
    check("바꾼 규칙도 서버 재계산이 같은 결과 (규칙은 대전마다 스냅샷)", r.finished && r.state.winner === s.winner && r.state.turn === s.turn);
  }
  const b = simulateBalance(DEFAULT_DUEL_RULES, 60);
  check("관리자 시뮬레이션: 기본값에서 끝나지 않은 판 없음 · 전설 덱 우세", b.stuck === 0 && b.legendVsCommon >= 0.6, JSON.stringify({ first: b.firstWin, legend: b.legendVsCommon, hard: b.hardVsEasy, turns: b.avgTurns }));
}

// ---------------- 덱 만들기 · 공명 ----------------
{
  const owned = Array.from({ length: 15 }, (_, i) => ({ cardId: `c${i}`, philosopherId: `p${i % 6}`, name: `n${i}`, rarity: (["common", "rare", "epic", "legendary"] as const)[i % 4], level: 1 + (i % 3) }));
  const saved = ["c0", "c5", "c9"];
  const d = pickDuelDeck(owned, saved, 12);
  check("직접 고른 카드가 먼저 · 나머지는 자동으로 12장", d.length === 12 && d.slice(0, 3).map((o) => o.cardId).join() === "c0,c5,c9");
  check("보유 카드가 충분하면 자동으로 채운 카드도 겹치지 않음", new Set(d.map((o) => o.cardId)).size === 12);
  check("보유하지 않은(지운) 카드 id 는 무시", pickDuelDeck(owned, ["gone", "c1"], 12)[0].cardId === "c1");
  const few = pickDuelDeck(owned.slice(0, 4), [], 12);
  check("보유 4장 → 같은 카드를 반복해 12장", few.length === 12);
}
{
  const west = (uid: string) => card(uid, { tradition: "서양윤리" });
  let s = setupFixed([west("w1"), west("w2"), card("e1", { tradition: "동양윤리", effect: "guard" })], []);
  for (const uid of ["w1", "w2", "e1"]) s = step(s, "me", { t: "play", uid });
  check("켜진 공명 목록: 서양 2명 → [서양윤리], 동양 1명 → 꺼짐", JSON.stringify(activeResonances(s, "me")) === JSON.stringify(["서양윤리"]) && activeResonances(s, "foe").length === 0);
}

// ---------------- 사상가 도장깨기 (내 카드 3장 vs 관 보스 1명) ----------------
{
  const list: [string, string][] = [["칸트", "서양윤리"], ["공자", "동양윤리"], ["이이", "한국윤리"], ["맹자", "동양윤리"], ["롤스", "사회사상"], ["플라톤", "서양윤리"], ["이황", "한국윤리"], ["주희", "동양윤리"], ["밀", "서양윤리"], ["노직", "사회사상"]];
  const EFF2 = ["strike", "sweep", "heal", "guard", "stun"] as const;
  // 실제 게임처럼 사상가 성향대로 자동 분배된 기본 능력치
  const cards: StageCard[] = list.map(([n, t], i) => {
    const b = roleBase(n, EFF2[i % 5]);
    return { philosopherId: `p${i}`, name: n, tradition: t, baseAtk: b.atk, baseHp: b.hp, skillEffect: EFF2[i % 5], skillName: "s", artUrl: null };
  });
  const byId = new Map(cards.map((c) => [c.philosopherId, c]));
  {
    const bases = cards.map((c) => `${c.name} ${c.baseAtk}/${c.baseHp}`);
    const products = cards.map((c) => c.baseAtk * c.baseHp);
    check("사상가 성향 분배: 모두 다른 능력치 · 공격×체력 합은 비슷 (±12%)", new Set(cards.map((c) => `${c.baseAtk}/${c.baseHp}`)).size === cards.length && Math.max(...products) / Math.min(...products) < 1.25, bases.join(" · "));
    check("관리자가 정한 능력치(40/300 이 아님)는 그대로", isDefaultBase(40, 300) && !isDefaultBase(55, 260));
  }
  const name = (id: string) => byId.get(id)!.name;
  const st = buildCampaign(cards, 5);
  check("관 순서: 동양 → 한국 → 서양 → 사회사상, 분야 안에서는 태어난 순", st.map((x) => name(x.bossId)).join(",") === "공자,맹자,주희,이황,이이,플라톤,칸트,밀,롤스,노직", st.map((x) => name(x.bossId)).join(","));
  // 기본 능력치 비교 (특수 보스는 패턴이 있어 체력을 조금 낮추므로 패턴 없는 값으로)
  // 적 전체(보스 + 수하)의 공격×체력 합 (특수 보스는 패턴이 있어 체력을 조금 낮추므로 패턴 없는 값으로)
  const teamPow = (stages: typeof st) => stages.map((x) => stageFoes({ ...x, pattern: null }, byId).reduce((n, f) => n + f.atk * f.hp, 0));
  const power = st.map((x) => stageBossStats({ ...x, pattern: null }));
  const tp = teamPow(st);
  check("관마다 보스 한 명 · 매 관 더 강해짐 (공격×체력이 매번 늘고, 마지막이 첫 관보다 훨씬 강함)", tp.every((p, i) => i === 0 || p > tp[i - 1]) && tp[9] > tp[0] * 5, tp.map((p) => Math.round(p / 1000)).join(" "));
  check("보스 레벨 = 관 번호 (매 관 오름) · 등급은 내려가지 않음", st.every((x, i) => x.level === i + 1) && st.every((x, i) => i === 0 || ["common", "rare", "epic", "legendary"].indexOf(x.rarity) >= ["common", "rare", "epic", "legendary"].indexOf(st[i - 1].rarity)));
  {
    // 사상가마다 기본 능력치가 달라도 뒤 관이 약해지지 않음
    const uneven = cards.map((c, i) => ({ ...c, baseAtk: 30 + ((i * 13) % 25), baseHp: 220 + ((i * 71) % 160) }));
    const ub = new Map(uneven.map((c) => [c.philosopherId, c]));
    const p2 = buildCampaign(uneven, 5).map((x) => stageFoes({ ...x, pattern: null }, ub).reduce((n, f) => n + f.atk * f.hp, 0));
    check("사상가 기본값이 제각각이어도 적 전체는 매 관 강해짐 (공격×체력 합)", p2.every((p, i) => i === 0 || p > p2[i - 1]), p2.map((p) => Math.round(p / 1000)).join(" "));
  }
  check("보스 등급: 일반 → 희귀 → 영웅 → 전설", st[0].rarity === "common" && st[9].rarity === "legendary" && st.some((x) => x.rarity === "rare") && st.some((x) => x.rarity === "epic"));
  const none = stageStatuses(st, new Set());
  check("처음엔 1관만 열림", none[0] === "current" && none.slice(1).every((x) => x === "locked"));
  const two = new Set([st[0].bossId, st[1].bossId]);
  const s2 = stageStatuses(st, two);
  check("1·2관을 깨면 3관이 열리고 깬 관은 다시 도전 가능", s2[0] === "cleared" && s2[1] === "cleared" && s2[2] === "current" && s2[3] === "locked" && canPlayStage(st, two, st[0].bossId) && canPlayStage(st, two, st[2].bossId) && !canPlayStage(st, two, st[3].bossId));

  const team = (rar: "common" | "rare" | "epic" | "legendary", lv: number, g: number): Fighter[] =>
    [0, 1, 2].map((i) => {
      const x = statsFor({ atk: 40, hp: 300 }, rar, lv);
      return { key: `me-${i}`, philosopherId: `t${i}`, name: `t${i}`, atk: x.atk, hp: x.hp, skillName: "s", skillEffect: EFF2[(g + i) % 5] };
    });
  // 3 vs 1: 보스는 내 카드가 한 번 움직일 때마다 한 번 (양쪽 행동 횟수 같음)
  {
    const r = runBattle(team("legendary", 5, 0), [stageBoss(st[9], byId.get(st[9].bossId)!)], "order");
    // 내 카드가 쓰러지기 전까지 (쓰러진 카드의 차례는 건너뛰므로)
    const firstFaint = r.events.findIndex((e) => e.t === "faint");
    const acts = r.events.slice(0, firstFaint < 0 ? undefined : firstFaint).filter((e) => e.t === "attack" || e.t === "skill" || e.t === "stunned").map((e) => ("actor" in e ? e.actor : ""));
    const boss = acts.filter((a) => a === "foe-0").length;
    check("3 vs 1: 보스와 내 팀의 행동 횟수가 같음 (±1)", Math.abs(boss - (acts.length - boss)) <= 1, `보스 ${boss} · 팀 ${acts.length - boss}`);
  }
  // 필살기 게이지: 필살기가 나가기 직전에는 언제나 '가득', 일반 공격 직전에는 가득이 아님
  {
    let okAll = true;
    let skills = 0;
    for (let g = 0; g < 30; g++) {
      const r = runBattle(team("rare", 2, g), [stageBoss(st[3], byId.get(st[3].bossId)!)], `gauge${g}`);
      const keys = ["me-0", "me-1", "me-2", "foe-0"];
      r.events.forEach((e, i) => {
        if (e.t !== "attack" && e.t !== "skill") return;
        const c = chargeAt(keys, r.events, i)[e.actor];
        if (e.t === "skill") skills++;
        if ((e.t === "skill") !== (c === SKILL_READY)) okAll = false;
      });
    }
    check("필살기 게이지가 가득일 때만 필살기가 나감 (30판 모든 행동)", okAll && skills > 0, `필살기 ${skills}번`);
  }
  // 보스 회복 필살기는 보통 카드 크기만큼만
  {
    const b = stageBoss(st[2], { ...byId.get(st[2].bossId)!, skillEffect: "heal" });
    const r = runBattle(team("common", 1, 1), [b], "heal");
    const heals = r.events.filter((e) => e.t === "skill" && e.heal && e.heal.target === "foe-0").map((e) => (e.t === "skill" && e.heal ? e.heal.amount : 0));
    check("보스 회복은 체력 배율만큼 줄여서 (보통 카드의 35% 이하)", heals.every((h) => h <= Math.ceil((b.hp / (b.scale ?? 1)) * 0.35)), heals.join(","));
  }
  const rate = (rar: "common" | "rare" | "epic" | "legendary", lv: number, idx: number) => {
    let w = 0;
    for (let g = 0; g < 100; g++) if (runBattle(team(rar, lv, g), stageFoes(st[idx], byId), `camp${idx}-${g}`).winner === "me") w++;
    return w;
  };
  const w1 = rate("common", 1, 0);
  check("새내기 팀(일반 Lv.1 3장)은 1관도 반반 정도 (쉽지 않게)", w1 >= 25 && w1 <= 75, `${w1}/100`);
  const w3 = rate("common", 1, 2);
  check("새내기 팀은 3관부터 거의 못 깸 (강화석으로 키워야 함)", w3 <= 25, `${w3}/100`);
  const wl = rate("common", 1, 9);
  check("새내기 팀으로는 마지막 관을 못 깸 (뽑기·강화가 필요)", wl <= 5, `${wl}/100`);
  const wt = rate("legendary", 5, 9);
  check("전설 Lv.5 팀은 마지막 관도 몇 번 도전하면 깰 수 있음 (시너지·칭호 없이 한 판 8% 이상)", wt >= 8, `${wt}/100`);
  // 강화석 성장만으로는 보스를 못 넘음: 깬 관 강화석을 덱 3장 레벨업에 모두 쓴 일반 팀 (코인 무제한 가정)
  {
    const lvFrom = (stones: number) => {
      const lv = [1, 1, 1];
      for (let moved = true; moved; ) {
        moved = false;
        const i = lv.indexOf(Math.min(...lv));
        if (lv[i] < 5 && stones >= upgradeCost(lv[i]).shards) {
          stones -= upgradeCost(lv[i]).shards;
          lv[i]++;
          moved = true;
        }
      }
      return lv;
    };
    let stones = 0;
    let k = 0;
    for (; k < st.length; k++) {
      const lv = lvFrom(stones);
      let w = 0;
      for (let g = 0; g < 60; g++) {
        const t = team("common", 1, g).map((f, i) => ({ ...f, ...statsFor({ atk: f.atk, hp: f.hp }, "common", lv[i]) }));
        if (runBattle(t, stageFoes(st[k], byId), `grow${k}-${g}`).winner === "me") w++;
      }
      if (w < 30) break;
      stones += stageStones(k + 1);
    }
    check("일반 카드는 강화석만으로 키워도 앞 절반을 못 넘음 (뽑기·합성으로 등급을 올려야 함)", k < st.length / 2, `${k}/${st.length}관에서 막힘`);
  }
  // 특수 보스 패턴
  {
    const st20 = buildCampaign(Array.from({ length: 20 }, (_, i) => ({ philosopherId: `q${i}`, name: `q${i}`, tradition: "서양윤리" })), 5);
    const pats = st20.map((x) => x.pattern ?? "-").join(",");
    check("특수 보스: 5관 재생 · 10관 격노 · 15관 철벽 · 마지막 관 격노, 나머지 없음", pats === "-,-,-,-,regen,-,-,-,-,enrage,-,-,-,-,fortress,-,-,-,-,enrage", pats);
    check("특수 보스는 강화석 +1", stageStones(5, true) === 2 && stageStones(5) === 1);
    const boss = (p: "enrage" | "regen" | "fortress" | null, seed: string) => {
      const b = stageBoss({ ...st[5], pattern: p }, byId.get(st[5].bossId)!);
      return runBattle(team("legendary", 4, 2), [b], seed);
    };
    for (const p of ["enrage", "regen", "fortress"] as const) {
      const r = boss(p, `pat-${p}`);
      const ph = r.events.filter((e) => e.t === "phase");
      const i = r.events.findIndex((e) => e.t === "phase");
      // 발동 직전 보스 체력이 절반 이하
      const before = r.events.slice(0, i).reverse().map((e) => (e.t === "attack" && e.target === "foe-0" ? e.hp : e.t === "skill" ? e.hits.find((h) => h.target === "foe-0")?.hp : undefined)).find((x) => x !== undefined);
      const max = stageBoss({ ...st[5], pattern: p }, byId.get(st[5].bossId)!).hp;
      check(`패턴 「${p}」: 체력이 절반 아래가 되면 한 번 발동`, ph.length === 1 && before !== undefined && before <= max / 2, `발동 ${ph.length} · 직전 ${before}/${max}`);
      if (p === "enrage") {
        const next = r.events.slice(i + 1).find((e) => (e.t === "attack" || e.t === "skill" || e.t === "stunned") && e.actor === "foe-0");
        check("격노: 다음 보스 행동이 필살기 (게이지도 가득으로 표시)", next?.t === "skill" && chargeAt(["foe-0"], r.events, i + 1)["foe-0"] === SKILL_READY);
      }
      if (p === "regen") {
        const e = ph[0];
        check("재생: 최대 체력 15% 회복", e.t === "phase" && !!e.heal && e.heal.amount > 0 && e.heal.amount <= Math.round(max * 0.15) + 1);
      }
    }
    // 수하 포함 실제 관 구성으로, 반반쯤 이기는 팀(영웅 Lv.3)과 비교
    const full = (p: "fortress" | null, seed: string) => runBattle(team("epic", 4, 2), stageFoes({ ...st[5], pattern: p }, byId), seed);
    let wPlain = 0, wPat = 0;
    for (let g = 0; g < 120; g++) {
      if (full(null, `pp${g}`).winner === "me") wPlain++;
      if (full("fortress", `pp${g}`).winner === "me") wPat++;
    }
    check("특수 보스는 같은 관 보통 보스보다 어려움", wPat < wPlain, `보통 ${wPlain} · 철벽 ${wPat} /120`);
  }
  // 수하: 희귀 관 1명 · 영웅·전설 관 2명, 한 단계 아래 등급, 바로 앞 관의 사상가
  {
    const ok = st.every((x) => x.minions.length === Math.min(MINION_COUNT[x.rarity], x.index) && x.minions.every((m, k) => m.id === st[x.index - 1 - k].bossId && m.rarity === ({ common: "common", rare: "common", epic: "rare", legendary: "epic" } as const)[x.rarity]));
    check("수하: 일반 0 · 희귀 1 · 영웅 2 · 전설 2명, 등급은 한 단계 아래, 앞 관 사상가", ok, st.map((x) => `${x.rarity[0]}${x.minions.length}`).join(" "));
    const f = stageFoes(st[st.length - 1], byId);
    check("수하 배틀 참가자: foe-0 보스 + foe-1 · foe-2", f.map((x) => x.key).join(",") === "foe-0,foe-1,foe-2" && f[1].hp < f[0].hp);
    const legend = st.filter((x) => x.rarity === "legendary");
    const epicLast = [...st].reverse().find((x) => x.rarity === "epic")!;
    const rate = (stage: (typeof st)[number]) => {
      let w = 0;
      for (let g = 0; g < 100; g++) if (runBattle(team("legendary", 5, g), stageFoes(stage, byId), `lg${stage.no}-${g}`).winner === "me") w++;
      return w;
    };
    const wE = rate(epicLast), wL = rate(legend[legend.length - 1]);
    check("전설 관은 영웅 관보다 어려움 (같은 전설 Lv.5 팀)", wL < wE, `영웅 마지막 ${wE} · 전설 마지막 ${wL} /100`);
  }
  // 재도전 포함 진행도: 조금만 키운 팀(일반 Lv.1 두 장 + 희귀 Lv.2)은 재도전 5번씩 해도 앞쪽 20%를 못 넘음
  {
    const big = Array.from({ length: 40 }, (_, i) => ({ philosopherId: `b${i}`, name: `b${i}`, tradition: "서양윤리", baseAtk: 40, baseHp: 300, skillEffect: EFF2[(i * 3) % 5], skillName: "s", artUrl: null }));
    const bigById = new Map(big.map((c) => [c.philosopherId, c]));
    const camp = buildCampaign(big, 5);
    const reach = (spec: ["common" | "rare" | "epic" | "legendary", number][]) => {
      let k = 0;
      for (; k < camp.length; k++) {
        let won = false;
        for (let a = 0; a < 5 && !won; a++) {
          const t = spec.map(([r, lv], i) => { const x = statsFor({ atk: 40, hp: 300 }, r, lv); return { key: `me-${i}`, philosopherId: `t${i}`, name: `t${i}`, atk: x.atk, hp: x.hp, skillName: "s", skillEffect: EFF2[(a + k + i) % 5] }; });
          won = runBattle(t, stageFoes(camp[k], bigById), `reach${k}-${a}`).winner === "me";
        }
        if (!won) break;
      }
      return k;
    };
    const light = reach([["common", 1], ["common", 1], ["rare", 2]]);
    const rare3 = reach([["rare", 3], ["rare", 3], ["rare", 3]]);
    const leg5 = reach([["legendary", 5], ["legendary", 5], ["legendary", 5]]);
    check("조금 키운 팀(일반1·일반1·희귀2)은 재도전 5번씩 해도 40관 중 20%를 못 넘음", light < 8, `${light}/40`);
    check("키울수록 멀리 감: 조금 키운 팀 < 희귀 Lv.3 < 전설 Lv.5 (전설은 65% 이상)", light < rare3 && rare3 < leg5 && leg5 >= 26, `${light} · ${rare3} · ${leg5} /40`);
  }
  check(
    "첫 클리어 강화석: 1~10관 1개 · 11~20관 2개 … (뒤 관일수록 많음)",
    stageStones(1) === 1 && stageStones(10) === 1 && stageStones(11) === 2 && stageStones(25) === 3 && Array.from({ length: 60 }, (_, i) => i + 1).every((n) => n === 1 || stageStones(n) >= stageStones(n - 1)),
  );
  {
    const sum = (k: number) => Array.from({ length: k }, (_, i) => stageStones(i + 1)).reduce((a, b) => a + b, 0);
    check("앞 10관을 다 깨도 강화석 10개 (덱 3장 모두 최대 레벨엔 30개 필요)", sum(10) === 10, `40관까지 ${sum(40)}개`);
  }
}

console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
