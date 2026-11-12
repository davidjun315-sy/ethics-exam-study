/**
 * 업적 · 칭호 (순수 계산: 서버·화면·테스트 공통).
 * 업적은 따로 저장하지 않고 지금 상태(보유 카드 · 도장깨기 · 전적)로 계산한다 → 조건을 채우면 바로 달성.
 * 달성한 업적의 이름이 곧 칭호이고, 고른 칭호 하나를 game_profiles.title 에 저장한다 (019).
 */
import type { Rarity } from "./rules.ts";
import type { Synergy } from "./synergy.ts";

export interface AchievementInput {
  owned: { philosopherId: string; rarity: Rarity; level: number }[];
  /** 공개 사상가 (분야별 전원 수집 확인용) */
  cards: { philosopherId: string; tradition: string }[];
  maxLevel: number;
  stagesCleared: number;
  stagesTotal: number;
  /** 깬 특수 보스 수 */
  specialCleared: number;
  wins: number;
  /** 윤리 퀴즈 기록 (없으면 퀴즈 업적은 진행 0) */
  quiz?: { answered: number; bestStreak: number; missions: number; essayCorrect: number; conquered: number };
}

export interface Achievement {
  id: string;
  /** 칭호 (업적 이름) */
  title: string;
  desc: string;
  group: "퀴즈" | "수집" | "성장" | "도장깨기" | "대전" | "분야";
  done: boolean;
  progress: number; // 0~1
  /** 진행 표시 (예: 3/5) */
  count?: string;
  /** 칭호 등급 1~5 (어려울수록 높음) */
  tier: number;
  /** 칭호를 달면 배틀에서 내 팀 능력치 +비율 */
  bonus: { atk: number; hp: number };
}

/**
 * 칭호 효과: 얻기 어려운 칭호일수록 큼 (도장깨기 · 빠른 대전의 내 팀, 하나만 달 수 있음)
 *  ★1 +1~2% · ★2 +2~3% · ★3 +3~5% · ★4 +5~7% · ★5 +8%
 */
const TITLE_EFFECT: Record<string, { tier: number; atk: number; hp: number }> = {
  first: { tier: 1, atk: 0, hp: 0.02 },
  stage1: { tier: 1, atk: 0.02, hp: 0 },
  collect5: { tier: 2, atk: 0.01, hp: 0.02 },
  epic: { tier: 2, atk: 0.02, hp: 0.01 },
  win10: { tier: 2, atk: 0.03, hp: 0 },
  max1: { tier: 2, atk: 0, hp: 0.03 },
  special1: { tier: 3, atk: 0.03, hp: 0.02 },
  legend: { tier: 3, atk: 0.04, hp: 0.01 },
  stage10: { tier: 3, atk: 0.02, hp: 0.03 },
  trad: { tier: 3, atk: 0.02, hp: 0.03 },
  collect15: { tier: 4, atk: 0.03, hp: 0.03 },
  max3: { tier: 4, atk: 0.04, hp: 0.03 },
  win50: { tier: 4, atk: 0.05, hp: 0.02 },
  collectAll: { tier: 5, atk: 0.05, hp: 0.05 },
  stageAll: { tier: 5, atk: 0.06, hp: 0.06 },
  // 윤리 퀴즈
  quiz1: { tier: 1, atk: 0.01, hp: 0.01 },
  quiz100: { tier: 2, atk: 0.02, hp: 0.01 },
  streak7: { tier: 2, atk: 0.01, hp: 0.02 },
  mission10: { tier: 2, atk: 0.01, hp: 0.02 },
  quiz500: { tier: 3, atk: 0.03, hp: 0.02 },
  essay30: { tier: 3, atk: 0.02, hp: 0.03 },
  conquer1: { tier: 3, atk: 0.03, hp: 0.02 },
  quiz1000: { tier: 4, atk: 0.04, hp: 0.03 },
  streak30: { tier: 4, atk: 0.03, hp: 0.04 },
  conquer10: { tier: 5, atk: 0.05, hp: 0.05 },
};
const effectOf = (id: string) => TITLE_EFFECT[id.startsWith("trad:") ? "trad" : id] ?? { tier: 1, atk: 0, hp: 0 };

/** 달고 있는 칭호 → 팀 능력치 효과 (시너지와 같은 모양, 없으면 null) */
export function titleSynergy(list: Achievement[], title: string | null | undefined): Synergy | null {
  const a = title ? list.find((x) => x.done && x.title === title) : undefined;
  if (!a || (!a.bonus.atk && !a.bonus.hp)) return null;
  return { id: "title", name: `칭호 「${a.title}」`, desc: `칭호 · ${bonusText(a.bonus)}`, atk: a.bonus.atk, hp: a.bonus.hp };
}

/** 예: "공격 +4% · 체력 +2%" */
export function bonusText(b: { atk: number; hp: number }): string {
  const parts = [b.atk ? `공격 +${Math.round(b.atk * 100)}%` : "", b.hp ? `체력 +${Math.round(b.hp * 100)}%` : ""].filter(Boolean);
  return parts.join(" · ") || "효과 없음";
}

const TRADITION_TITLES: Record<string, string> = { 동양윤리: "동양의 현자", 한국윤리: "해동의 선비", 서양윤리: "서양의 철인", 사회사상: "시대의 사상가" };

export function achievements(i: AchievementInput): Achievement[] {
  const distinct = new Set(i.owned.map((o) => o.philosopherId)).size;
  const total = new Set(i.cards.map((c) => c.philosopherId)).size;
  const has = (r: Rarity) => i.owned.some((o) => o.rarity === r);
  const maxed = i.owned.filter((o) => o.level >= i.maxLevel).length;
  const out: Achievement[] = [];
  const add = (id: string, title: string, desc: string, group: Achievement["group"], cur: number, goal: number, showCount = true) => {
    const g = Math.max(1, goal);
    const e = effectOf(id);
    out.push({ id, title, desc, group, done: cur >= g, progress: Math.min(1, cur / g), ...(showCount ? { count: `${Math.min(cur, g)}/${g}` } : {}), tier: e.tier, bonus: { atk: e.atk, hp: e.hp } });
  };
  // 윤리 퀴즈 (공부한 만큼)
  const q = i.quiz ?? { answered: 0, bestStreak: 0, missions: 0, essayCorrect: 0, conquered: 0 };
  add("quiz1", "첫걸음", "윤리 퀴즈 첫 문제를 푼다", "퀴즈", q.answered, 1, false);
  add("quiz100", "성실한 학도", "윤리 퀴즈 100문제를 푼다", "퀴즈", q.answered, 100);
  add("quiz500", "문제은행 탐험가", "윤리 퀴즈 500문제를 푼다", "퀴즈", q.answered, 500);
  add("quiz1000", "천 문제의 현자", "윤리 퀴즈 1000문제를 푼다", "퀴즈", q.answered, 1000);
  add("streak7", "개근상", "7일 연속으로 오늘의 미션을 완주한다", "퀴즈", q.bestStreak, 7);
  add("streak30", "불굴의 학구열", "30일 연속으로 오늘의 미션을 완주한다", "퀴즈", q.bestStreak, 30);
  add("mission10", "미션 완주자", "오늘의 미션을 10번 완주한다", "퀴즈", q.missions, 10);
  add("essay30", "서술형 장인", "서술형 30문제를 맞힌다", "퀴즈", q.essayCorrect, 30);
  add("conquer1", "사상가 정복자", "정복 지도에서 사상가 1명을 모두 채운다", "퀴즈", q.conquered, 1, false);
  add("conquer10", "정복왕", "정복 지도에서 사상가 10명을 모두 채운다", "퀴즈", q.conquered, 10);
  // 수집 (공개 사상가 수보다 많이 요구하지 않음)
  add("first", "견습 철학도", "첫 카드를 얻는다", "수집", i.owned.length, 1, false);
  add("collect5", "사상 수집가", "서로 다른 사상가 5명을 모은다", "수집", distinct, Math.min(5, total));
  // 공개 사상가가 적으면 '모두 모으기'와 같아지므로 생략
  if (total > 15) add("collect15", "걸어 다니는 백과사전", "서로 다른 사상가 15명을 모은다", "수집", distinct, 15);
  add("collectAll", "만물박사", "공개된 사상가를 모두 모은다", "수집", distinct, total);
  add("epic", "영웅의 벗", "영웅 등급 카드를 얻는다", "수집", Number(has("epic") || has("legendary")), 1, false);
  add("legend", "전설을 부르는 자", "전설 등급 카드를 얻는다", "수집", Number(has("legendary")), 1, false);
  // 성장
  add("max1", "단련된 자", `카드 한 장을 최대 레벨(Lv.${i.maxLevel})까지 올린다`, "성장", maxed, 1, false);
  add("max3", "장인", "최대 레벨 카드 3장을 만든다", "성장", maxed, 3);
  // 도장깨기
  add("stage1", "도전자", "도장깨기 첫 관을 깬다", "도장깨기", i.stagesCleared, 1, false);
  if (i.stagesTotal > 10) add("stage10", "도장 사냥꾼", "도장깨기 10관을 깬다", "도장깨기", i.stagesCleared, 10);
  add("special1", "보스 사냥꾼", "특수 패턴 보스를 처음 쓰러뜨린다", "도장깨기", i.specialCleared, 1, false);
  add("stageAll", "천하제일", "도장깨기 모든 관을 깬다", "도장깨기", i.stagesCleared, i.stagesTotal);
  // 대전
  add("win10", "논객", "빠른 대전 10승", "대전", i.wins, 10);
  add("win50", "백전노장", "빠른 대전 50승", "대전", i.wins, 50);
  // 분야: 그 분야 공개 사상가를 모두 모음
  const owned = new Set(i.owned.map((o) => o.philosopherId));
  for (const [trad, title] of Object.entries(TRADITION_TITLES)) {
    const ids = [...new Set(i.cards.filter((c) => c.tradition === trad).map((c) => c.philosopherId))];
    if (!ids.length) continue;
    add(`trad:${trad}`, title, `${trad} 사상가를 모두 모은다`, "분야", ids.filter((id) => owned.has(id)).length, ids.length);
  }
  return out;
}

/** 이 칭호를 쓸 수 있는가 (달성한 업적의 칭호만) */
export const canUseTitle = (list: Achievement[], title: string) => list.some((a) => a.done && a.title === title);
