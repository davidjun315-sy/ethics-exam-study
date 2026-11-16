"use client";

import { CalendarCheck, Ticket } from "lucide-react";
import { ATTEND_OPEN_EVENT } from "./AttendanceCheck";

/** 홈 인사 배너 오른쪽: 작은 출석 칩 → 누르면 출석표 팝업 (배너 톤에 맞춘 은은한 유리 질감) */
export function AttendanceWidget({ day, checkedToday, tickets }: { day: number; checkedToday: boolean; tickets: number }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ATTEND_OPEN_EVENT))}
      className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-navy/15 bg-white/45 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-navy/80 backdrop-blur-sm transition hover:border-navy/35 hover:bg-white/70 hover:text-navy dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
      aria-label={`출석표 보기 · ${checkedToday ? `${day}일차 출석 완료` : "오늘 출석 전"}`}
      data-attend-widget
    >
      <CalendarCheck className="h-3.5 w-3.5 opacity-70 transition group-hover:opacity-100" aria-hidden />
      {checkedToday ? (
        <span>
          출석 <span className="font-bold text-navy">{day}</span>일차
        </span>
      ) : (
        <span>출석하기</span>
      )}
      {tickets > 0 && (
        <span className="ml-0.5 inline-flex items-center gap-0.5 border-l border-navy/15 pl-1.5 text-[#a07a2c] dark:text-[#e3c27a]">
          <Ticket className="h-3 w-3" aria-hidden />
          {tickets}
        </span>
      )}
    </button>
  );
}
