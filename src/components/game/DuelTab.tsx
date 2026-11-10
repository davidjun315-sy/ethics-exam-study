"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Heart, Shield, Sparkles, Swords } from "lucide-react";
import type { GameState } from "@/lib/game/data";
import { DIFFICULTY_NAMES, type Difficulty } from "@/lib/game/battle";
import {
  applyAction,
  attackOf,
  createDuel,
  activeResonances,
  EFFECT_TEXT,
  effectPower,
  illegal,
  isResonating,
  needsTarget,
  replayDuel,
  RESONANCE,
  type DuelAction,
  type DuelCardDef,
  type DuelEvent,
  type DuelRules,
  type DuelSide,
  type DuelState,
  type Minion,
  type Target,
} from "@/lib/game/duel";
import { chooseDuelAction } from "@/lib/game/duelAi";
import { pickDuelDeck } from "@/lib/game/duelDeck";
import { RARITY_NAMES, SKILL_EFFECTS, type Rarity } from "@/lib/game/rules";
import { quizApi } from "@/lib/quiz/client";
import { DeckSummary, duelCardOf, FRAME, HandCard, shortTradition } from "./DuelParts";
import { DuelDeckBuilder } from "./DuelDeckBuilder";

interface Setup {
  duelId: string;
  difficulty: Difficulty;
  me: DuelCardDef[];
  foe: DuelCardDef[];
  seed: string;
  rules: DuelRules;
}
interface Outcome {
  result: "win" | "lose" | "draw";
  turns: number;
  record: { wins: number; losses: number; draws: number };
}
interface Saved extends Setup {
  log: DuelAction[];
}

const SAVE_KEY = "ees:duel";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const loadSaved = (): Saved | null => {
  try {
    const v = localStorage.getItem(SAVE_KEY);
    return v ? (JSON.parse(v) as Saved) : null;
  } catch {
    return null;
  }
};
const store = (v: Saved | null) => {
  try {
    if (v) localStorage.setItem(SAVE_KEY, JSON.stringify(v));
    else localStorage.removeItem(SAVE_KEY);
  } catch {}
};

/** 논쟁 대전(카드 대전): 로비 → 대전(자동, 직접 조작 가능) → 결과 */
export function DuelTab({ state, reload, goDraw }: { state: GameState; reload: () => Promise<GameState>; goDraw: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [resumeLog, setResumeLog] = useState<DuelAction[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [building, setBuilding] = useState(false);
  const rules = state.settings.duelRules;

  // 이어 하기 (새로고침해도 진행 중인 대전을 이어서)
  useEffect(() => {
    const s = loadSaved();
    if (!s) return;
    // 외부 저장소(localStorage)에서 읽어 오는 값
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(s);
  }, []);

  // 로비의 덱 미리보기 (서버와 같은 규칙)
  const preview = useMemo(() => pickDuelDeck(state.owned, state.duelDeck, rules.deckSize).map((o, i) => duelCardOf(o, rules, `p${i}`)), [state.owned, state.duelDeck, rules]);

  if (state.owned.length < 3)
    return (
      <section className="card p-8 text-center">
        <h2 className="text-lg font-bold">카드 3장이 필요합니다</h2>
        <p className="mt-1 text-sm text-muted">논쟁 대전은 보유 카드 3장부터 할 수 있습니다 (모자라면 같은 카드를 여러 장 넣어 12장 덱을 만듭니다).</p>
        <button type="button" className="btn-primary mt-4" onClick={goDraw}>카드 뽑으러 가기</button>
      </section>
    );

  async function start(body: { difficulty: Difficulty }) {
    setBusy(true);
    setError(null);
    try {
      const r = await quizApi<Setup>("/api/game/duel", "POST", body);
      setResumeLog([]);
      setOutcome(null);
      setSetup(r);
      store({ ...r, log: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSetup(null);
    } finally {
      setBusy(false);
    }
  }

  if (setup)
    return (
      <DuelBoard
        key={setup.duelId}
        setup={setup}
        initialLog={resumeLog}
        outcome={outcome}
        onOutcome={(o) => {
          setOutcome(o);
          store(null);
          setSaved(null);
          reload().catch(() => {});
        }}
        onLeave={() => {
          setSetup(null);
          setOutcome(null);
        }}
        onEditDeck={() => {
          setSetup(null);
          setOutcome(null);
          setBuilding(true);
        }}
        onAgain={() => {
          const d = setup.difficulty;
          setSetup(null);
          setOutcome(null);
          start({ difficulty: d });
        }}
      />
    );

  if (building) return <DuelDeckBuilder state={state} onClose={() => setBuilding(false)} onSaved={reload} />;

  const custom = state.duelDeck.length;
  const costText = (() => {
    // 비용이 같은 등급끼리 묶기: "일반·희귀 2 · 영웅 3 · 전설 4"
    const groups = new Map<number, string[]>();
    for (const r of ["common", "rare", "epic", "legendary"] as Rarity[]) groups.set(rules.cost[r], [...(groups.get(rules.cost[r]) ?? []), RARITY_NAMES[r]]);
    return [...groups].map(([c, names]) => `${names.join("·")} ${c}`).join(" · ");
  })();
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-4">
        {!state.duel.ready && <p className="card p-4 text-sm text-warn">관리자가 논쟁 대전 업데이트(012)를 적용하면 열립니다.</p>}
        {saved && (
          <button
            type="button"
            className="card flex w-full items-center justify-between gap-2 border-[#ffd36b]/50 p-4 text-left"
            onClick={() => {
              const { log, ...rest } = saved;
              setResumeLog(log);
              setOutcome(null);
              setSetup(rest);
            }}
          >
            <span>
              <span className="block text-sm font-bold">진행 중인 대전 이어 하기</span>
              <span className="text-xs text-muted">{DIFFICULTY_NAMES[saved.difficulty]}</span>
            </span>
            <span className="btn-primary px-4 py-2 text-sm">이어 하기</span>
          </button>
        )}
        <section className="card space-y-4 p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-black">카드 대전</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              사유력으로 사상가를 내고 상대 사상가와 논자를 공격하는 카드 게임입니다. 상대 논자의 신념 {rules.heroHp}을 먼저 0으로 만들면 승리. 자동으로 진행되고, 화면을 누르면 직접 둘 수 있습니다.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">상대 난이도</h3>
            <div className="grid grid-cols-3 gap-1.5 sm:max-w-sm">
              {(Object.keys(DIFFICULTY_NAMES) as Difficulty[]).map((d) => (
                <button key={d} type="button" onClick={() => setDifficulty(d)} aria-pressed={difficulty === d} className={`rounded-lg border px-2 py-2 text-sm ${difficulty === d ? "border-navy bg-navy-soft font-bold text-navy" : "border-line text-muted"}`}>
                  {DIFFICULTY_NAMES[d]}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="btn-primary w-full py-3 text-base font-bold sm:max-w-sm" disabled={busy || !state.duel.ready} onClick={() => start({ difficulty })}>
            {busy ? "상대를 찾는 중…" : "대전 시작"}
          </button>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <ul className="grid gap-1.5 text-[12px] leading-5 text-muted sm:grid-cols-2">
            <li><b className="text-ink">사유력</b> 턴마다 최대치 +1 (최대 {rules.maxMana}). 비용: {costText}</li>
            <li><b className="text-ink">필드</b> 최대 {rules.fieldSize}명. 낸 턴에는 공격할 수 없습니다</li>
            <li><b className="text-ink">수호</b> 상대에 수호가 있으면 그 사상가부터 공격</li>
            <li><b className="text-ink">공명</b> 같은 분야 2명 이상: {Object.entries(RESONANCE).map(([k, v]) => `${k.replace("윤리", "")} ${v}`).join(" · ")}</li>
          </ul>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="card space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-bold">
              내 덱 <span className="font-normal text-muted">{custom ? `직접 ${custom}장${preview.length > custom ? ` + 자동 ${preview.length - custom}장` : ""}` : `자동 · 강한 카드 ${preview.length}장`}</span>
            </h3>
            <button type="button" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-surface-2" onClick={() => setBuilding(true)}>
              덱 만들기
            </button>
          </div>
          <DeckSummary deck={preview} rules={rules} />
          <div className="grid grid-cols-6 gap-1">
            {preview.map((c) => (
              <span key={c.uid} className={`relative block aspect-[3/4] overflow-hidden rounded-md ring-1 ${FRAME[c.rarity]}`} title={`${c.name} · ${RARITY_NAMES[c.rarity]} Lv.${c.level}`}>
                {c.artUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.artUrl} alt="" className="h-full w-full object-cover object-[center_18%]" loading="lazy" draggable={false} />
                ) : (
                  <span className="flex h-full items-center justify-center bg-[#1a2234] text-xs font-bold text-white/40">{c.name.slice(0, 1)}</span>
                )}
                <span className="absolute left-0.5 top-0.5 rounded bg-[#3b6fd8] px-1 text-[9px] font-black text-white">{c.cost}</span>
              </span>
            ))}
          </div>
          <div className="flex justify-between rounded-lg bg-surface-2 p-2.5 text-sm">
            <span className="text-muted">논쟁 대전 전적</span>
            <span>
              <b className="text-ok">{state.duel.wins}승</b> <b className="text-danger">{state.duel.losses}패</b>
              {state.duel.draws ? <b className="text-muted"> {state.duel.draws}무</b> : null}
            </span>
          </div>
        </section>

        <p className="px-1 text-[11px] leading-5 text-faint">카드 대전에는 보상이 없고 전적만 남습니다. 결과는 서버가 기록을 다시 계산해 확정합니다. 코인은 학습으로만 받습니다.</p>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------
// 대전 화면
// ---------------------------------------------------------------------
type Select = { kind: "hand"; uid: string } | { kind: "unit"; uid: string } | null;
type Flash = { key: string; text: string; tone: "dmg" | "heal" | "info"; n: number };
const tkey = (t: Target) => ("hero" in t ? `${t.side}:hero` : `${t.side}:${t.uid}`);

function narrate(s: DuelState, ev: DuelEvent[]): string | null {
  const name = (uid: string) => s.cards[uid]?.name ?? "?";
  const who = (side: DuelSide) => (side === "me" ? "내" : "상대");
  const tn = (t: Target) => ("hero" in t ? `${who(t.side)} 논자` : name(t.uid));
  for (const e of [...ev].reverse()) {
    if (e.t === "end") return e.winner === "draw" ? "무승부" : e.winner === "me" ? "승리!" : "패배…";
    if (e.t === "effect") return `${who(e.side)} ${name(e.uid)} 등장 — 「${s.cards[e.uid].skillName}」 ${SKILL_EFFECTS[e.effect].name}${e.target ? ` → ${tn(e.target)}` : ""}`;
    if (e.t === "attack") return `${who(e.side)} ${name(e.attacker)}의 공격 → ${tn(e.target)}`;
    if (e.t === "play") return `${who(e.side)} ${name(e.uid)} 등장`;
    if (e.t === "resonance") return `${who(e.side)} ${e.tradition} 공명! ${RESONANCE[e.tradition]}`;
    if (e.t === "turn") return e.side === "me" ? `내 턴 · 사유력 ${e.mana}` : "상대 턴";
    if (e.t === "fatigue") return `${who(e.side)} 덱이 비었습니다 · 신념 −${e.dmg}`;
  }
  return null;
}

function DuelBoard({
  setup,
  initialLog,
  outcome,
  onOutcome,
  onLeave,
  onAgain,
  onEditDeck,
}: {
  setup: Setup;
  initialLog: DuelAction[];
  outcome: Outcome | null;
  onOutcome: (o: Outcome) => void;
  onLeave: () => void;
  onAgain: () => void;
  onEditDeck: () => void;
}) {
  const foeName = "상대 논자";
  const level = setup.difficulty;
  const [s, setS] = useState<DuelState>(() => {
    const base = { me: setup.me, foe: setup.foe, seed: setup.seed, rules: setup.rules };
    return initialLog.length ? replayDuel(base, initialLog, (st, side) => chooseDuelAction(st, side, level)).state : createDuel(base).state;
  });
  const logRef = useRef<DuelAction[]>([...initialLog]);
  const [sel, setSel] = useState<Select>(null);
  // 자동 대전 (기본): 내 쪽도 컴퓨터가 둔다. 화면을 누르면 직접 조작으로
  const [auto, setAuto] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [line, setLine] = useState<string>(() => (s.active === "me" ? "내 턴" : "상대 턴"));
  const delay = () => (reducedMotion() ? 60 : speed === 2 ? 300 : 700);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const sent = useRef(false);
  const flashN = useRef(0);
  const boardRef = useRef<HTMLElement>(null);
  // 대전이 시작되면 보드를 화면 맨 위로
  useEffect(() => {
    boardRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);

  function show(st: DuelState, ev: DuelEvent[]) {
    const n = narrate(st, ev);
    if (n) setLine(n);
    const add: Flash[] = [];
    for (const e of ev) {
      if (e.t === "damage" && e.amount > 0) add.push({ key: tkey(e.target), text: `−${e.amount}`, tone: "dmg", n: ++flashN.current });
      if (e.t === "heal" && e.amount > 0) add.push({ key: tkey(e.target), text: `+${e.amount}`, tone: "heal", n: ++flashN.current });
      if (e.t === "stun") add.push({ key: tkey(e.target), text: "기절", tone: "info", n: ++flashN.current });
    }
    if (add.length) {
      setFlashes((f) => [...f, ...add]);
      const ids = new Set(add.map((a) => a.n));
      setTimeout(() => setFlashes((f) => f.filter((x) => !ids.has(x.n))), 900);
    }
  }

  function act(a: DuelAction) {
    const why = illegal(s, "me", a);
    if (why) {
      setError(why);
      return;
    }
    const r = applyAction(s, "me", a);
    logRef.current.push(a);
    store({ ...setup, log: logRef.current });
    setS(r.state);
    setSel(null);
    setError(null);
    show(r.state, r.events);
  }

  // 상대 턴: 한 행동씩 (동작 줄이기면 바로)
  useEffect(() => {
    if (s.winner || s.active !== "foe") return;
    const t = setTimeout(() => {
      const r = applyAction(s, "foe", chooseDuelAction(s, "foe", level));
      setS(r.state);
      show(r.state, r.events);
    }, delay());
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // 내 턴 자동: 가장 강한 컴퓨터 규칙으로 한 행동씩
  useEffect(() => {
    if (!auto || s.winner || s.active !== "me") return;
    const t = setTimeout(() => act(chooseDuelAction(s, "me", "hard")), delay());
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, auto]);

  /** 결과 바로 보기: 남은 판을 한 번에 계산 (내 쪽은 자동 규칙) */
  function skipToEnd() {
    let st = s;
    const evs: DuelEvent[] = [];
    for (let i = 0; i < 3000 && !st.winner; i++) {
      const side = st.active;
      const a = chooseDuelAction(st, side, side === "me" ? "hard" : level);
      if (side === "me") logRef.current.push(a);
      const r = applyAction(st, side, a);
      st = r.state;
      evs.push(...r.events);
    }
    store({ ...setup, log: logRef.current });
    setSel(null);
    setS(st);
    show(st, evs.filter((e) => e.t === "end"));
  }
  function takeOver() {
    if (!auto) return false;
    setAuto(false);
    setSel(null);
    setLine("직접 조작으로 바꿨습니다. 카드를 내거나 공격하세요.");
    return true;
  }

  // 끝나면 서버가 기록을 다시 계산해 확정
  useEffect(() => {
    if (!s.winner || sent.current) return;
    sent.current = true;
    quizApi<Outcome>(`/api/game/duel/${setup.duelId}`, "POST", { actions: logRef.current })
      .then(onOutcome)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.winner]);

  const me = s.players.me;
  const foe = s.players.foe;
  const myTurn = s.active === "me" && !s.winner;

  // 고른 카드·사상가로 갈 수 있는 대상
  const targets = useMemo(() => {
    const out = new Set<string>();
    if (!sel || !myTurn) return out;
    const cands: Target[] = [
      { side: "foe", hero: true },
      { side: "me", hero: true },
      ...foe.field.map((m) => ({ side: "foe" as DuelSide, uid: m.uid })),
      ...me.field.map((m) => ({ side: "me" as DuelSide, uid: m.uid })),
    ];
    for (const t of cands) {
      const a: DuelAction = sel.kind === "hand" ? { t: "play", uid: sel.uid, target: t } : { t: "attack", attacker: sel.uid, target: t };
      if (!illegal(s, "me", a)) out.add(tkey(t));
    }
    return out;
  }, [sel, s, myTurn, foe.field, me.field]);

  function pickHand(uid: string) {
    if (takeOver() || !myTurn) return;
    const c = s.cards[uid];
    const base: DuelAction = { t: "play", uid };
    const why = illegal(s, "me", base);
    if (why) {
      setError(why);
      return;
    }
    if (!needsTarget(c.effect)) return act(base);
    // 대상이 필요한 효과: 대상이 없으면 그냥 낸다 (효과 없이)
    const any = [...foe.field.map((m) => ({ side: "foe" as DuelSide, uid: m.uid })), ...me.field.map((m) => ({ side: "me" as DuelSide, uid: m.uid })), { side: "me" as DuelSide, hero: true as const }].some(
      (t) => !illegal(s, "me", { t: "play", uid, target: t }),
    );
    if (!any) return act(base);
    setSel(sel?.kind === "hand" && sel.uid === uid ? null : { kind: "hand", uid });
    setError(null);
    setLine(`「${c.skillName}」 대상을 고르세요 (${EFFECT_TEXT[c.effect](effectPower(c)).replace("등장 시: ", "")})`);
  }
  function pickUnit(side: DuelSide, uid: string) {
    if (takeOver() || !myTurn) return;
    const t: Target = { side, uid };
    if (sel && targets.has(tkey(t))) return act(sel.kind === "hand" ? { t: "play", uid: sel.uid, target: t } : { t: "attack", attacker: sel.uid, target: t });
    if (side === "me") {
      const m = me.field.find((x) => x.uid === uid)!;
      if (!m.canAttack) {
        setError(m.stun ? "기절해서 이번 턴에는 공격할 수 없습니다" : "이번 턴에 낸 사상가는 다음 턴부터 공격할 수 있습니다");
        return;
      }
      setSel(sel?.kind === "unit" && sel.uid === uid ? null : { kind: "unit", uid });
      setError(null);
      setLine(`${s.cards[uid].name}: 공격할 대상을 고르세요`);
    }
  }
  function pickHero(side: DuelSide) {
    if (!myTurn || !sel) return;
    const t: Target = { side, hero: true };
    if (targets.has(tkey(t))) act(sel.kind === "hand" ? { t: "play", uid: sel.uid, target: t } : { t: "attack", attacker: sel.uid, target: t });
  }

  const canDoSomething = myTurn && (me.hand.some((u) => !illegal(s, "me", { t: "play", uid: u })) || me.field.some((m) => m.canAttack && attackOf(s, "me", m) > 0));
  const fl = (key: string) => flashes.filter((f) => f.key === key);

  return (
    <section ref={boardRef} className="relative mx-auto max-w-2xl scroll-mt-16 overflow-hidden rounded-2xl border border-line bg-[radial-gradient(90%_70%_at_50%_45%,#26324d,#0c111b)] p-2.5 text-white sm:p-4">
      {/* 상대 */}
      <HeroBar side="foe" name={foeName} p={foe} rules={s.rules} resonance={activeResonances(s, "foe")} active={s.active === "foe" && !s.winner} targetable={targets.has("foe:hero")} onClick={() => pickHero("foe")} flashes={fl("foe:hero")} />
      <Field s={s} side="foe" units={foe.field} sel={sel} targets={targets} onPick={(uid) => pickUnit("foe", uid)} flashes={fl} myTurn={myTurn} />

      {/* 가운데: 안내 · 턴 종료 */}
      <div className="my-2 flex items-center gap-2">
        <p className="min-h-10 flex-1 rounded-lg bg-black/30 px-3 py-2 text-[13px] leading-5 text-white/85" aria-live="polite">
          {error ? <span className="text-[#ffb4a8]">{error}</span> : line}
        </p>
        {!s.winner && !auto && (
          <button
            type="button"
            disabled={!myTurn}
            onClick={() => act({ t: "end" })}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${myTurn ? (canDoSomething ? "bg-white/15 text-white hover:bg-white/25" : "duel-pulse bg-[#ffd36b] text-[#2a1d00]") : "bg-white/5 text-white/40"}`}
          >
            {myTurn ? "턴 종료" : "상대 턴…"}
          </button>
        )}
      </div>

      {/* 나 */}
      <Field s={s} side="me" units={me.field} sel={sel} targets={targets} onPick={(uid) => pickUnit("me", uid)} flashes={fl} myTurn={myTurn} />
      <HeroBar side="me" name="내 논자" p={me} rules={s.rules} resonance={activeResonances(s, "me")} active={myTurn} targetable={targets.has("me:hero")} onClick={() => pickHero("me")} flashes={fl("me:hero")} />

      {/* 손패 */}
      <div className="-mx-2.5 mt-2 flex gap-2 overflow-x-auto px-2.5 pb-1 [&::-webkit-scrollbar]:hidden sm:-mx-4 sm:px-4" aria-label="내 손패">
        {me.hand.length === 0 && <p className="py-6 text-center text-xs text-white/50">손패가 없습니다</p>}
        {me.hand.map((uid) => {
          const c = s.cards[uid];
          const playable = myTurn && !illegal(s, "me", { t: "play", uid });
          return (
            <button key={uid} type="button" data-playable={playable || undefined} onClick={() => pickHand(uid)} className={`shrink-0 rounded-xl text-left transition-transform ${sel?.kind === "hand" && sel.uid === uid ? "-translate-y-2 ring-2 ring-[#ffd36b]" : ""}`} aria-label={`${c.name} · 비용 ${c.cost} · ${c.atk}/${c.hp}`}>
              <HandCard c={c} playable={playable} />
            </button>
          );
        })}
      </div>

      {/* 자동 대전 조작 */}
      {!s.winner && (
        <div className="mt-2 flex items-center gap-1.5" role="group" aria-label="자동 대전">
          <button
            type="button"
            onClick={() => (auto ? takeOver() : (setAuto(true), setLine("자동 대전")))}
            aria-pressed={auto}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${auto ? "bg-[#ffd36b] text-[#2a1d00]" : "bg-white/10 text-white hover:bg-white/20"}`}
          >
            {auto ? "자동 ▶" : "자동으로"}
          </button>
          {auto && (
            <button type="button" onClick={() => setSpeed(speed === 1 ? 2 : 1)} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold tabular-nums hover:bg-white/20" aria-label={`속도 ${speed}배`}>
              {speed}x
            </button>
          )}
          {auto && (
            <button type="button" onClick={takeOver} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20">
              직접 하기
            </button>
          )}
          <button type="button" onClick={skipToEnd} className="ml-auto rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20">
            결과 바로 보기 ⏭
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
        <span>{DIFFICULTY_NAMES[setup.difficulty]} · 턴 {Math.ceil(s.turn / 2)}</span>
        {!s.winner &&
          (confirmQuit ? (
            <span className="flex items-center gap-1.5">
              항복할까요?
              <button type="button" className="rounded bg-[#ef6a5a] px-2 py-1 font-semibold text-white" onClick={() => act({ t: "concede" })}>항복</button>
              <button type="button" className="rounded bg-white/10 px-2 py-1" onClick={() => setConfirmQuit(false)}>취소</button>
            </span>
          ) : (
            <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10" onClick={() => setConfirmQuit(true)}>
              <Flag className="h-3.5 w-3.5" aria-hidden /> 항복
            </button>
          ))}
      </div>

      {s.winner && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
          <div className="card-enter w-full max-w-sm rounded-2xl border border-white/15 bg-[#121a2a]/95 p-5 text-center">
            <div className={`text-4xl font-black ${s.winner === "me" ? "text-[#ffd36b]" : "text-white/85"}`}>{s.winner === "me" ? "승리!" : s.winner === "draw" ? "무승부" : "패배"}</div>
            <p className="mt-1 text-sm text-white/70">
              {s.endReason === "concede" ? "항복했습니다." : s.endReason === "turns" ? "제한 턴이 끝나 신념을 비교했습니다." : s.winner === "me" ? "상대 논자의 신념을 꺾었습니다." : "덱을 바꾸거나 카드를 강화해 다시 도전해 보세요."}
            </p>
            <p className="mt-2 text-xs text-white/60">
              {outcome ? `서버 확인 완료 · 전적 ${outcome.record.wins}승 ${outcome.record.losses}패${outcome.record.draws ? ` ${outcome.record.draws}무` : ""}` : error ? <span className="text-[#ffb4a8]">{error}</span> : "결과 확인 중…"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/20" onClick={onLeave}>로비로</button>
              <button type="button" className="btn-primary py-2.5 font-bold" onClick={onAgain}>다시 대전</button>
            </div>
            <button type="button" className="mt-2 text-xs text-white/60 underline-offset-2 hover:underline" onClick={onEditDeck}>덱 수정</button>
          </div>
        </div>
      )}
    </section>
  );
}

function FlashBadges({ flashes }: { flashes: Flash[] }) {
  return (
    <>
      {flashes.map((f) => (
        <span key={f.n} className={`dmg-float z-20 text-xl ${f.tone === "dmg" ? "text-[#ffb0a0]" : f.tone === "heal" ? "text-[#9ff0bf]" : "text-[#d8a6ff]"}`}>
          {f.text}
        </span>
      ))}
    </>
  );
}

function HeroBar({ side, name, p, rules, resonance, active, targetable, onClick, flashes }: { side: DuelSide; name: string; p: DuelState["players"]["me"]; rules: DuelRules; resonance: string[]; active: boolean; targetable: boolean; onClick: () => void; flashes: Flash[] }) {
  const ratio = Math.max(0, p.hero) / rules.heroHp;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!targetable}
      data-target={targetable || undefined}
      aria-label={`${side === "me" ? "내 논자" : `상대 논자(${name})`} · 신념 ${p.hero}`}
      className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${targetable ? "bg-[#ef6a5a]/25 ring-2 ring-[#ef6a5a]" : active ? "bg-white/10" : "bg-white/5"}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${side === "me" ? "bg-[#5a78d1]" : "bg-[#8a4a4a]"}`}>{side === "me" ? "나" : "상대"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2 text-sm">
          <b className="truncate">{name}</b>
          <span className="text-[11px] text-white/55">
            덱 {p.deck.length}
            {side === "foe" ? ` · 손패 ${p.hand.length}` : ""}
          </span>
          {resonance.map((t) => (
            <span key={t} className="truncate rounded bg-[#ffd36b]/20 px-1 text-[10px] font-semibold text-[#ffd36b]" title={`${t} 공명: ${RESONANCE[t]}`}>
              {shortTradition(t)} 공명 · {RESONANCE[t]}
            </span>
          ))}
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/40">
          <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${ratio * 100}%`, background: ratio > 0.5 ? "#5fd08f" : ratio > 0.25 ? "#f2c14e" : "#ef6a5a" }} />
        </span>
      </span>
      <span className="text-right">
        <span className="flex items-center justify-end gap-1 text-lg font-black tabular-nums">
          <Heart className="h-4 w-4 text-[#ff8f8f]" aria-hidden />
          {p.hero}
        </span>
        <span className="flex items-center justify-end gap-0.5" aria-label={`사유력 ${p.mana}/${p.maxMana}`}>
          {Array.from({ length: Math.max(p.maxMana, p.mana) }, (_, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i < p.mana ? "bg-[#7fb6ff]" : "bg-white/15"}`} />
          ))}
        </span>
      </span>
      <FlashBadges flashes={flashes} />
    </button>
  );
}

function Field({ s, side, units, sel, targets, onPick, flashes, myTurn }: { s: DuelState; side: DuelSide; units: Minion[]; sel: Select; targets: Set<string>; onPick: (uid: string) => void; flashes: (key: string) => Flash[]; myTurn: boolean }) {
  return (
    <div className="my-1.5 grid min-h-[5.5rem] gap-1.5 sm:my-2 sm:min-h-[7.5rem] sm:gap-3" style={{ gridTemplateColumns: `repeat(${s.rules.fieldSize}, minmax(0, 1fr))` }} aria-label={side === "me" ? "내 필드" : "상대 필드"}>
      {units.map((m) => (
        <Unit key={m.uid} s={s} side={side} m={m} selected={sel?.kind === "unit" && sel.uid === m.uid} targetable={targets.has(`${side}:${m.uid}`)} ready={side === "me" && myTurn && m.canAttack && attackOf(s, side, m) > 0} onClick={() => onPick(m.uid)} flashes={flashes(`${side}:${m.uid}`)} />
      ))}
      {Array.from({ length: Math.max(0, s.rules.fieldSize - units.length) }, (_, i) => (
        <div key={`e${i}`} className="rounded-xl border border-dashed border-white/10" />
      ))}
    </div>
  );
}

function Unit({ s, side, m, selected, targetable, ready, onClick, flashes }: { s: DuelState; side: DuelSide; m: Minion; selected: boolean; targetable: boolean; ready: boolean; onClick: () => void; flashes: Flash[] }) {
  const c = s.cards[m.uid];
  const atk = attackOf(s, side, m);
  const res = isResonating(s, side, m.uid);
  return (
    <button
      type="button"
      onClick={onClick}
      data-target={targetable || undefined}
      data-ready={ready || undefined}
      aria-label={`${c.name} 공격 ${atk} 체력 ${m.hp}${m.guard ? " 수호" : ""}${m.stun ? " 기절" : ""}`}
      className={`relative flex aspect-square flex-col sm:aspect-[4/5] overflow-hidden rounded-xl bg-[#1a2234] text-left ring-2 transition-transform ${FRAME[c.rarity]} ${selected ? "-translate-y-1.5 ring-[#ffd36b] ring-4" : targetable ? "ring-4 ring-[#ef6a5a]" : ready ? "shadow-[0_0_14px_rgba(127,224,166,0.8)]" : ""} ${m.guard ? "outline outline-2 outline-offset-2 outline-[#8fc6ff]" : ""}`}
    >
      {c.artUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.artUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" draggable={false} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-black text-white/20">{c.name.slice(0, 1)}</span>
      )}
      <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
      <span className="relative mt-auto truncate px-1.5 text-[11px] font-bold">{c.name}</span>
      <span className="relative flex items-center justify-between px-1.5 pb-1 text-[13px] font-black tabular-nums">
        <span className={`flex items-center gap-0.5 ${atk > c.atk ? "text-[#ffd36b]" : "text-[#ffb0a0]"}`}>
          <Swords className="h-3 w-3" aria-hidden />
          {atk}
        </span>
        <span className={`flex items-center gap-0.5 ${m.hp < m.maxHp ? "text-[#ff8f8f]" : "text-[#9ff0bf]"}`}>
          <Heart className="h-3 w-3" aria-hidden />
          {m.hp}
        </span>
      </span>
      <span className="absolute left-1 top-1 flex flex-col gap-0.5">
        {m.guard && (
          <span className="flex items-center gap-0.5 rounded bg-[#8fc6ff] px-1 text-[9px] font-bold text-[#0b2440]">
            <Shield className="h-2.5 w-2.5" aria-hidden />
            수호
          </span>
        )}
        {m.stun ? <span className="rounded bg-[#d8a6ff] px-1 text-[9px] font-bold text-[#2a0b40]">기절</span> : null}
        {res && (
          <span className="flex items-center gap-0.5 rounded bg-[#ffd36b] px-1 text-[9px] font-bold text-[#3a2600]" title={RESONANCE[c.tradition]}>
            <Sparkles className="h-2.5 w-2.5" aria-hidden />
            공명
          </span>
        )}
      </span>
      <FlashBadges flashes={flashes} />
    </button>
  );
}
