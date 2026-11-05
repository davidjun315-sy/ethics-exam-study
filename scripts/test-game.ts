/** 철학자 대난투 규칙 점검.  npm run test:game */
import { opponentLevel, runBattle, seededRandom, type Fighter } from "../src/lib/game/battle.ts";
import { canUpgrade, effectiveRates, quizCoins, statsAt, upgradeCost } from "../src/lib/game/rules.ts";
import { artPrompt, suggestFor } from "../src/lib/game/suggestions.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};

// 능력치 · 강화
check("Lv.1 = 기본 능력치", JSON.stringify(statsAt({ atk: 50, hp: 400 }, 1)) === '{"atk":50,"hp":400}');
check("Lv.5 = 기본의 148%", JSON.stringify(statsAt({ atk: 50, hp: 400 }, 5)) === '{"atk":74,"hp":592}');
check("강화 비용: Lv1→2 조각1·50코인, Lv4→5 조각4·250코인", upgradeCost(1).shards === 1 && upgradeCost(1).coins === 50 && upgradeCost(4).shards === 4 && upgradeCost(4).coins === 250);
check("강화 가능 판정", canUpgrade({ level: 1, shards: 1 }, 50, 5).ok && canUpgrade({ level: 1, shards: 0 }, 999, 5).reason === "조각 부족" && canUpgrade({ level: 2, shards: 5 }, 10, 5).reason === "코인 부족" && canUpgrade({ level: 5, shards: 9 }, 999, 5).reason === "최대 레벨");

// 학습 코인
const q = (o: Partial<Parameters<typeof quizCoins>[0]>) => quizCoins({ format: "fill", selfGraded: false, result: "correct", answerLength: 3, xpAwarded: true, reconquered: false, ...o });
check("기입형 정답 20 · 오답 5", q({}).base === 20 && q({ result: "wrong" }).base === 5);
check("서술형 완벽 30 · 부분 15 (답안 30자 이상)", q({ format: "essay", selfGraded: true, answerLength: 40 }).base === 30 && q({ format: "essay", selfGraded: true, result: "partial", answerLength: 40 }).base === 15);
check("서술형 자기평가 악용 방지: 답안 없이 '완벽'이면 5만", q({ format: "essay", selfGraded: true, answerLength: 0 }).base === 5 && q({ format: "essay", selfGraded: true, answerLength: 10 }).reconquer === 0);
check("자기평가 기입형도 답을 써야 정답 코인", q({ selfGraded: true, answerLength: 0 }).base === 5 && q({ selfGraded: true, answerLength: 3 }).base === 20);
check("자동 채점 기입형은 서버 판정이라 제한 없음", q({ selfGraded: false, answerLength: 1 }).base === 20);
check("재정복 +15 (정답일 때만)", q({ reconquered: true }).reconquer === 15 && q({ reconquered: true, result: "wrong" }).reconquer === 0);
check("같은 문제 같은 날 (경험치 없음) → 코인 0", q({ xpAwarded: false }).base === 0 && q({ xpAwarded: false, reconquered: true }).reconquer === 0);

// 확률
const er = effectiveRates({ common: 60, rare: 28, epic: 10, legendary: 2 }, ["common", "legendary"]);
check("공개 카드가 있는 등급만으로 확률 재분배", Math.abs(er.common - 60 / 62) < 1e-9 && Math.abs(er.legendary - 2 / 62) < 1e-9 && er.rare === 0);

// 배틀
const F = (key: string, atk: number, hp: number, effect: Fighter["skillEffect"] = "strike"): Fighter => ({ key, philosopherId: key, name: key, atk, hp, skillName: `${key} 필살기`, skillEffect: effect });
const me = [F("me-0", 50, 400, "stun"), F("me-1", 45, 380, "heal"), F("me-2", 55, 360, "sweep")];
const foe = [F("foe-0", 48, 390, "guard"), F("foe-1", 52, 370, "strike"), F("foe-2", 44, 420, "heal")];
const a = runBattle(me, foe, "seed-1");
const b = runBattle(me, foe, "seed-1");
check("같은 시드 → 같은 결과 (서버 결정, 화면은 재생)", JSON.stringify(a) === JSON.stringify(b));
check("배틀은 한쪽 전멸 또는 제한 횟수로 끝남", a.events[a.events.length - 1].t === "end" && a.actions <= 90);
{
  const lens = Array.from({ length: 100 }, (_, i) => runBattle(me, foe, `len-${i}`).actions).sort((x, y) => x - y);
  check("배틀 길이 적당 (행동 중앙값 20~50회 · 최대 70회)", lens[50] >= 20 && lens[50] <= 50 && lens[99] <= 70, `median ${lens[50]}, max ${lens[99]}`);
}
check("필살기가 실제로 발동 (4종 이상)", new Set(a.events.filter((x) => x.t === "skill").map((x) => (x.t === "skill" ? x.effect : ""))).size >= 4);
{
  const many = Array.from({ length: 30 }, (_, i) => runBattle(me, foe, `fx-${i}`));
  check("기절 → 다음 행동 쉼", many.some((r) => r.events.some((x) => x.t === "stunned")));
  check("수호막 → 피해 절반 표시", many.some((r) => r.events.some((x) => (x.t === "attack" && x.shielded) || (x.t === "skill" && x.hits.some((h) => h.shielded)))));
}
check("쓰러진 카드는 다시 행동하지 않음", (() => {
  const dead = new Set<string>();
  for (const e of a.events) {
    if (e.t === "faint") dead.add(e.target);
    if ((e.t === "attack" || e.t === "skill" || e.t === "stunned") && dead.has(e.actor)) return false;
  }
  return true;
})());
const strong = runBattle(me.map((f) => ({ ...f, atk: f.atk * 3, hp: f.hp * 3 })), foe, "x");
check("훨씬 강한 덱이 이김", strong.winner === "me");
let wins = 0;
for (let i = 0; i < 200; i++) if (runBattle(me, me.map((f) => ({ ...f, key: f.key.replace("me", "foe") })), `mirror-${i}`).winner === "me") wins++;
check("같은 덱끼리는 승률이 한쪽으로 쏠리지 않음 (20~80%)", wins >= 40 && wins <= 160, `${wins}/200`);
check("난수 범위 0~1", (() => { const r = seededRandom("z"); for (let i = 0; i < 1000; i++) { const v = r(); if (v < 0 || v >= 1) return false; } return true; })());
check("상대 레벨: 평균 기준 쉬움 -1 · 어려움 +1 (1~최대)", opponentLevel([2, 3, 3], "easy", 5) === 2 && opponentLevel([5, 5, 5], "hard", 5) === 5 && opponentLevel([1, 1, 1], "easy", 5) === 1);

// 제안
check("이름·별칭으로 제안 찾기", suggestFor("왕양명", ["왕수인"], "동양윤리").skill === "치양지" && suggestFor("칸트", [], "서양윤리").quote === "오늘의 의무는 다했는가?");
check("모르는 사상가는 분류별 기본값 + 재구성 표시", suggestFor("가상인물", [], "사회사상").effect === "guard" && suggestFor("가상인물", [], "사회사상").basis === "reconstruction");
check("생존 인물 프롬프트: 사실적 얼굴 금지", artPrompt({ name: "싱어", originalName: "Peter Singer", era: null, tradition: "서양윤리", look: "x", living: true }).includes("do NOT depict a realistic likeness"));

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
