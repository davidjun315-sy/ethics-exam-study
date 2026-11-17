/**
 * 사상의 탑 2.0: 서버가 계산한 전투 사건 → 화면 연출 순서 (순수 · 화면 전용).
 * 각 단계는 '맞는 순간(impact)'에 체력 · 보호막 · 사유력이 그 사건 뒤 상태(snap)로 바뀐다.
 */
import type { BattleEvent, Snap } from "@/lib/game/tower-battle";
import type { SkillEffect } from "@/lib/game/rules";
import type { Strike } from "./TowerArena";

export interface Float {
  id: number;
  text: string;
  tone: "gold" | "green" | "blue" | "purple" | "red" | "white";
  side: "team" | "enemy";
}
export interface Step {
  strike: Strike | null;
  float: Float | null;
  /** 다음 단계까지 (ms) */
  dur: number;
  /** 상태가 바뀌는 때 (ms, 단계 시작부터) */
  impact: number;
  snap: Snap;
}

const DUR = { attack: 900, extra: 560, skill: 1500, enemy: 1000, shield: 950, support: 1150, boss: 1250, float: 420 } as const;
const IMPACT = { attack: 230, extra: 200, skill: 720, enemy: 260, shield: 260, support: 420, boss: 300, float: 0 } as const;

let seq = 1;
const nid = () => seq++ + Date.now();

function strike(kind: Strike["kind"], o: Partial<Strike> = {}): Strike {
  return { id: nid(), kind, actor: 0, dealt: 0, taken: 0, quick: false, combo: 0, cleared: false, dead: false, ...o };
}

/** reduced = 동작 줄이기 (모든 연출을 짧게) */
export function toSteps(events: BattleEvent[], o: { reduced?: boolean; teamSize: number }): Step[] {
  const k = o.reduced ? 0.45 : 1;
  const steps: Step[] = [];
  const push = (s: Strike | null, f: Float | null, type: keyof typeof DUR, snap: Snap) => steps.push({ strike: s, float: f, dur: Math.round(DUR[type] * k), impact: Math.round(IMPACT[type] * k), snap });
  const fl = (text: string, tone: Float["tone"], side: Float["side"] = "team"): Float => ({ id: nid(), text, tone, side });
  const last = () => [...steps].reverse().find((s) => s.strike);
  for (const e of events) {
    switch (e.t) {
      case "hit": {
        const big = e.quick || e.combo >= 3;
        push(strike(big ? "skill" : "attack", { actor: e.actor % Math.max(1, o.teamSize), dealt: e.dmg + e.shieldDmg, quick: e.quick, combo: e.combo }), null, big ? "skill" : "attack", e.snap);
        break;
      }
      case "extra":
        push(strike("attack", { actor: e.actor, dealt: e.dmg + e.shieldDmg, small: true }), null, "extra", e.snap);
        break;
      case "skill": {
        const support = e.role === "guard" || e.role === "heal";
        if (support) push(strike("support", { actor: e.actor, role: e.role, title: e.title, heal: e.heal, guard: e.shield, ult: true }), null, "support", e.snap);
        else push(strike("skill", { actor: e.actor, role: e.role, title: e.title, dealt: e.dmg, hits: e.hits, ult: true, delay: e.delay }), null, "skill", e.snap);
        break;
      }
      case "heal":
        push(null, fl(`+${e.amount}`, "green"), "float", e.snap);
        break;
      case "guard":
        push(null, fl(`🛡 +${e.amount}`, "blue"), "float", e.snap);
        break;
      case "focus":
        push(null, fl(`✨ 사유력 +${e.amount}`, "gold"), "float", e.snap);
        break;
      case "enemy":
        if (e.blocked) push(strike("shield", { taken: 0 }), null, "shield", e.snap);
        else push(strike("enemy", { taken: e.dmg, absorbed: e.absorbed, pattern: e.pattern }), null, "enemy", e.snap);
        break;
      case "barrier":
        push(strike("boss", { banner: { text: `방벽 +${e.amount}`, tone: "blue" }, bossFx: "barrier" }), null, "boss", e.snap);
        break;
      case "mend":
        push(strike("boss", { banner: { text: `회복 +${e.amount}`, tone: "green" }, bossFx: "mend" }), null, "boss", e.snap);
        break;
      case "drain":
        push(strike("boss", { banner: { text: `사유력 -${e.amount}`, tone: "purple" }, bossFx: "drain" }), null, "boss", e.snap);
        break;
      case "seal":
        push(strike("boss", { banner: { text: `필살기 봉인 ${e.turns}턴`, tone: "purple" }, bossFx: "seal" }), null, "boss", e.snap);
        break;
      case "enrage":
        push(strike("boss", { banner: { text: "폭주!", tone: "red" }, bossFx: "enrage" }), null, "boss", e.snap);
        break;
      case "phase":
        push(strike("boss", { banner: { text: e.text, tone: e.phase === 3 ? "red" : "gold" }, bossFx: "phase" }), null, "boss", e.snap);
        break;
      case "reflect":
        push(strike("boss", { banner: { text: `${e.source} · ${e.dmg} 되돌림`, tone: "blue" }, bossFx: "reflect", dealt: e.dmg }), null, "boss", e.snap);
        break;
      case "undying":
        push(strike("support", { role: "heal" as SkillEffect, title: "불굴의 의지!", ult: false }), fl("버팀!", "gold"), "support", e.snap);
        break;
      case "relic":
        push(null, fl(e.text, "gold"), "float", e.snap);
        break;
      case "clear": {
        const s = last();
        if (s?.strike) s.strike.cleared = true;
        else push(strike("boss", { banner: { text: "격파!", tone: "gold" }, cleared: true }), null, "boss", e.snap);
        // 격파 연출이 끝까지 보이게
        if (s) s.dur += Math.round(500 * k);
        break;
      }
      case "down": {
        const s = last();
        if (s?.strike) s.strike.dead = true;
        if (s) s.dur += Math.round(500 * k);
        break;
      }
    }
  }
  return steps;
}

export const totalDuration = (steps: Step[]) => steps.reduce((a, s) => a + s.dur, 0);
