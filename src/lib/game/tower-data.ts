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
import {
  applyAnswer,
  applyBuff,
  BUFFS,
  buffChoices,
  EPIC_TICKET_FLOOR,
  enemyForFloor,
  floorCoins,
  floorStones,
  hash,
  isBossFloor,
  nextFloor,
  pickItem,
  QUICK_SEC,
  startState,
  tierOf,
  TIERS,
  triesFor,
  TOWER_TEAM_SIZE,
  type BuffId,
  type RunState,
  type TowerItem,
  type Verdict,
} from "./tower";
import type { Rarity } from "./rules";

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
}
interface Stored extends RunState {
  enemyId: string | null;
  used: string[];
  /** 이번 도전에서 나온 기출 묶음 (예전 도전엔 없음 → used 로 계산) */
  usedQ?: string[];
  essays: number;
  seed: number;
}
interface Current {
  itemId: string;
  servedAt: string;
  essay: boolean;
  /** 힌트를 이미 썼으면 그 내용 (다시 열어도 같은 힌트) */
  hint?: TowerHint | null;
  /** false = 새 층에 아직 들어가지 않음 (탑 화면에서 '입장'을 누르면 문제 공개 · 빠른 정답 시계 시작). 예전 도전은 없음 = 들어감 */
  entered?: boolean;
}
type RunRow = {
  id: string;
  learner: string;
  day: string;
  status: "active" | "over" | "quit";
  team: TeamCard[];
  state: Stored;
  current: Current | null;
  choices: BuffId[] | null;
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
  choices: { id: BuffId; name: string; desc: string }[] | null;
  cleared: number;
  coins: number;
  stones: number;
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

function enemyView(c: CardView | undefined, floor: number): EnemyView | null {
  if (!c) return null;
  return {
    philosopherId: c.philosopherId,
    name: c.name,
    tradition: c.tradition,
    quote: c.quote,
    artUrl: c.artUrl,
    battleArtUrl: c.battleArtUrl ?? null,
    rarity: TIERS[tierOf(floor)].enemy,
    freqRank: c.freqRank ?? null,
  };
}

async function toView(r: RunRow): Promise<RunView> {
  const cards = await publishedCards();
  const enemy = enemyView(
    cards.find((c) => c.philosopherId === r.state.enemyId),
    r.state.floor,
  );
  let item: RunView["item"] = null;
  const awaiting = r.status === "active" && r.current?.entered === false;
  if (r.status === "active" && r.current && !awaiting) {
    const v = await getItemView(r.current.itemId).catch(() => null);
    if (v) item = { ...v, essay: r.current.essay, servedAt: r.current.servedAt, hint: r.current.hint ?? null };
  }
  const { enemyId: _e, used: _u, essays: _s, seed: _d, ...state } = r.state;
  void _e;
  void _u;
  void _s;
  void _d;
  return {
    id: r.id,
    status: r.status,
    state,
    tier: TIERS[tierOf(r.state.floor)],
    boss: isBossFloor(r.state.floor),
    enemy,
    team: r.team,
    teamAtk: teamAtk(r.team),
    item,
    awaiting,
    choices: r.choices?.length ? r.choices.map((id) => ({ id, ...BUFFS[id] })) : null,
    cleared: r.cleared,
    coins: r.coins,
    stones: r.stones,
  };
}

async function loadRun(learner: string, runId?: string): Promise<RunRow | null> {
  let q = getAdminClient().from("game_tower_runs").select("*").eq("learner", learner);
  q = runId ? q.eq("id", runId) : q.eq("status", "active");
  const { data, error } = await q.maybeSingle();
  if (error) throw missing027(error.message) ? new GameError(GAME_027_HINT, 503) : gameError(error.message);
  return (data as RunRow | null) ?? null;
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
  return data as RunRow;
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
async function serveNext(learner: string, s: Stored, entered = true): Promise<{ current: Current | null; state: Stored }> {
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

export async function startTower(learner: string, cardIds: string[]): Promise<RunView> {
  const ids = [...new Set(cardIds)];
  if (!ids.length || ids.length > TOWER_TEAM_SIZE) throw new GameError(`카드를 1~${TOWER_TEAM_SIZE}장 고르세요.`);
  const [state, att] = await Promise.all([getGameState(learner), getAttendance(learner).catch(() => null)]);
  const team: TeamCard[] = ids.map((id) => {
    const o = state.owned.find((x) => x.cardId === id);
    if (!o) throw new GameError("보유하지 않은 카드입니다.");
    return { cardId: o.cardId, philosopherId: o.philosopherId, name: o.name, rarity: o.rarity, level: o.level, atk: o.atk, hp: o.hp, artUrl: o.artUrl, battleArtUrl: o.battleArtUrl ?? null, tradition: o.tradition, skillName: o.skillName };
  });
  const enemies = await enemyOrder();
  const seed = hash(`${learner}:${Date.now()}`);
  const first: Stored = { ...startState(team.reduce((s, c) => s + c.hp, 0)), enemyId: enemyForFloor(enemies, 1, seed)?.philosopherId ?? null, used: [], usedQ: [], essays: 0, seed };
  const max = triesFor(Boolean(att?.ready && att.checkedToday));
  const { data, error } = await getAdminClient().rpc("game_tower_start", { p_learner: learner, p_day: kstDay(), p_max: max, p_team: team, p_state: first });
  if (error) {
    if (/GAME_TOWER_NO_TRIES/.test(error.message)) throw new GameError(`오늘 도전 횟수(${max}번)를 다 썼어요. 내일 다시 오르세요${max === triesFor(false) ? " · 출석하면 1번 더" : ""}.`, 429);
    throw missing027(error.message) ? new GameError(GAME_027_HINT, 503) : gameError(error.message);
  }
  const run = (await loadRun(learner, (data as { id: string }).id))!;
  if ((data as { resumed: boolean }).resumed || run.current) return toView(run);
  const n = await serveNext(learner, run.state, false);
  if (!n.current) throw new GameError("탑에 낼 문제가 아직 없습니다. 관리자가 윤리 퀴즈 문제를 공개하면 열립니다.", 409);
  return toView(await saveRun(run, { state: n.state, current: n.current }));
}

export interface TowerAnswerResult {
  verdict: Verdict;
  dealt: number;
  taken: number;
  shieldUsed: boolean;
  quick: boolean;
  floorCleared: boolean;
  dead: boolean;
  reward: { coins: number; stones: number; ticket: boolean } | null;
  attempt: Pick<AttemptResult, "xp" | "coins" | "levelUp" | "cheer"> | null;
  essayGrading: EssayGrading | null;
  solution: Solution | null;
  run: RunView;
}

/** AI 채점 (서술형 층): 판정이 그대로 결과 (탑에서는 자기평가 없음) */
async function gradeEssay(itemId: string, answer: string): Promise<{ verdict: Verdict; grading: EssayGrading | null }> {
  if (answer.trim().length < ESSAY_MIN) return { verdict: "wrong", grading: null };
  if (!isGeminiConfigured()) throw new GameError("AI 채점을 지금 쓸 수 없습니다.", 503);
  const ctx = await getEssayContext(itemId);
  const { data } = await geminiJson(EssayGradingSchema, ESSAY_GRADING_SYSTEM, buildEssayPrompt(ctx, answer));
  const g = tidyGrading(data);
  return { verdict: g.verdict, grading: g };
}

export async function answerTower(learner: string, runId: string, itemId: string, answer: string): Promise<TowerAnswerResult> {
  const run = await loadRun(learner, runId);
  if (!run || run.status !== "active") throw new GameError("끝난 도전입니다.", 409);
  if (!run.current || run.current.itemId !== itemId) throw new GameError("지금 문제가 아닙니다. 새로고침해 주세요.", 409);
  if (run.current.entered === false) throw new GameError("먼저 층에 입장하세요.", 409);
  const cur = run.current;
  const quick = !cur.essay && Date.now() - new Date(cur.servedAt).getTime() <= QUICK_SEC * 1000;

  // 채점 + 윤리 퀴즈 기록 (경험치 · 복습 · 정복 · 코인은 퀴즈와 같은 규칙)
  let verdict: Verdict;
  let essayGrading: EssayGrading | null = null;
  let attempt: AttemptResult | null = null;
  if (cur.essay) {
    const g = await gradeEssay(itemId, answer);
    verdict = g.verdict;
    essayGrading = g.grading;
    attempt = await recordAttempt(learner, { itemId, mode: "free", answer: answer || undefined, self: verdict }).catch(() => null);
  } else {
    attempt = await recordAttempt(learner, { itemId, mode: "free", answer });
    verdict = attempt.result;
  }

  const out = applyAnswer(run.state, verdict, { teamAtk: teamAtk(run.team), quick });
  let state: Stored = { ...run.state, ...out.state };
  let reward: TowerAnswerResult["reward"] = null;
  let patch: Partial<RunRow>;
  if (out.floorCleared) {
    const f = state.floor;
    const { data, error } = await getAdminClient().rpc("game_tower_clear", {
      p_learner: learner,
      p_run: run.id,
      p_floor: f,
      p_coins: floorCoins(f),
      p_stones: floorStones(f),
      p_ticket_floor: EPIC_TICKET_FLOOR,
      p_day: kstDay(),
      p_week: weekKey(),
    });
    if (error) throw gameError(error.message);
    reward = data as { coins: number; stones: number; ticket: boolean };
    patch = { state, current: null, choices: buffChoices(state, state.seed + f), cleared: Math.max(run.cleared, f), coins: run.coins + reward.coins, stones: run.stones + reward.stones };
  } else if (out.dead) {
    patch = { state, current: null, choices: null, status: "over" };
  } else {
    const n = await serveNext(learner, state);
    state = n.state;
    patch = n.current ? { state, current: n.current } : { state, current: null, status: "over" };
  }
  const saved = await saveRun(run, patch);
  if (saved.status !== "active") await getAdminClient().from("game_tower_runs").update({ ended_at: new Date().toISOString() }).eq("id", saved.id);
  const solution = await getSolution(itemId).catch(() => null);
  return {
    verdict,
    dealt: out.dealt,
    taken: out.taken,
    shieldUsed: out.shieldUsed,
    quick,
    floorCleared: out.floorCleared,
    dead: out.dead,
    reward,
    attempt: attempt ? { xp: attempt.xp, coins: attempt.coins, levelUp: attempt.levelUp, cheer: attempt.cheer } : null,
    essayGrading,
    solution,
    run: await toView(saved),
  };
}

/** 층을 깬 뒤 강화 하나 고르기 → 다음 층 */
export async function chooseTowerBuff(learner: string, runId: string, buff: BuffId): Promise<RunView> {
  const run = await loadRun(learner, runId);
  if (!run || run.status !== "active") throw new GameError("끝난 도전입니다.", 409);
  if (!run.choices?.includes(buff)) throw new GameError("고를 수 없는 강화입니다.", 409);
  const enemies = await enemyOrder();
  const up = nextFloor(applyBuff(run.state, buff));
  let state: Stored = { ...run.state, ...up, enemyId: enemyForFloor(enemies, up.floor, run.state.seed)?.philosopherId ?? null, essays: 0 };
  const n = await serveNext(learner, state, false);
  state = n.state;
  return toView(await saveRun(run, n.current ? { state, current: n.current, choices: null } : { state, current: null, choices: null, status: "over" }));
}

/** 탑 화면에서 새 층 입장: 이때 문제가 공개되고 빠른 정답 시계가 시작된다 */
export async function enterTowerFloor(learner: string, runId: string): Promise<RunView> {
  const run = await loadRun(learner, runId);
  if (!run || run.status !== "active") throw new GameError("끝난 도전입니다.", 409);
  if (!run.current || run.current.entered !== false) return toView(run);
  return toView(await saveRun(run, { current: { ...run.current, entered: true, servedAt: new Date().toISOString() } }));
}

/** 힌트권 사용: 보기 하나 지우기 · 진술 하나 분류 공개 · 첫 글자 */
export async function spendTowerHint(learner: string, runId: string): Promise<RunView> {
  const run = await loadRun(learner, runId);
  if (!run || run.status !== "active" || !run.current) throw new GameError("지금은 힌트를 쓸 수 없습니다.", 409);
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
  await getAdminClient().from("game_tower_runs").update({ ended_at: new Date().toISOString() }).eq("id", run.id);
}
