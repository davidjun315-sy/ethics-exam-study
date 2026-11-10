/**
 * 팀 시너지 (순수 계산: 서버·화면·테스트 공통). 배틀 전에 팀 구성으로 정해지고 능력치에 곱해진다.
 *  - 같은 분야 3명 「동문수학」 체력 +12% / 2명 「학파」 체력 +6%
 *  - 성향 3가지가 모두 다름 「백가쟁명」 공격 +8%
 *  - 공격형·광역형·제압형 2명 이상 「선봉」 공격 +6%
 *  - 지원형·수호형 2명 이상 「철옹성」 체력 +10%
 */
import type { SkillEffect } from "./rules.ts";

export interface Synergy {
  id: "same3" | "same2" | "diverse" | "vanguard" | "bulwark";
  name: string;
  desc: string;
  atk: number; // 더하는 비율 (0.08 = +8%)
  hp: number;
}

export const SYNERGIES: Record<Synergy["id"], Omit<Synergy, "id">> = {
  same3: { name: "동문수학", desc: "같은 분야 3명 · 체력 +12%", atk: 0, hp: 0.12 },
  same2: { name: "학파", desc: "같은 분야 2명 · 체력 +6%", atk: 0, hp: 0.06 },
  diverse: { name: "백가쟁명", desc: "성향이 모두 다름 · 공격 +8%", atk: 0.08, hp: 0 },
  vanguard: { name: "선봉", desc: "공격형·광역형·제압형 2명 이상 · 공격 +6%", atk: 0.06, hp: 0 },
  bulwark: { name: "철옹성", desc: "지원형·수호형 2명 이상 · 체력 +10%", atk: 0, hp: 0.1 },
};

const DPS: SkillEffect[] = ["strike", "sweep", "stun"];

export function teamSynergies(team: { tradition: string; skillEffect: SkillEffect }[]): Synergy[] {
  if (team.length < 2) return [];
  const out: Synergy["id"][] = [];
  const byTrad = new Map<string, number>();
  for (const m of team) byTrad.set(m.tradition, (byTrad.get(m.tradition) ?? 0) + 1);
  const most = Math.max(...byTrad.values());
  if (most >= 3) out.push("same3");
  else if (most === 2) out.push("same2");
  if (team.length >= 3 && new Set(team.map((m) => m.skillEffect)).size === team.length) out.push("diverse");
  if (team.filter((m) => DPS.includes(m.skillEffect)).length >= 2) out.push("vanguard");
  if (team.filter((m) => !DPS.includes(m.skillEffect)).length >= 2) out.push("bulwark");
  return out.map((id) => ({ id, ...SYNERGIES[id] }));
}

/** 시너지를 능력치에 반영 (더한 비율을 합쳐 한 번에) */
export function withSynergy<T extends { atk: number; hp: number }>(m: T, syn: Synergy[]): T {
  const a = syn.reduce((n, s) => n + s.atk, 0);
  const h = syn.reduce((n, s) => n + s.hp, 0);
  return { ...m, atk: Math.round(m.atk * (1 + a)), hp: Math.round(m.hp * (1 + h)) };
}
