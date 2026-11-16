import { Ticket } from "lucide-react";
import type { AttendanceState } from "@/lib/game/data";
import { ATTEND_CYCLE, attendCoins, EPIC_TICKET_DAY, RARE_TICKET_DAY, TICKET_NAMES } from "@/lib/game/attendance";

/**
 * 출석표 28칸 (홈 카드 · 출석 팝업 공통).
 * 출석한 날은 붉은 '출석' 도장, 7일차 · 28일차는 뽑기권 칸. stampDay 를 주면 그 칸에 도장이 '쾅' 찍히는 연출.
 */
export function AttendanceBoard({ a, stampDay }: { a: AttendanceState; stampDay?: number }) {
  // 도장 찍힌 칸: 오늘까지 (아직 안 들어왔으면 어제까지 · 어제 28일차였으면 새 바퀴라 비움)
  const shown = a.checkedToday || a.day < ATTEND_CYCLE ? a.day : 0;
  return (
    <ol className={`att-board grid grid-cols-7 gap-1.5 ${stampDay ? "att-thud" : ""}`} aria-label="출석 28일">
      {Array.from({ length: ATTEND_CYCLE }, (_, i) => {
        const d = i + 1;
        const stamped = d <= shown;
        const today = a.checkedToday && d === a.day;
        // 7일차 희귀 확정: 이번 바퀴에서 아직 안 받았을 때만 표시 (받고 영웅 대기 중이면 지난 바퀴 것)
        const ticket = d === RARE_TICKET_DAY ? (a.rarePending && !stamped ? null : "rare") : d === EPIC_TICKET_DAY ? "epic" : null;
        const animate = stampDay === d;
        return (
          <li
            key={d}
            className={`att-cell relative flex aspect-square items-center justify-center rounded-xl border text-[11px] font-semibold leading-none ${
              stamped ? "border-[#e8c9c4] bg-[#fff7f5] dark:border-[#5a3a38] dark:bg-[#2a1e1e]" : ticket ? (ticket === "epic" ? "att-cell-epic border-[#b37bff]/50" : "att-cell-rare border-[#6fb6ff]/50") : "border-line bg-surface-2/60 text-faint"
            } ${today ? "ring-2 ring-[#ffd36b] ring-offset-1 ring-offset-surface" : ""}`}
            title={`${d}일차 · ${attendCoins(d)} 코인${ticket ? ` · ${TICKET_NAMES[ticket]} 뽑기권` : ""}`}
          >
            {/* 칸 번호 (도장 밑에 비침) */}
            <span className={`absolute left-1 top-0.5 text-[8px] ${stamped ? "text-[#c9a39d] dark:text-[#8a6a66]" : "hidden"}`}>{d}</span>
            {stamped ? (
              <span className={`att-seal ${animate ? "att-seal-in" : ""}`} aria-hidden>
                출석
              </span>
            ) : ticket ? (
              <Ticket className={`h-4 w-4 ${ticket === "epic" ? "text-[#8f5be8] dark:text-[#d8b4ff]" : "text-[#2f78d8] dark:text-[#8fd0ff]"}`} aria-hidden />
            ) : (
              <span>{d}</span>
            )}
            {stamped && ticket && <Ticket className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 text-[#c9a39d]" aria-hidden />}
            <span className="sr-only">
              {d}일차{stamped ? " 출석" : ""}
              {ticket ? ` ${TICKET_NAMES[ticket]}` : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
