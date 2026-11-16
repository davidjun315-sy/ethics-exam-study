"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck, Check, ChevronRight, Trophy } from "lucide-react";
import type { QuizWeekly } from "@/lib/quiz/weekly";
import type { DailyRanking } from "@/lib/quiz/fun";
import { TitleBadge } from "@/components/game/HonorTab";

type Tab = "weekly" | "daily";
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

/**
 * 홈: 윤리 퀴즈 랭킹 한 묶음 (이번 주 경험치 · 오늘의 미션).
 * 카드에는 내 순위 두 개만 은은하게, 누르면 한 팝업에서 탭으로 전체 순위 (두 순위표 같은 모양).
 */
export function RankingHub({ weekly, daily }: { weekly: QuizWeekly | null; daily: DailyRanking | null }) {
  const [open, setOpen] = useState<Tab | null>(null);
  const leaderW = weekly?.rows[0];
  const leaderD = daily?.rows[0];
  return (
    <section className="card relative overflow-hidden p-4 sm:p-5" aria-labelledby="rank-hub-h" data-ranking-hub>
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "var(--hero)" }} aria-hidden />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="rank-hub-h" className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[#c99a2e]" aria-hidden />
            <span className="text-base font-bold">랭킹</span>
            <span className="eyebrow !text-navy/70">윤리 퀴즈</span>
          </h2>
          <button type="button" onClick={() => setOpen(weekly ? "weekly" : "daily")} className="inline-flex items-center gap-0.5 text-xs font-semibold text-navy/80 hover:text-navy">
            전체 순위 <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SummaryTile
            label="이번 주"
            icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => setOpen("weekly")}
            disabled={!weekly}
            rank={weekly?.mine?.rank}
            empty="한 문제부터"
            detail={weekly?.mine ? <><b className="num text-ink">{weekly.mine.xp}</b> XP · {weekly.mine.solved}문제</> : null}
            leader={leaderW && !leaderW.me ? leaderW.name : null}
            top={weekly?.rows.slice(0, 3).map((r) => ({ rank: r.rank, name: r.name, me: r.me, value: <><b className="num text-ink">{r.xp}</b> XP</> }))}
          />
          <SummaryTile
            label="오늘의 미션"
            icon={<CalendarCheck className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => setOpen("daily")}
            disabled={!daily}
            rank={daily?.mine?.rank}
            empty="아직 시작 전"
            detail={daily?.mine ? <Progress answered={daily.mine.answered} total={daily.mine.total} done={daily.mine.done} /> : null}
            leader={leaderD && !leaderD.me ? leaderD.name : null}
            top={daily?.rows.slice(0, 3).map((x) => ({ rank: x.rank, name: x.name, me: x.me, value: x.done ? <span className="font-bold text-[#8a5a00] dark:text-[#ffd36b]">완주</span> : <span className="num">{x.answered}/{x.total}</span> }))}
          />
        </div>
      </div>
      {open && <RankingPopup tab={open} setTab={setOpen} weekly={weekly} daily={daily} onClose={() => setOpen(null)} />}
    </section>
  );
}

type Mini = { rank: number; name: string; me: boolean; value: ReactNode };

function SummaryTile({ label, icon, onClick, disabled, rank, empty, detail, leader, top }: { label: string; icon: ReactNode; onClick: () => void; disabled: boolean; rank?: number; empty: string; detail: ReactNode; leader: string | null; top?: Mini[] }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex gap-4 rounded-2xl border border-line/80 bg-surface/70 p-3 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-navy/30 hover:bg-surface disabled:pointer-events-none disabled:opacity-60 sm:p-4"
    >
      <span className="block min-w-0 shrink-0 sm:w-36">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted">
        <span className="text-navy/70">{icon}</span>
        {label}
      </span>
      <span className="mt-1.5 flex items-baseline gap-1">
        {rank ? (
          <>
            <span className="num text-2xl font-black tracking-tight text-navy">{rank}</span>
            <span className="text-sm font-bold text-navy/80">위</span>
          </>
        ) : (
          <span className="text-sm font-semibold text-faint">{empty}</span>
        )}
      </span>
      <span className="mt-1 block min-h-[18px] text-[11px] text-muted">{detail}</span>
      {leader && <span className="mt-1 block truncate text-[10px] text-faint sm:hidden">선두 {leader}</span>}
      </span>
      {/* 넓은 화면: 상위 3명 미리보기 (팝업 순위표와 같은 메달) */}
      {top && top.length > 0 && (
        <span className="hidden min-w-0 flex-1 flex-col justify-center gap-1 border-l border-line/70 pl-4 sm:flex">
          {top.map((t) => (
            <span key={t.rank} className={`flex items-center gap-2 rounded-lg px-1.5 py-0.5 text-xs ${t.me ? "bg-navy-soft/70" : ""}`}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${MEDAL[t.rank - 1] ?? "text-muted"}`}>{t.rank}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {t.name}
                {t.me && <span className="ml-1 font-normal text-muted">(나)</span>}
              </span>
              <span className="shrink-0 text-muted">{t.value}</span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/** 오늘의 미션 진행: 가는 막대 + 2/10 · 다 풀면 금빛 완주 */
function Progress({ answered, total, done }: { answered: number; total: number; done: boolean }) {
  if (done)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#d9a520]/40 bg-[#ffd36b]/15 px-2 py-0.5 text-[11px] font-bold text-[#8a5a00] dark:text-[#ffd36b]">
        <Check className="h-3 w-3" aria-hidden /> 완주
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-navy/10" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-navy/70" style={{ width: `${(answered / Math.max(1, total)) * 100}%` }} />
      </span>
      <span className="num text-[11px] font-semibold text-muted">
        {answered}/{total}
      </span>
    </span>
  );
}

const MEDAL = [
  "bg-gradient-to-br from-[#ffe39a] to-[#e6b445] text-[#3a2600] shadow-[0_1px_4px_rgba(201,154,46,.45)]",
  "bg-gradient-to-br from-[#f1f3f7] to-[#c3cad6] text-[#2a2f38] shadow-[0_1px_4px_rgba(120,130,150,.35)]",
  "bg-gradient-to-br from-[#f3c79a] to-[#c9864a] text-[#3a1f00] shadow-[0_1px_4px_rgba(180,110,50,.35)]",
];

/** 두 순위표 공통 한 줄: 순위 메달 · 이름 · 칭호 · 오른쪽 값 */
function RankRow({ rank, name, me, title, right }: { rank: number; name: string; me: boolean; title: string | null; right: ReactNode }) {
  return (
    <li className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm ${me ? "bg-navy-soft/70 ring-1 ring-navy/25" : ""}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums ${MEDAL[rank - 1] ?? "text-muted"}`}>{rank}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{name}</span>
        {me && <span className="ml-1 text-xs text-muted">(나)</span>}
        {title && <TitleBadge title={title} className="ml-1.5 align-middle" />}
      </span>
      <span className="shrink-0">{right}</span>
    </li>
  );
}

function RankingPopup({ tab, setTab, weekly, daily, onClose }: { tab: Tab; setTab: (t: Tab) => void; weekly: QuizWeekly | null; daily: DailyRanking | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lastDay = weekly ? new Date(new Date(weekly.weekEnd).getTime() - 1).toISOString() : null;
  const tabs: { id: Tab; label: string; on: boolean }[] = [
    { id: "weekly", label: "이번 주", on: Boolean(weekly) },
    { id: "daily", label: "오늘의 미션", on: Boolean(daily) },
  ];

  let meta: ReactNode = null;
  let mine: ReactNode = null;
  let list: ReactNode = null;
  let cta: { href: string; label: string } | null = null;
  if (tab === "weekly" && weekly) {
    meta = <>{fmtDay(weekly.weekStart)} (월) ~ {fmtDay(lastDay!)} (일) · 풀이 경험치 합 · 월요일 0시 새로 시작</>;
    mine = weekly.mine ? (
      <>
        내 순위 <b className="text-navy">{weekly.mine.rank}위</b> · <b className="num">{weekly.mine.xp}</b> XP <span className="text-xs text-muted">({weekly.mine.solved}문제 · 정답 {weekly.mine.correct})</span>
      </>
    ) : (
      <span className="text-muted">이번 주 기록이 아직 없어요. 한 문제만 풀어도 순위에 올라갑니다.</span>
    );
    list = weekly.rows.length ? (
      weekly.rows.map((r) => (
        <RankRow
          key={r.rank}
          {...r}
          right={
            <span className="text-right">
              <b className="num">{r.xp}</b>
              <span className="text-xs text-muted"> XP</span>
              <span className="ml-1.5 text-[11px] text-faint">{r.solved}문제</span>
            </span>
          }
        />
      ))
    ) : (
      <p className="px-2 py-6 text-center text-sm text-muted">아직 이번 주에 문제를 푼 사람이 없습니다. 첫 번째가 되어 보세요!</p>
    );
    cta = { href: "/quiz", label: "퀴즈 풀러 가기" };
  } else if (tab === "daily" && daily) {
    meta = <>오늘 {daily.players}명 참여 · 완주 {daily.finishers}명 · 자정에 새로 시작</>;
    mine = daily.mine ? (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <span>
          내 순위 <b className="text-navy">{daily.mine.rank}위</b>
        </span>
        <Progress answered={daily.mine.answered} total={daily.mine.total} done={daily.mine.done} />
      </span>
    ) : (
      <span className="text-muted">오늘의 미션을 아직 시작하지 않았어요. 10문제를 다 풀면 완주!</span>
    );
    list = daily.rows.length ? (
      daily.rows.map((x) => <RankRow key={x.rank} {...x} right={<Progress answered={x.answered} total={x.total} done={x.done} />} />)
    ) : (
      <p className="px-2 py-6 text-center text-sm text-muted">아직 오늘 미션을 푼 사람이 없어요. 첫 번째가 되어 보세요!</p>
    );
    cta = daily.mine?.done ? { href: "/quiz", label: "퀴즈 홈으로" } : { href: "/quiz/play?mode=daily", label: "오늘의 미션 풀기" };
  }

  return (
    <div className="att-backdrop fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-labelledby="rank-pop-h" onClick={onClose} data-ranking-popup>
      <div className="att-panel relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" style={{ background: "var(--hero)" }} aria-hidden />
        <div className="relative px-5 pt-5">
          <div className="flex items-center justify-between">
            <h2 id="rank-pop-h" className="flex items-center gap-2 text-lg font-black tracking-tight">
              <Trophy className="h-5 w-5 text-[#c99a2e]" aria-hidden /> 윤리 퀴즈 랭킹
            </h2>
            <button ref={closeRef} type="button" onClick={onClose} className="text-xl leading-none text-faint hover:text-ink" aria-label="닫기">
              ×
            </button>
          </div>
          {/* 탭 */}
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-line/80 bg-surface/70 p-1 backdrop-blur-sm" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                disabled={!t.on}
                onClick={() => setTab(t.id)}
                className={`rounded-full py-1.5 text-sm font-semibold transition disabled:opacity-40 ${tab === t.id ? "bg-navy text-on-accent shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">{meta}</p>
          <div className="mt-2 rounded-xl bg-navy-soft/60 px-3 py-2 text-sm">{mine}</div>
        </div>
        <ol className="relative mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2" aria-label={tab === "weekly" ? "이번 주 순위" : "오늘의 미션 순위"}>
          {list}
        </ol>
        {cta && (
          <div className="relative border-t border-line/70 px-5 py-3">
            <Link href={cta.href} onClick={onClose} className="btn-primary w-full justify-center py-2.5 font-bold">
              {cta.label}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
