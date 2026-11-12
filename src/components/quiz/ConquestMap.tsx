"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Gift } from "lucide-react";
import type { Conquest, ConquestTile } from "@/lib/quiz/fun";
import { quizApi } from "@/lib/quiz/client";
import { FeaturedCardOpener } from "@/components/game/FeaturedCardOpener";

/** 진행 고리 + 초상 (정복하면 금빛) */
export function Ring({ t, size = 64 }: { t: Pick<ConquestTile, "done" | "total" | "full" | "artUrl" | "name">; size?: number }) {
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

const TRAD_SHORT: Record<string, string> = { 동양윤리: "동양", 한국윤리: "한국", 서양윤리: "서양", 사회사상: "사회사상", "그 밖의 사상가": "그 밖" };

export function ConquestMap({ c }: { c: Conquest }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState(c.groups[0]?.tradition ?? "");
  const group = c.groups.find((g) => g.tradition === tab) ?? c.groups[0];

  async function claim(t: ConquestTile) {
    setBusy(t.id);
    setMsg(null);
    try {
      await quizApi("/api/quiz/conquest", "POST", { philosopherId: t.id });
      setMsg({ ok: true, text: `${t.name} 정복 보상: 영웅 카드를 받았습니다! 철학자 대난투 도감에서 확인하세요.` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* 분야 고르기 */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" role="tablist">
        {c.groups.map((g) => {
          const full = g.tiles.filter((t) => t.full).length;
          return (
            <button key={g.tradition} type="button" role="tab" aria-selected={g.tradition === group?.tradition} onClick={() => setTab(g.tradition)} className={`shrink-0 grow basis-auto whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${g.tradition === group?.tradition ? "bg-navy text-on-accent" : "text-muted hover:bg-surface-2"}`}>
              {TRAD_SHORT[g.tradition] ?? g.tradition}
              <span className="ml-1 text-[11px] font-normal opacity-80">{full}/{g.tiles.length}</span>
            </button>
          );
        })}
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${msg.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label={`${group?.tradition} 사상가`}>
        {group?.tiles.map((t) => (
          <li key={t.id} className={`flex flex-col items-center rounded-xl border p-2.5 text-center ${t.full ? "border-[#d9a520]/40 bg-[#ffd36b]/[0.07]" : "border-line"}`} data-conquest={t.name}>
            {(() => {
              const face = (
                <span className="flex flex-col items-center">
                  <Ring t={t} />
                  <span className="mt-1.5 max-w-full truncate text-sm font-bold">{t.name}</span>
                  <span className="text-[11px] tabular-nums text-muted">
                    {t.done}/{t.total}
                  </span>
                </span>
              );
              // 카드가 있으면 도감과 같은 카드 상세 창 (+ 퀴즈 진행), 없으면 그 사상가 문제 풀기
              return t.hasCard ? (
                <FeaturedCardOpener philosopherId={t.id} label={`${t.name} 카드 상세 · 퀴즈 진행 ${t.done}/${t.total}`} quiz={{ done: t.done, total: t.total, rewardable: t.rewardable, reward: t.reward, min: c.min }} className="!w-auto !text-center">
                  {face}
                </FeaturedCardOpener>
              ) : (
                <Link href={`/quiz/free?philosopher=${encodeURIComponent(t.name)}`} title={`${t.name} 문제 풀기`}>
                  {face}
                </Link>
              );
            })()}
            {t.reward === "claimable" ? (
              <button type="button" disabled={busy !== null} onClick={() => claim(t)} className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#ffd36b] px-2.5 py-1 text-[11px] font-black text-[#3a2600] disabled:opacity-60">
                <Gift className="h-3 w-3" aria-hidden /> {busy === t.id ? "받는 중…" : "영웅 카드 받기"}
              </button>
            ) : t.reward === "claimed" ? (
              <span className="mt-1.5 text-[11px] font-semibold text-[#8a5a00] dark:text-[#ffd36b]">카드 받음</span>
            ) : t.reward === "locked" ? (
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-faint" title={`다 채우면 ${t.name} 영웅 카드`}>
                <Gift className="h-3 w-3" aria-hidden /> 카드 보상
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-faint">
        고리는 그 사상가 문제 중 <b>한 번 이상 맞힌 문제</b>의 비율입니다 (지금 출제 범위 기준). 고리를 다 채우면 정복! 문제가 {c.min}개 이상인 사상가는 정복하면 <b>영웅 카드</b>를 한 장 받습니다. 사상가를 누르면 카드 상세와 퀴즈 진행이 열립니다 (카드가 아직 없는 사상가는 바로 문제 풀기).
        {!c.ready && " (카드 보상은 관리자가 업데이트를 적용하면 받을 수 있습니다.)"}
      </p>
    </div>
  );
}

/** 퀴즈 홈용 요약: 전체 진행 + 곧 정복할 사상가 */
export function ConquestSummary({ c }: { c: Conquest }) {
  const tiles = c.groups.flatMap((g) => g.tiles);
  const near = tiles.filter((t) => !t.full && t.done > 0).sort((a, b) => b.done / b.total - a.done / a.total).slice(0, 3);
  const claimable = tiles.filter((t) => t.reward === "claimable").length;
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
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex justify-between text-xs text-muted">
            <span>
              정복 <b className="text-ink">{c.totals.full}</b>/{c.totals.philosophers}명
            </span>
            <span className="tabular-nums">맞힌 문제 {c.totals.done}/{c.totals.items}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-gradient-to-r from-navy to-[#d9a520]" style={{ width: `${c.totals.items ? (c.totals.done / c.totals.items) * 100 : 0}%` }} />
          </div>
        </div>
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
              <Ring t={t} size={44} />
              <span className="leading-tight">
                <span className="block text-sm font-bold">{t.name}</span>
                <span className="block text-[11px] tabular-nums text-muted">
                  {t.done}/{t.total}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
