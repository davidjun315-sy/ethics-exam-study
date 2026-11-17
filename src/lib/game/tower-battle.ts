/**
 * 사상의 탑 2.0 전투 엔진 (순수 계산: 서버 · 화면 · 테스트 공통). 판정과 적용은 모두 서버가 이 파일로 한다.
 *
 * 문제 풀이는 그대로, 정답이 전투를 움직인다. 전략 선택은 문제를 풀 때가 아니라 답을 낸 뒤 · 층을 깬 뒤에만.
 *
 * 한 턴 (문제 하나):
 *   1 답 제출 → 2 서버 채점 → 3 기본 공격 또는 오답 결과 → 4 사유력 획득 → 5 필살기 선택창 (쓸 수 있을 때만)
 *   → 6 필살기 사용 또는 넘기기 → 7 보스 행동 게이지 처리 → 8 피해 · 상태 적용 → 9 다음 문제 또는 층 돌파
 *   - 3~4 는 resolveAnswer, 6~8 은 resolveTurn. 필살기를 쓸 수 없으면 서버가 한 요청 안에서 둘 다 처리한다.
 *   - 오답 공격과 패턴 공격은 한 턴에 같이 들어오지 않는다: 이번 턴에 패턴 공격이 터지면 오답 공격은 그것으로 대신.
 *     (제압형 필살기로 패턴이 미뤄지면 오답 공격만 들어옴)
 *
 * 사유력(Focus): 최대 6 · 정답 +2 · 부분 정답 +1 · 오답 0 · 도전 동안 층을 넘어 이어짐 · 필살기에 씀 (기본 3).
 * 역할(카드의 필살기 종류): 공격형 · 광역형 · 수호형 · 지원형 · 제압형 — 팀에 있으면 늘 켜지는 역할 효과 + 역할 필살기.
 * 사상가 고유 패시브는 역할과 따로 (UNIQUE_PASSIVES, 사상가 이름으로 · 늘려 가면 됨).
 * 보스(10층마다) · 특수 전투: 행동 게이지(몇 턴 뒤 무엇을 하는지 미리 보임) · 패턴 5가지 · 체력 60% / 25% 에서 2 · 3단계.
 * 유물: 이번 도전에서만. 층을 깬 뒤 고르는 후보에 기본 강화와 섞여 나온다. 겹침 한도 · 공격 강화 합 한도(+60%).
 */
import type { SkillEffect } from "./rules.ts";
import { COMBO_MAX, COMBO_STEP, enemyHit, enemyMaxHp, hash, HIT, isBossFloor, QUICK_SEC, teamPowerMult, type RunState, type TowerBuffs, type Verdict } from "./tower.ts";

// ---------------------------------------------------------------------
// 수치 (한곳에서 조정)
// ---------------------------------------------------------------------
export const FOCUS_MAX = 6;
export const FOCUS_GAIN: Record<Verdict, number> = { correct: 2, partial: 1, wrong: 0 };
/** 공격 강화(논증 단련 + 논박의 칼날) 합 한도: 공격만 쌓아 끝까지 가는 것을 막음 */
export const POWER_CAP = 0.6;
/** 팀 보호막 한도 (최대 체력 대비) */
export const SHIELD_CAP = 0.4;
/** 콤보 × 공격 강화 × 역할 효과를 곱한 배율의 한도 */
export const BOOST_CAP = 1.7;
/** 2.0 적 체력 배율 (필살기 몫만큼) */
export const HP_SCALE = 1.65;
/** 2.0 적 공격 배율 (역할 · 필살기 · 유물로 버티는 만큼 적도 세게 · 시뮬레이션으로 맞춤) */
export const ENEMY_SCALE = 1.4;
/** 정상(31층~)은 층마다 2%씩 더 (역할 · 유물이 쌓여도 끝없이 오르지 않게) */
export const enemyScale = (floor: number) => ENEMY_SCALE * (1 + Math.max(0, floor - 30) * 0.02);

export const ROLE_NAMES: Record<SkillEffect, string> = { strike: "공격형", sweep: "광역형", guard: "수호형", heal: "지원형", stun: "제압형" };

/** 역할 효과 (팀에 있는 카드마다 · 늘 켜짐) */
export const ROLE_PASSIVE = {
  /** 공격형: 정답 피해 +5% (한 장마다) · 콤보 한도 +10% (한 장이라도 있으면) */
  strike: { dmg: 0.05, comboCap: 0.1 },
  /** 광역형: 정답마다 추가타 (기본 피해의 10% · 한 장마다 한 번) · 추가타는 보스 방벽에 2배 */
  sweep: { extra: 0.1 },
  /** 수호형: 정답이면 보호막 (최대 체력의 2.5% · 한 장마다, 부분 정답은 절반) */
  guard: { shield: 0.025 },
  /** 지원형: 정답이면 체력 회복 (최대 체력의 2% · 한 장마다, 부분 정답은 절반) */
  heal: { heal: 0.02 },
  /** 제압형: 적 공격 -8% (한 장마다 · 최대 -24%) */
  stun: { atkDown: 0.08, cap: 0.24 },
} as const;

export const ROLE_PASSIVE_DESC: Record<SkillEffect, string> = {
  strike: "정답 피해 +5% · 콤보 한도 +10%",
  sweep: "정답마다 추가타 (피해 10%) · 방벽에 2배",
  guard: "정답이면 보호막 +2.5%",
  heal: "정답이면 체력 +2%",
  stun: "적 공격 -8% (최대 -24%)",
};

/** 역할 필살기 (사유력 비용 · 효과) */
export const ROLE_SKILL: Record<SkillEffect, { cost: number; title: string; desc: string }> = {
  strike: { cost: 3, title: "결정적 논증", desc: "강한 단일 공격 (기본 피해의 150%) · 방벽에 2배" },
  sweep: { cost: 3, title: "연쇄 논박", desc: "3연타 (각 50%) · 방벽에 2배" },
  guard: { cost: 3, title: "철벽 수호", desc: "보호막 +22% · 다음 적 공격 절반" },
  heal: { cost: 3, title: "치유의 성찰", desc: "체력 25% 회복 · 봉인 해제" },
  stun: { cost: 3, title: "논점 봉쇄", desc: "공격(80%) + 보스 행동 2턴 늦춤 · 2턴 동안 적 공격 -30%" },
};
const SKILL_NUM = { strikeMult: 1.5, sweepHits: 3, sweepMult: 0.5, guardShield: 0.22, healPct: 0.25, stunDelay: 2, stunWeaken: 2, weakenMult: 0.7, stunMult: 0.8 };

// ---------------------------------------------------------------------
// 사상가 고유 패시브 (역할과 별개 · 이름으로 찾음 · 없으면 역할 효과만)
// ---------------------------------------------------------------------
export interface UniquePassive {
  title: string;
  desc: string;
  /** 정답 피해 +비율 */
  dmg?: number;
  /** 빠른 정답이면 사유력 +n */
  quickFocus?: number;
  /** 층을 깰 때 체력 +비율 */
  clearHeal?: number;
  /** 층을 시작할 때 보호막 +비율 */
  startShield?: number;
  /** 콤보 한도 +비율 */
  comboCap?: number;
  /** 이 역할 필살기의 효과 +비율 */
  skillBoost?: number;
  /** 오답일 때 사유력 +n */
  wrongFocus?: number;
}
export const UNIQUE_PASSIVES: Record<string, UniquePassive> = {
  칸트: { title: "정언명령", desc: "필살기 효과 +15%", skillBoost: 0.15 },
  아리스토텔레스: { title: "중용", desc: "층을 깰 때 체력 +5%", clearHeal: 0.05 },
  플라톤: { title: "이데아", desc: "콤보 한도 +10%", comboCap: 0.1 },
  롤스: { title: "무지의 베일", desc: "층을 시작할 때 보호막 +8%", startShield: 0.08 },
  밀: { title: "질적 공리", desc: "빠른 정답이면 사유력 +1", quickFocus: 1 },
  맹자: { title: "측은지심", desc: "층을 깰 때 체력 +5%", clearHeal: 0.05 },
  주희: { title: "격물치지", desc: "정답 피해 +5%", dmg: 0.05 },
  이황: { title: "경(敬)", desc: "층을 시작할 때 보호막 +8%", startShield: 0.08 },
  이이: { title: "기발이승", desc: "빠른 정답이면 사유력 +1", quickFocus: 1 },
  왕수인: { title: "지행합일", desc: "틀려도 사유력 +1", wrongFocus: 1 },
  공자: { title: "인(仁)", desc: "층을 깰 때 체력 +5%", clearHeal: 0.05 },
  노자: { title: "무위", desc: "틀려도 사유력 +1", wrongFocus: 1 },
  소크라테스: { title: "산파술", desc: "필살기 효과 +15%", skillBoost: 0.15 },
  벤담: { title: "쾌락 계산", desc: "정답 피해 +5%", dmg: 0.05 },
};
export const uniqueOf = (name: string): UniquePassive | null => UNIQUE_PASSIVES[name.replace(/\s/g, "")] ?? null;

// ---------------------------------------------------------------------
// 유물 (이번 도전에서만)
// ---------------------------------------------------------------------
export const RELICS = {
  hourglass: { name: "현자의 모래시계", icon: "⏳", desc: "빠른 정답 시간 +10초", max: 1 },
  mirror: { name: "반성의 거울", icon: "🪞", desc: "층마다 첫 패턴 공격의 절반을 적에게 되돌림", max: 1 },
  laurel: { name: "월계관", icon: "🌿", desc: "층을 깰 때마다 체력 8% 회복", max: 2 },
  scroll: { name: "고대 두루마리", icon: "📜", desc: "층을 시작할 때 사유력 +1", max: 2 },
  crest: { name: "학파의 문장", icon: "🏛", desc: "콤보 피해 한도 +20%", max: 1 },
  crystal: { name: "통찰의 수정", icon: "🔮", desc: "빠른 정답이면 사유력 +1 더", max: 1 },
  blade: { name: "논박의 칼날", icon: "🗡", desc: "정답 피해 +10% (공격 강화 합 최대 +60%)", max: 3 },
  counter: { name: "반격의 방패", icon: "🔰", desc: "보호막이 막은 피해의 50%를 적에게 되돌림", max: 1 },
  oath: { name: "탐구의 맹세", icon: "🤝", desc: "부분 정답도 콤보가 이어지고 피해 75%", max: 1 },
  memory: { name: "오답의 기억", icon: "🧠", desc: "틀려도 사유력 +1", max: 1 },
  seal: { name: "침묵의 인장", icon: "🔏", desc: "보스 행동 게이지가 1턴 느려짐", max: 1 },
  undying: { name: "불굴의 의지", icon: "🔥", desc: "쓰러질 공격을 한 번 버티고 체력 30%로 (도전에 한 번)", max: 1 },
  lamp: { name: "스승의 등불", icon: "🪔", desc: "얻을 때 힌트권 +2", max: 2 },
  owl: { name: "미네르바의 부엉이", icon: "🦉", desc: "필살기 사유력 비용 -1 (최소 1)", max: 1 },
} as const;
export type RelicId = keyof typeof RELICS;
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
export const isRelicId = (x: string): x is RelicId => x in RELICS;

// ---------------------------------------------------------------------
// 층 사이 선택 (기본 강화 + 유물)
// ---------------------------------------------------------------------
export const BASIC = {
  heal: { name: "숨 고르기", icon: "💚", desc: "체력 35% 회복" },
  power: { name: "논증 단련", icon: "⚔️", desc: "정답 피해 +15% (공격 강화 합 최대 +60%)" },
  shield: { name: "반론 대비", icon: "🛡", desc: "다음 공격 한 번을 완전히 막음" },
  hint: { name: "스승의 귀띔", icon: "💡", desc: "힌트권 +1 (보기 하나 지우기 · 첫 글자 보기)" },
  focus: { name: "사유 집중", icon: "✨", desc: "사유력 +3" },
} as const;
export type BasicId = keyof typeof BASIC;
/** 고르는 것: 기본 강화 id 또는 'relic:유물id' (예전 도전의 heal · power · shield · hint 도 그대로) */
export type ChoiceId = BasicId | `relic:${RelicId}`;
export function choiceInfo(id: string): { id: string; kind: "buff" | "relic"; name: string; icon: string; desc: string; count?: number; max?: number } | null {
  if (id.startsWith("relic:")) {
    const r = id.slice(6);
    if (!isRelicId(r)) return null;
    return { id, kind: "relic", name: RELICS[r].name, icon: RELICS[r].icon, desc: RELICS[r].desc, max: RELICS[r].max };
  }
  if (id in BASIC) {
    const b = BASIC[id as BasicId];
    return { id, kind: "buff", name: b.name, icon: b.icon, desc: b.desc };
  }
  return null;
}

// ---------------------------------------------------------------------
// 보스 패턴 · 행동
// ---------------------------------------------------------------------
/** none: 1~10층 일반 (게이지 없음) · normal: 11층부터 일반 (가벼운 공격만) · 나머지: 보스 · 특수 전투 (적 사상가의 필살기 종류로) */
export type Pattern = "none" | "normal" | "attack" | "guard" | "heal" | "suppress" | "rage";
export const PATTERN_OF: Record<SkillEffect, Pattern> = { strike: "attack", guard: "guard", heal: "heal", stun: "suppress", sweep: "rage" };
export const PATTERN_NAMES: Record<Pattern, string> = { none: "", normal: "일반", attack: "공격형", guard: "수호형", heal: "회복형", suppress: "제압형", rage: "폭주형" };
export const PATTERN_DESC: Record<Pattern, string> = {
  none: "",
  normal: "몇 턴마다 가벼운 공격",
  attack: "주기적으로 강한 공격 · 3단계엔 더 자주",
  guard: "체력이 줄면 방벽을 세움 (광역 · 연타에 약함)",
  heal: "주기적으로 체력을 회복",
  suppress: "사유력을 빼앗거나 필살기를 봉인",
  rage: "체력 25% 아래에서 폭주 (공격 +30% · 더 자주)",
};
/** 관리자가 사상가별로 바꾸고 싶을 때 여기에 (이름 → 패턴). 없으면 필살기 종류로 */
export const PATTERN_OVERRIDE: Record<string, Pattern> = {};

export type Intent = "smash" | "barrier" | "mend" | "drain" | "seal";
export const INTENT_NAMES: Record<Intent, string> = { smash: "강타", barrier: "방벽", mend: "회복", drain: "사유력 흡수", seal: "필살기 봉인" };
const damaging = (i: Intent | null) => i === "smash";

/** 패턴 공격 세기 (그 층 오답 공격 대비) */
function smashMult(p: Pattern, phase: number): number {
  switch (p) {
    case "normal":
      return 0.45;
    case "attack":
      return [0.7, 0.8, 0.95][phase - 1];
    case "rage":
      return [0.6, 0.7, 0.8][phase - 1];
    case "guard":
      return 0.55;
    case "heal":
      return 0.5;
    case "suppress":
      return 0.5;
    default:
      return 0;
  }
}
function intentFor(p: Pattern, phase: number, step: number): Intent | null {
  switch (p) {
    case "none":
      return null;
    case "normal":
    case "attack":
    case "rage":
      return "smash";
    case "guard":
      return phase === 1 ? "smash" : step % 2 === 0 ? "barrier" : "smash";
    case "heal":
      return step % 2 === 0 ? "mend" : "smash";
    case "suppress":
      return (["drain", "smash", "seal"] as Intent[])[step % 3];
  }
}
function intervalFor(p: Pattern, phase: number, enraged: boolean, relics: Relics, floor = 0): number {
  if (p === "none") return 0;
  // 정상(31층~)의 일반 층은 더 자주
  const base = (p === "attack" && phase === 3) || (p === "rage" && enraged) || (p === "normal" && floor > 30) ? 2 : 3;
  return base + (relics.seal ? 1 : 0);
}

export interface BossState {
  kind: FloorKind;
  pattern: Pattern;
  phase: 1 | 2 | 3;
  /** 행동까지 남은 턴 (0 = 게이지 없음) */
  gauge: number;
  interval: number;
  /** 다음 행동 */
  intent: Intent | null;
  /** 행동 순서 */
  step: number;
  /** 방벽 (먼저 깎임) */
  shield: number;
  /** 제압형 필살기: 남은 턴 동안 적 공격 -30% */
  weaken: number;
  /** 필살기 봉인 남은 턴 */
  sealed: number;
  enraged: boolean;
  /** 철벽 수호: 다음 보스 공격 절반 */
  halfNext: boolean;
  /** 반성의 거울: 이 층에서 이미 썼나 */
  mirrorUsed: boolean;
}
export type FloorKind = "normal" | "boss" | "elite";
type Relics = Partial<Record<RelicId, number>>;

export interface EventState {
  kind: EventKind;
  floor: number;
  /** 고를 수 있는 유물 (도서관 · 제단 · 상인) */
  relics: RelicId[];
  /** 상인 값 */
  prices?: { relic: number; heal: number };
}
export type EventKind = "rest" | "library" | "altar" | "merchant" | "elite";

export interface Pending {
  /** 이 턴 번호 (같은 요청 두 번 · 늦게 온 요청 구분) */
  turn: number;
  verdict: Verdict;
  /** 오답 공격을 이번 턴 패턴 공격으로 미뤘나 */
  deferred: boolean;
}

export interface Battle {
  v: 2;
  focus: number;
  /** 팀 보호막 (체력보다 먼저 깎임) */
  shield: number;
  relics: Relics;
  boss: BossState;
  /** 지금까지 끝난 턴 수 */
  turn: number;
  pending: Pending | null;
  event: EventState | null;
  undyingUsed: boolean;
  /** 이번 도전에서 이미 고른 층 사이 선택 (같은 선택 두 번 방지) */
  picked: number[];
}
export type BattleRun = RunState & { b: Battle };

export interface TeamRole {
  name: string;
  effect: SkillEffect;
  skillName?: string;
}

// ---------------------------------------------------------------------
// 화면 연출용 사건 (서버가 계산한 순서 그대로 재생 · 각 사건 뒤 상태가 snap)
// ---------------------------------------------------------------------
export interface Snap {
  hp: number;
  enemyHp: number;
  shield: number;
  bossShield: number;
  focus: number;
}
export type BattleEvent = (
  | { t: "hit"; actor: number; dmg: number; shieldDmg: number; quick: boolean; combo: number; partial: boolean }
  | { t: "extra"; actor: number; dmg: number; shieldDmg: number }
  | { t: "skill"; actor: number; role: SkillEffect; title: string; dmg: number; hits: number; heal: number; shield: number; delay: number }
  | { t: "heal"; amount: number; source: string }
  | { t: "guard"; amount: number; source: string }
  | { t: "focus"; amount: number; source: string }
  | { t: "enemy"; dmg: number; raw: number; blocked: boolean; absorbed: number; pattern: boolean }
  | { t: "barrier"; amount: number }
  | { t: "mend"; amount: number }
  | { t: "drain"; amount: number }
  | { t: "seal"; turns: number }
  | { t: "enrage" }
  | { t: "phase"; phase: 2 | 3; text: string }
  | { t: "reflect"; dmg: number; source: string }
  | { t: "undying" }
  | { t: "relic"; id: RelicId; text: string }
  | { t: "clear" }
  | { t: "down" }
) & { snap: Snap };

// ---------------------------------------------------------------------
// 준비
// ---------------------------------------------------------------------
export const floorKind = (floor: number, elite = false): FloorKind => (isBossFloor(floor) ? "boss" : elite ? "elite" : "normal");

export function bossFor(floor: number, kind: FloorKind, enemy: { name?: string; effect?: SkillEffect | null }, relics: Relics): BossState {
  const special = kind !== "normal";
  const pattern: Pattern = special ? (PATTERN_OVERRIDE[enemy.name ?? ""] ?? PATTERN_OF[enemy.effect ?? "strike"] ?? "attack") : floor > 10 ? "normal" : "none";
  const interval = intervalFor(pattern, 1, false, relics, floor);
  return { kind, pattern, phase: 1, gauge: interval, interval, intent: intentFor(pattern, 1, 0), step: 0, shield: 0, weaken: 0, sealed: 0, enraged: false, halfNext: false, mirrorUsed: false };
}

/**
 * 2.0 적 체력: 필살기 · 역할 효과로 정답 한 번의 피해가 커진 만큼 늘려 층마다 푸는 문제 수를 1.0 과 비슷하게.
 * 정상(31층~)은 층마다 4%씩 더. 특수 전투는 한 대 더.
 */
export function floorHp(floor: number, kind: FloorKind): number {
  const base = enemyMaxHp(floor) + (kind === "elite" ? HIT : 0);
  return Math.round((base * HP_SCALE * (1 + Math.max(0, floor - 30) * 0.04)) / 10) * 10;
}
export const eliteHp = (floor: number) => floorHp(floor, "elite");

export function newBattle(floor: number, kind: FloorKind, enemy: { name?: string; effect?: SkillEffect | null }): Battle {
  return { v: 2, focus: 0, shield: 0, relics: {}, boss: bossFor(floor, kind, enemy, {}), turn: 0, pending: null, event: null, undyingUsed: false, picked: [] };
}

/** 예전(1.0) 도전 상태 → 2.0 (사유력 0 · 유물 없음 · 지금 층 보스 상태 새로). 이미 2.0 이면 그대로 */
export function upgradeRun<T extends RunState & { b?: Battle | null }>(s: T, enemy: { name?: string; effect?: SkillEffect | null }): Omit<T, "b"> & { b: Battle } {
  if (s.b && s.b.v === 2) {
    // 빠진 칸 채우기 (필드가 나중에 늘어난 경우)
    const b = s.b;
    return { ...s, b: { ...newBattle(s.floor, b.boss?.kind ?? floorKind(s.floor), enemy), ...b, picked: b.picked ?? [], relics: b.relics ?? {} } };
  }
  return { ...s, buffs: { ...{ power: 0, shield: 0, hints: 0 }, ...s.buffs }, b: newBattle(s.floor, floorKind(s.floor), enemy) };
}

/** 새 층으로 (체력 · 사유력 · 유물 · 강화 유지, 적 · 보스 상태 새로). 보호막은 절반만 남음 */
export function enterFloor<T extends BattleRun>(s: T, floor: number, kind: FloorKind, enemy: { name?: string; effect?: SkillEffect | null }, team: TeamRole[]): { state: T; events: BattleEvent[] } {
  const max = floorHp(floor, kind);
  const relics = s.b.relics;
  const b: Battle = { ...s.b, boss: bossFor(floor, kind, enemy, relics), shield: Math.round(s.b.shield / 2), pending: null, event: null };
  const st = { ...s, floor, enemyHp: max, enemyMax: max, b } as T;
  const ev: BattleEvent[] = [];
  const scroll = relics.scroll ?? 0;
  if (scroll > 0) {
    st.b.focus = Math.min(FOCUS_MAX, st.b.focus + scroll);
    ev.push({ t: "relic", id: "scroll", text: `사유력 +${scroll}`, snap: snap(st) });
  }
  const startShield = team.reduce((a, c) => a + (uniqueOf(c.name)?.startShield ?? 0), 0);
  if (startShield > 0) {
    st.b.shield = Math.min(Math.round(st.maxHp * SHIELD_CAP), st.b.shield + Math.round(st.maxHp * startShield));
    ev.push({ t: "guard", amount: Math.round(st.maxHp * startShield), source: "고유 패시브", snap: snap(st) });
  }
  return { state: st, events: ev };
}

// ---------------------------------------------------------------------
// 계산 도우미
// ---------------------------------------------------------------------
const count = (team: TeamRole[], e: SkillEffect) => team.filter((c) => c.effect === e).length;
export const snap = (s: BattleRun): Snap => ({ hp: s.hp, enemyHp: s.enemyHp, shield: s.b.shield, bossShield: s.b.boss.shield, focus: s.b.focus });
/** 공격 강화 합 (논증 단련 + 칼날, 한도 +60%) */
export const powerBonus = (buffs: TowerBuffs, relics: Relics) => Math.min(POWER_CAP, buffs.power + 0.1 * (relics.blade ?? 0));
export function comboCap(team: TeamRole[], relics: Relics): number {
  return COMBO_MAX + (count(team, "strike") > 0 ? ROLE_PASSIVE.strike.comboCap : 0) + (relics.crest ? 0.2 : 0) + team.reduce((a, c) => a + (uniqueOf(c.name)?.comboCap ?? 0), 0);
}
/** 빠른 정답 시간 (초) */
export const quickWindow = (b: Battle | null | undefined) => QUICK_SEC + (b?.relics.hourglass ? 10 : 0);

/** 정답 기본 피해 (1.0 과 같은 식 + 역할 · 유물 · 고유 패시브) */
export function baseDamage(s: BattleRun, team: TeamRole[], ctx: { teamAtk: number; quick: boolean; combo: number }): number {
  const comboMult = 1 + Math.min(comboCap(team, s.b.relics), ctx.combo * COMBO_STEP);
  const roleDmg = ROLE_PASSIVE.strike.dmg * count(team, "strike") + team.reduce((a, c) => a + (uniqueOf(c.name)?.dmg ?? 0), 0);
  // 콤보 × 강화 합에도 한도: 한 문제로 층이 끝나지 않게 (층마다 푸는 문제 수 유지)
  const m = teamPowerMult(ctx.teamAtk, s.floor) * Math.min(BOOST_CAP, comboMult * (1 + powerBonus(s.buffs, s.b.relics) + roleDmg)) * (ctx.quick ? 1.2 : 1);
  return Math.round(HIT * m);
}

/** 적에게 피해 (방벽 먼저 · shieldMult 배로 깎음). 반환: 체력 피해 · 방벽 피해 */
function hitBoss(s: BattleRun, dmg: number, shieldMult = 1): { dmg: number; shieldDmg: number } {
  let left = Math.max(0, Math.round(dmg));
  let shieldDmg = 0;
  const bs = s.b.boss;
  if (bs.shield > 0 && left > 0) {
    const need = Math.ceil(bs.shield / shieldMult);
    if (left <= need) {
      shieldDmg = Math.min(bs.shield, Math.round(left * shieldMult));
      bs.shield -= shieldDmg;
      left = 0;
    } else {
      shieldDmg = bs.shield;
      bs.shield = 0;
      left -= need;
    }
  }
  const real = Math.min(s.enemyHp, left);
  s.enemyHp -= real;
  return { dmg: real, shieldDmg };
}

/** 적 체력에 따른 단계 변화 (보스 · 특수 전투만, 되돌아가지 않음) */
function checkPhase(s: BattleRun, ev: BattleEvent[]) {
  const bs = s.b.boss;
  if (bs.kind === "normal" || s.enemyHp <= 0) return;
  const r = s.enemyHp / s.enemyMax;
  const want = r <= 0.25 ? 3 : r <= 0.6 ? 2 : 1;
  while (bs.phase < want) {
    bs.phase = (bs.phase + 1) as 2 | 3;
    const ph = bs.phase as 2 | 3;
    let text = ph === 2 ? "2단계 · 기세가 바뀐다" : "3단계 · 마지막 저항";
    if (bs.pattern === "guard") {
      const amt = Math.round(s.enemyMax * (ph === 2 ? 0.2 : 0.25));
      bs.shield += amt;
      text = ph === 2 ? "2단계 · 방벽을 세운다" : "3단계 · 방벽 강화";
      ev.push({ t: "phase", phase: ph, text, snap: snap(s) });
      ev.push({ t: "barrier", amount: amt, snap: snap(s) });
      bs.intent = intentFor(bs.pattern, bs.phase, bs.step);
      continue;
    }
    if (bs.pattern === "attack" && ph === 3) text = "3단계 · 공격이 빨라진다";
    if (bs.pattern === "heal" && ph >= 2) {
      bs.step = 0; // 다음 행동은 회복
      text = ph === 2 ? "2단계 · 회복을 준비한다" : "3단계 · 생명력이 넘친다";
    }
    if (bs.pattern === "suppress" && ph === 3) {
      const d = Math.min(1, s.b.focus);
      s.b.focus -= d;
      text = "3단계 · 사유를 짓누른다";
    }
    if (bs.pattern === "rage" && ph === 3) {
      bs.enraged = true;
      text = "3단계 · 폭주! 공격 +30%";
    }
    const iv = intervalFor(bs.pattern, bs.phase, bs.enraged, s.b.relics, s.floor);
    bs.interval = iv;
    bs.gauge = Math.min(bs.gauge, iv);
    bs.intent = intentFor(bs.pattern, bs.phase, bs.step);
    ev.push({ t: "phase", phase: ph, text, snap: snap(s) });
    if (bs.enraged && ph === 3) ev.push({ t: "enrage", snap: snap(s) });
  }
}

/** 적 공격 한 번의 세기 (제압 · 약화 · 폭주 · 철벽 반영) */
export function enemyDamage(s: BattleRun, team: TeamRole[], mult: number): number {
  const bs = s.b.boss;
  const down = Math.min(ROLE_PASSIVE.stun.cap, ROLE_PASSIVE.stun.atkDown * count(team, "stun"));
  const m = mult * (1 - down) * (bs.weaken > 0 ? SKILL_NUM.weakenMult : 1) * (bs.enraged ? 1.3 : 1) * (bs.halfNext ? 0.5 : 1);
  return Math.max(1, Math.round(enemyHit(s.floor) * enemyScale(s.floor) * m));
}

/** 내 팀이 맞음: 반론 대비(완전 방어) → 보호막 → 체력. 불굴의 의지 */
function hurt(s: BattleRun, raw: number, pattern: boolean, ev: BattleEvent[]) {
  const bs = s.b.boss;
  bs.halfNext = false;
  if (s.buffs.shield > 0) {
    s.buffs = { ...s.buffs, shield: s.buffs.shield - 1 };
    ev.push({ t: "enemy", dmg: 0, raw, blocked: true, absorbed: 0, pattern, snap: snap(s) });
    return;
  }
  let dmg = raw;
  if (pattern && s.b.relics.mirror && !bs.mirrorUsed) {
    bs.mirrorUsed = true;
    const back = Math.round(raw * 0.5);
    dmg -= back;
    const h = hitBoss(s, back);
    ev.push({ t: "reflect", dmg: h.dmg + h.shieldDmg, source: RELICS.mirror.name, snap: snap(s) });
  }
  const absorbed = Math.min(s.b.shield, dmg);
  s.b.shield -= absorbed;
  dmg -= absorbed;
  s.hp = Math.max(0, s.hp - dmg);
  ev.push({ t: "enemy", dmg, raw, blocked: false, absorbed, pattern, snap: snap(s) });
  if (absorbed > 0 && s.b.relics.counter && s.enemyHp > 0) {
    const h = hitBoss(s, Math.round(absorbed * 0.5));
    ev.push({ t: "reflect", dmg: h.dmg + h.shieldDmg, source: RELICS.counter.name, snap: snap(s) });
  }
  if (s.hp <= 0 && s.b.relics.undying && !s.b.undyingUsed) {
    s.b.undyingUsed = true;
    s.hp = Math.round(s.maxHp * 0.3);
    ev.push({ t: "undying", snap: snap(s) });
  }
}

function gainFocus(s: BattleRun, n: number, source: string, ev: BattleEvent[]) {
  if (n <= 0) return;
  const before = s.b.focus;
  s.b.focus = Math.min(FOCUS_MAX, s.b.focus + n);
  if (s.b.focus > before) ev.push({ t: "focus", amount: s.b.focus - before, source, snap: snap(s) });
}
function heal(s: BattleRun, amt: number, source: string, ev: BattleEvent[]) {
  const before = s.hp;
  s.hp = Math.min(s.maxHp, s.hp + Math.round(amt));
  if (s.hp > before) ev.push({ t: "heal", amount: s.hp - before, source, snap: snap(s) });
}
function addShield(s: BattleRun, amt: number, source: string, ev: BattleEvent[]) {
  const before = s.b.shield;
  s.b.shield = Math.min(Math.round(s.maxHp * SHIELD_CAP), s.b.shield + Math.round(amt));
  if (s.b.shield > before) ev.push({ t: "guard", amount: s.b.shield - before, source, snap: snap(s) });
}

function clone<T extends BattleRun>(s: T): T {
  return { ...s, buffs: { ...s.buffs }, b: { ...s.b, relics: { ...s.b.relics }, boss: { ...s.b.boss }, pending: s.b.pending ? { ...s.b.pending } : null, picked: [...(s.b.picked ?? [])] } };
}

// ---------------------------------------------------------------------
// 필살기
// ---------------------------------------------------------------------
export function skillCost(effect: SkillEffect, relics: Relics): number {
  return Math.max(1, ROLE_SKILL[effect].cost - (relics.owl ? 1 : 0));
}
/** 이 카드의 필살기를 지금 쓸 수 없는 이유 (쓸 수 있으면 null) */
export function skillProblem(s: BattleRun, team: TeamRole[], idx: number): string | null {
  const c = team[idx];
  if (!c) return "없는 카드입니다.";
  if (s.b.boss.sealed > 0) return `필살기가 봉인됐어요 (${s.b.boss.sealed}턴)`;
  const cost = skillCost(c.effect, s.b.relics);
  if (s.b.focus < cost) return `사유력이 부족해요 (${s.b.focus}/${cost})`;
  return null;
}
export const canAnySkill = (s: BattleRun, team: TeamRole[]) => team.some((_, i) => skillProblem(s, team, i) === null);

function castSkill(s: BattleRun, team: TeamRole[], idx: number, ctx: { teamAtk: number }, ev: BattleEvent[]) {
  const c = team[idx];
  const cost = skillCost(c.effect, s.b.relics);
  s.b.focus -= cost;
  const boost = 1 + (uniqueOf(c.name)?.skillBoost ?? 0);
  const unit = baseDamage(s, team, { teamAtk: ctx.teamAtk, quick: false, combo: 0 });
  const title = ROLE_SKILL[c.effect].title;
  const e = { t: "skill" as const, actor: idx, role: c.effect, title: c.skillName || title, dmg: 0, hits: 0, heal: 0, shield: 0, delay: 0 };
  const bs = s.b.boss;
  if (c.effect === "strike") {
    // 방벽 절반 무시: 방벽에 2배로
    const h = hitBoss(s, unit * SKILL_NUM.strikeMult * boost, 2);
    e.dmg = h.dmg + h.shieldDmg;
    e.hits = 1;
  } else if (c.effect === "sweep") {
    for (let i = 0; i < SKILL_NUM.sweepHits; i++) {
      const h = hitBoss(s, unit * SKILL_NUM.sweepMult * boost, 2);
      e.dmg += h.dmg + h.shieldDmg;
    }
    e.hits = SKILL_NUM.sweepHits;
  } else if (c.effect === "guard") {
    const before = s.b.shield;
    s.b.shield = Math.min(Math.round(s.maxHp * SHIELD_CAP), s.b.shield + Math.round(s.maxHp * SKILL_NUM.guardShield * boost));
    e.shield = s.b.shield - before;
    bs.halfNext = true;
  } else if (c.effect === "heal") {
    const before = s.hp;
    s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * SKILL_NUM.healPct * boost));
    e.heal = s.hp - before;
    bs.sealed = 0;
  } else if (c.effect === "stun") {
    if (bs.pattern !== "none") {
      const delay = SKILL_NUM.stunDelay;
      bs.gauge = Math.min(bs.interval + delay, bs.gauge + delay);
      e.delay = delay;
    }
    bs.weaken = Math.max(bs.weaken, SKILL_NUM.stunWeaken + 1); // 이번 턴 포함
    const h = hitBoss(s, unit * SKILL_NUM.stunMult * boost);
    e.dmg = h.dmg + h.shieldDmg;
    e.hits = 1;
  }
  ev.push({ ...e, snap: snap(s) });
  checkPhase(s, ev);
}

// ---------------------------------------------------------------------
// 한 턴
// ---------------------------------------------------------------------
export interface StepOut<T extends BattleRun> {
  state: T;
  events: BattleEvent[];
  cleared: boolean;
  dead: boolean;
}

/** 3~4: 답 결과 (기본 공격 · 역할 효과 · 사유력 / 오답 공격). skillWindow = 이제 필살기를 고를 수 있음 */
export function resolveAnswer<T extends BattleRun>(s0: T, verdict: Verdict, team: TeamRole[], ctx: { teamAtk: number; quick: boolean }): StepOut<T> & { skillWindow: boolean; dealt: number; taken: number; shieldUsed: boolean } {
  const s = clone(s0);
  const ev: BattleEvent[] = [];
  const relics = s.b.relics;
  s.answered += 1;
  let deferred = false;
  const oath = Boolean(relics.oath);
  if (verdict === "wrong") {
    s.combo = 0;
    const bs = s.b.boss;
    // 이번 턴에 패턴 공격이 터지면 오답 공격은 그것으로 대신 (한 턴에 두 번 맞지 않음)
    if (bs.pattern !== "none" && bs.gauge <= 1 && damaging(bs.intent)) deferred = true;
    else hurt(s, enemyDamage(s, team, 1), false, ev);
    const wf = (relics.memory ? 1 : 0) + team.reduce((a, c) => a + (uniqueOf(c.name)?.wrongFocus ?? 0), 0);
    gainFocus(s, Math.min(1, wf), relics.memory ? RELICS.memory.name : "고유 패시브", ev);
  } else {
    const partial = verdict === "partial";
    const full = baseDamage(s, team, { teamAtk: ctx.teamAtk, quick: ctx.quick, combo: s.combo });
    const dmg = partial ? Math.round(full * (oath ? 0.75 : 0.5)) : full;
    const actor = (s.answered - 1) % Math.max(1, team.length);
    const h = hitBoss(s, dmg);
    s.combo = partial && !oath ? 0 : s.combo + 1;
    if (!partial) s.correct += 1;
    ev.push({ t: "hit", actor, dmg: h.dmg, shieldDmg: h.shieldDmg, quick: ctx.quick, combo: s.combo, partial, snap: snap(s) });
    // 광역형 추가타
    team.forEach((c, i) => {
      if (c.effect !== "sweep" || s.enemyHp <= 0) return;
      const x = hitBoss(s, full * ROLE_PASSIVE.sweep.extra * (partial ? 0.5 : 1), 2);
      if (x.dmg + x.shieldDmg > 0) ev.push({ t: "extra", actor: i, dmg: x.dmg, shieldDmg: x.shieldDmg, snap: snap(s) });
    });
    checkPhase(s, ev);
    const f = partial ? 0.5 : 1;
    const g = count(team, "guard");
    if (g) addShield(s, s.maxHp * ROLE_PASSIVE.guard.shield * g * f, "수호형", ev);
    const hl = count(team, "heal");
    if (hl) heal(s, s.maxHp * ROLE_PASSIVE.heal.heal * hl * f, "지원형", ev);
    let focus = FOCUS_GAIN[verdict];
    if (ctx.quick && !partial) focus += (relics.crystal ? 1 : 0) + Math.min(1, team.reduce((a, c) => a + (uniqueOf(c.name)?.quickFocus ?? 0), 0));
    gainFocus(s, focus, "정답", ev);
  }
  const dealt = ev.filter((e) => e.t === "hit" || e.t === "extra").reduce((a, e) => a + ("dmg" in e ? e.dmg + (e as { shieldDmg: number }).shieldDmg : 0), 0);
  const hurtEv = ev.find((e) => e.t === "enemy") as Extract<BattleEvent, { t: "enemy" }> | undefined;
  const base = { dealt, taken: hurtEv?.dmg ?? 0, shieldUsed: Boolean(hurtEv?.blocked) };
  if (s.enemyHp <= 0) {
    const out = finishFloor(s, team, ev);
    return { ...out, skillWindow: false, ...base };
  }
  if (s.hp <= 0) {
    ev.push({ t: "down", snap: snap(s) });
    return { state: s, events: ev, cleared: false, dead: true, skillWindow: false, ...base };
  }
  s.b.pending = { turn: s.b.turn, verdict, deferred };
  return { state: s, events: ev, cleared: false, dead: false, skillWindow: canAnySkill(s, team), ...base };
}

/** 6~8: 필살기(또는 넘기기) → 보스 행동 게이지 → 피해 · 상태 → 턴 끝 */
export function resolveTurn<T extends BattleRun>(s0: T, team: TeamRole[], skill: number | null, ctx: { teamAtk: number }): StepOut<T> {
  const s = clone(s0);
  const ev: BattleEvent[] = [];
  const p = s.b.pending;
  if (!p) throw new Error("NO_PENDING");
  s.b.pending = null;
  if (skill !== null) {
    const why = skillProblem(s, team, skill);
    if (why) throw new Error(why);
    castSkill(s, team, skill, ctx, ev);
    if (s.enemyHp <= 0) return finishFloor(s, team, ev);
  }
  const bs = s.b.boss;
  let patternHit = false;
  if (bs.pattern !== "none" && bs.gauge > 0) {
    bs.gauge -= 1;
    if (bs.gauge <= 0) {
      const intent = bs.intent;
      if (intent === "smash") {
        patternHit = true;
        hurt(s, enemyDamage(s, team, smashMult(bs.pattern, bs.phase)), true, ev);
      } else if (intent === "barrier") {
        const amt = Math.round(s.enemyMax * (bs.phase === 3 ? 0.3 : 0.22));
        bs.shield += amt;
        ev.push({ t: "barrier", amount: amt, snap: snap(s) });
      } else if (intent === "mend") {
        const before = s.enemyHp;
        s.enemyHp = Math.min(s.enemyMax, s.enemyHp + Math.round(s.enemyMax * [0.1, 0.13, 0.16][bs.phase - 1]));
        ev.push({ t: "mend", amount: s.enemyHp - before, snap: snap(s) });
      } else if (intent === "drain") {
        const d = Math.min(s.b.focus, bs.phase === 3 ? 3 : 2);
        s.b.focus -= d;
        ev.push({ t: "drain", amount: d, snap: snap(s) });
      } else if (intent === "seal") {
        bs.sealed = 2;
        ev.push({ t: "seal", turns: 2, snap: snap(s) });
      }
      bs.step += 1;
      bs.interval = intervalFor(bs.pattern, bs.phase, bs.enraged, s.b.relics, s.floor);
      bs.gauge = bs.interval;
      bs.intent = intentFor(bs.pattern, bs.phase, bs.step);
    }
  }
  // 미뤘던 오답 공격: 패턴 공격이 안 터졌으면 (제압형 필살기로 미뤄짐) 오답 공격만
  if (p.deferred && !patternHit) hurt(s, enemyDamage(s, team, 1), false, ev);
  // 턴 끝
  if (bs.weaken > 0) bs.weaken -= 1;
  if (bs.sealed > 0 && !ev.some((e) => e.t === "seal")) bs.sealed -= 1;
  s.b.turn += 1;
  if (s.enemyHp <= 0) return finishFloor(s, team, ev);
  if (s.hp <= 0) {
    ev.push({ t: "down", snap: snap(s) });
    return { state: s, events: ev, cleared: false, dead: true };
  }
  return { state: s, events: ev, cleared: false, dead: false };
}

/** 층 돌파: 월계관 · 고유 패시브 회복 */
function finishFloor<T extends BattleRun>(s: T, team: TeamRole[], ev: BattleEvent[]): StepOut<T> {
  s.b.pending = null;
  s.b.turn += 1;
  s.b.boss.shield = 0;
  ev.push({ t: "clear", snap: snap(s) });
  const laurel = s.b.relics.laurel ?? 0;
  if (laurel) heal(s, s.maxHp * 0.08 * laurel, RELICS.laurel.name, ev);
  const ch = team.reduce((a, c) => a + (uniqueOf(c.name)?.clearHeal ?? 0), 0);
  if (ch) heal(s, s.maxHp * Math.min(0.1, ch), "고유 패시브", ev);
  return { state: s, events: ev, cleared: true, dead: false };
}

// ---------------------------------------------------------------------
// 층 사이 선택
// ---------------------------------------------------------------------
export const relicCount = (b: Battle, id: RelicId) => b.relics[id] ?? 0;
export const relicOpen = (b: Battle, id: RelicId) => relicCount(b, id) < RELICS[id].max;
const order = <X extends string>(list: X[], seed: number, tag: string) => [...list].sort((a, c) => hash(`${seed}:${tag}:${a}`) - hash(`${seed}:${tag}:${c}`));

/**
 * 층을 깬 뒤 후보 3개 (같은 씨앗이면 같은 결과).
 *  - 보스 · 특수 전투: 유물 3개 (남은 유물이 모자라면 기본 강화로 채움)
 *  - 일반: 기본 강화 3개, 10번 중 4번쯤은 그중 하나가 유물
 *  - 체력이 절반 아래면 회복을 꼭 넣음 · 공격 강화 한도에 닿으면 논증 단련 · 칼날은 빠짐
 */
export function choicesAfterClear(s: BattleRun, kind: FloorKind, seed: number): ChoiceId[] {
  const b = s.b;
  const capped = powerBonus(s.buffs, b.relics) >= POWER_CAP - 1e-9;
  const relics = order(RELIC_IDS.filter((r) => relicOpen(b, r) && !(r === "blade" && capped)), seed, "relic");
  const basics = order((Object.keys(BASIC) as BasicId[]).filter((x) => !(x === "power" && capped) && !(x === "focus" && b.focus >= FOCUS_MAX)), seed, "basic");
  let pick: ChoiceId[];
  if (kind !== "normal") {
    pick = [...relics.slice(0, 3).map((r) => `relic:${r}` as ChoiceId), ...basics].slice(0, 3);
  } else {
    const withRelic = relics.length > 0 && hash(`${seed}:relic?`) % 10 < 4;
    pick = withRelic ? [...basics.slice(0, 2), `relic:${relics[0]}` as ChoiceId] : basics.slice(0, 3);
  }
  if (s.hp / s.maxHp < 0.5 && !pick.includes("heal")) pick = ["heal", ...pick.filter((x) => x !== "heal").slice(0, 2)];
  return pick;
}

/** 유물 얻기 (한도면 그대로) */
export function addRelic<T extends BattleRun>(s: T, id: RelicId): T {
  if (!relicOpen(s.b, id)) return s;
  const st = clone(s);
  st.b.relics[id] = relicCount(st.b, id) + 1;
  if (id === "lamp") st.buffs.hints += 2;
  if (id === "seal" && st.b.boss.pattern !== "none") {
    st.b.boss.interval += 1;
    st.b.boss.gauge += 1;
  }
  return st;
}

export function applyChoice<T extends BattleRun>(s: T, id: string): T {
  if (id.startsWith("relic:")) {
    const r = id.slice(6);
    if (!isRelicId(r)) throw new Error("BAD_CHOICE");
    return addRelic(s, r);
  }
  const st = clone(s);
  if (id === "heal") st.hp = Math.min(st.maxHp, st.hp + Math.round(st.maxHp * 0.35));
  else if (id === "power") st.buffs.power = Math.round((st.buffs.power + 0.15) * 100) / 100;
  else if (id === "shield") st.buffs.shield += 1;
  else if (id === "hint") st.buffs.hints += 1;
  else if (id === "focus") st.b.focus = Math.min(FOCUS_MAX, st.b.focus + 3);
  else throw new Error("BAD_CHOICE");
  return st;
}

// ---------------------------------------------------------------------
// 이벤트 층 (빈도 · 비중은 여기서 조정). 문제 수가 너무 줄지 않게 10층에 한 번
// ---------------------------------------------------------------------
export const EVENT_CONFIG = {
  /** 몇 층마다 */
  every: 10,
  /** 그 안에서 몇 번째 층 (5 → 5 · 15 · 25 · 35층) */
  offset: 5,
  minFloor: 5,
  weights: { rest: 3, library: 2, altar: 2, merchant: 2, elite: 2 } as Record<EventKind, number>,
};
export const isEventFloor = (floor: number) => floor >= EVENT_CONFIG.minFloor && !isBossFloor(floor) && floor % EVENT_CONFIG.every === EVENT_CONFIG.offset;

export const EVENT_INFO: Record<EventKind, { title: string; icon: string; desc: string }> = {
  rest: { title: "고요한 쉼터", icon: "🏕", desc: "잠시 숨을 고를 수 있는 곳. 하나를 고르세요." },
  library: { title: "고대 도서관", icon: "📚", desc: "먼지 쌓인 서가에서 유물 하나를 가져갈 수 있어요." },
  altar: { title: "위험한 제단", icon: "🗿", desc: "체력을 바치면 유물을 얻어요. 그냥 지나가도 됩니다." },
  merchant: { title: "떠돌이 상인", icon: "🧳", desc: "코인으로 유물이나 회복을 살 수 있어요 (지갑 코인에서 빠짐)." },
  elite: { title: "특수 전투", icon: "⚔️", desc: "강한 적이 길을 막았어요. 이기면 유물 3개 중 하나! 피해 갈 수도 있어요." },
};

export function eventFor(s: BattleRun, floor: number, seed: number, opts: { merchant: boolean }): EventState {
  const w = { ...EVENT_CONFIG.weights };
  if (!opts.merchant) w.merchant = 0;
  const open = order(RELIC_IDS.filter((r) => relicOpen(s.b, r)), seed, `ev${floor}`);
  if (open.length === 0) {
    w.library = 0;
    w.altar = 0;
    w.merchant = 0;
  }
  const kinds = (Object.keys(w) as EventKind[]).filter((k) => w[k] > 0);
  const total = kinds.reduce((a, k) => a + w[k], 0);
  let r = hash(`${seed}:event:${floor}`) % Math.max(1, total);
  let kind: EventKind = "rest";
  for (const k of kinds) {
    if (r < w[k]) {
      kind = k;
      break;
    }
    r -= w[k];
  }
  const relics = kind === "library" ? open.slice(0, 2) : kind === "altar" || kind === "merchant" ? open.slice(0, 1) : [];
  return { kind, floor, relics, ...(kind === "merchant" ? { prices: { relic: 60 + floor * 2, heal: 25 + floor } } : {}) };
}

export interface EventOption {
  id: string;
  label: string;
  desc: string;
  cost?: number;
  disabled?: string;
}
export function eventOptions(s: BattleRun, e: EventState): EventOption[] {
  const rel = (r: RelicId) => `${RELICS[r].icon} ${RELICS[r].name}`;
  switch (e.kind) {
    case "rest":
      return [
        { id: "heal", label: "휴식", desc: "체력 40% 회복" },
        { id: "meditate", label: "명상", desc: "사유력 가득 + 힌트권 1" },
      ];
    case "library":
      return [...e.relics.map((r) => ({ id: `relic:${r}`, label: rel(r), desc: RELICS[r].desc })), { id: "leave", label: "그냥 지나가기", desc: "" }];
    case "altar": {
      const cost = Math.round(s.maxHp * 0.25);
      return [
        { id: "offer", label: `체력 ${cost} 바치기`, desc: e.relics[0] ? `${rel(e.relics[0])} — ${RELICS[e.relics[0]].desc}` : "", disabled: s.hp <= cost ? "체력이 모자라요" : undefined },
        { id: "leave", label: "지나가기", desc: "" },
      ];
    }
    case "merchant":
      return [
        ...(e.relics[0] ? [{ id: `buy:relic:${e.relics[0]}`, label: `${rel(e.relics[0])}`, desc: RELICS[e.relics[0]].desc, cost: e.prices?.relic }] : []),
        { id: "buy:heal", label: "회복약", desc: "체력 50% 회복", cost: e.prices?.heal, disabled: s.hp >= s.maxHp ? "체력이 가득해요" : undefined },
        { id: "leave", label: "그냥 지나가기", desc: "" },
      ];
    case "elite":
      return [
        { id: "fight", label: "싸운다", desc: "특수 패턴을 쓰는 강한 적 · 이기면 유물 3개 중 하나" },
        { id: "leave", label: "피해 간다", desc: "체력 10% 회복하고 다음 층으로" },
      ];
  }
}

/**
 * 이벤트 고르기. outcome: pass = 이 층 끝 (다음 층으로) · fight = 이 층에서 특수 전투 시작.
 * spend = 상인에게 낼 코인 (서버가 지갑에서 먼저 빼고 적용)
 */
export function applyEvent<T extends BattleRun>(s0: T, option: string): { state: T; outcome: "pass" | "fight"; spend: number; text: string } {
  const e = s0.b.event;
  if (!e) throw new Error("NO_EVENT");
  const opt = eventOptions(s0, e).find((o) => o.id === option);
  if (!opt) throw new Error("BAD_OPTION");
  if (opt.disabled) throw new Error(opt.disabled);
  let s = clone(s0);
  let text = "";
  let spend = 0;
  let outcome: "pass" | "fight" = "pass";
  if (option === "heal") {
    s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * 0.4));
    text = "체력을 회복했어요";
  } else if (option === "meditate") {
    s.b.focus = FOCUS_MAX;
    s.buffs.hints += 1;
    text = "사유력이 가득 찼어요";
  } else if (option.startsWith("relic:")) {
    const r = option.slice(6) as RelicId;
    s = addRelic(s, r);
    text = `${RELICS[r].name} 획득`;
  } else if (option === "offer") {
    const r = e.relics[0];
    s.hp = Math.max(1, s.hp - Math.round(s.maxHp * 0.25));
    if (r) s = addRelic(s, r);
    text = r ? `${RELICS[r].name} 획득` : "제단이 침묵했어요";
  } else if (option.startsWith("buy:")) {
    if (option === "buy:heal") {
      spend = e.prices?.heal ?? 0;
      s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * 0.5));
      text = "회복약을 마셨어요";
    } else {
      const r = option.slice(10) as RelicId;
      spend = e.prices?.relic ?? 0;
      s = addRelic(s, r);
      text = `${RELICS[r].name} 구매`;
    }
  } else if (option === "fight") {
    outcome = "fight";
    text = "특수 전투 시작!";
  } else if (option === "leave") {
    if (e.kind === "elite") s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * 0.1));
    text = "다음 층으로";
  }
  s.b.event = null;
  return { state: s, outcome, spend, text };
}

/** 화면에 보일 보스 상태 한 줄 */
export function intentText(bs: BossState): string | null {
  if (bs.pattern === "none" || !bs.intent) return null;
  return `${bs.gauge}턴 뒤 ${INTENT_NAMES[bs.intent]}`;
}
