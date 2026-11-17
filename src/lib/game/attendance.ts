/**
 * 출석 보상 (순수 계산: 서버 · 화면 · 테스트 공통). 실제 지급 · 출석일차 계산은 DB 함수(029 game_attend)가 한다.
 *  - 28일이 한 바퀴. 어제 출석했으면 +1, 아니면 1일차부터 (하루 빠지면 다시 1일차)
 *  - 코인: 일주일 단위로 10 → 70 반복
 *  - 카드 보상: 7일차 일반 10장권 · 14일차 희귀 선택권 · 21일차 희귀 10장권 · 28일차 영웅 선택권
 *  - 이미 받은 보상은 이번 판에서 다시 주지 않음 (끊겨서 다시 와도 건너뜀). 28일차 보상을 받으면 한 판이 끝나 다시 받을 수 있음
 */
export const ATTEND_CYCLE = 28;

/** 뽑기권 종류. rare · epic 은 예전(026) '확정 뽑기권' — 가진 사람은 계속 쓸 수 있음 */
export type TicketKind = "normal10" | "rare_pick" | "rare10" | "epic_pick" | "rare" | "epic";
export const REWARD_KINDS = ["normal10", "rare_pick", "rare10", "epic_pick"] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

/** 출석일차 → 보상 */
export const REWARD_DAYS: Record<number, RewardKind> = { 7: "normal10", 14: "rare_pick", 21: "rare10", 28: "epic_pick" };

export const TICKET_NAMES: Record<TicketKind, string> = {
  normal10: "일반 10장권",
  rare_pick: "희귀 선택권",
  rare10: "희귀 10장권",
  epic_pick: "영웅 선택권",
  rare: "희귀 확정 뽑기권",
  epic: "영웅 확정 뽑기권",
};
/** 한 줄 설명 */
export const TICKET_DESC: Record<TicketKind, string> = {
  normal10: "일반 카드 10장을 바로 뽑아요",
  rare_pick: "희귀 카드 10장 중 1장을 골라요",
  rare10: "희귀 카드 10장을 바로 뽑아요",
  epic_pick: "영웅 카드 10장 중 1장을 골라요",
  rare: "희귀 80% · 영웅 17% · 전설 3%",
  epic: "영웅 85% · 전설 15%",
};
/** 가진 뽑기권 합 */
export const totalTickets = (t: Partial<Record<TicketKind, number>>) => Object.values(t).reduce((a: number, b) => a + (b ?? 0), 0);
export const isPack = (k: TicketKind): k is "normal10" | "rare10" => k === "normal10" || k === "rare10";
export const isPick = (k: TicketKind): k is "rare_pick" | "epic_pick" => k === "rare_pick" || k === "epic_pick";
/** 예전 확정 뽑기권 확률 (%) — DB 함수(026)와 같게 */
export const TICKET_ODDS: Record<"rare" | "epic", { rarity: string; pct: number }[]> = {
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
/** 이 출석일차에 받을 보상 (이번 판에 이미 받았으면 없음) */
export function attendTicket(day: number, claimed: number[]): RewardKind | null {
  const k = REWARD_DAYS[day];
  return k && !claimed.includes(day) ? k : null;
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
  /** 다음 출석(오늘 아직이면 오늘, 했으면 내일)의 출석일차 · 코인 · 보상 */
  next: { day: number; coins: number; ticket: RewardKind | null };
  /** 이번 판에서 이미 받은 보상의 출석일차 (7 · 14 · 21) */
  claimed: number[];
  bestDay: number;
}

/** 저장된 상태 → 화면에 보일 출석 (today: 한국 날짜 YYYY-MM-DD) */
export function attendanceView(s: { lastDay: string | null; cycleDay: number; bestDay: number; claimed: number[] }, today: string): AttendanceView {
  const checkedToday = s.lastDay === today;
  const alive = checkedToday || s.lastDay === addDay(today, -1);
  const day = alive ? s.cycleDay : 0;
  const nextDay = day >= ATTEND_CYCLE || day === 0 ? 1 : day + 1;
  return { checkedToday, day, next: { day: nextDay, coins: attendCoins(nextDay), ticket: attendTicket(nextDay, s.claimed) }, claimed: s.claimed, bestDay: s.bestDay };
}
