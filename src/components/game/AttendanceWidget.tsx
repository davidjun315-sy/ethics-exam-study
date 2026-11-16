"use client";

import { CalendarCheck } from "lucide-react";
import { ATTEND_OPEN_EVENT } from "./AttendanceCheck";

/** 홈: 작은 출석 위젯 → 누르면 출석표 팝업 */
export function AttendanceWidget({ day, checkedToday, tickets }: { day: number; checkedToday: boolean; tickets: number }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ATTEND_OPEN_EVENT))}
      className="group inline-flex items-center gap-1.5 rounded-full border border-[#e8c9c4] bg-surface/80 py-1 pl-1 pr-3 text-xs font-bold shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-[#d4372c]/60 dark:border-[#5a3a38]"
      aria-label={`출석표 보기 · ${checkedToday ? `${day}일차 출석 완료` : "오늘 출석 전"}`}
      data-attend-widget
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-[#d4372c] text-[#d4372c] transition group-hover:rotate-[-12deg] dark:border-[#ff7a6e] dark:text-[#ff7a6e]">
        <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
      </span>
      {checkedToday ? (
        <span>
          출석 <b className="text-[#d4372c] dark:text-[#ff7a6e]">{day}</b>일차
        </span>
      ) : (
        <span>출석하기</span>
      )}
      {tickets > 0 && <span className="rounded-full bg-[#ffd36b]/30 px-1.5 text-[10px] text-[#8a5a00] dark:text-[#ffd36b]">🎟 {tickets}</span>}
    </button>
  );
}
