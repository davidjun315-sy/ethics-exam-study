/**
 * 업적 · 칭호 (순수 계산: 서버·화면·테스트 공통).
 * 업적은 따로 저장하지 않고 지금 상태(보유 카드 · 도장깨기 · 전적)로 계산한다 → 조건을 채우면 바로 달성.
 * 달성한 업적의 이름이 곧 칭호이고, 고른 칭호 하나를 game_profiles.title 에 저장한다 (019).
 */
import type { Rarity } from "./rules.ts";

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
}

export interface Achievement {
  id: string;
  /** 칭호 (업적 이름) */
  title: string;
  desc: string;
  group: "수집" | "성장" | "도장깨기" | "대전" | "분야";
  done: boolean;
  progress: number; // 0~1
  /** 진행 표시 (예: 3/5) */
  count?: string;
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
    out.push({ id, title, desc, group, done: cur >= g, progress: Math.min(1, cur / g), ...(showCount ? { count: `${Math.min(cur, g)}/${g}` } : {}) });
  };
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
