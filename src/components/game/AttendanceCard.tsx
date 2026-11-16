import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import type { AttendanceState } from "@/lib/game/data";
import { EPIC_TICKET_DAY, TICKET_NAMES } from "@/lib/game/attendance";
import { AttendanceBoard } from "./AttendanceBoard";

/** 홈: 출석 (28일 한 바퀴 · 7일차 희귀 확정 · 28일차 영웅 확정) */
export function AttendanceCard({ a }: { a: AttendanceState }) {
  const done = a.day; // 이어지는 출석일차
  const toEpic = EPIC_TICKET_DAY - (a.checkedToday ? a.day : a.next.day - 1);
  return (
    <section className="card p-4" aria-labelledby="attend-h" data-attendance>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 id="attend-h" className="flex items-center gap-1.5 text-base font-bold">
          <CalendarCheck className="h-4 w-4 text-navy" aria-hidden /> 출석
        </h2>
        <span className="text-[11px] text-faint">28일 한 바퀴 · 하루 빠지면 1일차부터</span>
      </div>
      <p className="mb-2 rounded-xl bg-navy-soft/60 px-3 py-2 text-sm">
        {a.checkedToday ? (
          <>
            오늘 <b className="text-navy">{a.day}일차</b> 출석 완료 · 내일 <b>+{a.next.coins}</b> 코인
            {a.next.ticket && <span className="ml-1 font-semibold text-[#8a5a00] dark:text-[#ffd36b]">+ 🎟 {TICKET_NAMES[a.next.ticket]}</span>}
          </>
        ) : (
          <>
            {done > 0 ? `${done}일째 이어지는 중 · ` : ""}오늘 들어오면 <b className="text-navy">{a.next.day}일차</b> +{a.next.coins} 코인
          </>
        )}
      </p>
      <AttendanceBoard a={a} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>
          코인 10→70 (일주일 단위 반복) · 7일차 🎟 희귀 확정 · 28일차 🎟 영웅 확정
          {a.rarePending && <> · 희귀 확정은 이미 받았어요 (28일차 영웅 확정까지 {Math.max(0, toEpic)}일)</>}
        </span>
        {a.tickets.rare + a.tickets.epic > 0 && (
          <Link href="/quiz/game?tab=draw" className="font-semibold text-navy hover:underline">
            가진 뽑기권 {a.tickets.rare + a.tickets.epic}장 → 뽑으러 가기
          </Link>
        )}
      </div>
    </section>
  );
}
