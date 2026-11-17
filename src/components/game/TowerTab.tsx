"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coins as CoinIcon, Crown, Flame, Gem, Lightbulb, Shield, Swords, Timer, Trophy } from "lucide-react";
import type { GameState } from "@/lib/game/data";
import type { RunView, TowerAnswerResult, TowerHint, TowerOverview } from "@/lib/game/tower-data";
import { isBossFloor, QUICK_SEC, TIER_START, tierOpen, tierRewards, TOWER_TEAM_SIZE, type TowerTier } from "@/lib/game/tower";
import { slotOf, towerKindSlot, towerSlotFor, type ArtSlotKey } from "@/lib/game/art-slots";
import { quizApi } from "@/lib/quiz/client";
import { PracticeInput, type PublicPractice } from "@/components/quiz/PracticeParts";
import { SolutionView } from "@/components/quiz/SolutionView";
import { byStrength } from "./GameApp";
import { PhilosopherCard } from "./PhilosopherCard";
import { STRIKE_DURATION, STRIKE_IMPACT, TowerArena, type Strike } from "./TowerArena";
import { TowerMap, TowerScene } from "./TowerMap";

const RARITY_KO = { common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" } as const;

/** 칸 그림 (올린 그림 → 없으면 기본 그라데이션) */
function artBg(art: GameState["settings"]["art"], key: ArtSlotKey): React.CSSProperties {
  const url = art?.[key];
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" } : { background: slotOf(key).fallback };
}

/**
 * 배틀 아레나 › 사상의 탑: 화면은 둘뿐.
 *  - 탑 화면: 탑 그림 · 내 위치 · 팀 고르기 / 'N층 입장' / 층을 깬 뒤 강화 고르기 / 지난 도전 요약 · 랭킹
 *  - 게임 화면: 전장 + 문제 (층을 깨거나 쓰러지면 탑 화면으로)
 */
export function TowerTab({ state, reload, goDraw }: { state: GameState; reload: () => Promise<GameState>; goDraw: () => void }) {
  const [ov, setOv] = useState<TowerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(null);
  const [view, setView] = useState<"main" | "game">("main");
  const [last, setLast] = useState<RunView | null>(null);
  const [climbFrom, setClimbFrom] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    quizApi<TowerOverview>("/api/game/tower")
      .then((v) => {
        if (!alive) return;
        setOv(v);
        setRun(v.run);
        // 문제를 풀던 중에 다시 들어왔으면 게임 화면으로
        if (v.run && !v.run.awaiting && !v.run.choices) setView("game");
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [tick]);

  if (error) return <p className="card p-4 text-sm text-danger">{error}</p>;
  if (!ov) return <p className="card p-8 text-center text-sm text-muted">탑을 불러오는 중…</p>;
  if (!ov.ready) return <p className="card p-4 text-sm text-muted">{ov.hint}</p>;

  /** 게임 화면에서 탑으로: 도전이 끝났으면 요약을 탑 화면에 */
  const backToTower = (r: RunView) => {
    window.scrollTo({ top: 0 });
    if (r.status !== "active") {
      setLast(r);
      setRun(null);
      setView("main");
      load();
      reload();
      return;
    }
    setRun(r);
    setClimbFrom(null);
    setView("main");
  };

  if (view === "game" && run)
    return <TowerGame key={run.id} run={run} setRun={setRun} art={state.settings.art} onBack={backToTower} />;
  return (
    <TowerMain
      ov={ov}
      state={state}
      run={run}
      last={last}
      climbFrom={climbFrom}
      goDraw={goDraw}
      onRun={(r, from) => {
        setLast(null);
        setClimbFrom(from ?? null);
        setRun(r);
      }}
      onEnter={(r) => {
        setRun(r);
        setView("game");
        window.scrollTo({ top: 0 });
      }}
      onQuit={(r) => backToTower({ ...r, status: "quit" })}
    />
  );
}

// ---------------------------------------------------------------------
// 탑 화면
// ---------------------------------------------------------------------
function TowerMain({
  ov,
  state,
  run,
  last,
  climbFrom,
  goDraw,
  onRun,
  onEnter,
  onQuit,
}: {
  ov: TowerOverview;
  state: GameState;
  run: RunView | null;
  last: RunView | null;
  climbFrom: number | null;
  goDraw: () => void;
  onRun: (r: RunView, from?: number) => void;
  onEnter: (r: RunView) => void;
  onQuit: (r: RunView) => void;
}) {
  const owned = useMemo(() => [...state.owned].sort(byStrength), [state.owned]);
  // 고른 탑 (구간): 처음엔 열린 탑 중 가장 높은 곳
  const [pick, setPick] = useState<TowerTier>(() => ([4, 3, 2, 1] as TowerTier[]).find((t) => tierOpen(t, ov.best)) ?? 1);
  const [team, setTeam] = useState<string[]>(() => {
    const deck = state.deck.filter((id) => owned.some((o) => o.cardId === id));
    return (deck.length ? deck : owned.map((o) => o.cardId)).slice(0, TOWER_TEAM_SIZE);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const left = Math.max(0, ov.tries.max - ov.tries.used);
  const atk = team.reduce((s, id) => s + (owned.find((o) => o.cardId === id)?.atk ?? 0), 0);
  const toggle = (id: string) => setTeam((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= TOWER_TEAM_SIZE ? [...t.slice(1), id] : [...t, id]));
  const call = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  /** 탑 오르기 = 시작하고 바로 1층 입장 */
  const start = () =>
    call(async () => {
      const r = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "start", cardIds: team, startFloor: TIER_START[pick] });
      const e = r.run.awaiting ? await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "enter", runId: r.run.id }) : r;
      onEnter(e.run);
    });
  const enter = (r: RunView) =>
    call(async () => {
      const e = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "enter", runId: r.id });
      onEnter(e.run);
    });
  const choose = (r: RunView, buff: string) =>
    call(async () => {
      const n = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "buff", runId: r.id, buff });
      if (n.run.status !== "active") return onQuit(n.run);
      onRun(n.run, r.state.floor);
    });
  const quit = (r: RunView) =>
    call(async () => {
      await quizApi("/api/game/tower", "POST", { action: "quit", runId: r.id });
      onQuit(r);
    });

  const s = run?.state;
  const boss = s ? isBossFloor(s.floor) : false;
  const teamCards = team.map((id) => owned.find((o) => o.cardId === id)).filter((o) => o !== undefined).map((o) => ({ cardId: o.cardId, name: o.name, artUrl: o.artUrl, battleArtUrl: o.battleArtUrl ?? null }));
  const lastBest = last && last.cleared > 0 && last.cleared >= ov.best;

  return (
    <div className="space-y-4" data-tower-lobby>
      {/* 탑: 제목 · 기록 · 탑 그림 · 내 위치 · 다음 행동이 한 화면에 */}
      <section className="relative overflow-hidden rounded-2xl border border-line text-white shadow-soft" data-tower-hub>
        <div className="absolute inset-0" style={artBg(state.settings.art, "tower-lobby")} aria-hidden />
        {!state.settings.art?.["tower-lobby"] && <div className="absolute inset-0 bg-gradient-to-b from-[#141a36] via-[#252c5c] to-[#3b2f6b]" aria-hidden />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/55" aria-hidden />
        <div className="relative space-y-3 p-4 sm:p-5">
          <div>
            <p className="text-[11px] font-bold tracking-[0.25em] text-white/70">THE TOWER OF THOUGHT{run ? ` · ${run.tier.name}` : ""}</p>
            <h2 className="mt-0.5 text-2xl font-black tracking-tight drop-shadow sm:text-3xl" data-tower-title>
              {run ? (run.choices ? `${s!.floor}층 돌파!` : run.cleared > 0 ? `${run.cleared}층 돌파 → ${s!.floor}층` : `${s!.floor}층 앞`) : "사상의 탑"}
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              <Chip icon={<Crown className="h-3.5 w-3.5" />} text={`최고 ${ov.best}층`} />
              <Chip icon={<Trophy className="h-3.5 w-3.5" />} text={`이번 주 ${ov.weeklyBest}층`} />
              <Chip icon={<Swords className="h-3.5 w-3.5" />} text={`오늘 도전 ${left}/${ov.tries.max}${ov.tries.attendBonus ? " (출석 +1)" : ""}`} />
            </div>
          </div>

          {/* 지난 도전 요약 (따로 창을 띄우지 않고 여기에) */}
          {last && (
            <div className="relative overflow-hidden rounded-xl border border-white/20 px-3 py-2.5" data-tower-last>
              <div className="absolute inset-0 opacity-60" style={artBg(state.settings.art, "tower-result")} aria-hidden />
              <div className="absolute inset-0 bg-black/40" aria-hidden />
              <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                <b>
                  {last.status === "quit" ? "도전 종료" : "쓰러졌어요"} · {last.cleared}층까지{lastBest ? " 🏆 최고 기록!" : ""}
                </b>
                <span className="text-xs text-white/85">
                  맞힘 {last.state.correct}/{last.state.answered} · <CoinIcon className="inline h-3 w-3" /> {last.coins}
                  {last.stones > 0 && ` · 강화석 ${last.stones}`}
                </span>
              </div>
            </div>
          )}

          {run ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <div className="space-y-1">
                  <Bar value={s!.hp} max={s!.maxHp} tone="team" label="내 팀" />
                  <div className="flex flex-wrap gap-1 text-[10px] font-semibold">
                    <Tag icon={<CoinIcon className="h-3 w-3" />} text={`${run.coins}`} tone="bg-white/20" />
                    {run.stones > 0 && <Tag icon={<Gem className="h-3 w-3" />} text={`${run.stones}`} tone="bg-white/20" />}
                    {s!.buffs.power > 0 && <Tag icon={<Swords className="h-3 w-3" />} text={`피해 +${Math.round(s!.buffs.power * 100)}%`} tone="bg-white/20" />}
                    {s!.buffs.shield > 0 && <Tag icon={<Shield className="h-3 w-3" />} text={`방어 ${s!.buffs.shield}`} tone="bg-white/20" />}
                    {s!.buffs.hints > 0 && <Tag icon={<Lightbulb className="h-3 w-3" />} text={`힌트 ${s!.buffs.hints}`} tone="bg-white/20" />}
                  </div>
                </div>
                {!run.choices && (
                  <span className="text-right text-[11px] text-white/75">
                    다음 상대
                    <b className="block text-sm text-white">
                      {boss ? "👑 " : ""}
                      {run.enemy?.name ?? "?"}
                    </b>
                  </span>
                )}
              </div>
              {run.choices ? (
                <BuffPick run={run} busy={busy} onChoose={(b) => choose(run, b)} />
              ) : (
                <button
                  type="button"
                  className={`w-full rounded-xl py-3.5 text-base font-black shadow-lg transition hover:brightness-110 disabled:opacity-60 ${boss ? "bg-gradient-to-r from-[#ff6b5a] to-[#ffb36b] text-[#2a0a00]" : "bg-gradient-to-r from-[#ffd36b] to-[#ffe9a8] text-[#3a2600]"}`}
                  onClick={() => (run.awaiting ? enter(run) : onEnter(run))}
                  disabled={busy}
                  data-tower-enter
                >
                  {busy ? "문을 여는 중…" : run.awaiting ? (boss ? `보스층 ${s!.floor}층 입장` : `${s!.floor}층 입장`) : `${s!.floor}층으로 돌아가기`}
                </button>
              )}
            </>
          ) : null}
          {!run && <TowerPicker ov={ov} pick={pick} onPick={setPick} art={state.settings.art} />}
          <TowerMap
            floor={run ? s!.floor : Math.min(TIER_START[pick] + 9, Math.max(TIER_START[pick], ov.best))}
            cleared={run ? (run.choices ? s!.floor : run.cleared) : ov.best}
            epicTicketGiven={ov.epicTicketGiven}
            kindArt={{ 1: state.settings.art?.["tower-kind-1"], 2: state.settings.art?.["tower-kind-2"], 3: state.settings.art?.["tower-kind-3"], 4: state.settings.art?.["tower-kind-4"] }}
            best={Math.max(ov.best, run?.cleared ?? 0)}
            from={climbFrom}
            team={run ? run.team : teamCards}
            enemyName={run && !run.choices ? run.enemy?.name : null}
            mode={run ? "run" : "lobby"}
          />

          {run && (
            <button type="button" className="block w-full text-center text-[11px] text-white/60 underline-offset-2 hover:text-white hover:underline" onClick={() => quit(run)} disabled={busy} data-tower-quit>
                여기서 도전 끝내기 (깬 층 보상은 남아요)
            </button>
          )}
          {msg && <p className="rounded-lg bg-black/40 px-3 py-2 text-sm text-[#ffb3a8]" role="alert">{msg}</p>}
        </div>
      </section>

      {!run && (
        <section className="card space-y-3 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-bold">함께 오를 카드 {team.length}/{TOWER_TEAM_SIZE}</h3>
            <span className="text-[11px] text-muted">공격 합 {atk} · 카드가 강할수록 정답 피해 ↑ (최대 1.4배)</span>
          </div>
          {owned.length === 0 ? (
            <div className="rounded-xl bg-surface-2 p-4 text-sm">
              카드가 있어야 오를 수 있어요.{" "}
              <button type="button" className="font-semibold text-navy underline" onClick={goDraw}>
                카드 뽑으러 가기
              </button>
            </div>
          ) : (
            <div className="grid max-h-[30rem] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4 lg:grid-cols-6" aria-label="보유 카드">
              {owned.map((o) => {
                const at = team.indexOf(o.cardId);
                return (
                  <div key={o.cardId} className={`relative rounded-[16px] p-0.5 transition ${at >= 0 ? "ring-2 ring-navy" : "opacity-80 hover:opacity-100"}`} data-tower-card>
                    <PhilosopherCard fx="full" card={o} rarity={o.rarity} level={o.level} stats={{ atk: o.atk, hp: o.hp }} maxLevel={state.settings.maxLevel} featured={o.cardId === state.featuredId} tilt={false} onClick={() => toggle(o.cardId)} />
                    {at >= 0 && <span className="absolute -left-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs font-bold text-on-accent shadow">{at + 1}</span>}
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" className="btn-primary w-full py-3 text-base font-bold" disabled={busy || !team.length || left <= 0} onClick={start} data-tower-start>
            {busy ? "탑 문을 여는 중…" : left <= 0 ? "오늘 도전을 모두 썼어요" : `${ov.tiers[pick].name} · ${TIER_START[pick]}층부터 오르기`}
          </button>
          <p className="text-center text-[11px] text-faint">하루 {ov.tries.max - (ov.tries.attendBonus ? 1 : 0)}번 · 그날 출석하면 1번 더 · 그만둬도 깬 층 보상은 남아요</p>
        </section>
      )}

      <div className="grid gap-4">
        {/* 주간 랭킹 */}
        <section className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="flex items-center gap-1.5 font-bold">
              <Trophy className="h-4 w-4 text-[#c99a2e]" aria-hidden /> 이번 주 탑 랭킹
            </h3>
            <span className="text-[11px] text-faint">가장 높이 깬 층 · 월요일 0시 새로 시작</span>
          </div>
          {ov.ranking.rows.length === 0 ? (
            <p className="text-sm text-muted">아직 이번 주에 탑을 오른 사람이 없어요. 첫 번째가 되어 보세요!</p>
          ) : (
            <ol className="space-y-1">
              {ov.ranking.rows.map((r) => (
                <li key={r.rank} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${r.me ? "bg-navy-soft/70 ring-1 ring-navy/25" : ""}`}>
                  <span className="w-6 text-center text-sm font-black italic tabular-nums text-muted">{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {r.name}
                    {r.me && <span className="ml-1 text-xs font-normal text-muted">(나)</span>}
                  </span>
                  <span className="shrink-0">
                    <b className="num">{r.floor}</b>
                    <span className="text-xs text-muted">층</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {ov.ranking.mine && ov.ranking.mine.rank > ov.ranking.rows.length && (
            <p className="mt-2 rounded-lg bg-navy-soft/60 px-3 py-1.5 text-xs">
              내 순위 <b className="text-navy">{ov.ranking.mine.rank}위</b> · {ov.ranking.mine.floor}층
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** 탑 고르기: 구간마다 따로 들어가는 네 개의 탑 (그림 · 문제 · 보상 · 잠김) */
function TowerPicker({ ov, pick, onPick, art }: { ov: TowerOverview; pick: TowerTier; onPick: (t: TowerTier) => void; art: GameState["settings"]["art"] }) {
  return (
    <div className="space-y-1.5" data-tower-picker>
      <p className="text-[11px] font-bold tracking-wider text-white/75">들어갈 탑을 고르세요</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([1, 2, 3, 4] as TowerTier[]).map((t) => {
          const ti = ov.tiers[t];
          const open = tierOpen(t, ov.best);
          const rw = tierRewards(t, ov.epicTicketGiven);
          const from = TIER_START[t];
          const on = pick === t;
          return (
            <button
              key={t}
              type="button"
              disabled={!open}
              onClick={() => onPick(t)}
              aria-pressed={on}
              className={`group relative overflow-hidden rounded-2xl text-left transition ${on ? "ring-2 ring-[#ffd36b] shadow-[0_0_24px_rgba(255,211,107,.35)]" : "ring-1 ring-white/15 hover:ring-white/40"} ${open ? "" : "cursor-not-allowed"}`}
              data-tower-tier={t}
            >
              <div className="relative h-24 overflow-hidden sm:h-28">
                {art?.[towerKindSlot(t)] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={art[towerKindSlot(t)]} alt="" className={`absolute inset-0 h-full w-full object-cover object-[35%_30%] ${open ? "" : "opacity-55 grayscale-[.6]"}`} />
                ) : (
                <div className="-mt-[12%]">
                  <TowerScene floors={Array.from({ length: 5 }, (_, i) => from + i * 2 + (i === 4 ? 1 : 0))} stateOf={(f) => (f <= ov.best ? "done" : "next")} tier={t} compact showRewards={false} dim={!open} />
                </div>
                )}
              </div>
              <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-2 pb-4 pt-1.5">
                <span className="block text-[10px] font-bold text-white/75">{ti.floors}</span>
                <span className="block text-sm font-black text-white drop-shadow">{ti.name}</span>
              </div>
              <div className="space-y-0.5 bg-black/55 px-2 py-1.5 text-[10px] leading-4 text-white/85 backdrop-blur-sm">
                <span className="block truncate">{ti.questions}</span>
                <span className="flex flex-wrap items-center gap-x-1.5 font-bold text-[#ffe9a8]">
                  <span>🪙 {rw.coins}</span>
                  <span className="text-[#bfe3ff]">💎 {rw.stones}</span>
                  {rw.ticket && <span className="text-[#e6b8ff]">🎟 영웅</span>}
                  {rw.title && <span className="text-white/80">👑 {rw.title}</span>}
                </span>
              </div>
              {!open && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 text-center text-white">
                  <span className="text-lg">🔒</span>
                  <span className="text-[10px] font-bold">{from - 1}층을 깨면 열림</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-white/60">🪙 코인 · 💎 강화석은 그 탑 10개 층을 모두 깼을 때의 합 (강화석은 보스층을 처음 깰 때만) · 층마다 받는 보상은 아래 탑 그림 오른쪽에</p>
    </div>
  );
}

function Chip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 backdrop-blur-sm">
      {icon}
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------
// 오르는 중
// ---------------------------------------------------------------------
function TowerGame({ run, setRun, art, onBack }: { run: RunView; setRun: (r: RunView) => void; art: GameState["settings"]["art"]; onBack: (r: RunView) => void }) {
  const [outcome, setOutcome] = useState<TowerAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [picks, setPicks] = useState<number[]>([]);
  const [assign, setAssign] = useState<(number | null)[]>([]);
  const [strike, setStrike] = useState<Strike | null>(null);
  // 체력바는 맞는 순간에 바뀜 (연출보다 먼저 줄지 않게)
  const [shown, setShown] = useState(run.state);
  const [showSol, setShowSol] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const item = run.item;
  const practice = (item?.practice ?? null) as PublicPractice | null;
  const picking = practice && practice.mode !== "fill" ? practice : null;
  const ready = picking ? (picking.mode === "classify" ? (picking.statements ?? []).every((_, i) => assign[i] !== null && assign[i] !== undefined) : picks.length > 0) : answer.trim().length > 0;

  // 빠른 정답 시계 (서버가 문제를 낸 시각 기준 · 판정은 서버)
  useEffect(() => {
    if (!item || item.essay || outcome) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [item, outcome]);
  const leftMs = item && now ? new Date(item.servedAt).getTime() + QUICK_SEC * 1000 - now : null;
  // 시작하면 무대가 보이게 (입구 화면에서 내려와 있던 위치에서 바로 무대로)
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, []);

  const play = (r: TowerAnswerResult) => {
    const after = r.run.state;
    const kind: Strike["kind"] = r.verdict === "wrong" ? (r.shieldUsed ? "shield" : "enemy") : r.quick || after.combo >= 3 || r.floorCleared ? "skill" : "attack";
    const st: Strike = { id: Date.now(), kind, actor: (after.answered - 1) % Math.max(1, run.team.length), dealt: r.dealt, taken: r.taken, quick: r.quick, combo: after.combo, cleared: r.floorCleared, dead: r.dead };
    setStrike(st);
    setTimeout(() => setShown(after), STRIKE_IMPACT[kind]);
    setTimeout(() => setStrike((cur) => (cur?.id === st.id ? null : cur)), STRIKE_DURATION + STRIKE_IMPACT[kind]);
  };

  async function submit() {
    if (!item) return;
    const payload = picking ? (picking.mode === "classify" ? JSON.stringify(assign.map((x) => x ?? -1)) : picking.mode === "choice" ? String(picks[0]) : JSON.stringify(picks)) : answer;
    setBusy(true);
    setErr(null);
    try {
      const r = await quizApi<TowerAnswerResult>("/api/game/tower", "POST", { action: "answer", runId: run.id, itemId: item.id, answer: payload });
      setOutcome(r);
      // 답 버튼 근처까지 내려와 있으므로 전장을 먼저 보여 주고 공격 연출
      const arena = topRef.current;
      const visible = arena ? arena.getBoundingClientRect().top > -40 : true;
      if (!visible) arena?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => play(r), visible ? 0 : 320);
      setRun({ ...r.run, item: run.item }); // 해설을 보는 동안 문제는 그대로
      setShowSol(r.verdict !== "correct");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (!outcome) return;
    const r = outcome.run;
    setOutcome(null);
    setAnswer("");
    setPicks([]);
    setAssign([]);
    setShowSol(false);
    // 층을 깼거나(강화 고르기) 쓰러졌으면 탑 화면으로
    if (r.status !== "active" || r.choices) return onBack(r);
    setRun(r);
    setShown(r.state);
    setStrike(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function hint() {
    setBusy(true);
    setErr(null);
    try {
      const r = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "hint", runId: run.id });
      setRun(r.run);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const s = run.state;
  const boss = isBossFloor(s.floor);

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-3" data-tower-run>
      {/* 무대 */}
      <section className="relative overflow-hidden rounded-2xl border border-line text-white shadow-soft">
        <div className="absolute inset-0 scale-105" style={artBg(art, towerSlotFor(s.floor))} aria-hidden />
        <div className={`absolute inset-0 ${boss ? "bg-gradient-to-b from-[#3a0b16]/55 via-black/35 to-black/70" : "bg-gradient-to-b from-black/35 via-black/25 to-black/65"}`} aria-hidden />
        <div className="relative space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] text-white/70">{run.tier.name}</p>
              <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
                {s.floor}층
                {boss && <span className="rounded-full bg-[#ff6b5a] px-2 py-0.5 text-[11px] font-black tracking-wider">BOSS</span>}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">
                깬 층 {run.cleared} · <CoinIcon className="inline h-3 w-3" /> {run.coins}
              </span>
              <button type="button" onClick={() => onBack(outcome ? outcome.run : run)} disabled={busy} className="rounded-full border border-white/30 px-2.5 py-1 text-xs text-white/85 hover:bg-white/10" data-tower-back>
                ← 탑
              </button>
            </div>
          </div>

          <TowerArena team={run.team} enemy={run.enemy} state={shown} boss={boss} strike={strike} enemyDown={Boolean(outcome?.floorCleared)} teamDown={Boolean(outcome?.dead)} />

          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            <div className="space-y-1">
              <Bar value={shown.hp} max={shown.maxHp} tone="team" label="내 팀" />
              <div className="flex flex-wrap gap-1 text-[10px] font-semibold">
                {shown.combo > 1 && <Tag icon={<Flame className="h-3 w-3" />} text={`${shown.combo}콤보`} tone="bg-[#ff8a3d]/80" />}
                {s.buffs.power > 0 && <Tag icon={<Swords className="h-3 w-3" />} text={`피해 +${Math.round(s.buffs.power * 100)}%`} tone="bg-white/20" />}
                {s.buffs.shield > 0 && <Tag icon={<Shield className="h-3 w-3" />} text={`방어 ${s.buffs.shield}`} tone="bg-white/20" />}
                {s.buffs.hints > 0 && <Tag icon={<Lightbulb className="h-3 w-3" />} text={`힌트 ${s.buffs.hints}`} tone="bg-white/20" />}
              </div>
            </div>
            <div className="space-y-1 text-right">
              <Bar value={shown.enemyHp} max={shown.enemyMax} tone="enemy" label={run.enemy?.name ?? "적"} />
              <div className="text-xs font-bold drop-shadow">
                {run.enemy?.name ?? "수수께끼의 사상가"}
                {run.enemy && <span className="ml-1 text-[10px] font-semibold text-white/75">{RARITY_KO[run.enemy.rarity]}</span>}
              </div>
            </div>
          </div>
          {run.enemy?.quote && !outcome && <p className="truncate text-center text-[11px] italic text-white/70">“{run.enemy.quote}”</p>}
        </div>
      </section>

      {err && <p className="card p-3 text-sm text-danger" role="alert">{err}</p>}

      {outcome ? (
        <OutcomeCard r={outcome} kind={item?.kind ?? "exam"} showSol={showSol} setShowSol={setShowSol} onNext={next} />
      ) : item ? (
        <article className="card space-y-3 p-4 sm:p-5" data-tower-item>
          <header className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`rounded px-2 py-0.5 font-semibold ${item.full ? "bg-[#7b3fe4] text-white" : item.kind === "exam" ? "bg-navy text-on-accent" : item.kind === "practice" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
              {item.full ? "완전 기출 · 서술형 (AI 채점)" : item.kind === "exam" ? "실제 기출" : item.kind === "practice" ? "개념 다지기" : "예상 문제"}
            </span>
            {item.ref && <span className="text-muted">{item.ref}</span>}
            <span className="rounded border border-line px-1.5 py-0.5 text-muted">난이도 {"★".repeat(item.difficulty)}</span>
            {!item.essay && leftMs !== null && (
              <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${leftMs > 0 ? "bg-[#ffd36b]/25 text-[#8a5a00] dark:text-[#ffd36b]" : "text-faint"}`}>
                <Timer className="h-3 w-3" />
                {leftMs > 0 ? `빠른 정답 ${Math.ceil(leftMs / 1000)}초 · +20%` : "빠른 정답 시간 끝"}
              </span>
            )}
          </header>
          {item.passage && <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap break-keep rounded-xl bg-surface-2 p-3 text-[15px] leading-7">{item.passage}</div>}
          {item.kind === "exam" && item.label && !item.full && !(item.prompt && item.passage?.includes(item.prompt)) && (
            <p className="rounded-lg border-2 border-navy/40 bg-navy-soft/40 p-3 text-[15px] font-medium leading-7">{item.prompt ?? `${item.label} 요구 사항에 답하세요.`}</p>
          )}
          {item.kind === "practice" && <p className="rounded-xl border-2 border-ok/40 bg-ok-soft/40 p-3 text-[15px] font-medium leading-7">{picking?.stem ?? item.prompt}</p>}
          {item.hint && <HintLine h={item.hint} p={practice} />}

          {picking ? (
            <PracticeInput p={picking} picks={picks} onPicks={setPicks} assign={assign.length ? assign : (picking.statements ?? []).map(() => null)} onAssign={setAssign} disabled={busy} />
          ) : item.essay ? (
            <textarea className="input min-h-40 text-[15px] leading-7" placeholder="답안을 쓰세요. AI 가 채점합니다 (완벽 = 피해 100%, 일부 = 50%)." value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={3000} />
          ) : (
            <input
              className="input py-3 text-[17px]"
              placeholder="정답을 입력하세요"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ready && !busy && submit()}
              autoComplete="off"
              enterKeyHint="done"
            />
          )}
          <div className="flex gap-2">
            {!item.essay && !item.hint && s.buffs.hints > 0 && (
              <button type="button" className="btn shrink-0 py-3" onClick={hint} disabled={busy}>
                <Lightbulb className="mr-1 inline h-4 w-4" /> 힌트 ({s.buffs.hints})
              </button>
            )}
            <button type="button" className="btn-primary flex-1 py-3 text-base font-bold" disabled={busy || !ready} onClick={submit} data-tower-submit>
              {busy ? (item.essay ? "AI 채점 중…" : "공격 중…") : "공격!"}
            </button>
          </div>
        </article>
      ) : (
        <p className="card p-6 text-center text-sm text-muted">다음 문제를 준비하는 중…</p>
      )}
    </div>
  );
}

function Tag({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 backdrop-blur-sm ${tone}`}>
      {icon}
      {text}
    </span>
  );
}

function Bar({ value, max, tone, label }: { value: number; max: number; tone: "team" | "enemy"; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div role="meter" aria-label={`${label} 체력`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
        <div className={`absolute inset-y-0 rounded-full transition-[width] duration-500 ${tone === "team" ? "left-0 bg-gradient-to-r from-[#3ad19a] to-[#9ff2c9]" : "right-0 bg-gradient-to-l from-[#ff6b5a] to-[#ffb36b]"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`mt-0.5 text-[10px] font-semibold tabular-nums text-white/80 ${tone === "enemy" ? "text-right" : ""}`}>
        {value} / {max}
      </div>
    </div>
  );
}

function HintLine({ h, p }: { h: TowerHint; p: PublicPractice | null }) {
  const LET = ["①", "②", "③", "④", "⑤", "⑥"];
  const text =
    h.kind === "remove"
      ? `${LET[h.index] ?? h.index + 1} 보기는 정답이 아니에요.`
      : h.kind === "reveal"
        ? `${h.statement + 1}번 진술은 「${p?.groups?.[h.group] ?? h.group + 1}」입니다.`
        : `정답의 첫 글자는 「${h.text}」입니다.`;
  return (
    <p className="flex items-center gap-2 rounded-lg bg-ok-soft/60 px-3 py-2 text-sm text-ok">
      <Lightbulb className="h-4 w-4 shrink-0" /> 스승의 귀띔: {text}
    </p>
  );
}

function OutcomeCard({
  r,
  kind,
  showSol,
  setShowSol,
  onNext,
}: {
  r: TowerAnswerResult;
  kind: "exam" | "expected" | "practice";
  showSol: boolean;
  setShowSol: (v: boolean) => void;
  onNext: () => void;
}) {
  const v = r.verdict;
  return (
    <div className="space-y-3" data-tower-outcome>
      <section className={`card overflow-hidden ${v === "correct" ? "border-ok/40" : v === "partial" ? "border-warn/40" : "border-danger/40"}`}>
        <div className={`flex items-center justify-between gap-3 px-4 py-3 ${v === "correct" ? "bg-ok-soft/70" : v === "partial" ? "bg-warn-soft/70" : "bg-danger-soft/70"}`}>
          <div>
            <p className={`text-lg font-black ${v === "correct" ? "text-ok" : v === "partial" ? "text-warn" : "text-danger"}`}>
              {v === "correct" ? (r.quick ? "정답! 빠른 일격" : "정답!") : v === "partial" ? "부분 정답" : "오답…"}
            </p>
            <p className="text-xs text-muted">
              {r.dealt ? `적에게 ${r.dealt} 피해` : r.shieldUsed ? "반론 대비로 공격을 막았어요" : `내 팀이 ${r.taken} 피해`}
              {r.attempt && r.attempt.xp > 0 && ` · +${r.attempt.xp} XP`}
              {r.attempt && r.attempt.coins > 0 && ` · +${r.attempt.coins} 코인`}
            </p>
          </div>
          {r.floorCleared && <span className="rounded-full bg-[#ffd36b] px-3 py-1 text-xs font-black text-[#3a2600]">{r.run.state.floor}층 돌파!</span>}
          {r.dead && <span className="rounded-full bg-danger px-3 py-1 text-xs font-black text-white">쓰러짐</span>}
        </div>
        {r.essayGrading && (
          <div className="space-y-1 border-t border-line px-4 py-3 text-sm">
            <p>
              <b>AI 채점 {r.essayGrading.score}점</b> · {r.essayGrading.summary}
            </p>
            {r.essayGrading.missing.length > 0 && <p className="text-xs text-muted">빠진 요소: {r.essayGrading.missing.join(" · ")}</p>}
          </div>
        )}
        {r.solution && (
          <div className="border-t border-line px-4 py-2">
            <button type="button" className="text-sm font-semibold text-navy" onClick={() => setShowSol(!showSol)}>
              {showSol ? "해설 접기" : "정답과 해설 보기"}
            </button>
            {showSol && (
              <div className="mt-2">
                <SolutionView s={r.solution} kind={kind} />
              </div>
            )}
          </div>
        )}
      </section>
      {r.floorCleared && r.reward && (
        <p className="rounded-xl bg-[#ffd36b]/15 px-3 py-2 text-center text-sm">
          <CoinIcon className="inline h-4 w-4 text-warn" /> +{r.reward.coins}
          {r.reward.stones > 0 && <> · 강화석 +{r.reward.stones}</>}
          {r.reward.ticket && <b className="ml-1 text-[#7b3fe4]">· 🎟 영웅 확정 뽑기권!</b>}
        </p>
      )}
      <button type="button" className="btn-primary w-full py-3 text-base font-bold" onClick={onNext} data-tower-next>
        {r.floorCleared ? "탑으로 돌아가 강화 고르기" : r.dead || r.run.status !== "active" ? "탑으로 돌아가기" : "다음 문제"}
      </button>
    </div>
  );
}

function BuffPick({ run, busy, onChoose }: { run: RunView; busy: boolean; onChoose: (b: string) => void }) {
  return (
    <div className="space-y-2" data-tower-buffs>
      <p className="text-center text-xs text-white/80">다음 층({run.state.floor + 1}층)으로 가기 전에 하나를 고르세요</p>
      <div className="grid grid-cols-3 gap-2">
        {(run.choices ?? []).map((c) => (
          <button key={c.id} type="button" disabled={busy} onClick={() => onChoose(c.id)} className="rounded-xl border border-white/25 bg-white/10 p-2.5 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/20 disabled:opacity-50" data-buff={c.id}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ffd36b] text-[#3a2600]">
              {c.id === "heal" ? <Flame className="h-4 w-4" /> : c.id === "power" ? <Swords className="h-4 w-4" /> : c.id === "shield" ? <Shield className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
            </span>
            <span className="mt-1.5 block text-sm font-bold">{c.name}</span>
            <span className="block text-[10px] leading-4 text-white/75">{c.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
