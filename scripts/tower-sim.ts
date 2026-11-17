/**
 * 사상의 탑 2.0 밸런스 시뮬레이션 (순수 계산 · npm run sim:tower).
 * 팀 구성 × 구간별 정답률마다 여러 번 올라 평균 도달 층을 본다. 테스트(test-game)도 이 함수를 쓴다.
 */
import * as T from "../src/lib/game/tower.ts";
import * as B from "../src/lib/game/tower-battle.ts";
import type { SkillEffect } from "../src/lib/game/rules.ts";

export function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

const EFFECTS: SkillEffect[] = ["strike", "sweep", "guard", "heal", "stun"];

/** 간단한 플레이어: 위험하면 회복 · 패턴 공격이 오면 수호/제압 · 아니면 공격 필살기 */
export function pickSkill(s: B.BattleRun, team: B.TeamRole[]): number | null {
  const ok = team.map((_, i) => B.skillProblem(s, team, i) === null);
  const idx = (e: SkillEffect) => team.findIndex((c, i) => c.effect === e && ok[i]);
  const bs = s.b.boss;
  const smashSoon = bs.intent === "smash" && bs.gauge <= 1;
  if (s.hp / s.maxHp < 0.45 && idx("heal") >= 0) return idx("heal");
  if (smashSoon && idx("guard") >= 0) return idx("guard");
  if (smashSoon && idx("stun") >= 0) return idx("stun");
  if (s.b.focus >= B.FOCUS_MAX - 1) {
    for (const e of ["strike", "sweep", "heal", "guard", "stun"] as SkillEffect[]) if (idx(e) >= 0) return idx(e);
  }
  if (idx("strike") >= 0 && s.b.focus >= 3) return idx("strike");
  if (idx("sweep") >= 0 && (bs.shield > 0 || s.b.focus >= 4)) return idx("sweep");
  return null;
}

/** 한 번 오르기 → 깬 층 수 */
export function climb(team: B.TeamRole[], acc: (tier: number) => number, seed: number, o: { teamAtk?: number; teamHp?: number; useSkills?: boolean; maxFloor?: number } = {}): { floors: number; turns: number; skills: number } {
  const r = rng(seed);
  const teamAtk = o.teamAtk ?? 140;
  const effects = (f: number) => EFFECTS[(f * 7) % 5];
  let s: B.BattleRun = B.enterFloor({ ...T.startState(o.teamHp ?? 1000, 1), b: B.newBattle(1, "normal", { effect: effects(1) }) }, 1, "normal", { effect: effects(1) }, team).state;
  let turns = 0;
  let skills = 0;
  const maxFloor = o.maxFloor ?? 80;
  for (let guard = 0; guard < 2000 && s.floor <= maxFloor; guard++) {
    if (s.b.event) {
      const opts = B.eventOptions(s, s.b.event).filter((x) => !x.disabled && !x.cost);
      const pref = opts.find((x) => x.id === "heal" && s.hp / s.maxHp < 0.6) ?? opts.find((x) => x.id.startsWith("relic:")) ?? opts.find((x) => x.id === "offer" && s.hp / s.maxHp > 0.7) ?? opts.find((x) => x.id === "fight" && s.hp / s.maxHp > 0.7) ?? opts.find((x) => x.id === "meditate") ?? opts.find((x) => x.id === "leave")!;
      const e = B.applyEvent(s, pref.id);
      s = e.state;
      if (e.outcome === "fight") {
        s = B.enterFloor(s, s.floor, "elite", { effect: effects(s.floor) }, team).state;
        continue;
      }
      s = next(s);
      continue;
    }
    const tier = T.tierOf(s.floor);
    const x = r();
    const p = acc(tier);
    const v: T.Verdict = x < p ? "correct" : x < p + (1 - p) * 0.2 ? "partial" : "wrong";
    const a = B.resolveAnswer(s, v, team, { teamAtk, quick: v === "correct" && r() < 0.5 });
    turns++;
    s = a.state;
    if (a.dead) break;
    let cleared = a.cleared;
    if (!cleared) {
      const sk = o.useSkills === false ? null : a.skillWindow ? pickSkill(s, team) : null;
      if (sk !== null) skills++;
      const t = B.resolveTurn(s, team, sk, { teamAtk });
      s = t.state;
      if (t.dead) break;
      cleared = t.cleared;
    }
    if (cleared) {
      const kind = s.b.boss.kind;
      const ch = B.choicesAfterClear(s, kind, seed + s.floor);
      // 고르기: 체력이 낮으면 회복, 아니면 유물 > 공격 > 나머지
      const c = (s.hp / s.maxHp < 0.5 && ch.includes("heal") ? "heal" : ch.find((z) => z.startsWith("relic:")) ?? ch.find((z) => z === "power") ?? ch[0])!;
      s = B.applyChoice(s, c);
      s = next(s);
    }
  }
  return { floors: s.floor - 1, turns, skills };

  function next(st: B.BattleRun): B.BattleRun {
    const f = st.floor + 1;
    if (B.isEventFloor(f)) {
      const moved = { ...st, floor: f };
      return { ...moved, b: { ...moved.b, event: B.eventFor(moved, f, seed, { merchant: false }) } };
    }
    return B.enterFloor(st, f, B.floorKind(f), { effect: effects(f) }, team).state;
  }
}

export const COMPS: Record<string, SkillEffect[]> = {
  공격3: ["strike", "strike", "strike"],
  광역3: ["sweep", "sweep", "sweep"],
  수호3: ["guard", "guard", "guard"],
  지원3: ["heal", "heal", "heal"],
  제압3: ["stun", "stun", "stun"],
  공수지: ["strike", "guard", "heal"],
  공광제: ["strike", "sweep", "stun"],
  수지제: ["guard", "heal", "stun"],
};
export const ACC: Record<string, (t: number) => number> = {
  약: (t) => [0, 0.6, 0.5, 0.4, 0.3][t],
  보통: (t) => [0, 0.8, 0.7, 0.6, 0.5][t],
  강: (t) => [0, 0.95, 0.9, 0.85, 0.8][t],
};
const teamOf = (c: SkillEffect[]): B.TeamRole[] => c.map((effect, i) => ({ name: `X${i}`, effect }));

export function simulate(runs = 300) {
  const out: Record<string, Record<string, number>> = {};
  for (const [cn, c] of Object.entries(COMPS)) {
    out[cn] = {};
    for (const [an, a] of Object.entries(ACC)) {
      let sum = 0;
      let q = 0;
      for (let i = 0; i < runs; i++) {
        const x = climb(teamOf(c), a, 1000 + i * 7919);
        sum += x.floors;
        q += x.turns / Math.max(1, x.floors);
      }
      out[cn][an] = Math.round((sum / runs) * 10) / 10;
      out[cn][`${an} 문제/층`] = Math.round((q / runs) * 10) / 10;
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = simulate(Number(process.argv[2] ?? 300));
  console.table(res);
  let noSkill = 0;
  for (let i = 0; i < 300; i++) noSkill += climb(teamOf(COMPS.공수지), ACC.보통, 1000 + i * 7919, { useSkills: false }).floors;
  console.log("공수지 보통 필살기 안 씀:", (noSkill / 300).toFixed(1));
}
