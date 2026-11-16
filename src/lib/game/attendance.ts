/**
 * 출석 보상 (순수 계산: 서버 · 화면 · 테스트 공통). 실제 지급 · 출석일차 계산은 DB 함수(026 game_attend)가 한다.
 *  - 28일이 한 바퀴. 어제 출석했으면 +1, 아니면 1일차부터. 28일차 다음 날은 1일차
 *  - 코인: 일주일 단위로 10 → 70 반복
 *  - 7일차 희귀 확정 뽑기권 (받은 뒤 28일차 영웅 확정을 받기 전까지는 다시 주지 않음) · 28일차 영웅 확정 뽑기권
 */
export const ATTEND_CYCLE = 28;
export const RARE_TICKET_DAY = 7;
export const EPIC_TICKET_DAY = 28;
export type TicketKind = "rare" | "epic";
export const TICKET_NAMES: Record<TicketKind, string> = { rare: "희귀 확정", epic: "영웅 확정" };
/** 확정 뽑기권 확률 (%) — DB 함수와 같게 */
export const TICKET_ODDS: Record<TicketKind, { rarity: string; pct: number }[]> = {
  rare: [
    { rarity: "희귀", pct: 80 },
    { rarity: "영웅", pct: 17 },
    { rarity: "전설", pct: 3 },
  ],
  epic: [
    { rarity: "영웅", pct: 85 },
    { rarity: "전설", pct: 15 },
  ],
};

export const attendCoins = (day: number) => (((Math.max(1, day) - 1) % 7) + 1) * 10;
export function attendTicket(day: number, rarePending: boolean): TicketKind | null {
  if (day === RARE_TICKET_DAY && !rarePending) return "rare";
  if (day === EPIC_TICKET_DAY) return "epic";
  return null;
}

const addDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface AttendanceView {
  /** 오늘 출석했나 */
  checkedToday: boolean;
  /** 지금 이어지는 출석일차 (오늘 했으면 오늘 것, 어제까지 했으면 어제 것, 끊겼으면 0) */
  day: number;
  /** 다음 출석(오늘 아직이면 오늘, 했으면 내일)의 출석일차 · 코인 · 뽑기권 */
  next: { day: number; coins: number; ticket: TicketKind | null };
  /** 희귀 확정을 받고 영웅 확정을 기다리는 중 */
  rarePending: boolean;
  bestDay: number;
}

/** 저장된 상태 → 화면에 보일 출석 (today: 한국 날짜 YYYY-MM-DD) */
export function attendanceView(s: { lastDay: string | null; cycleDay: number; bestDay: number; rarePending: boolean }, today: string): AttendanceView {
  const checkedToday = s.lastDay === today;
  const alive = checkedToday || s.lastDay === addDay(today, -1);
  const day = alive ? s.cycleDay : 0;
  const nextDay = day >= ATTEND_CYCLE || day === 0 ? 1 : day + 1;
  return { checkedToday, day, next: { day: nextDay, coins: attendCoins(nextDay), ticket: attendTicket(nextDay, s.rarePending) }, rarePending: s.rarePending, bestDay: s.bestDay };
}
