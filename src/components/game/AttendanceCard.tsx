import Link from "next/link";
import { CalendarCheck, Check, Ticket } from "lucide-react";
import type { AttendanceState } from "@/lib/game/data";
import { ATTEND_CYCLE, attendCoins, EPIC_TICKET_DAY, RARE_TICKET_DAY, TICKET_NAMES } from "@/lib/game/attendance";

/** 홈: 출석 (28일 한 바퀴 · 7일차 희귀 확정 · 28일차 영웅 확정) */
export function AttendanceCard({ a }: { a: AttendanceState }) {
  const shown = a.checkedToday ? a.day : 0; // 도장 찍힌 칸 (오늘 아직이면 어제까지)
  const done = a.checkedToday ? a.day : a.day; // 이어지는 출석일차
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
      <ol className="grid grid-cols-7 gap-1" aria-label="출석 28일">
        {Array.from({ length: ATTEND_CYCLE }, (_, i) => {
          const d = i + 1;
          const stamped = d <= shown;
          const today = a.checkedToday && d === a.day;
          const ticket = d === RARE_TICKET_DAY ? (a.rarePending && !(stamped && d === RARE_TICKET_DAY) ? null : "rare") : d === EPIC_TICKET_DAY ? "epic" : null;
          return (
            <li
              key={d}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-[10px] leading-none ${stamped ? "border-navy/30 bg-navy text-on-accent" : ticket ? "border-[#d9a520]/50 bg-[#ffd36b]/15" : "border-line bg-surface-2/50 text-faint"} ${today ? "ring-2 ring-[#ffd36b]" : ""}`}
              title={`${d}일차 · ${attendCoins(d)} 코인${ticket ? ` · ${TICKET_NAMES[ticket]} 뽑기권` : ""}`}
            >
              {stamped ? <Check className="h-3.5 w-3.5" aria-hidden /> : ticket ? <Ticket className="h-3.5 w-3.5 text-[#b07a00] dark:text-[#ffd36b]" aria-hidden /> : <span className="font-semibold">{d}</span>}
              <span className="sr-only">
                {d}일차{stamped ? " 출석" : ""}
              </span>
            </li>
          );
        })}
      </ol>
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
