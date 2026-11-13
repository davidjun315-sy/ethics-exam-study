"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, Heart, Lock, Swords } from "lucide-react";
import type { CardView, GameState, StageReplay } from "@/lib/game/data";
import { buildCampaign, STAGE_CLEAR_SHARDS, stageBossStats, stageMinionStats, stageStatuses, stageStones, type CampaignStage, type StageStatus } from "@/lib/game/campaign";
import { RARITY_NAMES } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { PhilosopherCard } from "./PhilosopherCard";
import { initialTeam, TeamPicker } from "./BattleTab";
import { BattleStage } from "./BattleStage";
import { buildDialogue } from "@/lib/game/dialogue";
import { clock } from "@/lib/game/lives";
import { SynergyChips } from "./SynergyChips";
import { BOSS_PATTERNS } from "@/lib/game/battle";
import { teamSynergies, withSynergy } from "@/lib/game/synergy";
import { titleSynergy } from "@/lib/game/achievements";

const TILE_RING: Record<string, string> = { common: "ring-[#9aa4b5]/70", rare: "ring-[#5aa2ff]", epic: "ring-[#b07cff]", legendary: "ring-[#ffc94a]" };
const TILE_TEXT: Record<string, string> = { common: "#d5dae2", rare: "#8fc6ff", epic: "#d9b8ff", legendary: "#ffd36b" };
const stars = (tier: number) => "★".repeat(tier + 1) + "☆".repeat(4 - tier);
const tShort = (t: string) => t.replace("윤리", "");

/** 배틀 전 논쟁: 보스(foe-0) ↔ 내 팀 중 한 명 */
function debateFor(replay: StageReplay, byId: Map<string, CardView>) {
  const sp = (u: StageReplay["me"][number]) => {
    const c = byId.get(u.philosopherId);
    return { key: u.key, name: u.name, tradition: u.tradition, skillName: u.skillName, skillDesc: c?.skillDesc, quote: c?.quote };
  };
  const boss = replay.foe[0];
  return boss ? buildDialogue(sp(boss), replay.me.map(sp)) : [];
}

/** 생명력: 서버가 준 값에서 시간이 지나면 화면에서도 1개씩 채움 (실제 차감·충전은 서버가 계산) */
function useLives(lives: GameState["lives"]) {
  const [now, setNow] = useState(() => Date.now());
  const full = lives.count >= lives.max || !lives.nextAt;
  useEffect(() => {
    if (full) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [full]);
  const regenMs = lives.regenSec * 1000;
  if (!lives.ready) return { ready: false, count: lives.max, max: lives.max, nextIn: 0, empty: false, regenMs };
  if (full) return { ready: true, count: lives.max, max: lives.max, nextIn: 0, empty: false, regenMs };
  const next = new Date(lives.nextAt!).getTime();
  const step = lives.regenSec * 1000;
  const gained = now >= next ? 1 + Math.floor((now - next) / step) : 0;
  const count = Math.min(lives.max, lives.count + gained);
  const nextIn = count >= lives.max ? 0 : next + gained * step - now;
  return { ready: true, count, max: lives.max, nextIn, empty: count < 1, regenMs };
}

const HEART = "M12 21.3c-.3 0-.6-.1-.8-.3C6.5 16.9 2.5 13.3 2.5 8.9 2.5 6 4.8 3.7 7.6 3.7c1.7 0 3.3.8 4.4 2.1 1.1-1.3 2.7-2.1 4.4-2.1 2.8 0 5.1 2.3 5.1 5.2 0 4.4-4 8-8.7 12.1-.2.2-.5.3-.8.3Z";

/** 하트 하나: full 꽉 참 · fill(0~1) 아래부터 차오르는 중 · 0 빈 하트 */
function LifeHeart({ fill, dark }: { fill: number; dark: boolean }) {
  const id = useId().replace(/:/g, "");
  const empty = dark ? "rgba(255,255,255,.16)" : "rgba(148,163,184,.35)";
  return (
    <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] shrink-0 ${fill >= 1 ? "drop-shadow-[0_1px_1.5px_rgba(200,30,40,.45)]" : ""}`} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a8a" />
          <stop offset="1" stopColor="#e5383b" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <rect x="0" y={24 - 24 * Math.max(0, Math.min(1, fill))} width="24" height="24" />
        </clipPath>
      </defs>
      <path d={HEART} fill={empty} />
      {fill > 0 && <path d={HEART} fill={`url(#g${id})`} clipPath={`url(#c${id})`} opacity={fill >= 1 ? 1 : 0.75} />}
      {fill >= 1 && <ellipse cx="8.2" cy="8" rx="2.3" ry="1.5" fill="#fff" opacity=".55" transform="rotate(-30 8.2 8)" />}
    </svg>
  );
}

/** 생명력 표시: 하트 5개 (다음 하트는 아래부터 차오름) · 남은 시간 */
function LivesChip({ l, dark = false }: { l: ReturnType<typeof useLives>; dark?: boolean }) {
  if (!l.ready) return null;
  const progress = l.nextIn > 0 ? 1 - l.nextIn / l.regenMs : 0;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${dark ? "border-white/15 bg-white/10 text-white" : "border-line bg-surface shadow-sm"}`}
      title={`생명력 ${l.count}/${l.max} · 도장깨기에 도전할 때마다 1개 사용, 30분마다 1개씩 다시 참`}
      aria-label={`생명력 ${l.count}/${l.max}${l.nextIn ? `, 다음 충전까지 ${clock(l.nextIn)}` : ""}`}
    >
      <span className="flex items-center gap-[2px]">
        {Array.from({ length: l.max }, (_, i) => (
          <LifeHeart key={i} fill={i < l.count ? 1 : i === l.count ? progress : 0} dark={dark} />
        ))}
      </span>
      {l.nextIn > 0 ? (
        <span className={`flex items-center gap-1 font-semibold ${dark ? "text-white/75" : "text-muted"}`}>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {clock(l.nextIn)}
        </span>
      ) : (
        <span className={`font-semibold ${dark ? "text-white/60" : "text-faint"}`}>가득</span>
      )}
    </span>
  );
}

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

/** 사상가 도장깨기: 뽑기로 얻은 카드 3장 vs 관마다 사상가 한 명 (자동 배틀) */
export function StageTab({ state, reload, goDraw }: { state: GameState; reload: () => Promise<GameState>; goDraw: () => void }) {
  const stages = useMemo(() => buildCampaign(state.cards, state.settings.maxLevel), [state.cards, state.settings.maxLevel]);
  const clearedIds = useMemo(() => new Set(state.campaign.cleared.map((c) => c.id)), [state.campaign.cleared]);
  const statuses = useMemo(() => stageStatuses(stages, clearedIds), [stages, clearedIds]);
  const byId = useMemo(() => new Map(state.cards.map((c) => [c.philosopherId, c])), [state.cards]);
  const lives = useLives(state.lives);
  const current = stages[statuses.indexOf("current")] ?? null;
  const clearedCount = stages.filter((s) => clearedIds.has(s.bossId)).length;

  const [team, setTeam] = useState<string[]>(() => initialTeam(state));
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [replay, setReplay] = useState<StageReplay | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.owned.length < 3)
    return (
      <section className="card p-8 text-center">
        <h2 className="text-lg font-bold">뽑기로 카드 3장을 모아야 도전할 수 있습니다</h2>
        <p className="mt-1 text-sm text-muted">
          지금 {state.owned.length}장 보유 · 도장깨기는 내가 뽑은 카드 3장으로 팀을 꾸려 사상가와 한 명씩 겨룹니다.
        </p>
        <button type="button" className="btn-primary mt-4 px-5 py-2.5" onClick={goDraw}>카드 뽑으러 가기</button>
      </section>
    );
  if (!stages.length) return <p className="card p-8 text-center text-sm text-muted">공개된 사상가 카드가 아직 없습니다.</p>;

  async function challenge(bossId: string) {
    if (team.length !== 3) {
      setPicking(true);
      setError("팀에 카드 3장을 넣으세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await quizApi<StageReplay>("/api/game/stage", "POST", { stage: bossId, deck: team });
      setReplay(r);
      reload().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---------------- 배틀 재생 + 결과 ----------------
  if (replay) {
    const boss = byId.get(replay.stage.bossId);
    const win = replay.winner === "me";
    const nextStage = win && current && current.bossId !== replay.stage.bossId ? current : null;
    return (
      <BattleStage
        key={replay.id}
        replay={replay}
        tradition={boss?.tradition ?? ""}
        bgUrl={boss ? state.settings.battleBg?.[boss.tradition] : undefined}
        intro={debateFor(replay, byId)}
        title={
          <span className="font-semibold text-[#ffd36b]">
            {replay.stage.no}관 · {boss?.name}
          </span>
        }
        result={
          <div className={`mx-auto max-w-sm rounded-2xl border p-4 text-center shadow-2xl backdrop-blur-md sm:p-5 ${win ? "border-[#ffd36b]/45 bg-[#140f04]/90" : "border-white/15 bg-[#0b0f18]/90"}`}>
            {win ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ffd36b]">{replay.stage.no}관</div>
                <div className="result-title text-3xl font-black text-[#ffd36b] sm:text-4xl">클리어!</div>
                <p className="mt-1 text-sm text-white/80">{boss?.name}에게 이겼습니다.</p>
              </>
            ) : (
              <>
                <div className="text-3xl font-black text-white/85 sm:text-4xl">패배</div>
                <p className="mt-1 text-sm text-white/70">{boss?.name} · 아직 버거운 상대입니다. 카드를 뽑고 레벨업·합성으로 팀을 키워 다시 도전하세요.</p>
              </>
            )}
            {replay.firstClear && replay.reward && (
              <p className="mt-2.5 rounded-lg bg-[#ffd36b]/15 px-3 py-1.5 text-sm font-bold text-[#ffd36b]">
                {replay.reward.kind === "stones" ? (
                  <>
                    보상: 강화석 +{replay.reward.amount}
                    <span className="mt-0.5 block text-[11px] font-medium text-[#ffd36b]/80">레벨업 화면에서 어느 카드에나 쓸 수 있습니다</span>
                  </>
                ) : (
                  <>보상: {boss?.name} 강화 조각 +{replay.reward.amount}</>
                )}
              </p>
            )}
            {win && !replay.firstClear && <p className="mt-2 text-xs text-white/60">이미 깬 관입니다 (보상은 처음 한 번)</p>}
            <div className="mt-2.5">
              <div className="flex justify-between text-[11px] text-white/60">
                <span>도장깨기</span>
                <span className="tabular-nums">
                  {replay.cleared} / {replay.stage.total}관
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-[#5a78d1] to-[#ffd36b]" style={{ width: `${(replay.cleared / Math.max(1, replay.stage.total)) * 100}%` }} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/20" onClick={() => setReplay(null)}>
                지도로
              </button>
              {nextStage ? (
                <button
                  type="button"
                  className="rounded-xl bg-[#ffd36b] py-2.5 text-sm font-black text-[#2a1d00] hover:bg-[#ffe08f] disabled:opacity-50"
                  disabled={busy || lives.empty}
                  onClick={() => {
                    setPicked(nextStage.bossId);
                    challenge(nextStage.bossId);
                  }}
                >
                  {lives.empty ? `충전 중 ${clock(lives.nextIn)}` : `다음 관: ${byId.get(nextStage.bossId)?.name}`}
                </button>
              ) : (
                <button type="button" className="btn-primary py-2.5 font-bold" disabled={busy || lives.empty} onClick={() => challenge(replay.stage.bossId)}>
                  {lives.empty ? `충전 중 ${clock(lives.nextIn)}` : "다시 도전"}
                </button>
              )}
            </div>
            {lives.ready && (
              <div className="mt-2 flex justify-center">
                <LivesChip l={lives} dark />
              </div>
            )}
            {error && <p className="mt-2 text-xs text-[#ffb4a8]">{error}</p>}
          </div>
        }
      />
    );
  }

  // ---------------- 지도 ----------------
  const sel: CampaignStage = stages.find((s) => s.bossId === picked) ?? current ?? stages[stages.length - 1];
  const selStatus: StageStatus = statuses[sel.index];
  const boss = byId.get(sel.bossId)!;
  const bossStats = stageBossStats(sel, state.settings.rarityMult);
  const minionInfo = sel.minions.filter((m) => byId.has(m.id)).map((m) => ({ m, c: byId.get(m.id)!, st: stageMinionStats(sel, m, state.settings.rarityMult) }));
  const teamCards = team.map((id) => state.owned.find((o) => o.cardId === id)).filter((o): o is NonNullable<typeof o> => Boolean(o));
  const titleFx = titleSynergy(state.achievements, state.title.value);
  const synergy = [...teamSynergies(teamCards), ...(titleFx ? [titleFx] : [])];
  // 시너지 반영한 팀 합계 (배틀과 같은 계산)
  const teamPower = teamCards.map((o) => withSynergy(o, synergy)).reduce((n, o) => ({ atk: n.atk + o.atk, hp: n.hp + o.hp }), { atk: 0, hp: 0 });
  const allClear = clearedCount === stages.length;
  const clearedAt = new Map(state.campaign.cleared.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {!state.campaign.ready && <p className="card p-4 text-sm text-warn">관리자가 도장깨기 업데이트(014)를 적용하면 도전할 수 있습니다.</p>}

      <section className="card space-y-4 p-4 sm:p-5" aria-labelledby="campaign-h">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <h2 id="campaign-h" className="whitespace-nowrap text-lg font-black">사상가 도장깨기</h2>
            <span className="ml-auto">
              <LivesChip l={lives} />
            </span>
            {state.stones.ready && (
              <span className="rounded-full border border-[#7fd0ff]/50 bg-[#7fd0ff]/10 px-2.5 py-0.5 text-xs font-bold tabular-nums text-[#2b7fbf] dark:text-[#9fd8ff]" title="강화석: 어느 카드 레벨업에나 쓰는 강화 재료">
                ◆ 강화석 {state.stones.count}
              </span>
            )}
            <span className="text-sm font-bold tabular-nums">
              <span className="text-navy">{clearedCount}</span> / {stages.length}관
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={stages.length} aria-valuenow={clearedCount} aria-label="도장깨기 진행도">
            <div className="h-full rounded-full bg-gradient-to-r from-navy to-[#ffc94a] transition-[width] duration-700" style={{ width: `${(clearedCount / stages.length) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {allClear
              ? "모든 사상가를 이겼습니다! 깬 관은 다시 도전할 수 있습니다."
              : state.stones.ready
                ? `내 카드 3장으로 관마다 사상가 한 명과 겨룹니다. 뒤로 갈수록 강해집니다. 처음 이기면 강화석(어느 사상가에게나 쓰는 강화 재료)을 받습니다.`
                : `내 카드 3장으로 관마다 사상가 한 명과 겨룹니다. 뒤로 갈수록 강해집니다. 처음 이기면 그 사상가의 강화 조각 ${STAGE_CLEAR_SHARDS}개.`}
            {lives.ready && " 도전할 때마다 생명력 ♥ 1개를 씁니다 (최대 5개, 30분마다 1개씩 다시 참)."}
            {" "}관 순서는 <b>빈출 순</b>입니다: 기출에 적게 나온 사상가부터, 자주 나온(정복 보상이 높은) 사상가가 뒤의 강한 관입니다.
          </p>
        </div>

        {/* 고른 관: 보스 vs 내 팀 */}
        <div className={`overflow-hidden rounded-2xl border p-3 text-white ${selStatus === "current" ? "border-[#ffd36b]/60" : "border-white/10"} bg-[radial-gradient(90%_80%_at_20%_30%,#2a3656,#0f1522)]`}>
          <div className="flex gap-3">
            <div className="w-28 shrink-0 sm:w-32">
              <PhilosopherCard fx="lite" card={boss} rarity={sel.rarity} level={sel.level} stats={bossStats} maxLevel={state.settings.maxLevel} locked={selStatus === "locked"} tilt={false} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#ffd36b]">
                {sel.no}관 · {tShort(sel.tradition)}
              </div>
              <div className="truncate text-xl font-black">{boss.name}</div>
              <div className="mt-0.5 text-xs text-[#ffd36b]" aria-label={`난이도 ${sel.tier + 1}/5`}>{stars(sel.tier)}</div>
              <div className="mt-1 text-xs text-white/70">
                {RARITY_NAMES[sel.rarity]} Lv.{sel.level}
                {boss.role && <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{boss.role}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold tabular-nums">
                <span className="flex items-center gap-1 text-[#ffb0a0]"><Swords className="h-3.5 w-3.5" aria-hidden />{bossStats.atk}</span>
                <span className="flex items-center gap-1 text-[#9ff0bf]"><Heart className="h-3.5 w-3.5" aria-hidden />{bossStats.hp}</span>
              </div>
              <div className="mt-1 text-[11px] text-white/55">
                내 팀 합계 ⚔ {teamPower.atk} · ♥ {teamPower.hp}
                {synergy.length > 0 && <span className="text-[#ffe7a8]"> (시너지 반영)</span>}
              </div>
            </div>
          </div>
          {minionInfo.length > 0 && (
            <div className="mt-2.5">
              <div className="mb-1 text-[11px] font-semibold text-white/60">함께 나오는 수하 {minionInfo.length}명 · 한 단계 아래 등급</div>
              <ul className="flex flex-wrap gap-2">
                {minionInfo.map(({ m, c, st }) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-lg bg-white/[0.07] py-1 pl-1 pr-2.5">
                    <Portrait c={c} className={`h-9 w-7 rounded ring-1 ${TILE_RING[m.rarity]}`} dim={selStatus === "locked"} />
                    <span className="leading-tight">
                      <span className="block text-xs font-bold">{c.name}</span>
                      <span className="block text-[10px] tabular-nums text-white/60">
                        <span style={{ color: TILE_TEXT[m.rarity] }}>{RARITY_NAMES[m.rarity]}</span> · ⚔ {st.atk} · ♥ {st.hp}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sel.pattern && (
            <p className="mt-2.5 rounded-lg border border-[#ef6a5a]/45 bg-[#ef6a5a]/12 px-2.5 py-1.5 text-xs text-[#ffc4b8]">
              <b className="text-[#ff8f7f]">특수 보스 · 「{BOSS_PATTERNS[sel.pattern].name}」</b> {BOSS_PATTERNS[sel.pattern].desc}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {selStatus === "cleared" && (
              <span className="flex items-center gap-1 text-xs text-[#9ff0bf]">
                <Check className="h-3.5 w-3.5" aria-hidden /> 이김{clearedAt.get(sel.bossId)?.at ? ` · ${new Date(clearedAt.get(sel.bossId)!.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}` : ""}
              </span>
            )}
            {selStatus === "locked" && (
              <span className="flex items-center gap-1 text-xs text-white/60">
                <Lock className="h-3.5 w-3.5" aria-hidden /> 앞 관을 깨면 열립니다
              </span>
            )}
            {selStatus !== "cleared" && state.stones.ready && <span className="text-xs text-[#9fd8ff]">첫 클리어 ◆ 강화석 {stageStones(sel.no, Boolean(sel.pattern))}</span>}
            <button
              type="button"
              className={`ml-auto inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-black ${selStatus === "current" ? "bg-[#ffd36b] text-[#2a1d00] hover:bg-[#ffe08f]" : "bg-white/15 hover:bg-white/25"} disabled:opacity-40`}
              disabled={busy || selStatus === "locked" || !state.campaign.ready || team.length !== 3 || lives.empty}
              onClick={() => challenge(sel.bossId)}
            >
              <Swords className="h-4 w-4" aria-hidden />
              {busy ? "겨루는 중…" : lives.empty ? `생명력 충전 중 ${clock(lives.nextIn)}` : selStatus === "cleared" ? "다시 도전" : "도전"}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}

        {/* 내 팀 */}
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold">
              내 팀 <span className="font-normal text-muted">{team.length}/3 · 뽑기로 얻은 카드</span>
            </h3>
            <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-surface-2" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
              {picking ? "다 골랐어요" : "팀 바꾸기"}
            </button>
          </div>
          {picking ? (
            <TeamPicker
              owned={state.owned}
              deck={team}
              onToggle={(id) => setTeam((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length >= 3 ? d : [...d, id]))}
              maxLevel={state.settings.maxLevel}
              featuredId={state.featuredId}
              extra={titleFx}
            />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 sm:max-w-md">
                {teamCards.map((o) => (
                  <PhilosopherCard fx="lite" key={o.cardId} card={o} rarity={o.rarity} level={o.level} stats={{ atk: o.atk, hp: o.hp }} maxLevel={state.settings.maxLevel} tilt={false} />
                ))}
              </div>
              <SynergyChips list={synergy} empty={teamCards.length === 3 ? "팀 시너지 없음 · '팀 바꾸기'에서 조합을 확인하세요" : undefined} />
            </div>
          )}
        </div>

        {/* 이긴 사상가 · 남은 사상가 */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold">사상가 {stages.length}명</span>
            <span className="flex items-center gap-3 text-muted">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-ok" />이김 {clearedCount}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-line-strong" />남음 {stages.length - clearedCount}</span>
            </span>
          </div>
          <ol className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8" aria-label="관 목록">
            {stages.map((s, i) => {
              const st = statuses[i];
              const c = byId.get(s.bossId);
              const on = sel.bossId === s.bossId;
              return (
                <li key={s.bossId}>
                  <button
                    type="button"
                    onClick={() => setPicked(s.bossId)}
                    aria-pressed={on}
                    aria-label={`${s.no}관 ${c?.name} · ${RARITY_NAMES[s.rarity]} Lv.${s.level}${s.minions.length ? ` · 수하 ${s.minions.length}명` : ""}${s.pattern ? ` · 특수 패턴 ${BOSS_PATTERNS[s.pattern].name}` : ""} · ${st === "cleared" ? "이김" : st === "current" ? "도전 중" : "잠김"}`}
                    className={`relative block w-full rounded-xl text-left ${on ? "ring-2 ring-navy ring-offset-2 ring-offset-surface" : ""}`}
                  >
                    <Portrait c={c} className={`aspect-[3/4] w-full rounded-xl ring-2 ${st === "current" ? "ring-[#ffd36b] duel-pulse" : TILE_RING[s.rarity]}`} dim={st === "locked"} />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">{s.no}</span>
                    {s.minions.length > 0 && (
                      <span className="absolute right-1 top-7 rounded bg-black/65 px-1 text-[9px] font-bold text-white" title={`수하 ${s.minions.length}명`}>
                        +{s.minions.length}
                      </span>
                    )}
                    {s.pattern && (
                      <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-[#d9443a] px-1 text-[9px] font-black text-white shadow" title={`특수 보스 · ${BOSS_PATTERNS[s.pattern].name}`}>
                        {BOSS_PATTERNS[s.pattern].name}
                      </span>
                    )}
                    {st === "cleared" && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ok text-white shadow">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                    )}
                    {st === "locked" && <Lock className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white/70" aria-hidden />}
                    <span className={`absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/90 via-black/70 to-transparent px-1 pb-1 pt-4 text-center leading-tight`}>
                      <span className={`block truncate text-[11px] font-bold ${st === "locked" ? "text-white/60" : "text-white"}`}>{c?.name}</span>
                      <span className="block truncate text-[9.5px] font-semibold" style={{ color: TILE_TEXT[s.rarity] }}>
                        {RARITY_NAMES[s.rarity]} Lv.{s.level}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
      <p className="px-1 text-[11px] leading-5 text-faint">
        배틀은 자동으로 진행됩니다. 필살기 게이지는 0에서 시작해 기본 공격 두 번이면 가득 차고, 세 번째 행동에 필살기를 씁니다. 보스는 체력이 크고, 희귀 관부터 수하가 함께 나옵니다 (희귀 1명 · 영웅·전설 2명, 한 단계 아래 등급). 전설 관은 더 강합니다. 5관마다·마지막 관은 특수 패턴 보스입니다. 코인은 학습으로만 받습니다.
      </p>
    </div>
  );
}
