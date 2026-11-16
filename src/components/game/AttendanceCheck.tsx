"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Coins as CoinIcon, Ticket } from "lucide-react";
import type { AttendanceState } from "@/lib/game/data";
import { TICKET_NAMES, TICKET_ODDS, type TicketKind } from "@/lib/game/attendance";
import { AttendanceBoard } from "./AttendanceBoard";

/** 출석 처리가 끝나면 알림 (홈 출석 카드 · 게임 화면이 듣고 새로 읽음) */
export const ATTEND_EVENT = "ethos:attended";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

type Result = { ready: boolean; already: boolean; day: number; coins: number; ticket: TicketKind | null; state: AttendanceState | null };

/**
 * 로그인한 회원 · 관리자가 사이트에 들어오면 하루 한 번 자동 출석 (판정 · 지급은 서버) → 출석표 팝업.
 * 같은 날 다시 들어오면 서버가 '이미 출석'으로 돌려주므로 팝업도 보상도 다시 나오지 않는다.
 */
export function AttendanceCheck() {
  const router = useRouter();
  const [shown, setShown] = useState<Result | null>(null);

  useEffect(() => {
    const day = todayKst();
    const key = `ees:attend:${day}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* 저장소를 못 써도 서버가 하루 한 번만 줌 */
    }
    let alive = true;
    fetch("/api/game/attend", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: Result | null) => {
        if (!alive || !r) return;
        try {
          if (r.ready) localStorage.setItem(key, "1");
        } catch {
          /* 무시 */
        }
        if (r.ready && !r.already && r.state) {
          setShown(r);
          window.dispatchEvent(new CustomEvent(ATTEND_EVENT, { detail: r }));
          router.refresh();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [router]);

  if (!shown?.state) return null;
  return <AttendancePopup r={shown} a={shown.state} onClose={() => setShown(null)} />;
}

/** 오늘의 출석 팝업: 도장 쾅 → 코인 → (7·28일차) 뽑기권 */
function AttendancePopup({ r, a, onClose }: { r: Result; a: AttendanceState; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="att-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-labelledby="att-pop-h" onClick={onClose} data-attend-popup>
      <div className="att-panel relative w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* 은은한 빛 */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,211,107,.35),transparent)]" aria-hidden />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-[0.18em] text-muted">
              <CalendarCheck className="h-3.5 w-3.5 text-navy" aria-hidden /> 오늘의 출석
            </span>
            <button type="button" onClick={onClose} className="text-xl leading-none text-faint hover:text-ink" aria-label="닫기">
              ×
            </button>
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <h2 id="att-pop-h" className="text-3xl font-black tracking-tight">
              출석 <span className="att-day-num text-navy">{r.day}</span>일차
            </h2>
            <span className="att-coin relative inline-flex items-center gap-1 rounded-full bg-[#ffd36b]/25 px-3 py-1 text-sm font-black text-[#8a5a00] dark:text-[#ffd36b]">
              <CoinIcon className="h-4 w-4" aria-hidden /> +{r.coins}
              <span className="att-coin-fly pointer-events-none absolute -top-1 right-2 text-xs font-black" aria-hidden>
                +{r.coins}
              </span>
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-faint">28일 한 바퀴 · 하루 빠지면 1일차부터 · 7일차 🎟 희귀 확정 · 28일차 🎟 영웅 확정</p>

          <div className="mt-3">
            <AttendanceBoard a={a} stampDay={r.day} />
          </div>

          {r.ticket ? (
            <div className={`att-ticket mt-3 flex items-center gap-3 rounded-2xl p-3 text-white ${r.ticket === "epic" ? "bg-gradient-to-r from-[#6a35d8] to-[#b37bff]" : "bg-gradient-to-r from-[#2a6fd6] to-[#6fb6ff]"}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Ticket className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-black">🎟 {TICKET_NAMES[r.ticket]} 뽑기권 획득!</div>
                <div className="text-[11px] text-white/85">{TICKET_ODDS[r.ticket].map((o) => `${o.rarity} ${o.pct}%`).join(" · ")}</div>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-navy-soft/60 px-3 py-2 text-center text-xs">
              내일 들어오면 <b className="text-navy">{a.next.day}일차</b> +{a.next.coins} 코인
              {a.next.ticket && <b className="ml-1 text-[#8a5a00] dark:text-[#ffd36b]">+ 🎟 {TICKET_NAMES[a.next.ticket]}</b>}
              {a.rarePending && a.day < 28 && !a.next.ticket && <span className="block text-[11px] text-muted">희귀 확정은 받았어요 · 28일차 영웅 확정까지 {28 - a.day}일</span>}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {r.ticket ? (
              <>
                <button type="button" className="btn py-2.5" onClick={onClose}>
                  나중에
                </button>
                <Link ref={okRef as never} href="/quiz/game?tab=draw" className="btn-primary justify-center py-2.5 font-bold" onClick={onClose}>
                  뽑으러 가기
                </Link>
              </>
            ) : (
              <button ref={okRef} type="button" className="btn-primary col-span-2 py-2.5 font-bold" onClick={onClose}>
                확인
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
