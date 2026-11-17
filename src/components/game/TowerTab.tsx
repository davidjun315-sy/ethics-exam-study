"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Coins as CoinIcon, Crown, Flame, Gem, Lightbulb, Shield, Swords, Ticket, Timer, Trophy } from "lucide-react";
import type { GameState } from "@/lib/game/data";
import type { RunView, TowerAnswerResult, TowerHint, TowerOverview } from "@/lib/game/tower-data";
import { EPIC_TICKET_FLOOR, floorCoins, isBossFloor, QUICK_SEC, TOWER_TEAM_SIZE } from "@/lib/game/tower";
import { slotOf, towerSlotFor, type ArtSlotKey } from "@/lib/game/art-slots";
import { quizApi } from "@/lib/quiz/client";
import { PracticeInput, type PublicPractice } from "@/components/quiz/PracticeParts";
import { SolutionView } from "@/components/quiz/SolutionView";
import { byStrength } from "./GameApp";
import { PhilosopherCard } from "./PhilosopherCard";
import { STRIKE_DURATION, STRIKE_IMPACT, TowerArena, type Strike } from "./TowerArena";

const RARITY_KO = { common: "일반", rare: "희귀", epic: "영웅", legendary: "전설" } as const;
const RARITY_TONE = { common: "text-[#5d6673]", rare: "text-[#2a6fd6]", epic: "text-[#7b3fe4]", legendary: "text-[#b9780f]" } as const;

/** 칸 그림 (올린 그림 → 없으면 기본 그라데이션) */
function artBg(art: GameState["settings"]["art"], key: ArtSlotKey): React.CSSProperties {
  const url = art?.[key];
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" } : { background: slotOf(key).fallback };
}

/** 배틀 아레나 › 사상의 탑: 기출 퀴즈로 오르는 탑 (판정 · 보상은 서버) */
export function TowerTab({ state, reload, goDraw }: { state: GameState; reload: () => Promise<GameState>; goDraw: () => void }) {
  const [ov, setOv] = useState<TowerOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<RunView | null>(null);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    quizApi<TowerOverview>("/api/game/tower")
      .then((v) => {
        if (!alive) return;
        setOv(v);
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
  if (ended)
    return (
      <TowerResult
        run={ended}
        ov={ov}
        art={state.settings.art}
        onBack={() => {
          setEnded(null);
          load();
          reload();
        }}
      />
    );
  if (ov.run)
    return (
      <TowerRun
        initial={ov.run}
        art={state.settings.art}
        onEnd={(r) => {
          setEnded(r);
          load();
        }}
      />
    );
  return <TowerLobby ov={ov} state={state} goDraw={goDraw} onStart={(run) => setOv({ ...ov, run })} />;
}

// ---------------------------------------------------------------------
// 입구
// ---------------------------------------------------------------------
function TowerLobby({ ov, state, goDraw, onStart }: { ov: TowerOverview; state: GameState; goDraw: () => void; onStart: (r: RunView) => void }) {
  const owned = useMemo(() => [...state.owned].sort(byStrength), [state.owned]);
  const [team, setTeam] = useState<string[]>(() => {
    const deck = state.deck.filter((id) => owned.some((o) => o.cardId === id));
    return (deck.length ? deck : owned.map((o) => o.cardId)).slice(0, TOWER_TEAM_SIZE);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const left = Math.max(0, ov.tries.max - ov.tries.used);
  const atk = team.reduce((s, id) => s + (owned.find((o) => o.cardId === id)?.atk ?? 0), 0);

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "start", cardIds: team });
      onStart(r.run);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const toggle = (id: string) => setTeam((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= TOWER_TEAM_SIZE ? [...t.slice(1), id] : [...t, id]));

  return (
    <div className="space-y-4" data-tower-lobby>
      {/* 입구 배너 */}
      <section className="relative overflow-hidden rounded-2xl border border-line text-white shadow-soft">
        <div className="absolute inset-0" style={artBg(state.settings.art, "tower-lobby")} aria-hidden />
        {!state.settings.art?.["tower-lobby"] && <TowerSilhouette />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-transparent" aria-hidden />
        <div className="relative px-5 py-6 sm:px-7 sm:py-8">
          <p className="text-[11px] font-bold tracking-[0.25em] text-white/70">THE TOWER OF THOUGHT</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight drop-shadow sm:text-4xl">사상의 탑</h2>
          <p className="mt-1 max-w-[70%] text-sm text-white/85 sm:max-w-md">층마다 기다리는 사상가의 기출을 풀어 쓰러뜨리세요. 올라갈수록 문제는 어려워지고 적은 강해집니다.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <Chip icon={<Crown className="h-3.5 w-3.5" />} text={`최고 ${ov.best}층`} />
            <Chip icon={<Trophy className="h-3.5 w-3.5" />} text={`이번 주 ${ov.weeklyBest}층`} />
            <Chip icon={<Swords className="h-3.5 w-3.5" />} text={`오늘 도전 ${left}/${ov.tries.max}${ov.tries.attendBonus ? " (출석 +1)" : ""}`} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* 팀 고르기 */}
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
            <div className="grid max-h-[30rem] grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4" aria-label="보유 카드">
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
          {msg && <p className="text-sm text-danger" role="alert">{msg}</p>}
          <button type="button" className="btn-primary w-full py-3 text-base font-bold" disabled={busy || !team.length || left <= 0} onClick={start} data-tower-start>
            {busy ? "탑 문을 여는 중…" : left <= 0 ? "오늘 도전을 모두 썼어요" : "탑 오르기"}
          </button>
          <p className="text-center text-[11px] text-faint">하루 {ov.tries.max - (ov.tries.attendBonus ? 1 : 0)}번 · 그날 출석하면 1번 더 · 그만둬도 깬 층 보상은 남아요</p>
        </section>

        {/* 층 안내 · 보상 */}
        <section className="card space-y-3 p-4">
          <h3 className="font-bold">탑의 구간</h3>
          <ol className="space-y-1.5">
            {([4, 3, 2, 1] as const).map((t) => {
              const ti = ov.tiers[t];
              const reached = ov.best >= (t - 1) * 10 + 1;
              return (
                <li key={t} className={`flex items-center gap-3 rounded-xl border p-2.5 ${reached ? "border-navy/25 bg-navy-soft/40" : "border-line"}`}>
                  <span className="w-14 shrink-0 text-center text-[11px] font-bold text-muted">{ti.floors}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{ti.name}</span>
                    <span className="block truncate text-[11px] text-muted">{ti.questions}</span>
                  </span>
                  <span className={`shrink-0 text-[11px] font-bold ${RARITY_TONE[ti.enemy]}`}>{RARITY_KO[ti.enemy]} 적</span>
                </li>
              );
            })}
          </ol>
          <ul className="space-y-1 rounded-xl bg-surface-2 p-3 text-[12px] leading-5">
            <li className="flex gap-2"><CoinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />층을 깰 때마다 코인 (1층 {floorCoins(1)} → 보스층 3배)</li>
            <li className="flex gap-2"><Gem className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy" />10층마다 보스 · 강화석 (10층 1개, 20층 2개 …)</li>
            <li className="flex gap-2">
              <Ticket className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7b3fe4]" />
              처음 {EPIC_TICKET_FLOOR}층을 깨면 영웅 확정 뽑기권{ov.epicTicketGiven ? " (받음 ✓)" : ""}
            </li>
            <li className="flex gap-2"><Crown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#c99a2e]" />칭호: 탑의 순례자(10층) · 탑의 현자(30층) · 탑의 정복자(50층)</li>
            <li className="flex gap-2"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />맞힌 문제는 윤리 퀴즈 기록 · 경험치 · 사상가 정복에도 반영돼요</li>
          </ul>
          {!ov.essayOk && <p className="text-[11px] text-faint">지금은 AI 채점을 쓸 수 없어 31층부터도 서술형 없이 진행됩니다.</p>}
        </section>
      </div>

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
          <ol className="grid gap-1 sm:grid-cols-2 sm:gap-x-4">
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

/** 기본 입구 그림: 겹겹이 쌓인 탑 실루엣 (그림을 올리면 그림이 대신) */
function TowerSilhouette() {
  return (
    <div className="pointer-events-none absolute inset-y-0 -right-6 flex w-36 origin-bottom scale-75 flex-col items-center justify-end opacity-70 sm:right-[12%] sm:w-52 sm:scale-100 sm:opacity-100" aria-hidden>
      <div className="tower-glow absolute bottom-0 h-full w-full rounded-full bg-[radial-gradient(closest-side,rgba(255,222,160,.45),transparent)]" />
      <div className="h-6 w-1 bg-[#f6dc8f]/80" />
      <div className="h-0 w-0 border-x-[22px] border-b-[30px] border-x-transparent border-b-[#141a36]" />
      {[44, 56, 68, 80, 94].map((w, i) => (
        <div key={w} className="relative flex items-center justify-center gap-1.5 border-x border-t border-white/10 bg-[#141a36]" style={{ width: w, height: 26 + i * 2 }}>
          {Array.from({ length: 2 + i }, (_, k) => (
            <span key={k} className="tower-window h-2.5 w-1.5 rounded-t-full bg-[#ffd98a]" style={{ animationDelay: `${(i * 3 + k) * 0.37}s` }} />
          ))}
        </div>
      ))}
      <div className="h-3 w-32 rounded-t-md bg-[#0e1328] sm:w-40" />
    </div>
  );
}

// ---------------------------------------------------------------------
// 오르는 중
// ---------------------------------------------------------------------
function TowerRun({ initial, art, onEnd }: { initial: RunView; art: GameState["settings"]["art"]; onEnd: (r: RunView) => void }) {
  const [run, setRun] = useState(initial);
  const [outcome, setOutcome] = useState<TowerAnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [picks, setPicks] = useState<number[]>([]);
  const [assign, setAssign] = useState<(number | null)[]>([]);
  const [strike, setStrike] = useState<Strike | null>(null);
  // 체력바는 맞는 순간에 바뀜 (연출보다 먼저 줄지 않게)
  const [shown, setShown] = useState(initial.state);
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
      setRun((old) => ({ ...r.run, item: old.item })); // 해설을 보는 동안 문제는 그대로
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
    if (r.status !== "active") return onEnd(r);
    setRun(r);
    setShown(r.state);
    setStrike(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function choose(buff: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await quizApi<{ run: RunView }>("/api/game/tower", "POST", { action: "buff", runId: run.id, buff });
      setOutcome(null);
      setAnswer("");
      setPicks([]);
      setAssign([]);
      if (r.run.status !== "active") return onEnd(r.run);
      setRun(r.run);
      setShown(r.run.state);
      setStrike(null);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
  async function quit() {
    if (!confirm("이번 도전을 그만둘까요? 깬 층의 보상은 그대로 남아요.")) return;
    setBusy(true);
    try {
      await quizApi("/api/game/tower", "POST", { action: "quit", runId: run.id });
      onEnd({ ...run, status: "quit" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const s = run.state;
  const floorDone = run.choices && !outcome; // 강화 고르기 (새로고침 후 이어서)
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
              <button type="button" onClick={quit} disabled={busy} className="rounded-full border border-white/30 px-2.5 py-1 text-xs text-white/85 hover:bg-white/10">
                그만두기
              </button>
            </div>
          </div>

          <TowerArena team={run.team} enemy={run.enemy} state={shown} boss={boss} strike={strike} enemyDown={Boolean(outcome?.floorCleared || floorDone)} teamDown={Boolean(outcome?.dead)} />

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
          {run.enemy?.quote && !outcome && !floorDone && <p className="truncate text-center text-[11px] italic text-white/70">“{run.enemy.quote}”</p>}
        </div>
      </section>

      {err && <p className="card p-3 text-sm text-danger" role="alert">{err}</p>}

      {floorDone ? (
        <BuffPick run={run} busy={busy} onChoose={choose} />
      ) : outcome ? (
        <OutcomeCard r={outcome} kind={item?.kind ?? "exam"} showSol={showSol} setShowSol={setShowSol} onNext={outcome.floorCleared && outcome.run.choices ? null : next} onChoose={choose} busy={busy} />
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
  onChoose,
  busy,
}: {
  r: TowerAnswerResult;
  kind: "exam" | "expected" | "practice";
  showSol: boolean;
  setShowSol: (v: boolean) => void;
  onNext: (() => void) | null;
  onChoose: (b: string) => void;
  busy: boolean;
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
      {r.floorCleared && r.run.choices ? (
        <BuffPick run={r.run} busy={busy} onChoose={onChoose} reward={r.reward} />
      ) : (
        onNext && (
          <button type="button" className="btn-primary w-full py-3 text-base font-bold" onClick={onNext} data-tower-next>
            {r.dead || r.run.status !== "active" ? "결과 보기" : "다음 문제"}
          </button>
        )
      )}
    </div>
  );
}

function BuffPick({ run, busy, onChoose, reward }: { run: RunView; busy: boolean; onChoose: (b: string) => void; reward?: TowerAnswerResult["reward"] }) {
  return (
    <section className="card space-y-3 p-4 text-center" data-tower-buffs>
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-muted">FLOOR CLEAR</p>
        <h3 className="text-xl font-black">{run.state.floor}층 돌파!</h3>
        {reward && (
          <p className="mt-1 text-sm">
            <CoinIcon className="inline h-4 w-4 text-warn" /> +{reward.coins}
            {reward.stones > 0 && <> · 강화석 +{reward.stones}</>}
            {reward.ticket && <b className="ml-1 text-[#7b3fe4]">· 🎟 영웅 확정 뽑기권!</b>}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">다음 층으로 가기 전에 하나를 고르세요.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {(run.choices ?? []).map((c) => (
          <button key={c.id} type="button" disabled={busy} onClick={() => onChoose(c.id)} className="group rounded-2xl border-2 border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-navy/50 disabled:opacity-50" data-buff={c.id}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-soft text-navy">
              {c.id === "heal" ? <Flame className="h-5 w-5" /> : c.id === "power" ? <Swords className="h-5 w-5" /> : c.id === "shield" ? <Shield className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
            </span>
            <span className="mt-2 block font-bold">{c.name}</span>
            <span className="block text-xs text-muted">{c.desc}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// 결과
// ---------------------------------------------------------------------
function TowerResult({ run, ov, art, onBack }: { run: RunView; ov: TowerOverview; art: GameState["settings"]["art"]; onBack: () => void }) {
  const newBest = run.cleared > 0 && run.cleared >= ov.best;
  return (
    <section className="card overflow-hidden" data-tower-result>
      <div className="relative h-32 sm:h-40" style={artBg(art, "tower-result")}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-3 left-4 text-white">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white/75">{run.status === "quit" ? "도전 종료" : "도전 끝"}</p>
          <h3 className="text-3xl font-black drop-shadow">{run.cleared}층까지 올랐어요</h3>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {newBest && <p className="rounded-lg bg-[#ffd36b]/20 px-3 py-2 text-sm font-semibold text-[#8a5a00] dark:text-[#ffd36b]">🏆 최고 기록! {run.cleared}층</p>}
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-[11px] text-muted">맞힌 문제</dt>
            <dd className="text-xl font-black">
              {run.state.correct}
              <span className="text-xs font-semibold text-muted">/{run.state.answered}</span>
            </dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-[11px] text-muted">받은 코인</dt>
            <dd className="text-xl font-black">{run.coins}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-[11px] text-muted">강화석</dt>
            <dd className="text-xl font-black">{run.stones}</dd>
          </div>
        </dl>
        <p className="text-center text-xs text-muted">틀린 문제는 윤리 퀴즈 &apos;오답 학습&apos;에서 다시 볼 수 있어요.</p>
        <button type="button" className="btn-primary w-full py-3 font-bold" onClick={onBack} data-tower-back>
          탑 입구로
        </button>
      </div>
    </section>
  );
}
