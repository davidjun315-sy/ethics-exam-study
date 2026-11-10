"use client";

import { useMemo, useState } from "react";
import { Check, Lock, Swords } from "lucide-react";
import type { CardView, GameState } from "@/lib/game/data";
import { buildCampaign, STAGE_CLEAR_SHARDS, stageStatuses, type CampaignStage, type StageStatus } from "@/lib/game/campaign";
import { DIFFICULTY_NAMES } from "@/lib/game/battle";
import { RARITY_NAMES } from "@/lib/game/rules";
import { shortTradition } from "./DuelParts";

export interface CampaignView {
  stages: CampaignStage[];
  statuses: StageStatus[];
  byId: Map<string, CardView>;
  clearedCount: number;
  current: CampaignStage | null;
}

export function useCampaign(state: GameState): CampaignView {
  return useMemo(() => {
    const stages = buildCampaign(state.cards, state.settings.maxLevel);
    const cleared = new Set(state.campaign.cleared.map((c) => c.id));
    const statuses = stageStatuses(stages, cleared);
    const byId = new Map(state.cards.map((c) => [c.philosopherId, c]));
    const ci = statuses.indexOf("current");
    return { stages, statuses, byId, clearedCount: stages.filter((s) => cleared.has(s.bossId)).length, current: ci >= 0 ? stages[ci] : null };
  }, [state.cards, state.campaign.cleared, state.settings.maxLevel]);
}

const stars = (tier: number) => "★".repeat(tier + 1) + "☆".repeat(4 - tier);

function Portrait({ c, className = "", dim = false }: { c?: CardView; className?: string; dim?: boolean }) {
  return (
    <span className={`relative block overflow-hidden bg-[#1a2234] ${className}`}>
      {c?.artUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.artUrl} alt="" className={`h-full w-full object-cover object-[center_18%] ${dim ? "grayscale brightness-50" : ""}`} loading="lazy" draggable={false} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-lg font-black text-white/30">{c?.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

/** 사상가 도장깨기: 진행도 · 다음 관 · 이긴/남은 사상가 */
export function CampaignMap({ state, view, busy, onStart }: { state: GameState; view: CampaignView; busy: boolean; onStart: (bossId: string) => void }) {
  const { stages, statuses, byId, clearedCount, current } = view;
  const [picked, setPicked] = useState<string | null>(null);
  const sel = stages.find((s) => s.bossId === picked) ?? current ?? stages[stages.length - 1];
  const selStatus = sel ? statuses[sel.index] : "locked";
  const total = stages.length;
  const allClear = total > 0 && clearedCount === total;
  const clearedAt = new Map(state.campaign.cleared.map((c) => [c.id, c]));
  if (!total) return null;
  const boss = sel ? byId.get(sel.bossId) : undefined;

  return (
    <section className="card space-y-4 p-4 sm:p-5" aria-labelledby="campaign-h">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="campaign-h" className="text-lg font-black">사상가 도장깨기</h2>
          <span className="text-sm font-bold tabular-nums">
            <span className="text-navy">{clearedCount}</span> / {total}관
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={clearedCount} aria-label="도장깨기 진행도">
          <div className="h-full rounded-full bg-gradient-to-r from-navy to-[#ffc94a] transition-[width] duration-700" style={{ width: `${(clearedCount / total) * 100}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {allClear ? "모든 사상가를 꺾었습니다! 다시 도전해 기록을 줄여 보세요." : `관마다 보스 사상가와 동료 3명이 한 학파로 덤빕니다. 처음 깨면 보스의 강화 조각 ${STAGE_CLEAR_SHARDS}개.`}
        </p>
      </div>

      {/* 고른 관 (기본: 지금 도전할 관) */}
      {sel && boss && (
        <div className={`relative overflow-hidden rounded-2xl border p-3 text-white ${selStatus === "current" ? "border-[#ffd36b]/60" : "border-white/10"} bg-[radial-gradient(90%_80%_at_20%_30%,#2a3656,#0f1522)]`}>
          <div className="flex gap-3">
            <Portrait c={boss} className="aspect-[3/4] w-24 shrink-0 rounded-xl ring-2 ring-white/15 sm:w-28" dim={selStatus === "locked"} />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#ffd36b]">
                {sel.no}관 · {shortTradition(sel.tradition)}
              </div>
              <div className="truncate text-xl font-black">{boss.name} 학파</div>
              <div className="mt-0.5 text-xs text-white/60">
                <span className="text-[#ffd36b]">{stars(sel.tier)}</span> · 보스 {RARITY_NAMES[sel.bossRarity]} Lv.{sel.bossLevel} · 컴퓨터 {DIFFICULTY_NAMES[sel.ai]}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="함께 나오는 사상가">
                {sel.allyIds.map((id) => (
                  <span key={id} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white/10 py-0.5 pl-0.5 pr-2 text-[11px]">
                    <Portrait c={byId.get(id)} className="h-5 w-5 rounded-full" />
                    {byId.get(id)?.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {selStatus === "cleared" && (
              <span className="flex items-center gap-1 text-xs text-[#9ff0bf]">
                <Check className="h-3.5 w-3.5" aria-hidden /> 클리어{clearedAt.get(sel.bossId)?.turns ? ` · ${Math.ceil((clearedAt.get(sel.bossId)!.turns ?? 0) / 2)}턴` : ""}
              </span>
            )}
            {selStatus === "locked" && (
              <span className="flex items-center gap-1 text-xs text-white/60">
                <Lock className="h-3.5 w-3.5" aria-hidden /> 앞 관을 깨면 열립니다
              </span>
            )}
            <button
              type="button"
              className={`ml-auto inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-black ${selStatus === "current" ? "bg-[#ffd36b] text-[#2a1d00] hover:bg-[#ffe08f]" : "bg-white/15 hover:bg-white/25"} disabled:opacity-40`}
              disabled={busy || selStatus === "locked" || !state.campaign.ready}
              onClick={() => onStart(sel.bossId)}
            >
              <Swords className="h-4 w-4" aria-hidden />
              {busy ? "준비 중…" : selStatus === "cleared" ? "다시 도전" : "도전"}
            </button>
          </div>
        </div>
      )}

      {/* 이긴 사상가 · 남은 사상가 */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold">사상가 {total}명</span>
          <span className="flex items-center gap-3 text-muted">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-ok" />이김 {clearedCount}</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-line-strong" />남음 {total - clearedCount}</span>
          </span>
        </div>
        <ol className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-7" aria-label="관 목록">
          {stages.map((s, i) => {
            const st = statuses[i];
            const c = byId.get(s.bossId);
            const on = sel?.bossId === s.bossId;
            return (
              <li key={s.bossId}>
                <button
                  type="button"
                  onClick={() => setPicked(s.bossId)}
                  aria-pressed={on}
                  aria-label={`${s.no}관 ${c?.name} · ${st === "cleared" ? "이김" : st === "current" ? "도전 중" : "잠김"}`}
                  className={`group relative block w-full rounded-xl text-left ${on ? "ring-2 ring-navy ring-offset-2 ring-offset-surface" : ""}`}
                >
                  <Portrait c={c} className={`aspect-[3/4] w-full rounded-xl ${st === "current" ? "ring-2 ring-[#ffd36b] duel-pulse" : ""}`} dim={st === "locked"} />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">{s.no}</span>
                  {st === "cleared" && (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ok text-white shadow">
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                  )}
                  {st === "locked" && <Lock className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white/70" aria-hidden />}
                  <span className={`absolute inset-x-0 bottom-0 truncate rounded-b-xl bg-gradient-to-t from-black/85 to-transparent px-1 pb-1 pt-3 text-center text-[11px] font-bold ${st === "locked" ? "text-white/50" : "text-white"}`}>
                    {c?.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
