/**
 * 전장 배경 고르기 (순수 · 화면 공통).
 * 배경은 동양윤리 · 한국윤리 · 서양윤리 · 사회사상 네 갈래만 올릴 수 있는데, 사상가 분야는 도덕교육론 · 미분류일 수도 있고
 * 어떤 갈래는 아직 배경을 안 올렸을 수도 있다 → 가까운 갈래 → 아무 배경 순으로 고른다.
 */
const NEAR: Record<string, string[]> = {
  동양윤리: ["동양윤리", "한국윤리"],
  한국윤리: ["한국윤리", "동양윤리"],
  서양윤리: ["서양윤리", "사회사상"],
  사회사상: ["사회사상", "서양윤리"],
  도덕교육론: ["서양윤리", "사회사상"],
};
const ALL = ["서양윤리", "동양윤리", "한국윤리", "사회사상"];

export function battleBgFor(tradition: string | null | undefined, bgs: Record<string, string> | null | undefined): string | undefined {
  if (!bgs) return undefined;
  for (const k of [...(NEAR[tradition ?? ""] ?? []), ...ALL]) if (bgs[k]) return bgs[k];
  return undefined;
}
