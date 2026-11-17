"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coins as CoinIcon, Crown, Flame, Gem, Lightbulb, Shield, Sparkles, Swords, Timer, Trophy } from "lucide-react";
import type { GameState } from "@/lib/game/data";
import type { RunView, TowerAnswerResult, TowerHint, TowerOverview } from "@/lib/game/tower-data";
import { isBossFloor, TIER_START, tierOpen, tierRewards, TOWER_TEAM_SIZE, type TowerTier } from "@/lib/game/tower";
import { slotOf, towerKindSlot, towerSlotFor, type ArtSlotKey } from "@/lib/game/art-slots";
import { quizApi } from "@/lib/quiz/client";
import { PracticeInput, type PublicPractice } from "@/components/quiz/PracticeParts";
import { SolutionView } from "@/components/quiz/SolutionView";
import { byStrength } from "./GameApp";
import { PhilosopherCard } from "./PhilosopherCard";
import { TowerArena, type ArenaFloat, type Strike } from "./TowerArena";
import { toSteps } from "./towerPlayback";
import { ROLE_NAMES, ROLE_PASSIVE_DESC, ROLE_SKILL, type BattleEvent } from "@/lib/game/tower-battle";
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
        // 문제를 풀던 중 · 필살기 선택 · 이벤트 · 일반 층 강화 고르기 중에 다시 들어왔으면 게임 화면으로
        if (v.run && showsGame(v.run)) setView("game");
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
      // 일반 층이면 바로 다음 문제 (게임 화면), 보스층을 깬 뒤면 탑 화면에서 입장
      if (showsGame(n.run)) return onEnter(n.run);
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
              {run ? (run.choices ? (run.clearedKind === "boss" ? `👑 ${s!.floor}층 보스 돌파!` : `${s!.floor}층 돌파!`) : run.cleared > 0 ? `${run.cleared}층 돌파 → ${s!.floor}층` : `${s!.floor}층 앞`) : "사상의 탑"}
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
                    <Tag icon={<Sparkles className="h-3 w-3" />} text={`사유력 ${run.battle.focus}/${run.battle.focusMax}`} tone="bg-white/20" />
                    {run.battle.relics.map((r) => (
                      <Tag key={r.id} icon={<span>{r.icon}</span>} text={r.count > 1 ? `${r.name} ×${r.count}` : r.name} tone="bg-[#6a35d8]/45" />
                    ))}
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
                <ChoicePanel run={run} busy={busy} onChoose={(b) => choose(run, b)} tone="dark" />
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
          {team.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[11px]" data-tower-team-roles>
              {team.map((id) => {
                const o = owned.find((x) => x.cardId === id);
                if (!o) return null;
                return (
                  <span key={id} className="rounded-full border border-line bg-surface-2 px-2 py-0.5">
                    <b style={{ color: ROLE_TONE[o.skillEffect] }}>{ROLE_NAMES[o.skillEffect]}</b> {o.name} · {ROLE_PASSIVE_DESC[o.skillEffect]}
                  </span>
                );
              })}
            </div>
          )}
          <p className="text-[11px] leading-4 text-muted">정답 +2 · 부분 정답 +1 사유력(최대 6) → 답을 낸 뒤 필살기를 쓸지 고릅니다. 역할마다 효과 · 필살기가 달라요. 10층마다 보스는 몇 턴 뒤 행동을 미리 보여 줍니다.</p>
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
                    <span className="mt-1 block truncate text-center text-[10px] font-bold" style={{ color: ROLE_TONE[o.skillEffect] }} title={`${ROLE_PASSIVE_DESC[o.skillEffect]} · 필살기 ${ROLE_SKILL[o.skillEffect].title} (사유력 ${ROLE_SKILL[o.skillEffect].cost})`} data-tower-role>
                      {ROLE_NAMES[o.skillEffect]} · {ROLE_SKILL[o.skillEffect].title}
                    </span>
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
type Shown = { hp: number; maxHp: number; enemyHp: number; enemyMax: number; shield: number; bossShield: number; focus: number; combo: number };
const fromRun = (r: RunView): Shown => ({ hp: r.state.hp, maxHp: r.state.maxHp, enemyHp: r.state.enemyHp, enemyMax: r.state.enemyMax, shield: r.battle.shield, bossShield: r.battle.bossShield, focus: r.battle.focus, combo: r.state.combo });
const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
type ItemKind = "exam" | "expected" | "practice";

/** 게임 화면에서 이 상태면 탑 화면으로 (보스층을 깬 뒤 · 새 층 입장 전 · 끝남) */
export const showsGame = (r: RunView) => r.status === "active" && (r.phase === "battle" || r.phase === "skill" || r.phase === "event" || (r.phase === "choice" && r.clearedKind !== "boss"));

function TowerGame({ run, setRun, art, onBack }: { run: RunView; setRun: (r: RunView) => void; art: GameState["settings"]["art"]; onBack: (r: RunView) => void }) {
  const [outcome, setOutcome] = useState<{ r: TowerAnswerResult; kind: ItemKind; turn: TowerAnswerResult | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [picks, setPicks] = useState<number[]>([]);
  const [assign, setAssign] = useState<(number | null)[]>([]);
  const [strike, setStrike] = useState<Strike | null>(null);
  const [floats, setFloats] = useState<ArenaFloat[]>([]);
  // 연출 중에는 서버 결과가 아니라 '맞는 순간'의 상태를 보여 줌 (null = 지금 도전 상태)
  const [shown, setShown] = useState<Shown | null>(null);
  const [playing, setPlaying] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showSol, setShowSol] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const endRef = useRef<(() => void) | null>(null);
  const item = run.item;
  const practice = (item?.practice ?? null) as PublicPractice | null;
  const picking = practice && practice.mode !== "fill" ? practice : null;
  const ready = picking ? (picking.mode === "classify" ? (picking.statements ?? []).every((_, i) => assign[i] !== null && assign[i] !== undefined) : picks.length > 0) : answer.trim().length > 0;
  const disp = shown ?? fromRun(run);
  const asking = !outcome && run.phase === "battle" && Boolean(item) && !playing && moving === null;

  // 빠른 정답 시계 (서버가 문제를 낸 시각 기준 · 판정은 서버)
  useEffect(() => {
    if (!item || item.essay || !asking) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [item, asking]);
  const leftMs = item && now ? new Date(item.servedAt).getTime() + run.battle.quickSec * 1000 - now : null;
  // 시작하면 무대가 보이게
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  /** 서버가 정한 사건을 순서대로 재생 (체력 · 보호막 · 사유력은 맞는 순간에 바뀜) */
  function play(events: BattleEvent[], before: RunView, done?: () => void) {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    const steps = toSteps(events, { reduced: reducedMotion(), teamSize: run.team.length });
    const end = () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
      endRef.current = null;
      setStrike(null);
      setFloats([]);
      setShown(null);
      setPlaying(false);
      done?.();
    };
    if (!steps.length) return end();
    endRef.current = end;
    setPlaying(true);
    setShown(fromRun(before));
    let t = 0;
    for (const st of steps) {
      timers.current.push(
        window.setTimeout(() => {
          if (st.strike) setStrike(st.strike);
          if (st.float) setFloats((f) => [...f.slice(-3), st.float!]);
        }, t),
      );
      timers.current.push(window.setTimeout(() => setShown((cur) => ({ ...(cur ?? fromRun(before)), ...st.snap })), t + st.impact));
      t += st.dur;
    }
    timers.current.push(window.setTimeout(end, t + 120));
  }
  const skip = () => endRef.current?.();

  const call = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const showArena = () => {
    const arena = topRef.current;
    const visible = arena ? arena.getBoundingClientRect().top > -40 : true;
    if (!visible) arena?.scrollIntoView({ behavior: "smooth", block: "start" });
    return visible ? 0 : 320;
  };

  const submit = () =>
    call(async () => {
      if (!item) return;
      const payload = picking ? (picking.mode === "classify" ? JSON.stringify(assign.map((x) => x ?? -1)) : picking.mode === "choice" ? String(picks[0]) : JSON.stringify(picks)) : answer;
      const r = await quizApi<TowerAnswerResult>("/api/game/tower", "POST", { action: "answer", runId: run.id, itemId: item.id, answer: payload });
      const before = run;
      setOutcome({ r, kind: item.kind, turn: null });
      setShowSol(r.verdict !== "correct");
      setShown(fromRun(before));
      setRun(r.run);
      const wait = showArena();
      timers.current.push(window.setTimeout(() => play(r.events, before), wait));
    });
  /** 필살기 쓰기 (팀 순서) 또는 넘기기 (null) */
  const resolve = (skill: number | null) =>
    call(async () => {
      const turn = run.battle.pending?.turn ?? 0;
      const r = await quizApi<TowerAnswerResult>("/api/game/tower", "POST", { action: "resolve", runId: run.id, turn, skill });
      const before = run;
      setOutcome((o) => (o ? { ...o, turn: r } : o));
      setRun(r.run);
      const wait = showArena();
      timers.current.push(window.setTimeout(() => play(r.events, before), wait));
    });
  const reset = () => {
    setOutcome(null);
    setAnswer("");
    setPicks([]);
    setAssign([]);
    setShowSol(false);
    setShown(null);
    setStrike(null);
  };
  function next() {
    reset();
    if (run.status !== "active") return onBack(run);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  /** 다음 층으로 걸어 올라가는 연출 뒤 새 층 */
  const climbTo = (r: RunView) => {
    if (r.status !== "active" || r.awaiting) return onBack(r);
    reset();
    setMoving(r.state.floor);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    timers.current.push(
      window.setTimeout(
        () => {
          setMoving(null);
          setRun(r);
        },
        reducedMotion() ? 250 : 950,
      ),
    );
  };
  const choose = (id: string) =>
    call(async () => {
      const n = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "buff", runId: run.id, buff: id });
      climbTo(n.run);
    });
  const pickEvent = (option: string) =>
    call(async () => {
      const n = await quizApi<{ run: RunView; text: string }>("/api/game/tower", "POST", { action: "event", runId: run.id, option });
      setNote(n.text);
      timers.current.push(window.setTimeout(() => setNote(null), 2600));
      if (n.run.state.floor === run.state.floor) {
        // 특수 전투: 같은 층에서 싸움
        reset();
        setRun(n.run);
      } else climbTo(n.run);
    });
  const hint = () =>
    call(async () => {
      const r = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "hint", runId: run.id });
      setRun(r.run);
    });

  const s = run.state;
  const bt = run.battle;
  const boss = isBossFloor(s.floor);
  const elite = bt.kind === "elite";
  const enemyDown = run.phase === "choice" && (!playing || Boolean(strike?.cleared));
  const teamDown = run.status === "over" && s.hp <= 0 && (!playing || Boolean(strike?.dead));

  let panel: React.ReactNode = null;
  let footer = false;
  if (playing)
    panel = (
      <button type="button" className="btn w-full py-2.5 text-sm" onClick={skip} data-tower-skip>
        ⏩ 연출 건너뛰기
      </button>
    );
  else if (run.phase === "skill") panel = <SkillBar run={run} busy={busy} onUse={resolve} />;
  else if (run.phase === "choice" && run.clearedKind === "boss") {
    footer = true;
    panel = (
      <button type="button" className="w-full rounded-xl bg-gradient-to-r from-[#ffd36b] to-[#ffb36b] py-3.5 text-base font-black text-[#3a2600] shadow-lg" onClick={() => onBack(run)} data-tower-next>
        👑 보스 돌파! 탑으로 돌아가 유물 고르기
      </button>
    );
  }
  else if (run.phase === "choice") panel = <ChoicePanel run={run} busy={busy} onChoose={choose} tone="light" />;
  else if (run.phase === "event") panel = <EventPanel run={run} busy={busy} onPick={pickEvent} />;
  else if (run.status !== "active") {
    footer = true;
    panel = (
      <button type="button" className="btn-primary w-full py-3 text-base font-bold" onClick={() => onBack(run)} data-tower-next>
        탑으로 돌아가기
      </button>
    );
  } else if (outcome) {
    footer = true;
    panel = (
      <button type="button" className="btn-primary w-full py-3 text-base font-bold" onClick={next} data-tower-next>
        다음 문제
      </button>
    );
  }

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-3" data-tower-run data-phase={playing ? "playing" : run.phase}>
      {/* 무대 */}
      <section className="relative overflow-hidden rounded-2xl border border-line text-white shadow-soft">
        <div className="absolute inset-0 scale-105" style={artBg(art, towerSlotFor(s.floor))} aria-hidden />
        <div className={`absolute inset-0 ${boss ? "bg-gradient-to-b from-[#3a0b16]/55 via-black/35 to-black/70" : elite ? "bg-gradient-to-b from-[#2a1450]/55 via-black/35 to-black/70" : "bg-gradient-to-b from-black/35 via-black/25 to-black/65"}`} aria-hidden />
        <div className="relative space-y-2.5 p-3 sm:space-y-3 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] text-white/70">{run.tier.name}</p>
              <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
                {s.floor}층
                {boss && <span className="rounded-full bg-[#ff6b5a] px-2 py-0.5 text-[11px] font-black tracking-wider">BOSS</span>}
                {elite && <span className="rounded-full bg-[#8a4dff] px-2 py-0.5 text-[11px] font-black tracking-wider">특수 전투</span>}
                {run.phase === "event" && <span className="rounded-full bg-[#2f9e6b] px-2 py-0.5 text-[11px] font-black tracking-wider">이벤트</span>}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">
                깬 층 {run.cleared} · <CoinIcon className="inline h-3 w-3" /> {run.coins}
              </span>
              <button type="button" onClick={() => onBack(run)} disabled={busy || playing} className="rounded-full border border-white/30 px-2.5 py-1 text-xs text-white/85 hover:bg-white/10" data-tower-back>
                ← 탑
              </button>
            </div>
          </div>

          <TowerArena
            team={run.team}
            enemy={run.phase === "event" ? null : run.enemy}
            state={{ ...s, hp: disp.hp, enemyHp: disp.enemyHp }}
            boss={boss}
            strike={strike}
            enemyDown={enemyDown}
            teamDown={teamDown}
            floats={floats}
            teamShield={disp.shield}
            bossShield={disp.bossShield}
            enraged={bt.enraged}
            elite={elite}
            sealed={bt.sealed > 0}
            moving={moving}
          />

          {run.phase !== "event" && (
            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              <TeamHud run={run} d={disp} />
              <BossHud run={run} d={disp} />
            </div>
          )}
          <RoleStrip run={run} focus={disp.focus} />
          {note && <p className="rise-in rounded-lg bg-black/45 px-3 py-1.5 text-center text-sm font-bold text-[#ffe9a8]">{note}</p>}
          {run.enemy?.quote && asking && run.phase === "battle" && <p className="truncate text-center text-[11px] italic text-white/70">“{run.enemy.quote}”</p>}
        </div>
      </section>

      {err && (
        <p className="card p-3 text-sm text-danger" role="alert">
          {err}
        </p>
      )}

      {/* 고를 것 (필살기 · 층 사이 선택 · 이벤트 · 연출 건너뛰기)은 해설보다 위에 */}
      {panel && !footer && <div className={busy ? "pointer-events-none opacity-70" : ""}>{panel}</div>}

      {outcome && <OutcomeCard r={outcome.r} turn={outcome.turn} kind={outcome.kind} showSol={showSol} setShowSol={setShowSol} />}

      {asking && item ? (
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
      ) : !outcome && run.phase === "skill" ? (
        <p className="card p-3 text-center text-sm text-muted">답을 냈어요. 필살기를 쓰거나 넘기면 적이 움직입니다.</p>
      ) : !outcome && run.phase === "battle" && !moving ? (
        <p className="card p-6 text-center text-sm text-muted">다음 문제를 준비하는 중…</p>
      ) : null}

      {/* 다음으로 (다음 문제 · 탑으로)는 해설 아래 */}
      {panel && footer && <div className={busy ? "pointer-events-none opacity-70" : ""}>{panel}</div>}
    </div>
  );
}

/** 사유력 칸 */
function FocusPips({ n, max }: { n: number; max: number }) {
  return (
    <div className="flex items-center gap-1" role="meter" aria-label="사유력" aria-valuenow={n} aria-valuemin={0} aria-valuemax={max} data-tower-focus={n}>
      <Sparkles className="h-3 w-3 text-[#ffd36b]" aria-hidden />
      {Array.from({ length: max }, (_, i) => (
        <span key={`${i}-${i < n}`} className={`tower2-pip h-2.5 w-2.5 rounded-sm ring-1 ring-white/30 sm:h-3 sm:w-3 ${i < n ? "tower2-pip-on tower2-pip-gain" : "bg-black/40"}`} />
      ))}
      <span className="ml-0.5 text-[10px] font-bold tabular-nums text-white/85">{n}/{max}</span>
    </div>
  );
}

function TeamHud({ run, d }: { run: RunView; d: Shown }) {
  const s = run.state;
  const bt = run.battle;
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1" data-tower-teamhud>
      <Bar value={d.hp} max={d.maxHp} tone="team" label="내 팀" extra={d.shield} />
      <FocusPips n={d.focus} max={bt.focusMax} />
      <div className="flex flex-wrap gap-1 text-[10px] font-semibold">
        {d.combo > 1 && <Tag icon={<Flame className="h-3 w-3" />} text={`${d.combo}콤보`} tone="bg-[#ff8a3d]/80" />}
        {d.shield > 0 && <Tag icon={<Shield className="h-3 w-3" />} text={`보호막 ${d.shield}`} tone="bg-[#3b7dd8]/70" />}
        {s.buffs.power > 0 && <Tag icon={<Swords className="h-3 w-3" />} text={`피해 +${Math.round(s.buffs.power * 100)}%`} tone="bg-white/20" />}
        {s.buffs.shield > 0 && <Tag icon={<Shield className="h-3 w-3" />} text={`반론 대비 ${s.buffs.shield}`} tone="bg-white/20" />}
        {s.buffs.hints > 0 && <Tag icon={<Lightbulb className="h-3 w-3" />} text={`힌트 ${s.buffs.hints}`} tone="bg-white/20" />}
        {bt.halfNext && <Tag icon={<Shield className="h-3 w-3" />} text="다음 공격 절반" tone="bg-[#3b7dd8]/70" />}
      </div>
      {bt.relics.length > 0 && (
        <div className="relative">
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-wrap items-center gap-0.5 rounded-lg bg-black/30 px-1.5 py-0.5 text-sm" aria-expanded={open} aria-label="유물 보기" data-tower-relics>
            {bt.relics.map((r) => (
              <span key={r.id} title={`${r.name} — ${r.desc}`}>
                {r.icon}
                {r.count > 1 && <sub className="text-[9px] font-black">{r.count}</sub>}
              </span>
            ))}
          </button>
          {open && (
            <ul className="absolute left-0 top-full z-50 mt-1 w-64 space-y-1 rounded-xl border border-white/20 bg-[#111626]/95 p-2 text-[11px] shadow-xl backdrop-blur">
              {bt.relics.map((r) => (
                <li key={r.id}>
                  <b>
                    {r.icon} {r.name}
                    {r.max > 1 ? ` ${r.count}/${r.max}` : ""}
                  </b>
                  <span className="block text-white/70">{r.desc}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BossHud({ run, d }: { run: RunView; d: Shown }) {
  const bt = run.battle;
  const special = bt.kind !== "normal";
  const hot = bt.gauge <= 1 && bt.intent === "강타";
  return (
    <div className="space-y-1 text-right" data-tower-bosshud>
      <Bar value={d.enemyHp} max={d.enemyMax} tone="enemy" label={run.enemy?.name ?? "적"} extra={d.bossShield} marks={special ? [0.6, 0.25] : []} />
      <div className="text-xs font-bold drop-shadow">
        {run.enemy?.name ?? "수수께끼의 사상가"}
        {run.enemy && <span className="ml-1 text-[10px] font-semibold text-white/75">{RARITY_KO[run.enemy.rarity]}</span>}
        {special && <span className="ml-1 rounded bg-white/15 px-1 text-[10px] font-semibold">{bt.patternName}</span>}
      </div>
      {special && (
        <div className="flex items-center justify-end gap-1 text-[10px] font-bold" aria-label={`${bt.phase}단계`}>
          {[1, 2, 3].map((p) => (
            <span key={p} className={`rounded px-1 ${p === bt.phase ? (p === 3 ? "bg-[#ff6b5a] text-white" : "bg-[#ffd36b] text-[#3a2600]") : p < bt.phase ? "bg-white/30" : "bg-black/30 text-white/50"}`}>
              {p}단계
            </span>
          ))}
        </div>
      )}
      {bt.intentText && (
        <div className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${hot ? "tower2-intent-hot bg-[#b3122a]/85" : "bg-black/40"}`} title={bt.patternDesc} data-tower-intent>
          <span>{bt.intent === "강타" ? "⚔" : bt.intent === "방벽" ? "🛡" : bt.intent === "회복" ? "💚" : "🔮"}</span>
          {bt.intentText}
          <span className="ml-0.5 flex gap-0.5">
            {Array.from({ length: bt.interval }, (_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < bt.interval - bt.gauge ? "bg-[#ff9d8a]" : "bg-white/25"}`} />
            ))}
          </span>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-1 text-[10px] font-semibold">
        {d.bossShield > 0 && <Tag icon={<Shield className="h-3 w-3" />} text={`방벽 ${d.bossShield}`} tone="bg-[#3b7dd8]/70" />}
        {bt.weaken > 0 && <Tag icon={<Swords className="h-3 w-3" />} text={`약화 ${bt.weaken}턴`} tone="bg-[#6a35d8]/70" />}
        {bt.enraged && <Tag icon={<Flame className="h-3 w-3" />} text="폭주" tone="bg-[#b3122a]/80" />}
      </div>
    </div>
  );
}

const ROLE_TONE: Record<string, string> = { strike: "#ff7a6b", sweep: "#ffb05a", stun: "#c99bff", heal: "#6fe0a0", guard: "#7fc4ff" };

/** 팀 역할 · 필살기 준비 (늘 보임 · 누르면 설명) */
function RoleStrip({ run, focus }: { run: RunView; focus: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const r = open !== null ? run.battle.roles[open] : null;
  return (
    <div className="space-y-1" data-tower-roles>
      <div className="grid grid-cols-3 gap-1.5">
        {run.battle.roles.map((x) => {
          const readyNow = focus >= x.cost && run.battle.sealed <= 0;
          return (
            <button key={x.index} type="button" onClick={() => setOpen(open === x.index ? null : x.index)} className={`min-w-0 rounded-lg bg-black/35 px-1.5 py-1 text-left backdrop-blur-sm ${readyNow ? "tower2-ready" : ""}`} aria-expanded={open === x.index}>
              <span className="flex items-center gap-1 text-[10px] font-black" style={{ color: ROLE_TONE[x.effect] }}>
                {x.role}
                <span className="ml-auto rounded bg-black/40 px-1 text-[9px] text-[#ffe9a8]">✨{x.cost}</span>
              </span>
              <span className="block truncate text-[10px] font-semibold text-white/85">{x.name}</span>
            </button>
          );
        })}
      </div>
      {r && (
        <p className="rounded-lg bg-black/45 px-2.5 py-1.5 text-[11px] leading-4 text-white/85">
          <b style={{ color: ROLE_TONE[r.effect] }}>{r.role}</b> · 역할 효과: {r.passive}
          {r.unique && (
            <>
              <br />
              <b className="text-[#ffe9a8]">고유 「{r.unique.title}」</b> {r.unique.desc}
            </>
          )}
          <br />
          <b>필살기 {r.skillName}</b> (사유력 {r.cost}) — {r.skillDesc}
        </p>
      )}
    </div>
  );
}

/** 답을 낸 뒤 필살기 선택 (쓰기 · 넘기기) */
function SkillBar({ run, busy, onUse }: { run: RunView; busy: boolean; onUse: (i: number | null) => void }) {
  const bt = run.battle;
  return (
    <section className="card space-y-2 border-[#ffd36b]/50 p-3" data-tower-skillbar>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-black">필살기를 쓸까요?</h3>
        <span className="text-[11px] text-muted">
          사유력 {bt.focus}/{bt.focusMax}
          {bt.intentText ? ` · 적: ${bt.intentText}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {bt.roles.map((x) => (
          <button key={x.index} type="button" disabled={busy || Boolean(x.problem)} onClick={() => onUse(x.index)} title={x.skillDesc} className={`min-w-0 rounded-xl border p-2 text-left transition disabled:opacity-45 ${x.problem ? "border-line" : "tower2-ready border-[#ffd36b]/60 bg-[#ffd36b]/10 hover:-translate-y-0.5"}`} data-tower-skill={x.index}>
            <span className="flex items-center gap-1 text-[10px] font-black sm:text-[11px]" style={{ color: ROLE_TONE[x.effect] }}>
              <span className="truncate">{x.role}<span className="hidden sm:inline"> · {x.name}</span></span>
              <span className="ml-auto shrink-0 rounded bg-[#ffd36b]/25 px-1 text-[10px] text-[#8a5a00] dark:text-[#ffd36b]">✨{x.cost}</span>
            </span>
            <span className="mt-0.5 block truncate text-[13px] font-bold sm:text-sm">{x.skillName}</span>
            <span className="block text-[10px] leading-[14px] text-muted sm:text-[11px] sm:leading-4">{x.problem ?? x.skillDesc}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn w-full py-2.5 text-sm font-semibold" disabled={busy} onClick={() => onUse(null)} data-tower-skillskip>
        넘기기 (사유력 아끼기)
      </button>
    </section>
  );
}

/** 층을 깬 뒤 고르기 (기본 강화 + 유물) */
function ChoicePanel({ run, busy, onChoose, tone }: { run: RunView; busy: boolean; onChoose: (id: string) => void; tone: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <div className={dark ? "space-y-2" : "card space-y-2 p-3"} data-tower-buffs>
      <p className={`text-center text-xs ${dark ? "text-white/80" : "text-muted"}`}>
        {run.clearedKind === "boss" ? "👑 보스 돌파! 유물 하나를 고르세요" : `${run.state.floor}층 돌파! 다음 층(${run.state.floor + 1}층)으로 가기 전에 하나를 고르세요`}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {(run.choices ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={busy}
            onClick={() => onChoose(c.id)}
            className={`relative rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 disabled:opacity-50 ${c.kind === "relic" ? (dark ? "border-[#e6b8ff]/60 bg-[#6a35d8]/25" : "border-[#b37bff]/60 bg-[#b37bff]/10") : dark ? "border-white/25 bg-white/10 backdrop-blur-sm hover:bg-white/20" : "border-line bg-surface-2"}`}
            data-buff={c.id}
          >
            {c.kind === "relic" && <span className="absolute right-1.5 top-1.5 rounded bg-[#8a4dff] px-1 text-[9px] font-black text-white">유물</span>}
            <span className="text-xl leading-none">{c.icon}</span>
            <span className="mt-1 block text-sm font-bold leading-5">{c.name}</span>
            <span className={`block text-[10px] leading-4 ${dark ? "text-white/75" : "text-muted"}`}>{c.desc}</span>
            {c.kind === "relic" && (c.max ?? 1) > 1 && <span className={`mt-0.5 block text-[10px] font-bold ${dark ? "text-[#e6b8ff]" : "text-[#7b3fe4]"}`}>보유 {c.count ?? 0}/{c.max}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 이벤트 층 */
function EventPanel({ run, busy, onPick }: { run: RunView; busy: boolean; onPick: (id: string) => void }) {
  const e = run.battle.event;
  if (!e) return null;
  return (
    <section className="card space-y-2.5 p-4" data-tower-event={e.kind}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-3xl">{e.icon}</span>
        <div>
          <h3 className="text-lg font-black">{e.title}</h3>
          <p className="text-xs text-muted">{e.desc}</p>
        </div>
      </div>
      <div className="grid gap-2">
        {e.options.map((o) => (
          <button key={o.id} type="button" disabled={busy || Boolean(o.disabled)} onClick={() => onPick(o.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-45 ${o.id === "leave" ? "border-line" : "border-navy/30 bg-navy-soft/30 hover:-translate-y-0.5"}`} data-event-option={o.id}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{o.label}</span>
              {(o.desc || o.disabled) && <span className="block text-[11px] leading-4 text-muted">{o.disabled ?? o.desc}</span>}
            </span>
            {o.cost !== undefined && (
              <span className="shrink-0 rounded-full bg-[#ffd36b]/25 px-2 py-0.5 text-xs font-black text-[#8a5a00] dark:text-[#ffd36b]">
                <CoinIcon className="inline h-3 w-3" /> {o.cost}
              </span>
            )}
          </button>
        ))}
      </div>
      {e.kind === "merchant" && <p className="text-[10px] text-faint">값은 지갑 코인에서 빠집니다 (한 층에서 하나만).</p>}
    </section>
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

/** 체력 바 · extra = 보호막(방벽) 만큼 푸른 칸 · marks = 단계가 바뀌는 곳 (0~1) */
function Bar({ value, max, tone, label, extra = 0, marks = [] }: { value: number; max: number; tone: "team" | "enemy"; label: string; extra?: number; marks?: number[] }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const ext = Math.max(0, Math.min(100 - pct, (extra / Math.max(1, max)) * 100));
  const side = tone === "team" ? "left" : "right";
  return (
    <div role="meter" aria-label={`${label} 체력`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
        <div className={`absolute inset-y-0 rounded-full transition-[width] duration-500 ${tone === "team" ? "left-0 bg-gradient-to-r from-[#3ad19a] to-[#9ff2c9]" : "right-0 bg-gradient-to-l from-[#ff6b5a] to-[#ffb36b]"}`} style={{ width: `${pct}%` }} />
        {ext > 0 && <div className="absolute inset-y-0 bg-gradient-to-r from-[#7fc6ff] to-[#d6efff] transition-all duration-500" style={{ [side]: `${pct}%`, width: `${ext}%` }} />}
        {marks.map((m) => (
          <span key={m} className="absolute inset-y-0 w-px bg-white/70" style={{ [side]: `${m * 100}%` }} aria-hidden />
        ))}
      </div>
      <div className={`mt-0.5 text-[10px] font-semibold tabular-nums text-white/80 ${tone === "enemy" ? "text-right" : ""}`}>
        {value} / {max}
        {extra > 0 && <span className="text-[#bfe3ff]"> +{extra}</span>}
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

function OutcomeCard({ r, turn, kind, showSol, setShowSol }: { r: TowerAnswerResult; turn: TowerAnswerResult | null; kind: ItemKind; showSol: boolean; setShowSol: (v: boolean) => void }) {
  const v = r.verdict ?? "wrong";
  const last = turn ?? r;
  const cleared = r.floorCleared || Boolean(turn?.floorCleared);
  const dead = r.dead || Boolean(turn?.dead);
  const reward = turn?.reward ?? r.reward;
  const skill = turn?.events.find((e) => e.t === "skill");
  return (
    <div className="space-y-3" data-tower-outcome>
      <section className={`card overflow-hidden ${v === "correct" ? "border-ok/40" : v === "partial" ? "border-warn/40" : "border-danger/40"}`}>
        <div className={`flex items-center justify-between gap-3 px-4 py-3 ${v === "correct" ? "bg-ok-soft/70" : v === "partial" ? "bg-warn-soft/70" : "bg-danger-soft/70"}`}>
          <div>
            <p className={`text-lg font-black ${v === "correct" ? "text-ok" : v === "partial" ? "text-warn" : "text-danger"}`}>
              {v === "correct" ? (r.quick ? "정답! 빠른 일격" : "정답!") : v === "partial" ? "부분 정답" : "오답…"}
              <span className="ml-2 text-xs font-bold text-[#8a5a00] dark:text-[#ffd36b]">✨ +{v === "correct" ? 2 : v === "partial" ? 1 : 0}</span>
            </p>
            <p className="text-xs text-muted">
              {r.dealt ? `적에게 ${r.dealt} 피해` : r.shieldUsed ? "반론 대비로 공격을 막았어요" : r.taken ? `내 팀이 ${r.taken} 피해` : v === "wrong" ? "이번 턴 적의 패턴 공격이 오답 공격을 대신해요" : ""}
              {skill && skill.t === "skill" && ` · ${skill.title}${skill.dmg ? ` ${skill.dmg} 피해` : skill.heal ? ` +${skill.heal} 회복` : skill.shield ? ` 보호막 +${skill.shield}` : ""}`}
              {turn && turn.taken > 0 && ` · 적의 행동으로 ${turn.taken} 피해`}
              {r.attempt && r.attempt.xp > 0 && ` · +${r.attempt.xp} XP`}
              {r.attempt && r.attempt.coins > 0 && ` · +${r.attempt.coins} 코인`}
            </p>
          </div>
          {cleared && <span className="rounded-full bg-[#ffd36b] px-3 py-1 text-xs font-black text-[#3a2600]">{last.run.state.floor}층 돌파!</span>}
          {dead && <span className="rounded-full bg-danger px-3 py-1 text-xs font-black text-white">쓰러짐</span>}
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
      {cleared && reward && (
        <p className="rounded-xl bg-[#ffd36b]/15 px-3 py-2 text-center text-sm">
          <CoinIcon className="inline h-4 w-4 text-warn" /> +{reward.coins}
          {reward.stones > 0 && <> · 강화석 +{reward.stones}</>}
          {reward.ticket && <b className="ml-1 text-[#7b3fe4]">· 🎟 영웅 확정 뽑기권!</b>}
        </p>
      )}
    </div>
  );
}
