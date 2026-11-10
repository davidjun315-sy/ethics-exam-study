/**
 * 레벨업 재료 보유량 (화면용, 서버·화면 공용 순수 함수).
 * 018 이후(강화석 통일): 모든 사상가가 같은 강화석을 씀 / 전: 사상가별 강화 조각
 */
type BankState = { settings: { stonesUnified: boolean }; stones: { count: number }; shards: Record<string, number> };

export const bankOf = (s: BankState, philosopherId: string) => (s.settings.stonesUnified ? s.stones.count : (s.shards[philosopherId] ?? 0));

/** 재료 이름: "강화석" 또는 "칸트 조각" */
export const bankName = (s: BankState, name: string) => (s.settings.stonesUnified ? "강화석" : `${name} 조각`);
