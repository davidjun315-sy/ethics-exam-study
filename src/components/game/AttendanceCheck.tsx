"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Ticket } from "lucide-react";
import { TICKET_NAMES, type TicketKind } from "@/lib/game/attendance";

/** 출석 처리가 끝나면 알림 (홈 출석 카드 · 게임 화면이 듣고 새로 읽음) */
export const ATTEND_EVENT = "ethos:attended";

const todayKst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

/**
 * 로그인한 회원이 사이트에 들어오면 하루 한 번 자동 출석 (판정 · 지급은 서버).
 * 같은 날 다시 들어오면 서버가 '이미 출석'으로 돌려주므로 두 번 받지 않는다. 브라우저 기록은 요청을 줄이는 용도뿐.
 */
export function AttendanceCheck() {
  const router = useRouter();
  const [toast, setToast] = useState<{ day: number; coins: number; ticket: TicketKind | null } | null>(null);

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
      .then((r: { ready: boolean; already: boolean; day: number; coins: number; ticket: TicketKind | null } | null) => {
        if (!alive || !r) return;
        try {
          if (r.ready) localStorage.setItem(key, "1");
        } catch {
          /* 무시 */
        }
        if (r.ready && !r.already) {
          setToast({ day: r.day, coins: r.coins, ticket: r.ticket });
          window.dispatchEvent(new CustomEvent(ATTEND_EVENT, { detail: r }));
          router.refresh();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), toast.ticket ? 6500 : 4000);
    return () => clearTimeout(h);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[70] flex justify-center px-4 sm:bottom-6" role="status" aria-live="polite" data-attend-toast>
      <div className="attend-toast pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-[#d9a520]/40 bg-surface/95 px-4 py-3 shadow-2xl backdrop-blur">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toast.ticket ? "bg-[#ffd36b] text-[#3a2600]" : "bg-navy-soft text-navy"}`}>
          {toast.ticket ? <Ticket className="h-5 w-5" aria-hidden /> : <CalendarCheck className="h-5 w-5" aria-hidden />}
        </span>
        <div className="min-w-0 text-sm">
          <div className="font-bold">
            출석 {toast.day}일차 · <span className="text-[#8a5a00] dark:text-[#ffd36b]">+{toast.coins} 코인</span>
          </div>
          {toast.ticket ? (
            <Link href="/quiz/game?tab=draw" className="text-xs font-semibold text-navy hover:underline">
              🎟 {TICKET_NAMES[toast.ticket]} 뽑기권 획득! 뽑으러 가기 →
            </Link>
          ) : (
            <div className="text-xs text-muted">내일도 들어오면 이어집니다</div>
          )}
        </div>
      </div>
    </div>
  );
}
