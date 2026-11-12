/**
 * 도장깨기 생명력 (순수 계산 · 화면과 테스트 공통. 실제 차감은 DB 함수 game_use_life 가 같은 규칙으로)
 *  - 최대 LIFE_MAX 개, LIFE_REGEN_SEC 마다 1개씩 다시 참
 *  - 도전할 때마다 1개 사용 (이기든 지든)
 *  - 저장값: lives(마지막으로 계산한 개수) · livesAt(그 기준 시각). 가득 차 있으면 시계는 멈춤
 */
export const LIFE_MAX = 5;
export const LIFE_REGEN_SEC = 30 * 60;

export interface LifeState {
  count: number;
  max: number;
  /** 다음 1개가 차는 시각 (가득이면 null) */
  nextAt: string | null;
  /** 가득 차는 시각 (가득이면 null) */
  fullAt: string | null;
}

/** 저장값 + 지금 시각 → 지금 생명력 */
export function lifeNow(stored: { lives: number | null | undefined; livesAt: string | null | undefined }, now: Date = new Date(), max = LIFE_MAX, regenSec = LIFE_REGEN_SEC): LifeState {
  const base = stored.lives ?? max;
  const at = stored.livesAt ? new Date(stored.livesAt).getTime() : now.getTime();
  if (base >= max) return { count: max, max, nextAt: null, fullAt: null };
  const step = regenSec * 1000;
  const gained = Math.max(0, Math.floor((now.getTime() - at) / step));
  const count = Math.min(max, base + gained);
  if (count >= max) return { count: max, max, nextAt: null, fullAt: null };
  const next = at + (gained + 1) * step;
  return { count, max, nextAt: new Date(next).toISOString(), fullAt: new Date(next + (max - count - 1) * step).toISOString() };
}

/** 남은 시간 → "12:05" 또는 "1:02:05" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
