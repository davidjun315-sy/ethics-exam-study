"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Gift } from "lucide-react";
import type { Conquest, ConquestProgress, ConquestTile } from "@/lib/quiz/fun";
import { quizApi } from "@/lib/quiz/client";
import { CONQUEST_RARITY_NAME, CONQUEST_TIERS, CONQUEST_TRACK_NAMES, FULL_CONQUEST, type ConquestRarity, type ConquestTrack, type QuizProgress } from "@/lib/quiz/fun-core";
import { FeaturedCardOpener } from "@/components/game/FeaturedCardOpener";

/** 보상 등급 색 (카드 등급 색과 같은 결) */
export const TIER_TONE: Record<ConquestRarity, string> = {
  common: "text-[#5d6673] dark:text-[#a7b0bd]",
  rare: "text-[#2a6fd6] dark:text-[#8fd0ff]",
  epic: "text-[#7b3fe4] dark:text-[#d8b4ff]",
  legendary: "text-[#b9780f] dark:text-[#ffe39a]",
};
const rName = (r: ConquestRarity | null) => (r ? CONQUEST_RARITY_NAME[r] : "");
const pick = (t: ConquestTile, track: ConquestTrack): ConquestProgress => (track === "full" ? t.whole : t.part);
const TRACKS: ConquestTrack[] = ["full", "part"];

/** 카드 상세 창에 넘길 퀴즈 진행 (완전 · 부분 둘 다) */
export function quizProgressOf(t: ConquestTile, min: number): QuizProgress {
  const row = (x: ConquestProgress) => ({ done: x.done, total: x.total, rewardable: x.rewardable, reward: x.reward, rarityName: rName(x.rarity) || undefined });
  return { whole: row(t.whole), part: row(t.part), min, id: t.id };
}

/** 진행 고리 + 초상 (정복하면 금빛) */
export function Ring({ t, size = 64 }: { t: { done: number; total: number; full: boolean; artUrl: string | null; name: string }; size?: number }) {
  const r = 28, c = 2 * Math.PI * r, p = t.total ? t.done / t.total : 0;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-surface-2" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} stroke={t.full ? "#d9a520" : "var(--navy)"} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <span className={`absolute inset-[7px] overflow-hidden rounded-full ${t.full ? "ring-2 ring-[#ffd36b]/70" : ""} bg-surface-2`}>
        {t.artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.artUrl} alt="" className={`h-full w-full object-cover object-[center_15%] ${p === 0 ? "grayscale opacity-60" : ""}`} loading="lazy" draggable={false} />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-black text-muted">{t.name[0]}</span>
        )}
      </span>
      {t.full && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#d9a520] text-white shadow" aria-hidden>
          <Check className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

/** 보상 기준 한 줄 */
export function TierLine({ track }: { track: ConquestTrack }) {
  return track === "full" ? (
    <span className="whitespace-nowrap text-muted">
      완전 기출 {FULL_CONQUEST.min}문항↑ 사상가를 모두 맞히면 <b className={TIER_TONE.legendary}>전설</b>
    </span>
  ) : (
    <>
      {[...CONQUEST_TIERS].reverse().map((t) => (
        <span key={t.rarity} className="whitespace-nowrap text-muted">
          부분 기출 {t.min}문제↑ <b className={TIER_TONE[t.rarity]}>{CONQUEST_RARITY_NAME[t.rarity]}</b>
        </span>
      ))}
    </>
  );
}

const TRAD_SHORT: Record<string, string> = { 동양윤리: "동양", 한국윤리: "한국", 서양윤리: "서양", 사회사상: "사회사상", "그 밖의 사상가": "그 밖" };

export function ConquestMap({ c }: { c: Conquest }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [track, setTrack] = useState<ConquestTrack>("full");
  const [tab, setTab] = useState(c.groups[0]?.tradition ?? "");
  const group = c.groups.find((g) => g.tradition === tab) ?? c.groups[0];
  const unit = track === "full" ? "문항" : "문제";

  async function claim(t: ConquestTile) {
    const x = pick(t, track);
    setBusy(t.id);
    setMsg(null);
    try {
      await quizApi("/api/quiz/conquest", "POST", { philosopherId: t.id, track });
      setMsg({ ok: true, text: `${t.name} ${CONQUEST_TRACK_NAMES[track]} 정복 보상: ${rName(x.rarity)} 등급 카드를 받았습니다! 철학자 대난투 도감에서 확인하세요.` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* 완전 기출 / 부분 기출 */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="정복 갈래">
        {TRACKS.map((k) => {
          const tt = c.totals[k];
          return (
            <button key={k} type="button" role="tab" aria-selected={track === k} onClick={() => setTrack(k)} className={`rounded-lg px-3 py-2 text-sm font-bold ${track === k ? "bg-navy text-on-accent" : "text-muted hover:bg-surface-2"}`} data-track={k}>
              {CONQUEST_TRACK_NAMES[k]}
              <span className="ml-1.5 text-[11px] font-normal opacity-80">
                정복 {tt.conquered}명 · {tt.done}/{tt.items}
              </span>
            </button>
          );
        })}
      </div>
      {/* 분야 고르기 */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="분야">
        {c.groups.map((g) => {
          const has = g.tiles.filter((t) => pick(t, track).total > 0);
          const full = has.filter((t) => pick(t, track).full).length;
          return (
            <button key={g.tradition} type="button" role="tab" aria-selected={g.tradition === group?.tradition} onClick={() => setTab(g.tradition)} className={`shrink-0 grow basis-auto whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${g.tradition === group?.tradition ? "bg-navy-soft text-navy" : "text-muted hover:bg-surface-2"}`}>
              {TRAD_SHORT[g.tradition] ?? g.tradition}
              <span className="ml-1 text-[11px] font-normal opacity-80">
                {full}/{has.length}
              </span>
            </button>
          );
        })}
      </div>
      {/* 보상 등급 안내 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs" data-conquest-tiers>
        <span className="inline-flex items-center gap-1 font-bold">
          <Gift className="h-3.5 w-3.5 text-[#c99a2e]" aria-hidden /> {CONQUEST_TRACK_NAMES[track]} 정복 보상
        </span>
        <TierLine track={track} />
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label={`${group?.tradition} 사상가`}>
        {group?.tiles.map((t) => {
          const x = pick(t, track);
          return (
            <li key={t.id} className={`flex flex-col items-center rounded-xl border p-2.5 text-center ${x.full ? "border-[#d9a520]/40 bg-[#ffd36b]/[0.07]" : "border-line"} ${x.total === 0 ? "opacity-55" : ""}`} data-conquest={t.name}>
              {(() => {
                const face = (
                  <span className="flex flex-col items-center">
                    <Ring t={{ ...x, artUrl: t.artUrl, name: t.name }} />
                    <span className="mt-1.5 max-w-full truncate text-sm font-bold">{t.name}</span>
                    <span className="text-[11px] tabular-nums text-muted">{x.total ? `${x.done}/${x.total}` : `${CONQUEST_TRACK_NAMES[track]} 없음`}</span>
                  </span>
                );
                // 카드가 있으면 도감과 같은 카드 상세 창 (+ 퀴즈 진행), 없으면 그 사상가 기출문제 목록
                return t.hasCard ? (
                  <FeaturedCardOpener philosopherId={t.id} label={`${t.name} 카드 상세 · ${CONQUEST_TRACK_NAMES[track]} ${x.done}/${x.total}`} quiz={quizProgressOf(t, c.min)} className="!w-auto !text-center">
                    {face}
                  </FeaturedCardOpener>
                ) : (
                  <Link href={`/quiz/map/${t.id}`} title={`${t.name} 기출문제 목록`}>
                    {face}
                  </Link>
                );
              })()}
              {x.reward === "claimable" ? (
                <button type="button" disabled={busy !== null} onClick={() => claim(t)} className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#ffd36b] px-2.5 py-1 text-[11px] font-black text-[#3a2600] disabled:opacity-60">
                  <Gift className="h-3 w-3" aria-hidden /> {busy === t.id ? "받는 중…" : `${rName(x.rarity)} 카드 받기`}
                </button>
              ) : x.reward === "claimed" ? (
                <span className="mt-1.5 text-[11px] font-semibold text-[#8a5a00] dark:text-[#ffd36b]">카드 받음</span>
              ) : x.reward === "locked" ? (
                <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-faint" title={`다 채우면 ${t.name} ${rName(x.rarity)} 등급 카드`}>
                  <Gift className="h-3 w-3" aria-hidden /> <b className={x.rarity ? TIER_TONE[x.rarity] : ""}>{rName(x.rarity)}</b> 카드
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] leading-relaxed text-faint">
        <b>완전 기출</b>(기출 문항 전체)과 <b>부분 기출</b>(윤리 퀴즈에서 문항을 빈칸·요구 사항별로 나눈 문제)은 따로 셉니다. 고리는 그 사상가의 {CONQUEST_TRACK_NAMES[track]} 중 한 번 이상 맞힌 {unit}의 비율이고, 연습문제 · 예상 문제는 세지 않습니다. 두 사상가 이상이 함께 나온 연계 문항은 모두에게 함께 셉니다.
        완전 기출은 윤리 퀴즈 &lsquo;실전만 · 완전 기출&rsquo;이나 기출문제 탭에서, 부분 기출은 윤리 퀴즈에서 맞히면 채워집니다. 보상: 완전 기출 {FULL_CONQUEST.min}문항↑ 사상가를 다 맞히면 <b>전설</b>, 부분 기출은 <b>10문제↑ 일반 · 20문제↑ 희귀 · 30문제↑ 영웅</b> (갈래마다 한 번씩).
        사상가를 누르면 카드 상세와 퀴즈 진행이 열립니다 (카드가 아직 없는 사상가는 바로 기출문제 목록).
        {!c.ready && " (카드 보상은 관리자가 업데이트를 적용하면 받을 수 있습니다.)"}
        {c.ready && !c.tracksReady && " (완전 기출 보상은 관리자가 업데이트(SQL 024)를 적용하면 받을 수 있습니다.)"}
      </p>
    </div>
  );
}

/** 퀴즈 홈용 요약: 갈래별 진행 + 곧 정복할 사상가 */
export function ConquestSummary({ c }: { c: Conquest }) {
  const tiles = c.groups.flatMap((g) => g.tiles);
  const near = tiles
    .filter((t) => !t.whole.full && t.whole.done > 0)
    .sort((a, b) => b.whole.done / b.whole.total - a.whole.done / a.whole.total)
    .slice(0, 3);
  const claimable = tiles.filter((t) => t.whole.reward === "claimable").length + tiles.filter((t) => t.part.reward === "claimable").length;
  return (
    <section className="card p-4" aria-labelledby="conquest-h">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="conquest-h" className="text-base font-bold">
          사상가 정복 지도
        </h2>
        <Link href="/quiz/map" className="text-xs font-semibold text-navy hover:underline">
          지도 열기 →
        </Link>
      </div>
      <div className="space-y-2">
        {TRACKS.map((k) => {
          const tt = c.totals[k];
          return (
            <div key={k}>
              <div className="flex justify-between text-xs text-muted">
                <span>
                  {CONQUEST_TRACK_NAMES[k]} · 정복 <b className="text-ink">{tt.conquered}</b>명
                </span>
                <span className="tabular-nums">
                  {tt.done}/{tt.items}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className={`h-full rounded-full ${k === "full" ? "bg-gradient-to-r from-navy to-[#d9a520]" : "bg-navy/60"}`} style={{ width: `${tt.items ? (tt.done / tt.items) * 100 : 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {claimable > 0 && (
        <Link href="/quiz/map" className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#ffd36b]/20 px-3 py-1.5 text-sm font-bold text-[#8a5a00] dark:text-[#ffd36b]">
          <Gift className="h-4 w-4" aria-hidden /> 받을 수 있는 정복 보상 {claimable}개!
        </Link>
      )}
      {near.length > 0 && (
        <ul className="mt-3 flex gap-3 overflow-x-auto">
          {near.map((t) => (
            <li key={t.id} className="flex shrink-0 items-center gap-2">
              <Ring t={{ ...t.whole, artUrl: t.artUrl, name: t.name }} size={44} />
              <span className="leading-tight">
                <span className="block text-sm font-bold">{t.name}</span>
                <span className="block text-[11px] tabular-nums text-muted">
                  완전 {t.whole.done}/{t.whole.total}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
