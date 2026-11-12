"use client";

import { useEffect, useState } from "react";
import { Check, Crown, Medal, Trophy } from "lucide-react";
import type { GameState, WeeklyRanking } from "@/lib/game/data";
import { bonusText, type Achievement } from "@/lib/game/achievements";
import { quizApi } from "@/lib/quiz/client";

const GROUPS: Achievement["group"][] = ["퀴즈", "수집", "성장", "도장깨기", "대전", "분야"];

/**
 * 칭호 표시 (랭킹 · 홈 · 게임 위쪽 공통). 배지처럼 튀지 않게 주변 글자와 같은 결로:
 * 작은 금빛 왕관 + 은은한 글자 (배경·테두리 없음)
 */
export function TitleBadge({ title, className = "" }: { title: string | null | undefined; className?: string }) {
  if (!title) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold tracking-tight text-muted ${className}`} title={`칭호: ${title}`}>
      <Crown className="h-3 w-3 shrink-0 text-[#c99a2e] dark:text-[#e0b64e]" aria-hidden />
      <span className="sr-only">칭호 </span>
      {title}
    </span>
  );
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

/** 명예의 전당: 칭호 · 주간 랭킹 · 업적 */
export function HonorTab({ state, reload }: { state: GameState; reload: () => Promise<GameState> }) {
  const [ranking, setRanking] = useState<WeeklyRanking | null>(null);
  const [rankErr, setRankErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    quizApi<WeeklyRanking>("/api/game/ranking")
      .then((r) => alive && setRanking(r))
      .catch((e) => alive && setRankErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // 효과가 큰 칭호부터
  const done = state.achievements.filter((a) => a.done).sort((a, b) => b.tier - a.tier || b.bonus.atk + b.bonus.hp - (a.bonus.atk + a.bonus.hp));
  const current = state.title.value;

  async function choose(title: string | null) {
    setBusy(title ?? "none");
    setMsg(null);
    try {
      await quizApi("/api/game/title", "POST", { title });
      await reload();
      setMsg({ ok: true, text: title ? `칭호 「${title}」을(를) 달았습니다.` : "칭호를 뗐습니다." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* 칭호 */}
        <section className="card space-y-3 p-4 sm:p-5 lg:col-start-1 lg:row-start-1" aria-labelledby="title-h">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="title-h" className="text-lg font-black">
              칭호
            </h2>
            <span className="text-xs text-muted">
              업적 {done.length}/{state.achievements.length}
            </span>
            <span className="ml-auto">{current ? <TitleBadge title={current} className="!text-xs" /> : <span className="text-xs text-faint">달고 있는 칭호 없음</span>}</span>
          </div>
          {!state.title.ready && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">칭호 저장은 관리자가 업데이트(SQL 019)를 적용하면 쓸 수 있습니다. 업적 확인은 지금도 됩니다.</p>}
          {done.length === 0 ? (
            <p className="text-sm text-muted">아직 얻은 칭호가 없습니다. 아래 업적을 달성하면 그 이름이 칭호가 됩니다.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {done.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={busy !== null || !state.title.ready}
                  onClick={() => choose(current === a.title ? null : a.title)}
                  aria-pressed={current === a.title}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${current === a.title ? "border-navy bg-navy-soft font-semibold text-navy" : "border-line text-muted hover:border-navy/40"}`}
                >
                  {current === a.title && <Check className="mr-1 inline h-3 w-3" aria-hidden />}
                  {a.title}
                  <span className="ml-1.5 text-[10px] text-[#c99a2e]" aria-label={`등급 ${a.tier}`}>{"★".repeat(a.tier)}</span>
                  <span className="ml-1 text-[10px] opacity-75">{bonusText(a.bonus)}</span>
                </button>
              ))}
            </div>
          )}
          {(() => {
            const cur = done.find((a) => a.title === current);
            return cur ? (
              <p className="rounded-lg bg-navy-soft/60 px-3 py-2 text-xs">
                지금 효과 · 배틀에서 내 팀 <b className="text-navy">{bonusText(cur.bonus)}</b>
                <span className="text-muted"> (도장깨기 · 빠른 대전)</span>
              </p>
            ) : null;
          })()}
          <p className="text-[11px] text-faint">칭호를 달면 배틀에서 내 팀 능력치가 오릅니다. 얻기 어려운 칭호(★이 많을수록)일수록 효과가 큽니다. 하나만 달 수 있고, 같은 칭호를 다시 누르면 뗍니다.</p>
          {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
        </section>

        {/* 업적 (휴대폰: 랭킹 아래) */}
        <section className="card space-y-4 p-4 sm:p-5 max-lg:order-2 lg:col-start-1 lg:row-start-2" aria-labelledby="ach-h">
          <h2 id="ach-h" className="text-lg font-black">
            업적
          </h2>
          {GROUPS.map((g) => {
            const list = state.achievements.filter((a) => a.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <h3 className="mb-1.5 text-xs font-bold text-muted">{g}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {list.map((a) => (
                    <li key={a.id} className={`rounded-xl border p-3 ${a.done ? "border-[#c99a2e]/30 bg-[#ffd36b]/[0.06]" : "border-line"}`} data-achievement={a.id} data-done={a.done ? "1" : "0"}>
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.done ? "bg-[#ffd36b] text-[#3a2600]" : "bg-surface-2 text-faint"}`}>
                          {a.done ? <Trophy className="h-3.5 w-3.5" aria-hidden /> : <Medal className="h-3.5 w-3.5" aria-hidden />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-sm font-bold ${a.done ? "" : "text-muted"}`}>{a.title}</div>
                          <div className="text-[11px] text-muted">{a.desc}</div>
                        </div>
                        {a.count && <span className="shrink-0 text-xs tabular-nums text-muted">{a.count}</span>}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 pl-9 text-[11px]">
                        <span className="text-[#c99a2e]" aria-label={`칭호 등급 ${a.tier}`}>{"★".repeat(a.tier)}<span className="text-line-strong">{"★".repeat(5 - a.tier)}</span></span>
                        <span className={a.done ? "font-semibold text-navy" : "text-muted"}>칭호 효과 {bonusText(a.bonus)}</span>
                      </div>
                      {!a.done && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(a.progress * 100)} aria-label={`${a.title} 진행도`}>
                          <div className="h-full rounded-full bg-gradient-to-r from-navy/70 to-navy" style={{ width: `${a.progress * 100}%` }} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

      {/* 주간 랭킹 (휴대폰: 칭호 바로 아래 · 넓은 화면: 오른쪽) */}
      <section className="card h-fit space-y-3 p-4 sm:p-5 max-lg:order-1 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-labelledby="rank-h">
        <div>
          <h2 id="rank-h" className="flex items-center gap-1.5 text-lg font-black">
            <Trophy className="h-5 w-5 text-[#c99a2e]" aria-hidden /> 주간 랭킹
          </h2>
          <p className="mt-0.5 text-[11px] text-muted">
            {ranking ? `${fmtDay(ranking.weekStart)} (월) ~ ${fmtDay(new Date(new Date(ranking.weekEnd).getTime() - 1).toISOString())} (일) · ` : ""}
            이번 주에 이긴 도장깨기 관 번호의 합 (같은 관은 한 번). 매주 월요일 0시에 새로 시작합니다.
          </p>
        </div>
        {rankErr ? (
          <p className="text-sm text-danger">{rankErr}</p>
        ) : !ranking ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <>
            <div className="rounded-xl bg-navy-soft/60 px-3 py-2 text-sm">
              {ranking.mine ? (
                <>
                  내 순위 <b className="text-navy">{ranking.mine.rank}위</b> · {ranking.mine.score}점 <span className="text-xs text-muted">({ranking.mine.stages}관)</span>
                </>
              ) : (
                <span className="text-muted">이번 주 기록이 없습니다. 도장깨기에서 이기면 순위에 오릅니다.</span>
              )}
            </div>
            {ranking.rows.length === 0 ? (
              <p className="text-sm text-muted">아직 이번 주 기록이 없습니다. 첫 번째 주인공이 되어 보세요!</p>
            ) : (
              <ol className="space-y-1" aria-label="주간 순위">
                {ranking.rows.map((r) => (
                  <li key={r.rank} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${r.me ? "bg-navy-soft/70 ring-1 ring-navy/30" : ""}`}>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${r.rank === 1 ? "bg-[#ffd36b] text-[#3a2600]" : r.rank === 2 ? "bg-[#d5dae2] text-[#2a2f38]" : r.rank === 3 ? "bg-[#e0a46a] text-[#3a1f00]" : "bg-surface-2 text-muted"}`}
                    >
                      {r.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="truncate font-semibold">
                        {r.name}
                        {r.me && <span className="ml-1 text-xs text-muted">(나)</span>}
                      </span>
                      {r.title && <TitleBadge title={r.title} className="ml-1.5 align-middle" />}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <b>{r.score}</b>
                      <span className="text-xs text-muted">점</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>
    </div>
  );
}
