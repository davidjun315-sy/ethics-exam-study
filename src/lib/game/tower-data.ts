import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache";
import { kstDay } from "@/lib/quiz/srs";
import { fetchAll } from "@/lib/quiz/paged";
import { geminiJson, isGeminiConfigured } from "@/lib/ai/gemini";
import { buildEssayPrompt, ESSAY_GRADING_SYSTEM, ESSAY_MIN, EssayGradingSchema, tidyGrading, type EssayGrading } from "@/lib/quiz/essay";
import { getEssayContext, getItemView, getSolution, recordAttempt, type AttemptResult, type ItemView, type Solution } from "@/lib/quiz/learn";
import type { PracticePayload } from "@/lib/quiz/practice";
import { getCanon } from "@/lib/data/canon";
import { GameError, gameError, getAttendance, getGameState, publishedCards, type CardView } from "./data";
import { weekStart } from "./ranking";
import { canStartAt, EPIC_TICKET_FLOOR, enemyForFloor, floorCoins, floorStones, hash, isBossFloor, pickItem, startState, tierOf, TIERS, triesFor, TOWER_TEAM_SIZE, type RunState, type TowerItem, type Verdict } from "./tower";
import * as TB from "./tower-battle";
import type { Battle, BattleEvent, BattleRun, EventKind, FloorKind, Pattern, RelicId, TeamRole } from "./tower-battle";
import { ROLES, type Rarity, type SkillEffect } from "./rules";

export const GAME_027_HINT = "사상의 탑 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/027_game_tower.sql 을 실행하세요.";
const missing027 = (m: string) => /game_tower|schema cache|does not exist|Could not find/i.test(m);

// ---------------------------------------------------------------------
// 문제 후보 (승인된 문제 + 다른 회원 정답률) · 1시간마다 새로
// ---------------------------------------------------------------------
type ItemRow = { id: string; question_id: string | null; kind: TowerItem["kind"]; origin: string; grading: "auto" | "self"; format: string; payload: { mode?: string } | null; difficulty: 1 | 2 | 3; philosopher_names: string[] | null };

async function buildTowerItems(): Promise<TowerItem[]> {
  const db = getAdminClient();
  const since = new Date(Date.now() - 180 * 864e5).toISOString();
  const [rows, attempts] = await Promise.all([
    fetchAll<ItemRow>((from, to) =>
      db.from("quiz_items").select("id, question_id, kind, origin, grading, format, payload, difficulty, philosopher_names").eq("status", "approved").order("id").range(from, to),
    ),
    fetchAll<{ item_id: string; result: string }>((from, to) => db.from("quiz_attempts").select("item_id, result").gte("created_at", since).order("id").range(from, to)).catch(() => []),
  ]);
  const stat = new Map<string, { n: number; ok: number }>();
  for (const a of attempts) {
    const s = stat.get(a.item_id) ?? { n: 0, ok: 0 };
    s.n += 1;
    if (a.result === "correct") s.ok += 1;
    stat.set(a.item_id, s);
  }
  return rows.map((r) => {
    const practiceAuto = r.kind === "practice" && r.payload && r.payload.mode !== "fill";
    const s = stat.get(r.id);
    return {
      id: r.id,
      kind: r.kind,
      full: r.origin === "full",
      difficulty: r.difficulty,
      auto: Boolean(practiceAuto) || r.grading === "auto",
      philosophers: r.philosopher_names ?? [],
      rate: s && s.n >= 3 ? s.ok / s.n : null,
      group: r.question_id ?? r.id,
    };
  });
}
const towerItems = cached("tower-items", buildTowerItems);

// ---------------------------------------------------------------------
// 도전 상태
// ---------------------------------------------------------------------
export interface TeamCard {
  cardId: string;
  philosopherId: string;
  name: string;
  rarity: Rarity;
  level: number;
  atk: number;
  hp: number;
  artUrl: string | null;
  battleArtUrl: string | null;
  tradition: string;
  /** 필살기 이름 (연출용 · 예전 도전엔 없음) */
  skillName?: string;
  /** 필살기 종류 = 역할 (2.0 · 예전 도전엔 없음 → 카드 정보에서 채움) */
  skillEffect?: SkillEffect;
}
interface Stored extends RunState {
  enemyId: string | null;
  used: string[];
  /** 이번 도전에서 나온 기출 묶음 (예전 도전엔 없음 → used 로 계산) */
  usedQ?: string[];
  essays: number;
  seed: number;
  /** 2.0 전투 상태 (예전 도전엔 없음 → 불러올 때 채움) */
  b?: Battle;
}
type Stored2 = Stored & { b: Battle };
interface Current {
  itemId: string;
  servedAt: string;
  essay: boolean;
  /** 힌트를 이미 썼으면 그 내용 (다시 열어도 같은 힌트) */
  hint?: TowerHint | null;
  /** false = 새 층에 아직 들어가지 않음 (탑 화면에서 '입장'을 누르면 문제 공개 · 빠른 정답 시계 시작). 예전 도전은 없음 = 들어감 */
  entered?: boolean;
  /** 채점 중 (같은 답을 두 번 · 두 창에서 동시에 내지 못하게) */
  claim?: string | null;
  /** 이미 답함 (필살기 선택을 기다리는 중) */
  answered?: boolean;
}
type RunRow = {
  id: string;
  learner: string;
  day: string;
  status: "active" | "over" | "quit";
  team: TeamCard[];
  state: Stored;
  current: Current | null;
  choices: string[] | null;
  cleared: number;
  coins: number;
  stones: number;
  version: number;
};

export type TowerHint = { kind: "remove"; index: number } | { kind: "reveal"; statement: number; group: number } | { kind: "first"; text: string };

export interface EnemyView {
  philosopherId: string;
  name: string;
  tradition: string;
  quote: string;
  artUrl: string | null;
  battleArtUrl: string | null;
  rarity: Rarity;
  freqRank: number | null;
}
export interface RoleView {
  index: number;
  cardId: string;
  name: string;
  effect: SkillEffect;
  role: string;
  passive: string;
  unique: { title: string; desc: string } | null;
  skillTitle: string;
  skillName: string;
  skillDesc: string;
  cost: number;
  /** 지금 쓸 수 없는 이유 (쓸 수 있으면 null) */
  problem: string | null;
}
export interface BattleView {
  focus: number;
  focusMax: number;
  shield: number;
  kind: FloorKind;
  pattern: Pattern;
  patternName: string;
  patternDesc: string;
  phase: 1 | 2 | 3;
  gauge: number;
  interval: number;
  intent: string | null;
  intentText: string | null;
  bossShield: number;
  sealed: number;
  weaken: number;
  enraged: boolean;
  halfNext: boolean;
  relics: { id: RelicId; name: string; icon: string; desc: string; count: number; max: number }[];
  roles: RoleView[];
  /** 필살기 선택을 기다리는 턴 */
  pending: { turn: number } | null;
  event: { kind: EventKind; title: string; icon: string; desc: string; floor: number; options: TB.EventOption[] } | null;
  quickSec: number;
}
export type RunPhase = "battle" | "skill" | "choice" | "event" | "awaiting" | "over";
export interface RunView {
  id: string;
  status: RunRow["status"];
  state: RunState;
  tier: (typeof TIERS)[keyof typeof TIERS];
  boss: boolean;
  enemy: EnemyView | null;
  team: TeamCard[];
  teamAtk: number;
  item: (ItemView & { essay: boolean; servedAt: string; hint: TowerHint | null }) | null;
  /** 새 층 입장 전 (탑 화면) */
  awaiting: boolean;
  choices: { id: string; kind: "buff" | "relic"; name: string; icon: string; desc: string; count?: number; max?: number }[] | null;
  /** 방금 깬 층이 보스층 (선택은 탑 화면에서 · 다음 층은 '입장'으로) */
  clearedKind: FloorKind | null;
  cleared: number;
  coins: number;
  stones: number;
  phase: RunPhase;
  battle: BattleView;
}
export interface TowerRankRow {
  rank: number;
  name: string;
  me: boolean;
  floor: number;
}
export interface TowerOverview {
  ready: boolean;
  hint?: string;
  tries: { used: number; max: number; attendBonus: boolean };
  best: number;
  weeklyBest: number;
  epicTicketGiven: boolean;
  run: RunView | null;
  ranking: { weekStart: string; rows: TowerRankRow[]; mine: { rank: number; floor: number } | null };
  essayOk: boolean;
  tiers: typeof TIERS;
}

const teamAtk = (t: TeamCard[]) => t.reduce((s, c) => s + c.atk, 0);
const weekKey = () => kstDay(weekStart());

async function enemyOrder(): Promise<CardView[]> {
  // 덜 나온 사상가 → 자주 나온 사상가 (위로 갈수록 · 보스층은 가장 자주 나온 사상가)
  const cards = await publishedCards();
  return [...cards].sort((a, b) => (b.freqRank ?? 999) - (a.freqRank ?? 999) || a.name.localeCompare(b.name, "ko"));
}

function enemyView(c: CardView | undefined, floor: number, kind: FloorKind): EnemyView | null {
  if (!c) return null;
  const r = TIERS[tierOf(floor)].enemy;
  return {
    philosopherId: c.philosopherId,
    name: c.name,
    tradition: c.tradition,
    quote: c.quote,
    artUrl: c.artUrl,
    battleArtUrl: c.battleArtUrl ?? null,
    // 특수 전투는 한 등급 위로 보임
    rarity: kind === "elite" ? ((({ common: "rare", rare: "epic", epic: "legendary", legendary: "legendary" }) as const)[r]) : r,
    freqRank: c.freqRank ?? null,
  };
}

/** 역할 (카드 필살기 종류). 예전 도전 카드엔 없으므로 지금 카드 정보에서 */
function rolesOf(team: TeamCard[], cards: CardView[]): { team: TeamCard[]; roles: TeamRole[] } {
  const byId = new Map(cards.map((c) => [c.philosopherId, c]));
  const t = team.map((c) => ({ ...c, skillEffect: c.skillEffect ?? byId.get(c.philosopherId)?.skillEffect ?? "stun" }));
  return { team: t, roles: t.map((c) => ({ name: c.name, effect: c.skillEffect!, skillName: c.skillName })) };
}
const enemyInfo = (cards: CardView[], id: string | null) => {
  const c = cards.find((x) => x.philosopherId === id);
  return { name: c?.name, effect: c?.skillEffect ?? null };
};

/** 불러온 도전 → 2.0 상태 (예전 도전은 사유력 0 · 유물 없음으로 바꿔 이어서) */
interface Prepared {
  run: RunRow;
  state: Stored2;
  team: TeamCard[];
  roles: TeamRole[];
  cards: CardView[];
}
async function prepare(run: RunRow): Promise<Prepared> {
  const cards = await publishedCards();
  const { team, roles } = rolesOf(run.team, cards);
  const state = TB.upgradeRun(run.state, enemyInfo(cards, run.state.enemyId)) as Stored2;
  return { run, state, team, roles, cards };
}

function battleView(st: Stored2, roles: TeamRole[], team: TeamCard[]): BattleView {
  const b = st.b;
  const bs = b.boss;
  const bst = st as BattleRun;
  return {
    focus: b.focus,
    focusMax: TB.FOCUS_MAX,
    shield: b.shield,
    kind: bs.kind,
    pattern: bs.pattern,
    patternName: TB.PATTERN_NAMES[bs.pattern],
    patternDesc: TB.PATTERN_DESC[bs.pattern],
    phase: bs.phase,
    gauge: bs.gauge,
    interval: bs.interval,
    intent: bs.intent ? TB.INTENT_NAMES[bs.intent] : null,
    intentText: TB.intentText(bs),
    bossShield: bs.shield,
    sealed: bs.sealed,
    weaken: bs.weaken,
    enraged: bs.enraged,
    halfNext: bs.halfNext,
    relics: (Object.keys(b.relics) as RelicId[]).filter((r) => (b.relics[r] ?? 0) > 0 && TB.isRelicId(r)).map((r) => ({ id: r, ...TB.RELICS[r], count: b.relics[r] ?? 0 })),
    roles: roles.map((r, i) => {
      const u = TB.uniqueOf(r.name);
      return {
        index: i,
        cardId: team[i]?.cardId ?? "",
        name: r.name,
        effect: r.effect,
        role: ROLES[r.effect]?.name ?? TB.ROLE_NAMES[r.effect],
        passive: TB.ROLE_PASSIVE_DESC[r.effect],
        unique: u ? { title: u.title, desc: u.desc } : null,
        skillTitle: TB.ROLE_SKILL[r.effect].title,
        skillName: r.skillName || TB.ROLE_SKILL[r.effect].title,
        skillDesc: TB.ROLE_SKILL[r.effect].desc,
        cost: TB.skillCost(r.effect, b.relics),
        problem: TB.skillProblem(bst, roles, i),
      };
    }),
    pending: b.pending ? { turn: b.pending.turn } : null,
    event: b.event ? { kind: b.event.kind, ...TB.EVENT_INFO[b.event.kind], floor: b.event.floor, options: TB.eventOptions(bst, b.event) } : null,
    quickSec: TB.quickWindow(b),
  };
}

async function toView(r: RunRow, p?: Prepared): Promise<RunView> {
  const P = p && p.run === r ? p : await prepare(r);
  const st = P.state;
  const kind = st.b.boss.kind;
  const enemy = enemyView(
    P.cards.find((c) => c.philosopherId === st.enemyId),
    st.floor,
    kind,
  );
  let item: RunView["item"] = null;
  const awaiting = r.status === "active" && r.current?.entered === false;
  if (r.status === "active" && r.current && !awaiting) {
    const v = await getItemView(r.current.itemId).catch(() => null);
    if (v) item = { ...v, essay: r.current.essay, servedAt: r.current.servedAt, hint: r.current.hint ?? null };
  }
  const { enemyId: _e, used: _u, essays: _s, seed: _d, usedQ: _q, b: _b, ...state } = st;
  void _e;
  void _u;
  void _s;
  void _d;
  void _q;
  void _b;
  const choices = r.choices?.length ? r.choices.map((id) => TB.choiceInfo(id)).filter((c) => c !== null) : null;
  const phase: RunPhase = r.status !== "active" ? "over" : choices ? "choice" : st.b.event ? "event" : st.b.pending ? "skill" : awaiting ? "awaiting" : "battle";
  return {
    id: r.id,
    status: r.status,
    state,
    tier: TIERS[tierOf(st.floor)],
    boss: isBossFloor(st.floor),
    enemy,
    team: P.team,
    teamAtk: teamAtk(r.team),
    item,
    awaiting,
    choices: choices ? choices.map((c) => (c.kind === "relic" ? { ...c, count: st.b.relics[c.id.slice(6) as RelicId] ?? 0 } : c)) : null,
    clearedKind: choices ? kind : null,
    cleared: r.cleared,
    coins: r.coins,
    stones: r.stones,
    phase,
    battle: battleView(st, P.roles, P.team),
  };
}

async function loadRun(learner: string, runId?: string): Promise<RunRow | null> {
  let q = getAdminClient().from("game_tower_runs").select("*").eq("learner", learner);
  q = runId ? q.eq("id", runId) : q.eq("status", "active");
  const { data, error } = await q.maybeSingle();
  if (error) throw missing027(error.message) ? new GameError(GAME_027_HINT, 503) : gameError(error.message);
  return (data as RunRow | null) ?? null;
}
async function activeRun(learner: string, runId: string): Promise<RunRow> {
  const run = await loadRun(learner, runId);
  if (!run || run.status !== "active") throw new GameError("끝난 도전입니다.", 409);
  return run;
}

/** 버전이 같을 때만 저장 (같은 도전을 두 창에서 동시에 진행하면 한쪽만) */
async function saveRun(r: RunRow, patch: Partial<Omit<RunRow, "id" | "learner" | "version">>): Promise<RunRow> {
  const { data, error } = await getAdminClient()
    .from("game_tower_runs")
    .update({ ...patch, version: r.version + 1, updated_at: new Date().toISOString() })
    .eq("id", r.id)
    .eq("version", r.version)
    .select("*")
    .maybeSingle();
  if (error) throw gameError(error.message);
  if (!data) throw new GameError("다른 화면에서 이 도전이 먼저 진행됐습니다. 새로고침해 주세요.", 409);
  const saved = data as RunRow;
  if (saved.status !== "active" && r.status === "active") await getAdminClient().from("game_tower_runs").update({ ended_at: new Date().toISOString() }).eq("id", saved.id);
  return saved;
}

/** 이 층의 적 사상가 이름들 (같은 사상가 다른 이름 포함) */
async function enemyNames(enemyId: string | null): Promise<string[]> {
  if (!enemyId) return [];
  const canon = await getCanon().catch(() => null);
  if (canon) return canon.namesOf(enemyId);
  const c = (await publishedCards()).find((x) => x.philosopherId === enemyId);
  return c ? [c.name] : [];
}

/** 최근 3일 동안 이 학습자가 푼 기출 묶음 (퀴즈 · 탑 모두) → 다른 도전에서도 새 기출이 먼저 나오게 */
async function recentGroups(learner: string, byId: Map<string, TowerItem>): Promise<Set<string>> {
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const { data } = await getAdminClient().from("quiz_progress").select("item_id").eq("learner", learner).gte("last_at", since).limit(2000);
  const out = new Set<string>();
  for (const r of (data ?? []) as { item_id: string }[]) {
    const it = byId.get(r.item_id);
    out.add(it?.group ?? r.item_id);
  }
  return out;
}

/** 다음 문제 정하기: 이번 도전에 안 나온 기출 → 최근에 안 푼 기출 우선 (없으면 null → 도전 끝) */
async function serveNext<S extends Stored>(learner: string, s: S, entered = true): Promise<{ current: Current | null; state: S }> {
  const [items, names] = await Promise.all([towerItems(), enemyNames(s.enemyId)]);
  const byId = new Map(items.map((it) => [it.id, it]));
  const usedQ = s.usedQ ?? [...new Set(s.used.map((id) => byId.get(id)?.group ?? id))];
  const recent = await recentGroups(learner, byId).catch(() => new Set<string>());
  const it = pickItem(items, { floor: s.floor, names, used: new Set(s.used), usedGroups: new Set(usedQ), recent, essayOk: isGeminiConfigured(), essaysThisFloor: s.essays, seed: s.seed + s.answered });
  if (!it) return { current: null, state: s };
  const essay = !it.auto;
  const g = it.group ?? it.id;
  return {
    current: { itemId: it.id, servedAt: new Date().toISOString(), essay, hint: null, entered },
    state: { ...s, used: [...s.used, it.id].slice(-400), usedQ: (usedQ.includes(g) ? usedQ : [...usedQ, g]).slice(-400), essays: s.essays + (essay ? 1 : 0) },
  };
}

/** 상인 SQL(032)이 적용됐나 (값 0 으로 불러 보면 아무것도 바꾸지 않음) · 10분마다 다시 확인 */
let spendOk: { at: number; ok: boolean } | null = null;
async function hasSpend(learner: string): Promise<boolean> {
  if (spendOk && Date.now() - spendOk.at < 600_000) return spendOk.ok;
  const { error } = await getAdminClient().rpc("game_tower_spend", { p_learner: learner, p_run: "00000000-0000-0000-0000-000000000000", p_floor: 0, p_cost: 0, p_day: kstDay() });
  spendOk = { at: Date.now(), ok: !error };
  return spendOk.ok;
}

/**
 * 다음 층으로: 적 정하기 → 이벤트 층이면 이벤트, 아니면 층 준비(두루마리 · 고유 패시브) + 문제.
 * entered = false 면 탑 화면에서 '입장'을 눌러야 문제가 열림 (보스층을 깬 뒤)
 */
async function advance(learner: string, P: Prepared, st: Stored2, entered: boolean): Promise<{ state: Stored2; current: Current | null; status?: "over"; events: BattleEvent[] }> {
  const enemies = await enemyOrder();
  const f = st.floor + 1;
  const enemyId = enemyForFloor(enemies, f, st.seed)?.philosopherId ?? null;
  const base: Stored2 = { ...st, enemyId, essays: 0 };
  if (TB.isEventFloor(f)) {
    const merchant = await hasSpend(learner).catch(() => false);
    const moved = { ...base, floor: f, b: { ...base.b, pending: null } } as Stored2;
    moved.b = { ...moved.b, event: TB.eventFor(moved, f, st.seed, { merchant }) };
    return { state: moved, current: null, events: [] };
  }
  const e = TB.enterFloor(base, f, TB.floorKind(f), enemyInfo(P.cards, enemyId), P.roles);
  const n = await serveNext(learner, e.state, entered);
  return n.current ? { state: n.state, current: n.current, events: e.events } : { state: n.state, current: null, status: "over", events: e.events };
}

/** 층 돌파 보상 (같은 도전 · 같은 층은 한 번만 · DB 가 기록으로 막음) */
async function payFloor(learner: string, runId: string, floor: number): Promise<{ coins: number; stones: number; ticket: boolean }> {
  const { data, error } = await getAdminClient().rpc("game_tower_clear", {
    p_learner: learner,
    p_run: runId,
    p_floor: floor,
    p_coins: floorCoins(floor),
    p_stones: floorStones(floor),
    p_ticket_floor: EPIC_TICKET_FLOOR,
    p_day: kstDay(),
    p_week: weekKey(),
  });
  if (error) throw gameError(error.message);
  return data as { coins: number; stones: number; ticket: boolean };
}

// ---------------------------------------------------------------------
// 공개 함수
// ---------------------------------------------------------------------
export async function getTower(learner: string): Promise<TowerOverview> {
  const db = getAdminClient();
  const day = kstDay();
  const wk = weekKey();
  const [runs, prof, weekly, att] = await Promise.all([
    db.from("game_tower_runs").select("id", { count: "exact", head: true }).eq("learner", learner).eq("day", day),
    db.from("game_tower_profiles").select("best_floor, epic_ticket").eq("learner", learner).maybeSingle(),
    db.from("game_tower_weekly").select("learner, best_floor, reached_at").eq("week_start", wk).gt("best_floor", 0).order("best_floor", { ascending: false }).order("reached_at").limit(200),
    getAttendance(learner).catch(() => null),
  ]);
  const err = runs.error ?? prof.error ?? weekly.error;
  const base = { tries: { used: 0, max: triesFor(false), attendBonus: false }, best: 0, weeklyBest: 0, epicTicketGiven: false, run: null, ranking: { weekStart: wk, rows: [], mine: null }, essayOk: isGeminiConfigured(), tiers: TIERS };
  if (err) {
    if (missing027(err.message)) return { ready: false, hint: GAME_027_HINT, ...base };
    throw gameError(err.message);
  }
  const attended = Boolean(att?.ready && att.checkedToday);
  const run = await loadRun(learner);
  const list = (weekly.data ?? []) as { learner: string; best_floor: number }[];
  const top = list.slice(0, 10);
  const names = await namesFor(top.map((r) => r.learner));
  const mineIdx = list.findIndex((r) => r.learner === learner);
  const p = prof.data as { best_floor: number; epic_ticket: boolean } | null;
  return {
    ready: true,
    tries: { used: runs.count ?? 0, max: triesFor(attended), attendBonus: attended },
    best: p?.best_floor ?? 0,
    weeklyBest: mineIdx >= 0 ? list[mineIdx].best_floor : 0,
    epicTicketGiven: p?.epic_ticket ?? false,
    run: run ? await toView(run) : null,
    ranking: {
      weekStart: wk,
      rows: top.map((r, i) => ({ rank: i + 1, name: names.get(r.learner) ?? "학습자", me: r.learner === learner, floor: r.best_floor })),
      mine: mineIdx >= 0 ? { rank: mineIdx + 1, floor: list[mineIdx].best_floor } : null,
    },
    essayOk: isGeminiConfigured(),
    tiers: TIERS,
  };
}

async function namesFor(learners: string[]): Promise<Map<string, string>> {
  const ids = learners.filter((l) => l.startsWith("m:")).map((l) => l.slice(2));
  const out = new Map<string, string>();
  if (learners.includes("owner")) out.set("owner", "관리자");
  if (!ids.length) return out;
  const { data } = await getAdminClient().from("members").select("id, display_name").in("id", ids);
  for (const m of (data ?? []) as { id: string; display_name: string }[]) out.set(`m:${m.id}`, m.display_name);
  return out;
}

export async function startTower(learner: string, cardIds: string[], startFloor = 1): Promise<RunView> {
  const ids = [...new Set(cardIds)];
  if (!ids.length || ids.length > TOWER_TEAM_SIZE) throw new GameError(`카드를 1~${TOWER_TEAM_SIZE}장 고르세요.`);
  // 고른 탑(구간): 그 아래 층을 깬 적이 있어야 열림
  if (startFloor !== 1) {
    const { data: prof } = await getAdminClient().from("game_tower_profiles").select("best_floor").eq("learner", learner).maybeSingle();
    const best = (prof as { best_floor: number } | null)?.best_floor ?? 0;
    if (!canStartAt(startFloor, best)) throw new GameError(`지금은 ${best + 1}층부터 이어 오를 수 있어요. 새로고침해 주세요.`, 409);
  }
  const [state, att, cards] = await Promise.all([getGameState(learner), getAttendance(learner).catch(() => null), publishedCards()]);
  const team: TeamCard[] = ids.map((id) => {
    const o = state.owned.find((x) => x.cardId === id);
    if (!o) throw new GameError("보유하지 않은 카드입니다.");
    return { cardId: o.cardId, philosopherId: o.philosopherId, name: o.name, rarity: o.rarity, level: o.level, atk: o.atk, hp: o.hp, artUrl: o.artUrl, battleArtUrl: o.battleArtUrl ?? null, tradition: o.tradition, skillName: o.skillName, skillEffect: o.skillEffect };
  });
  const { roles } = rolesOf(team, cards);
  const enemies = await enemyOrder();
  const seed = hash(`${learner}:${Date.now()}`);
  const enemyId = enemyForFloor(enemies, startFloor, seed)?.philosopherId ?? null;
  const kind = TB.floorKind(startFloor);
  const s0: Stored2 = { ...startState(team.reduce((s, c) => s + c.hp, 0), startFloor), enemyId, used: [], usedQ: [], essays: 0, seed, b: TB.newBattle(startFloor, kind, enemyInfo(cards, enemyId)) };
  const first = TB.enterFloor(s0, startFloor, kind, enemyInfo(cards, enemyId), roles).state;
  const max = triesFor(Boolean(att?.ready && att.checkedToday));
  const { data, error } = await getAdminClient().rpc("game_tower_start", { p_learner: learner, p_day: kstDay(), p_max: max, p_team: team, p_state: first });
  if (error) {
    if (/GAME_TOWER_NO_TRIES/.test(error.message)) throw new GameError(`오늘 도전 횟수(${max}번)를 다 썼어요. 내일 다시 오르세요${max === triesFor(false) ? " · 출석하면 1번 더" : ""}.`, 429);
    throw missing027(error.message) ? new GameError(GAME_027_HINT, 503) : gameError(error.message);
  }
  const run = (await loadRun(learner, (data as { id: string }).id))!;
  if ((data as { resumed: boolean }).resumed || run.current || run.choices || run.state.b?.event) return toView(run);
  const n = await serveNext(learner, run.state, false);
  if (!n.current) throw new GameError("탑에 낼 문제가 아직 없습니다. 관리자가 윤리 퀴즈 문제를 공개하면 열립니다.", 409);
  // 위 구간에서 시작했으면 그 아래 층은 이미 지나온 것으로 표시
  return toView(await saveRun(run, { state: n.state, current: n.current, ...(startFloor > 1 ? { cleared: startFloor - 1 } : {}) }));
}

export interface TowerTurnResult {
  /** 답을 낸 요청이면 판정 (필살기 선택 · 넘기기 요청이면 null) */
  verdict: Verdict | null;
  quick: boolean;
  /** 서버가 계산한 순서 그대로의 전투 사건 (화면은 이것을 재생만) */
  events: BattleEvent[];
  /** 답 직후 필살기를 고를 수 있음 (보스 행동은 아직) */
  skillWindow: boolean;
  dealt: number;
  taken: number;
  shieldUsed: boolean;
  floorCleared: boolean;
  dead: boolean;
  reward: { coins: number; stones: number; ticket: boolean } | null;
  attempt: Pick<AttemptResult, "xp" | "coins" | "levelUp" | "cheer"> | null;
  essayGrading: EssayGrading | null;
  solution: Solution | null;
  /** 같은 요청이 다시 와서 이미 처리된 결과만 돌려줌 */
  replayed?: boolean;
  run: RunView;
}
/** 예전 이름 (화면 · 다른 코드 호환) */
export type TowerAnswerResult = TowerTurnResult;

/** AI 채점 (서술형 층): 판정이 그대로 결과 (탑에서는 자기평가 없음) */
async function gradeEssay(itemId: string, answer: string): Promise<{ verdict: Verdict; grading: EssayGrading | null }> {
  if (answer.trim().length < ESSAY_MIN) return { verdict: "wrong", grading: null };
  if (!isGeminiConfigured()) throw new GameError("AI 채점을 지금 쓸 수 없습니다.", 503);
  const ctx = await getEssayContext(itemId);
  const { data } = await geminiJson(EssayGradingSchema, ESSAY_GRADING_SYSTEM, buildEssayPrompt(ctx, answer));
  const g = tidyGrading(data);
  return { verdict: g.verdict, grading: g };
}

/** 채점 중 표시가 이만큼 오래되면 (서버가 중간에 멈춘 경우) 다시 낼 수 있음 */
const CLAIM_MS = 150_000;

/** 턴을 마무리: 층 돌파 / 쓰러짐 / 다음 문제 */
async function finishTurn(learner: string, P: Prepared, run: RunRow, st: Stored2, out: { cleared: boolean; dead: boolean }, cur: Current | null): Promise<{ patch: Partial<RunRow>; reward: TowerTurnResult["reward"] }> {
  if (out.cleared) {
    const f = st.floor;
    const reward = await payFloor(learner, run.id, f);
    const kind = st.b.boss.kind;
    return {
      patch: { state: st, current: null, choices: TB.choicesAfterClear(st, kind, st.seed + f), cleared: Math.max(run.cleared, f), coins: run.coins + reward.coins, stones: run.stones + reward.stones },
      reward,
    };
  }
  if (out.dead) return { patch: { state: st, current: null, choices: null, status: "over" }, reward: null };
  void cur;
  const n = await serveNext(learner, st);
  return { patch: n.current ? { state: n.state, current: n.current } : { state: n.state, current: null, status: "over" }, reward: null };
}

export async function answerTower(learner: string, runId: string, itemId: string, answer: string): Promise<TowerTurnResult> {
  const run0 = await activeRun(learner, runId);
  const cur = run0.current;
  if (!cur || cur.itemId !== itemId) throw new GameError("지금 문제가 아닙니다. 새로고침해 주세요.", 409);
  if (cur.entered === false) throw new GameError("먼저 층에 입장하세요.", 409);
  if (cur.answered || run0.state.b?.pending) throw new GameError("이미 답한 문제입니다. 필살기를 고르거나 넘기세요.", 409);
  if (cur.claim && Date.now() - new Date(cur.claim).getTime() < CLAIM_MS) throw new GameError("채점 중입니다. 잠시만 기다려 주세요.", 409);
  // 먼저 '채점 중' 표시 (버전 확인) → 같은 답이 두 번 와도 한 번만 채점 · 기록 · 사유력
  const run = await saveRun(run0, { current: { ...cur, claim: new Date().toISOString() } });
  const P = await prepare(run);
  const quick = !cur.essay && Date.now() - new Date(cur.servedAt).getTime() <= TB.quickWindow(P.state.b) * 1000;

  // 채점 + 윤리 퀴즈 기록 (경험치 · 복습 · 정복 · 코인은 퀴즈와 같은 규칙)
  let verdict: Verdict;
  let essayGrading: EssayGrading | null = null;
  let attempt: AttemptResult | null = null;
  try {
    if (cur.essay) {
      const g = await gradeEssay(itemId, answer);
      verdict = g.verdict;
      essayGrading = g.grading;
      attempt = await recordAttempt(learner, { itemId, mode: "free", answer: answer || undefined, self: verdict }).catch(() => null);
    } else {
      attempt = await recordAttempt(learner, { itemId, mode: "free", answer });
      verdict = attempt.result;
    }
  } catch (e) {
    // 채점이 실패하면 표시를 풀어 다시 낼 수 있게
    await saveRun(run, { current: { ...cur, claim: null } }).catch(() => {});
    throw e;
  }

  const ctx = { teamAtk: teamAtk(run.team), quick };
  const a = TB.resolveAnswer(P.state, verdict, P.roles, ctx);
  let st = a.state as Stored2;
  const events = [...a.events];
  let out = { cleared: a.cleared, dead: a.dead };
  let patch: Partial<RunRow>;
  let reward: TowerTurnResult["reward"] = null;
  if (!a.cleared && !a.dead && a.skillWindow) {
    // 필살기 선택창: 보스 행동은 선택 뒤에
    patch = { state: st, current: { ...cur, claim: null, answered: true } };
  } else {
    if (!a.cleared && !a.dead) {
      const t = TB.resolveTurn(st, P.roles, null, ctx);
      st = t.state as Stored2;
      events.push(...t.events);
      out = { cleared: t.cleared, dead: t.dead };
    }
    const f = await finishTurn(learner, P, run, st, out, cur);
    patch = f.patch;
    reward = f.reward;
  }
  const saved = await saveRun(run, patch);
  const solution = await getSolution(itemId).catch(() => null);
  const taken = events.filter((e) => e.t === "enemy").reduce((s, e) => s + (e.t === "enemy" ? e.dmg : 0), 0);
  return {
    verdict,
    quick,
    events,
    skillWindow: Boolean(saved.state.b?.pending),
    dealt: a.dealt,
    taken,
    shieldUsed: a.shieldUsed,
    floorCleared: out.cleared,
    dead: out.dead,
    reward,
    attempt: attempt ? { xp: attempt.xp, coins: attempt.coins, levelUp: attempt.levelUp, cheer: attempt.cheer } : null,
    essayGrading,
    solution,
    run: await toView(saved),
  };
}

/** 답을 낸 뒤: 필살기 하나 쓰기 (skill = 팀 순서) 또는 넘기기 (null) → 보스 행동 → 다음 문제 / 층 돌파 */
export async function resolveTower(learner: string, runId: string, turn: number, skill: number | null): Promise<TowerTurnResult> {
  const run = await activeRun(learner, runId);
  const P = await prepare(run);
  const p = P.state.b.pending;
  const empty = { verdict: null, quick: false, events: [], skillWindow: false, dealt: 0, taken: 0, shieldUsed: false, floorCleared: false, dead: false, reward: null, attempt: null, essayGrading: null, solution: null };
  if (!p || p.turn !== turn) {
    // 이미 처리된 턴 (두 번 누름 · 늦게 온 요청): 지금 상태만
    if (P.state.b.turn > turn) return { ...empty, replayed: true, run: await toView(run, P) };
    throw new GameError("지금은 필살기를 고를 차례가 아닙니다.", 409);
  }
  if (skill !== null && (skill < 0 || skill >= P.roles.length)) throw new GameError("없는 카드입니다.", 400);
  const ctx = { teamAtk: teamAtk(run.team) };
  let t;
  try {
    t = TB.resolveTurn(P.state, P.roles, skill, ctx);
  } catch (e) {
    throw new GameError(e instanceof Error ? e.message : String(e), 409);
  }
  const st = t.state as Stored2;
  const f = await finishTurn(learner, P, run, st, t, run.current);
  const saved = await saveRun(run, f.patch);
  return {
    ...empty,
    events: t.events,
    dealt: t.events.filter((e) => e.t === "skill" || e.t === "reflect").reduce((s, e) => s + ("dmg" in e ? e.dmg : 0), 0),
    taken: t.events.filter((e) => e.t === "enemy").reduce((s, e) => s + (e.t === "enemy" ? e.dmg : 0), 0),
    shieldUsed: t.events.some((e) => e.t === "enemy" && e.blocked),
    floorCleared: t.cleared,
    dead: t.dead,
    reward: f.reward,
    run: await toView(saved),
  };
}

/** 층을 깬 뒤 하나 고르기 (기본 강화 · 유물) → 다음 층. 일반 층은 바로 다음 문제, 보스층은 탑 화면에서 '입장' */
export async function chooseTowerBuff(learner: string, runId: string, choice: string): Promise<RunView> {
  const run = await activeRun(learner, runId);
  const P = await prepare(run);
  if (!run.choices?.includes(choice)) {
    // 이미 골랐으면 (두 번 누름) 지금 상태 그대로
    if (!run.choices && P.state.b.picked.includes(P.state.floor - 1)) return toView(run, P);
    throw new GameError("고를 수 없는 강화입니다.", 409);
  }
  let st: Stored2;
  try {
    st = TB.applyChoice(P.state, choice) as Stored2;
  } catch {
    throw new GameError("고를 수 없는 강화입니다.", 409);
  }
  const wasBoss = st.b.boss.kind === "boss";
  st = { ...st, b: { ...st.b, picked: [...st.b.picked, st.floor].slice(-100) } };
  const n = await advance(learner, P, st, !wasBoss);
  return toView(await saveRun(run, { state: n.state, current: n.current, choices: null, ...(n.status ? { status: n.status } : {}) }));
}

/** 이벤트 층에서 하나 고르기. 특수 전투를 고르면 이 층에서 전투, 아니면 이 층을 지나 다음 층 */
export async function eventTower(learner: string, runId: string, option: string): Promise<{ run: RunView; text: string; reward: TowerTurnResult["reward"] }> {
  const run = await activeRun(learner, runId);
  const P = await prepare(run);
  const ev = P.state.b.event;
  if (!ev) throw new GameError("지금은 이벤트가 없습니다.", 409);
  let r;
  try {
    r = TB.applyEvent(P.state, option);
  } catch (e) {
    throw new GameError(e instanceof Error && !/^[A-Z_]+$/.test(e.message) ? e.message : "고를 수 없는 선택입니다.", 409);
  }
  if (r.spend > 0) {
    const { error } = await getAdminClient().rpc("game_tower_spend", { p_learner: learner, p_run: run.id, p_floor: ev.floor, p_cost: r.spend, p_day: kstDay() });
    if (error) {
      if (/GAME_NOT_ENOUGH_COINS/.test(error.message)) throw new GameError("코인이 모자라요.", 409);
      if (/does not exist|schema cache|Could not find/i.test(error.message)) throw new GameError("상점은 아직 열리지 않았어요. 관리자: supabase/migrations/032_game_tower_v2.sql 을 실행하세요.", 503);
      throw gameError(error.message);
    }
  }
  let st = r.state as Stored2;
  if (r.outcome === "fight") {
    const e = TB.enterFloor(st, st.floor, "elite", enemyInfo(P.cards, st.enemyId), P.roles);
    const n = await serveNext(learner, e.state as Stored2, true);
    const saved = await saveRun(run, n.current ? { state: n.state, current: n.current } : { state: n.state, current: null, status: "over" });
    return { run: await toView(saved), text: r.text, reward: null };
  }
  // 이벤트 층도 깬 층 (코인 · 최고 기록) → 다음 층 바로
  const reward = await payFloor(learner, run.id, st.floor);
  st = { ...st, b: { ...st.b, picked: [...st.b.picked, st.floor].slice(-100) } };
  const n = await advance(learner, P, st, true);
  const saved = await saveRun(run, { state: n.state, current: n.current, choices: null, cleared: Math.max(run.cleared, ev.floor), coins: run.coins + reward.coins, stones: run.stones + reward.stones, ...(n.status ? { status: n.status } : {}) });
  return { run: await toView(saved), text: r.text, reward };
}

/** 탑 화면에서 새 층 입장: 이때 문제가 공개되고 빠른 정답 시계가 시작된다 */
export async function enterTowerFloor(learner: string, runId: string): Promise<RunView> {
  const run = await activeRun(learner, runId);
  if (!run.current || run.current.entered !== false) return toView(run);
  return toView(await saveRun(run, { current: { ...run.current, entered: true, servedAt: new Date().toISOString() } }));
}

/** 힌트권 사용: 보기 하나 지우기 · 진술 하나 분류 공개 · 첫 글자 */
export async function spendTowerHint(learner: string, runId: string): Promise<RunView> {
  const run = await loadRun(learner, runId);
  if (!run || run.status !== "active" || !run.current || run.current.answered || run.state.b?.pending) throw new GameError("지금은 힌트를 쓸 수 없습니다.", 409);
  if (run.current.hint) return toView(run);
  if (run.state.buffs.hints <= 0) throw new GameError("힌트권이 없습니다. 층을 깬 뒤 '스승의 귀띔'을 고르면 생겨요.", 409);
  if (run.current.essay) throw new GameError("서술형에는 힌트를 쓸 수 없습니다.", 409);
  const { data } = await getAdminClient().from("quiz_items").select("payload, answer, accepted_answers, kind").eq("id", run.current.itemId).maybeSingle();
  const row = data as { payload: PracticePayload | null; answer: string | null; accepted_answers: string[] | null; kind: string } | null;
  let hint: TowerHint | null = null;
  const p = row?.payload as (PracticePayload & { mode: string }) | null;
  const seed = run.state.seed + run.state.answered;
  if (row?.kind === "practice" && p && p.mode === "choice") {
    const pc = p as unknown as { options: unknown[]; answer: number };
    const wrong = pc.options.map((_, i) => i).filter((i) => i !== pc.answer);
    if (wrong.length) hint = { kind: "remove", index: wrong[seed % wrong.length] };
  } else if (row?.kind === "practice" && p && p.mode === "multi") {
    const pm = p as unknown as { options: unknown[]; answers: number[] };
    const wrong = pm.options.map((_, i) => i).filter((i) => !pm.answers.includes(i));
    if (wrong.length) hint = { kind: "remove", index: wrong[seed % wrong.length] };
  } else if (row?.kind === "practice" && p && p.mode === "classify") {
    const pk = p as unknown as { statements: { group: number }[] };
    if (pk.statements.length) {
      const i = seed % pk.statements.length;
      hint = { kind: "reveal", statement: i, group: pk.statements[i].group };
    }
  } else {
    const ans = (row?.accepted_answers?.[0] ?? row?.answer ?? "").trim();
    if (ans) hint = { kind: "first", text: ans.slice(0, 1) };
  }
  if (!hint) throw new GameError("이 문제에는 힌트를 낼 수 없습니다.", 409);
  return toView(await saveRun(run, { current: { ...run.current, hint }, state: { ...run.state, buffs: { ...run.state.buffs, hints: run.state.buffs.hints - 1 } } }));
}

/** 그만두기 (깬 층 보상은 이미 받음) */
export async function quitTower(learner: string, runId: string): Promise<void> {
  const run = await loadRun(learner, runId);
  if (!run || run.status !== "active") return;
  await saveRun(run, { status: "quit", current: null, choices: null });
}
