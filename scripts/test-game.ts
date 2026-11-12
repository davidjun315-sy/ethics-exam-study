/** 철학자 대난투 규칙 점검.  npm run test:game */
import { opponentLevel, runBattle, seededRandom, type Fighter } from "../src/lib/game/battle.ts";
import { canUpgrade, DEFAULT_RARITY_MULT, effectiveRates, fusionProblem, nextRarity, quizCoins, RARITIES, SHARDS_FOR_CARD, statsAt, statsFor, upgradeCost } from "../src/lib/game/rules.ts";
import { teamSynergies, withSynergy } from "../src/lib/game/synergy.ts";
import { achievements, bonusText, canUseTitle, titleSynergy } from "../src/lib/game/achievements.ts";
import { rankWeekly, weekStart } from "../src/lib/game/ranking.ts";
import { buildDialogue, josa, pickResponder } from "../src/lib/game/dialogue.ts";
import { RIVALS, THOUGHTS } from "../src/lib/game/thought.ts";
import { clock, LIFE_MAX, LIFE_REGEN_SEC, lifeNow } from "../src/lib/game/lives.ts";
import { artPrompt, faceFor, portraitSearchUrl, suggestFor } from "../src/lib/game/suggestions.ts";

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

// 확률: 모든 사상가가 네 등급 모두로 나오므로 네 등급 전체 비율
const er = effectiveRates({ common: 60, rare: 28, epic: 10, legendary: 2 });
check("등급 확률 (네 등급 합 100%)", Math.abs(er.common - 0.6) < 1e-9 && Math.abs(er.legendary - 0.02) < 1e-9 && Math.abs(RARITIES.reduce((n, r) => n + er[r], 0) - 1) < 1e-9);

// 등급 · 합성
const base = { atk: 40, hp: 300 };
check("등급 배율: 일반 1.00 · 희귀 1.20 · 영웅 1.45 · 전설 1.75", JSON.stringify(statsFor(base, "common", 1)) === '{"atk":40,"hp":300}' && JSON.stringify(statsFor(base, "legendary", 1)) === '{"atk":70,"hp":525}');
check("같은 사상가·같은 레벨이면 등급이 오를수록 능력치 증가 (모든 레벨)", [1, 2, 3, 4, 5].every((lv) => RARITIES.slice(1).every((r, i) => { const lo = statsFor(base, RARITIES[i], lv); const hi = statsFor(base, r, lv); return hi.atk > lo.atk && hi.hp > lo.hp; })));
check("레벨과 등급은 독립 (희귀 Lv.3 = 기본×1.2×1.24)", JSON.stringify(statsFor(base, "rare", 3)) === JSON.stringify(statsAt({ atk: 48, hp: 360 }, 3)));
check("진화 단계: 일반→희귀→영웅→전설, 전설은 끝", nextRarity("common") === "rare" && nextRarity("rare") === "epic" && nextRarity("epic") === "legendary" && nextRarity("legendary") === null);
check("카드→조각: 1·2·4·8", SHARDS_FOR_CARD.common === 1 && SHARDS_FOR_CARD.legendary === 8);
const fp = (b: Parameters<typeof fusionProblem>[0], m: Parameters<typeof fusionProblem>[1], featured: string | null = null) => fusionProblem(b, m, { fusionCount: 2, featuredId: featured, coins: 0, cost: 0 });
const C = (id: string, rarity: "common" | "rare" | "epic" | "legendary", locked = false, philosopherId = "kohlberg") => ({ cardId: id, rarity, locked, philosopherId });
check("합성 가능: 같은 사상가 · 같은 등급 2장 (일반 콜버그 + 일반 콜버그)", fp(C("a", "common"), [C("b", "common")]) === null);
check("합성 불가: 다른 사상가 (일반 콜버그 + 일반 루소)", fp(C("a", "common"), [C("b", "common", false, "rousseau")]) === "같은 사상가 카드끼리만 합성할 수 있습니다");
check("합성 불가: 다른 등급", fp(C("a", "common"), [C("b", "rare")]) === "같은 등급끼리만 합성할 수 있습니다");
check("합성 불가: 전설", fp(C("a", "legendary"), [C("b", "legendary")]) === "전설은 최고 등급입니다");
check("합성 불가: 같은 카드 두 번 · 잠금 · 대표 카드", fp(C("a", "common"), [C("a", "common")]) !== null && fp(C("a", "common"), [C("b", "common", true)]) !== null && fp(C("a", "common"), [C("b", "common")], "b") !== null);
check("합성 불가: 재료 수", fp(C("a", "common"), []) !== null);


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

{
  // 밸런스: 전설 덱 vs 일반 덱 (같은 사상가·레벨) → 전설이 대부분 이김, 일반 덱끼리는 반반
  const deck = (r: "common" | "legendary", side: string) => (["strike", "heal", "sweep"] as const).map((e, i) => { const st = statsFor(base, r, 1, DEFAULT_RARITY_MULT); return F(`${side}-${i}`, st.atk, st.hp, e); });
  let w = 0;
  for (let i = 0; i < 200; i++) if (runBattle(deck("legendary", "me"), deck("common", "foe"), `bal-${i}`).winner === "me") w++;
  check("밸런스: 전설 덱은 일반 덱을 거의 이김 (등급 의미 있음)", w >= 180, `${w}/200`);
}
// 제안
check("이름·별칭으로 제안 찾기", suggestFor("왕양명", ["왕수인"], "동양윤리").skill === "치양지" && suggestFor("칸트", [], "서양윤리").quote === "오늘의 의무는 다했는가?");
check("모르는 사상가는 분류별 기본값 + 재구성 표시", suggestFor("가상인물", [], "사회사상").effect === "guard" && suggestFor("가상인물", [], "사회사상").basis === "reconstruction");
check("생존 인물 프롬프트: 사실적 얼굴 금지", artPrompt({ name: "싱어", originalName: "Peter Singer", era: null, tradition: "서양윤리", look: "x", living: true }).includes("do NOT depict a realistic likeness"));
check("실제 얼굴 반영: 프롬프트에 대표 초상과 얼굴 특징", (() => { const t = artPrompt({ name: "칸트", originalName: null, era: null, tradition: "서양윤리", look: "x" }); return t.includes("FACIAL LIKENESS") && t.includes("Johann Gottlieb Becker") && t.includes("Immanuel Kant (칸트)") && t.includes("Faithfully match the facial features of the real portraits"); })());
check("별칭으로도 얼굴 참고 찾기", faceFor("왕양명", ["왕수인"])?.en === "Wang Yangming");
check("초상 없는 사상가: 재구성 안내", artPrompt({ name: "가상인물", originalName: null, era: null, tradition: "동양윤리", look: "x" }).includes("If no reliable historical likeness is known"));
check("생존 인물: 얼굴 묘사·첨부 사진 무시", (() => { const t = artPrompt({ name: "싱어", originalName: "Peter Singer", era: null, tradition: "서양윤리", look: "x", living: true }); return t.includes("do NOT depict a realistic likeness") && !t.includes("FACIAL LIKENESS"); })());
check("참고 초상 찾기 링크 (영문 이름)", portraitSearchUrl("칸트", null).includes(encodeURIComponent("Immanuel Kant portrait")) && portraitSearchUrl("가상인물", "Someone").includes("Someone"));
check("ChatGPT용: 그리기 전에 실제 초상을 찾아보게 함 + 찾은 위키백과 이미지 포함", (() => { const t = artPrompt({ name: "칸트", originalName: null, era: null, tradition: "서양윤리", look: "x", research: { imageUrl: "https://upload.wikimedia.org/k.jpg", pageUrl: "https://en.wikipedia.org/wiki/Immanuel_Kant" } }); return t.startsWith("STEP 1 — FIND THE REAL FACE FIRST") && t.includes("Search the web for authentic historical portraits") && t.includes("https://upload.wikimedia.org/k.jpg") && t.includes("STEP 2 — DRAW"); })());
check("ChatGPT용: 초상을 못 찾아도 웹 검색 단계는 포함", (() => { const t = artPrompt({ name: "가상인물", originalName: null, era: null, tradition: "동양윤리", look: "x", research: {} }); return t.includes("STEP 1") && !t.includes("Reference image found"); })());
check("생존 인물은 조사 단계 없음", !artPrompt({ name: "싱어", originalName: "Peter Singer", era: null, tradition: "서양윤리", look: "x", living: true, research: {} }).includes("STEP 1"));


// ---------------------------------------------------------------------
// 팀 시너지 · 업적 · 주간 랭킹
// ---------------------------------------------------------------------
{
  const ids = (t: { tradition: string; skillEffect: "strike" | "sweep" | "heal" | "guard" | "stun" }[]) => teamSynergies(t).map((x) => x.id).sort().join(",");
  check("시너지: 같은 분야 3명 · 성향 모두 다름 · 딜러 2명", ids([{ tradition: "동양윤리", skillEffect: "strike" }, { tradition: "동양윤리", skillEffect: "sweep" }, { tradition: "동양윤리", skillEffect: "heal" }]) === "diverse,same3,vanguard");
  check("시너지: 같은 분야 2명 · 지원·수호 2명", ids([{ tradition: "동양윤리", skillEffect: "heal" }, { tradition: "동양윤리", skillEffect: "guard" }, { tradition: "서양윤리", skillEffect: "heal" }]) === "bulwark,same2");
  check("시너지: 조건 없으면 없음", ids([{ tradition: "동양윤리", skillEffect: "strike" }, { tradition: "한국윤리", skillEffect: "heal" }, { tradition: "서양윤리", skillEffect: "strike" }]) === "vanguard" && ids([{ tradition: "a", skillEffect: "strike" }]) === "");
  const w = withSynergy({ atk: 100, hp: 1000 }, teamSynergies([{ tradition: "a", skillEffect: "strike" }, { tradition: "a", skillEffect: "sweep" }, { tradition: "a", skillEffect: "heal" }]));
  check("시너지 반영: 공격 +14% · 체력 +12%", w.atk === 114 && w.hp === 1120, JSON.stringify(w));

  const base = { owned: [], cards: [{ philosopherId: "a", tradition: "동양윤리" }, { philosopherId: "b", tradition: "동양윤리" }, { philosopherId: "c", tradition: "서양윤리" }], maxLevel: 5, stagesCleared: 0, stagesTotal: 3, specialCleared: 0, wins: 0 };
  const none = achievements(base);
  check("업적: 처음엔 하나도 달성 안 됨", none.every((a) => !a.done) && !canUseTitle(none, "견습 철학도"));
  const some = achievements({ ...base, owned: [{ philosopherId: "a", rarity: "legendary", level: 5 }, { philosopherId: "b", rarity: "common", level: 1 }], stagesCleared: 1, specialCleared: 1, wins: 10 });
  const done = new Set(some.filter((a) => a.done).map((a) => a.title));
  check("업적: 첫 카드 · 전설 · 영웅의 벗 · 만렙 · 도전자 · 보스 사냥꾼 · 논객 · 동양 전원", ["견습 철학도", "전설을 부르는 자", "영웅의 벗", "단련된 자", "도전자", "보스 사냥꾼", "논객", "동양의 현자"].every((t) => done.has(t)), [...done].join(","));
  check("업적: 못 채운 것은 미달성 (서양 · 만물박사 · 백전노장)", !done.has("서양의 철인") && !done.has("만물박사") && !done.has("백전노장") && canUseTitle(some, "논객") && !canUseTitle(some, "백전노장"));
  check("업적: 공개 사상가가 적으면 목표도 줄어듦 (5명 → 3명)", some.find((a) => a.id === "collect5")!.count === "2/3");

  // 칭호 효과: 어려운 칭호일수록 큼
  {
    const all = achievements({ ...base, cards: Array.from({ length: 30 }, (_, i) => ({ philosopherId: `p${i}`, tradition: ["동양윤리", "한국윤리", "서양윤리", "사회사상"][i % 4] })), stagesTotal: 20 });
    const power = (a: (typeof all)[number]) => a.bonus.atk + a.bonus.hp;
    const ordered = [...all].sort((a, b) => a.tier - b.tier);
    check("칭호 효과: 등급(★)이 높을수록 효과 합이 작아지지 않음", ordered.every((a, i) => i === 0 || power(a) >= power(ordered[i - 1]) - 1e-9), ordered.map((a) => `${a.title}★${a.tier}:${Math.round(power(a) * 100)}`).join(" "));
    const by = (id: string) => all.find((a) => a.id === id)!;
    check("칭호 효과: 견습 철학도(+2%) < 전설을 부르는 자 < 천하제일(+12%)", power(by("first")) < power(by("legend")) && power(by("legend")) < power(by("stageAll")) && Math.round(power(by("stageAll")) * 100) === 12);
    check("칭호 효과: 모든 칭호에 효과가 있음", all.every((a) => power(a) > 0));
    check("칭호 효과 문구", bonusText({ atk: 0.04, hp: 0.01 }) === "공격 +4% · 체력 +1%");
    const got = achievements({ ...base, owned: [{ philosopherId: "a", rarity: "legendary", level: 5 }] });
    const fx = titleSynergy(got, "전설을 부르는 자");
    check("달고 있는 칭호 → 팀 효과 (얻은 칭호만)", !!fx && fx.atk === 0.04 && titleSynergy(got, "천하제일") === null && titleSynergy(got, null) === null);
    const w2 = withSynergy({ atk: 100, hp: 1000 }, [fx!]);
    check("칭호 효과 반영: 공격 104 · 체력 1010", w2.atk === 104 && w2.hp === 1010, JSON.stringify(w2));
  }
  // 한국 시간 월요일 0시
  check("주 시작: 한국 시간 일요일 밤 → 그 주 월요일 0시", weekStart(new Date("2026-11-15T14:00:00Z")).toISOString() === "2026-11-08T15:00:00.000Z");
  check("주 시작: 한국 시간 월요일 0시 직후 → 그날", weekStart(new Date("2026-11-15T15:00:01Z")).toISOString() === "2026-11-15T15:00:00.000Z");
  const r = rankWeekly([
    { learner: "x", stage: 3, at: "2026-11-10T01:00:00Z" },
    { learner: "x", stage: 3, at: "2026-11-10T02:00:00Z" },
    { learner: "x", stage: 1, at: "2026-11-10T03:00:00Z" },
    { learner: "y", stage: 4, at: "2026-11-10T00:30:00Z" },
    { learner: "z", stage: 2, at: "2026-11-10T00:10:00Z" },
    { learner: "z", stage: 2, at: "2026-11-10T00:20:00Z" },
  ]);
  check("랭킹: 같은 관은 한 번 · 관 번호 합 · 같은 점수는 먼저 달성한 사람", r.map((x) => `${x.learner}${x.score}`).join(" ") === "y4 x4 z2", r.map((x) => `${x.learner}${x.score}`).join(" "));
}


// ---------------------------------------------------------------------
// 배틀 전 논쟁 대사
// ---------------------------------------------------------------------
{
  const sp = (key: string, name: string, tradition = "동양윤리") => ({ key, name, tradition, skillName: "필살기", quote: "" });
  check("조사: 맹자가 · 정약용이 · 롤스가 · 칸트가", josa("맹자", "이", "가") === "맹자가" && josa("정약용", "이", "가") === "정약용이" && josa("롤스", "이", "가") === "롤스가" && josa("칸트", "이", "가") === "칸트가");
  // 맞수가 팀에 있으면 그 사상가가 나서고 전용 대사
  const d1 = buildDialogue(sp("foe-0", "순자"), [sp("me-0", "공자"), sp("me-1", "맹자"), sp("me-2", "칸트", "서양윤리")]);
  check("맞수(순자 ↔ 맹자): 맹자가 반박", d1[2].who === "ally" && d1[2].name === "맹자" && /우물/.test(d1[2].text) && d1[1].who === "boss" && /예로 바로잡아야/.test(d1[1].text), d1.map((l) => l.text).join(" / "));
  // 일반: 보스가 상대의 핵심어를 비판 → 상대가 보스의 핵심어를 반박 → 겨루자
  const d2 = buildDialogue(sp("foe-0", "지눌"), [sp("me-0", "루소", "서양윤리"), sp("me-1", "공자")]);
  check("일반 논쟁: 다른 분야 사상가가 나서고, 서로의 핵심어를 짚음", d2[1].text.includes("루소여") && d2[1].text.includes("「일반의지」라니") && d2[2].text.includes("지눌이여") && d2[2].text.includes("「돈오점수와 정혜쌍수」") && /겨루어/.test(d2[3].text), d2.map((l) => l.text).join(" / "));
  check("부르는 말: 정약용이여 · 맹자여", buildDialogue(sp("foe-0", "정약용"), [sp("me-0", "맹자")])[2].text.startsWith("정약용이여") && buildDialogue(sp("foe-0", "정약용"), [sp("me-0", "맹자")])[1].text.startsWith("맹자여"));
  // 표에 없는 사상가: 카드 정보로 대신
  const d3 = buildDialogue({ key: "foe-0", name: "새사상가", tradition: "x", skillName: "새로운 빛", quote: "나는 새롭다." }, [sp("me-0", "공자")]);
  check("표에 없는 사상가: 필살기 이름 · 대사로 대신", d3[3].text.startsWith("나는 새롭다.") && d3[4].text.includes("「새로운 빛」"));
  check("팀이 없으면 대사 없음", buildDialogue(sp("foe-0", "공자"), []).length === 0);
  check("맞수 우선 선택", pickResponder(sp("foe-0", "노직"), [sp("me-0", "공자"), sp("me-1", "롤스", "사회사상")]).name === "롤스");
  // 도장깨기 순서표(BORN)의 사상가는 모두 사상 요약이 있음
  const born = ["석가모니", "공자", "묵자", "노자", "맹자", "장자", "순자", "주희", "왕수인", "원효", "지눌", "이황", "이이", "정약용", "소크라테스", "플라톤", "아리스토텔레스", "칸트", "벤담", "밀", "롤스", "노직", "샌델", "싱어", "레건", "길리건", "나딩스", "콜버그", "루소", "홉스", "로크", "마르크스", "니체", "사르트르"];
  check("주요 사상가 사상 요약 · 맞수 대사가 모두 채워짐", born.every((n) => THOUGHTS[n]?.k && THOUGHTS[n].c && THOUGHTS[n].r) && RIVALS.every((r) => THOUGHTS[r.a] && THOUGHTS[r.b] && r.aSays && r.bSays), born.filter((n) => !THOUGHTS[n]).join(","));
}


// ---------------------------------------------------------------------
// 도장깨기 생명력
// ---------------------------------------------------------------------
{
  const t0 = new Date("2026-11-12T10:00:00Z");
  const at = (min: number) => new Date(t0.getTime() + min * 60000);
  check("생명력: 최대 5 · 30분", LIFE_MAX === 5 && LIFE_REGEN_SEC === 1800);
  check("기록이 없으면 가득", lifeNow({ lives: null, livesAt: null }, t0).count === 5 && lifeNow({ lives: null, livesAt: null }, t0).nextAt === null);
  const s3 = { lives: 3, livesAt: t0.toISOString() };
  check("3개 → 29분 뒤에도 3개, 다음 충전 30분 뒤", lifeNow(s3, at(29)).count === 3 && lifeNow(s3, at(29)).nextAt === at(30).toISOString());
  check("30분 뒤 4개, 다음 충전 60분 뒤", lifeNow(s3, at(30)).count === 4 && lifeNow(s3, at(30)).nextAt === at(60).toISOString());
  check("60분 뒤 가득(5), 시계 멈춤 · 오래 지나도 5를 넘지 않음", lifeNow(s3, at(60)).count === 5 && lifeNow(s3, at(60)).nextAt === null && lifeNow(s3, at(600)).count === 5);
  const s0 = { lives: 0, livesAt: t0.toISOString() };
  check("0개 → 가득 차는 시각 150분 뒤", lifeNow(s0, at(1)).fullAt === at(150).toISOString());
  check("시계 표시", clock(65_000) === "1:05" && clock(3_725_000) === "1:02:05" && clock(-5) === "0:00");
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
