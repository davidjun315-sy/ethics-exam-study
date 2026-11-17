import { Ticket } from "lucide-react";
import type { AttendanceState } from "@/lib/game/data";
import { ATTEND_CYCLE, attendCoins, REWARD_DAYS, TICKET_NAMES } from "@/lib/game/attendance";

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
        // 보상 칸 (7 · 14 · 21 · 28). 이번 판에 이미 받았는데 아직 그 날이 안 온 칸은 '받음' (오면 건너뜀)
        const ticket = REWARD_DAYS[d] ?? null;
        const got = Boolean(ticket) && !stamped && a.claimed.includes(d);
        const animate = stampDay === d;
        return (
          <li
            key={d}
            className={`att-cell relative flex aspect-square items-center justify-center rounded-xl border text-[11px] font-semibold leading-none ${
              stamped ? "border-[#e8c9c4] bg-[#fff7f5] dark:border-[#5a3a38] dark:bg-[#2a1e1e]" : got ? "border-line bg-surface-2/60 text-faint opacity-60" : ticket ? (ticket === "epic_pick" ? "att-cell-epic border-[#b37bff]/50" : ticket === "normal10" ? "border-[#a7b0bd]/60 bg-[#a7b0bd]/10" : "att-cell-rare border-[#6fb6ff]/50") : "border-line bg-surface-2/60 text-faint"
            } ${today ? "ring-2 ring-[#ffd36b] ring-offset-1 ring-offset-surface" : ""}`}
            title={`${d}일차 · ${attendCoins(d)} 코인${ticket ? ` · ${TICKET_NAMES[ticket]}${got ? " (이번 판에 받음)" : ""}` : ""}`}
          >
            {/* 칸 번호 (도장 밑에 비침) */}
            <span className={`absolute left-1 top-0.5 text-[8px] ${stamped ? "text-[#c9a39d] dark:text-[#8a6a66]" : "hidden"}`}>{d}</span>
            {stamped ? (
              <span className={`att-seal ${animate ? "att-seal-in" : ""}`} aria-hidden>
                출석
              </span>
            ) : got ? (
              <span className="text-[9px] font-bold">받음</span>
            ) : ticket ? (
              <span className="flex flex-col items-center gap-0.5">
                <Ticket className={`h-4 w-4 ${ticket === "epic_pick" ? "text-[#8f5be8] dark:text-[#d8b4ff]" : ticket === "normal10" ? "text-[#5d6673] dark:text-[#c3cad6]" : "text-[#2f78d8] dark:text-[#8fd0ff]"}`} aria-hidden />
                <span className="text-[8px] font-bold leading-none">{ticket.endsWith("pick") ? "선택" : "10장"}</span>
              </span>
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
