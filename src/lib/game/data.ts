import "server-only";
import { getAdminClient } from "@/lib/supabase/server";
import { cached, invalidateContent } from "@/lib/cache";
import { classifyPhilosopher } from "@/lib/traditions";
import { kstDay } from "@/lib/quiz/srs";
import { fetchAll } from "@/lib/quiz/paged";
import { opponentLevel, runBattle, seededRandom as seededRandomFor, type BattleEvent, type Difficulty, type Fighter } from "./battle";
import { duelRulesError, normalizeDuelRules, replayDuel, toDuelCard, type DuelAction, type DuelCardDef, type DuelRules } from "./duel";
import { chooseDuelAction } from "./duelAi";
import { pickDuelDeck } from "./duelDeck";
import { buildCampaign, canPlayStage, STAGE_CLEAR_SHARDS, stageBoss, stageBossStats, stageStones } from "./campaign";
import {
  canFuseCard,
  DEFAULT_COIN_RULES,
  DEFAULT_RARITY_MULT,
  effectiveRates,
  fusionMaterials,
  isDefaultBase,
  RARITIES,
  MAX_LEVEL_DEFAULT,
  quizCoins,
  roleBase,
  ROLES,
  statsFor,
  upgradeCost,
  type CoinRules,
  type Rarity,
  type SkillEffect,
} from "./rules";
import { suggestFor } from "./suggestions";

/**
 * 철학자 대난투 서버 데이터.
 * - 사상가 원본(philosophers · question_philosophers)은 읽기만 한다. 사상가 카드 정보(일러스트·필살기·기본 능력치)는 game_cards
 * - 보유 카드는 한 장마다 고유 id (game_user_cards): 같은 사상가의 여러 등급·여러 장 가능 (009)
 * - 코인·뽑기·레벨업·합성은 DB 함수 안에서 잔액 행을 잠그고 요청 id 로 한 번만 처리
 */
export const GAME_MIGRATION_HINT = "철학자 대난투 테이블이 없습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/008_philosopher_game.sql 을 실행하세요.";
export const GAME_009_HINT = "카드 합성·무료 뽑기용 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/009_game_cards_fusion.sql 을 실행하세요.";

const MESSAGES: Record<string, string> = {
  GAME_NOT_ENOUGH_COINS: "코인이 부족합니다. 윤리 퀴즈를 풀어 코인을 모아 보세요.",
  GAME_NO_CARDS: "아직 공개된 카드가 없습니다. 관리자가 카드 일러스트를 준비하면 열립니다.",
  GAME_NOT_OWNED: "보유하지 않은 카드이거나 이미 사용한 카드입니다.",
  GAME_MAX_LEVEL: "이미 최대 레벨입니다.",
  GAME_LEVEL_CHANGED: "다른 화면에서 이미 강화되었습니다. 새로고침 후 다시 시도하세요.",
  GAME_NOT_ENOUGH_SHARDS: "강화 조각이 부족합니다.",
  GAME_FREE_USED: "무료 뽑기는 계정당 1회입니다. 이미 사용했습니다.",
  GAME_FUSION_COUNT: "합성할 카드 수가 맞지 않습니다.",
  GAME_FUSION_MAX: "전설은 최고 등급이라 더 진화할 수 없습니다.",
  GAME_FUSION_RARITY: "같은 등급의 보유 카드끼리만 합성할 수 있습니다.",
  GAME_FUSION_PHILOSOPHER: "같은 사상가의 같은 등급 카드끼리만 합성할 수 있습니다.",
  GAME_FUSION_LOCKED: "잠긴 카드는 재료로 쓸 수 없습니다. 잠금을 풀어 주세요.",
  GAME_FUSION_FEATURED: "대표 카드는 재료로 쓸 수 없습니다. 대표 카드를 바꾼 뒤 다시 시도하세요.",
};

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function gameError(message: string): GameError {
  const code = message.match(/GAME_[A-Z_]+/)?.[0];
  if (code && MESSAGES[code]) return new GameError(MESSAGES[code], code === "GAME_NO_CARDS" ? 409 : 400);
  if (/(game_user_cards|game_free_draws|game_draw_card|game_fuse|game_level_up|game_card_to_shards|featured_card_id|deck_cards|rarity_mult|fusion_)/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message)) return new GameError(GAME_009_HINT, 503);
  if (/game_|function public\.game/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message)) return new GameError(GAME_MIGRATION_HINT, 503);
  return new GameError(message, 500);
}

// ---------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------
export interface GameSettings {
  draw_cost: number;
  rates: Record<Rarity, number>;
  coin_rules: CoinRules;
  max_level: number;
  dup_refund: number; // 008 값 (더 이상 쓰지 않음, 보존)
  rarity_mult: Record<Rarity, number>;
  fusion_count: number;
  fusion_cost: number;
  /** 논쟁 대전 조정값 (013, 없으면 기본값) */
  duel_rules: DuelRules;
  /** 013 적용 여부 (duel_rules 열이 있는지) */
  duel_rules_ready: boolean;
  /** 도장깨기 전장 배경 (분야 → 그림 주소, 016) */
  battle_bg: Record<string, string>;
  battle_bg_ready: boolean;
}
const DEFAULT_SETTINGS: GameSettings = {
  draw_cost: 100,
  rates: { common: 60, rare: 28, epic: 10, legendary: 2 },
  coin_rules: DEFAULT_COIN_RULES,
  max_level: MAX_LEVEL_DEFAULT,
  dup_refund: 20,
  rarity_mult: DEFAULT_RARITY_MULT,
  fusion_count: 2,
  fusion_cost: 0,
  duel_rules: normalizeDuelRules(null),
  duel_rules_ready: false,
  battle_bg: {},
  battle_bg_ready: false,
};

/**
 * 게임 설정 · 공개 카드: 모든 학습자에게 같으므로 서버에 저장해 두고 재사용 (메인·퀴즈·게임 화면을 열 때마다 DB 를 여러 번 왕복하지 않게).
 * 관리자가 카드·설정을 저장하면 바로 비운다 (invalidateContent). 관리자 화면은 loadGameSettings 로 항상 최신을 읽는다.
 */
export const getGameSettings = cached("game-settings", () => loadGameSettings());

export async function loadGameSettings(): Promise<GameSettings> {
  const { data, error } = await getAdminClient().from("game_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw gameError(error.message);
  const d = (data ?? {}) as Partial<GameSettings>;
  return {
    draw_cost: d.draw_cost ?? DEFAULT_SETTINGS.draw_cost,
    rates: { ...DEFAULT_SETTINGS.rates, ...(d.rates ?? {}) },
    coin_rules: { ...DEFAULT_COIN_RULES, ...(d.coin_rules ?? {}) },
    max_level: d.max_level ?? DEFAULT_SETTINGS.max_level,
    dup_refund: d.dup_refund ?? DEFAULT_SETTINGS.dup_refund,
    rarity_mult: { ...DEFAULT_RARITY_MULT, ...(d.rarity_mult ?? {}) },
    fusion_count: d.fusion_count ?? DEFAULT_SETTINGS.fusion_count,
    fusion_cost: d.fusion_cost ?? DEFAULT_SETTINGS.fusion_cost,
    duel_rules: normalizeDuelRules(d.duel_rules),
    duel_rules_ready: Boolean(data && "duel_rules" in data),
    battle_bg: cleanBattleBg((d as { battle_bg?: unknown }).battle_bg),
    battle_bg_ready: Boolean(data && "battle_bg" in data),
  };
}

/** 전장 배경을 고를 수 있는 분야 */
export const BATTLE_BG_KEYS = ["동양윤리", "한국윤리", "서양윤리", "사회사상"] as const;
function cleanBattleBg(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, u]) => (BATTLE_BG_KEYS as readonly string[]).includes(k) && typeof u === "string" && /^https?:\/\//.test(u))) as Record<string, string>;
}
export const GAME_016_HINT = "전장 배경 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/016_game_battle_bg.sql 을 실행하세요.";

/** 관리자: 분야별 전장 배경 저장 (url = null 이면 기본 배경으로) */
export async function saveBattleBg(tradition: (typeof BATTLE_BG_KEYS)[number], url: string | null) {
  const db = getAdminClient();
  const { data, error } = await db.from("game_settings").select("battle_bg").eq("id", 1).maybeSingle();
  if (error) throw /battle_bg/.test(error.message) ? new GameError(GAME_016_HINT, 503) : gameError(error.message);
  const next = { ...cleanBattleBg(data?.battle_bg) };
  if (url) next[tradition] = url;
  else delete next[tradition];
  const { error: e2 } = await db.from("game_settings").upsert({ id: 1, battle_bg: next, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (e2) throw /battle_bg/.test(e2.message) ? new GameError(GAME_016_HINT, 503) : gameError(e2.message);
  invalidateContent();
}

export const GAME_013_HINT = "논쟁 대전 조정값 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/013_game_duel_rules.sql 을 실행하세요.";

/** 관리자: 논쟁 대전 조정값. 이미 시작한 대전은 시작할 때의 규칙 그대로 (대전마다 규칙 스냅샷) */
export async function saveDuelRules(rules: DuelRules) {
  const why = duelRulesError(rules);
  if (why) throw new GameError(why);
  const db = getAdminClient();
  const { data, error } = await db.from("game_settings").update({ duel_rules: rules, updated_at: new Date().toISOString() }).eq("id", 1).select("id");
  if (error) throw /duel_rules/.test(error.message) ? new GameError(GAME_013_HINT, 503) : gameError(error.message);
  if (!data?.length) {
    const ins = await db.from("game_settings").upsert({ id: 1, duel_rules: rules, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (ins.error) throw /duel_rules/.test(ins.error.message) ? new GameError(GAME_013_HINT, 503) : gameError(ins.error.message);
  }
  invalidateContent();
}

export async function saveGameSettings(s: Omit<GameSettings, "dup_refund" | "duel_rules" | "duel_rules_ready" | "battle_bg" | "battle_bg_ready">) {
  // 등급이 오르면 능력치도 반드시 오르도록
  const m = s.rarity_mult;
  if (!(m.common > 0 && m.rare > m.common && m.epic > m.rare && m.legendary > m.epic)) throw new GameError("등급 배율은 일반 < 희귀 < 영웅 < 전설 순으로 커야 합니다.");
  const { error } = await getAdminClient()
    .from("game_settings")
    .upsert({ id: 1, ...s, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw gameError(error.message);
  invalidateContent();
}

// ---------------------------------------------------------------------
// 사상가 카드 정보 (등급과 무관: 일러스트·필살기·기본 능력치)
// ---------------------------------------------------------------------
export interface CardView {
  philosopherId: string;
  name: string;
  originalName: string | null;
  tradition: string; // 동양윤리 · 서양윤리 …
  baseAtk: number; // 일반 Lv.1 기준
  baseHp: number;
  skillName: string;
  skillEffect: SkillEffect;
  skillDesc: string;
  quote: string;
  artUrl: string | null;
  artBasis: "portrait" | "reconstruction";
  artNote: string;
  published: boolean;
  /** 성향 (공격형·광역형·제압형·지원형·수호형) */
  role?: string;
  /** 전투 캐릭터 (투명 배경 전신, 오른쪽을 봄). 015 전이거나 없으면 null */
  battleArtUrl?: string | null;
}

type CardRow = {
  philosopher_id: string;
  base_atk: number;
  base_hp: number;
  skill_name: string;
  skill_effect: SkillEffect;
  skill_desc: string;
  quote: string;
  art_url: string | null;
  art_basis: "portrait" | "reconstruction";
  art_note: string;
  published: boolean;
  updated_at: string;
  battle_art_url?: string | null;
};
type PhRow = { id: string; name: string; aliases: string[] | null; original_name: string | null; tradition: string | null; era: string | null };

const toView = (c: CardRow, p: PhRow): CardView => ({
  philosopherId: c.philosopher_id,
  name: p.name,
  originalName: p.original_name,
  tradition: classifyPhilosopher({ name: p.name, tradition: p.tradition }),
  // 관리자가 기본값(40/300)을 그대로 두면 사상가 성향대로 자동 분배
  ...(isDefaultBase(c.base_atk, c.base_hp) ? (({ atk, hp }) => ({ baseAtk: atk, baseHp: hp }))(roleBase(p.name, c.skill_effect)) : { baseAtk: c.base_atk, baseHp: c.base_hp }),
  role: ROLES[c.skill_effect]?.name,
  skillName: c.skill_name,
  skillEffect: c.skill_effect,
  skillDesc: c.skill_desc,
  quote: c.quote,
  artUrl: c.art_url,
  artBasis: c.art_basis,
  artNote: c.art_note,
  published: c.published,
  battleArtUrl: c.battle_art_url ?? null,
});

/** 기출 분석에 주요·비교 사상가로 연결된 사상가 id → 연결 문항 수 */
async function linkedCounts(): Promise<Map<string, number>> {
  const rows = await fetchAll<{ philosopher_id: string }>((from, to) =>
    getAdminClient().from("question_philosophers").select("philosopher_id").in("role", ["main", "comparison"]).order("question_id").order("philosopher_id").range(from, to),
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.philosopher_id, (m.get(r.philosopher_id) ?? 0) + 1);
  return m;
}

async function loadCards(ids?: string[]): Promise<{ cards: CardRow[]; philosophers: Map<string, PhRow> }> {
  const db = getAdminClient();
  let q = db.from("game_cards").select("*");
  if (ids) q = q.in("philosopher_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await q;
  if (error) throw gameError(error.message);
  const cards = (data ?? []) as CardRow[];
  const pids = cards.map((c) => c.philosopher_id);
  const { data: ps, error: pe } = pids.length
    ? await db.from("philosophers").select("id, name, aliases, original_name, tradition, era").in("id", pids)
    : { data: [], error: null };
  if (pe) throw gameError(pe.message);
  return { cards, philosophers: new Map(((ps ?? []) as PhRow[]).map((p) => [p.id, p])) };
}

/** 뽑기에 나오는 사상가 (공개 + 일러스트 + 기출 연결). DB 함수와 같은 조건 */
export const publishedCards = cached("game-published-cards", () => loadPublishedCards());

export async function loadPublishedCards(): Promise<CardView[]> {
  const { data, error } = await getAdminClient().rpc("game_draw_pool");
  if (error) throw gameError(error.message);
  const ids = ((data ?? []) as { philosopher_id: string }[]).map((r) => r.philosopher_id);
  const { cards, philosophers } = await loadCards(ids);
  return cards.filter((c) => philosophers.has(c.philosopher_id)).map((c) => toView(c, philosophers.get(c.philosopher_id)!));
}

// ---------------------------------------------------------------------
// 학습자 상태
// ---------------------------------------------------------------------
export interface OwnedCard extends CardView {
  cardId: string;
  rarity: Rarity;
  level: number;
  locked: boolean;
  source: "legacy" | "draw" | "free";
  atk: number;
  hp: number;
  upgrade: { shards: number; coins: number } | null; // null = 최대 레벨
}

export interface GameState {
  coins: number;
  settings: {
    drawCost: number;
    maxLevel: number;
    rates: Record<Rarity, number>;
    effectiveRates: Record<Rarity, number>;
    coinRules: CoinRules;
    rarityMult: Record<Rarity, number>;
    fusionCount: number;
    fusionCost: number;
    duelRules: DuelRules;
    battleBg: Record<string, string>;
  };
  cards: CardView[]; // 공개 사상가 (도감)
  owned: OwnedCard[]; // 보유 카드 한 장씩 (공개가 내려가도 일러스트가 있으면 계속 보유)
  shards: Record<string, number>; // 사상가별 강화 조각
  featuredId: string | null; // 대표 카드 id
  deck: string[]; // 배틀 덱 카드 id
  record: { wins: number; losses: number };
  /** 논쟁 대전 전적 (ready=false 면 012 적용 전) */
  duel: { ready: boolean; wins: number; losses: number; draws: number };
  /** 논쟁 대전 덱 (보유 카드 id, 비어 있으면 자동) */
  duelDeck: string[];
  /** 공용 강화석 (도장깨기 보상, 어느 사상가의 강화 조각으로든 바꿈). ready=false 면 017 적용 전 */
  stones: { ready: boolean; count: number };
  /** 사상가 도장깨기 (ready=false 면 014 적용 전) */
  campaign: { ready: boolean; cleared: { id: string; at: string; turns: number | null }[] };
  freeDraw: { available: boolean };
}

type UserCardRow = { id: string; philosopher_id: string; rarity: Rarity; level: number; locked: boolean; source: "legacy" | "draw" | "free"; created_at: string };

export async function getGameState(learner: string): Promise<GameState> {
  const db = getAdminClient();
  const [settings, cards, wallet, uc, col, prof, free, camp] = await Promise.all([
    getGameSettings(),
    publishedCards(),
    db.from("game_wallets").select("coins").eq("learner", learner).maybeSingle(),
    db.from("game_user_cards").select("id, philosopher_id, rarity, level, locked, source, created_at").eq("learner", learner).eq("status", "owned").order("created_at"),
    db.from("game_collection").select("philosopher_id, shards").eq("learner", learner),
    // * : 012(논쟁 대전) 전이면 duel_* 열이 없으므로 있는 열만 읽는다
    db.from("game_profiles").select("*").eq("learner", learner).maybeSingle(),
    db.from("game_free_draws").select("learner").eq("learner", learner).maybeSingle(),
    db.from("game_campaign").select("philosopher_id, cleared_at, turns").eq("learner", learner),
  ]);
  for (const r of [wallet, uc, col, prof, free]) if (r.error) throw gameError(r.error.message);
  const rows = (uc.data ?? []) as UserCardRow[];
  const missing = [...new Set(rows.map((r) => r.philosopher_id))].filter((id) => !cards.some((c) => c.philosopherId === id));
  const extra = missing.length ? await loadCards(missing) : { cards: [], philosophers: new Map<string, PhRow>() };
  const known = new Map<string, CardView>([
    ...cards.map((c) => [c.philosopherId, c] as const),
    ...extra.cards.filter((c) => c.art_url && extra.philosophers.has(c.philosopher_id)).map((c) => [c.philosopher_id, toView(c, extra.philosophers.get(c.philosopher_id)!)] as const),
  ]);
  const owned: OwnedCard[] = rows
    .filter((r) => known.has(r.philosopher_id))
    .map((r) => {
      const c = known.get(r.philosopher_id)!;
      const st = statsFor({ atk: c.baseAtk, hp: c.baseHp }, r.rarity, r.level, settings.rarity_mult);
      return { ...c, cardId: r.id, rarity: r.rarity, level: r.level, locked: r.locked, source: r.source, atk: st.atk, hp: st.hp, upgrade: r.level >= settings.max_level ? null : upgradeCost(r.level) };
    });
  const p = prof.data as { featured_card_id: string | null; deck_cards: string[] | null; wins: number; losses: number } | null;
  const ownedIds = new Set(owned.map((o) => o.cardId));
  return {
    coins: (wallet.data as { coins: number } | null)?.coins ?? 0,
    settings: {
      drawCost: settings.draw_cost,
      maxLevel: settings.max_level,
      rates: settings.rates,
      effectiveRates: effectiveRates(settings.rates),
      coinRules: settings.coin_rules,
      rarityMult: settings.rarity_mult,
      fusionCount: settings.fusion_count,
      fusionCost: settings.fusion_cost,
      duelRules: settings.duel_rules,
      battleBg: settings.battle_bg,
    },
    cards,
    owned,
    shards: Object.fromEntries(((col.data ?? []) as { philosopher_id: string; shards: number }[]).map((r) => [r.philosopher_id, r.shards])),
    featuredId: p?.featured_card_id && ownedIds.has(p.featured_card_id) ? p.featured_card_id : null,
    deck: (p?.deck_cards ?? []).filter((id) => ownedIds.has(id)).slice(0, 3),
    record: { wins: p?.wins ?? 0, losses: p?.losses ?? 0 },
    duel: {
      ready: p ? "duel_wins" in p : true,
      wins: (p as { duel_wins?: number } | null)?.duel_wins ?? 0,
      losses: (p as { duel_losses?: number } | null)?.duel_losses ?? 0,
      draws: (p as { duel_draws?: number } | null)?.duel_draws ?? 0,
    },
    stones: { ready: Boolean(p && "stones" in p), count: (p as { stones?: number } | null)?.stones ?? 0 },
    campaign: {
      ready: !camp.error,
      cleared: ((camp.data ?? []) as { philosopher_id: string; cleared_at: string; turns: number | null }[]).map((c) => ({ id: c.philosopher_id, at: c.cleared_at, turns: c.turns })),
    },
    duelDeck: (((p as { duel_deck?: string[] } | null)?.duel_deck ?? []) as string[]).filter((id) => ownedIds.has(id)).slice(0, settings.duel_rules.deckSize),
    freeDraw: { available: !free.data },
  };
}

export interface FeaturedSummary {
  coins: number;
  featured: OwnedCard | null;
  ownedCount: number;
  cardCount: number;
  maxLevel: number;
  freeDraw: boolean;
  shards: number; // 대표 카드 사상가의 강화 조각
  fusable: number; // 대표 카드와 같은 사상가 · 같은 등급의 재료 후보 수 (합성 장수-1 이상일 때만, 아니면 0)
}

/** 퀴즈 홈의 '나의 철학자' (테이블이 없으면 null → 퀴즈는 그대로 동작) */
export async function getFeatured(learner: string): Promise<FeaturedSummary | null> {
  try {
    const s = await getGameState(learner);
    const f = s.owned.find((o) => o.cardId === s.featuredId) ?? null;
    return {
      coins: s.coins,
      featured: f,
      ownedCount: s.owned.length,
      cardCount: s.cards.length,
      maxLevel: s.settings.maxLevel,
      freeDraw: s.freeDraw.available,
      shards: f ? (s.shards[f.philosopherId] ?? 0) : 0,
      fusable: f && canFuseCard(f, s.owned, s.featuredId, s.settings.fusionCount) ? fusionMaterials(f, s.owned, s.featuredId).length : 0,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// 뽑기 · 레벨업 · 합성 · 조각 전환 · 잠금 · 대표 카드 · 덱
// ---------------------------------------------------------------------
export interface DrawResult {
  card: OwnedCard;
  isNewPhilosopher: boolean;
  free: boolean;
  autoFeatured: boolean;
  coins: number;
  replayed: boolean;
}

async function ownedCard(learner: string, cardId: string): Promise<OwnedCard> {
  const s = await getGameState(learner);
  const c = s.owned.find((o) => o.cardId === cardId);
  if (!c) throw new GameError("카드 정보를 찾을 수 없습니다.", 500);
  return c;
}

/** 카드 뽑기. free = 계정당 최초 1회 무료 (비용은 서버가 정함, 클라이언트가 바꿀 수 없음) */
export async function drawCard(learner: string, requestId: string, free: boolean): Promise<DrawResult> {
  const { data, error } = await getAdminClient().rpc("game_draw_card", { p_learner: learner, p_ref: `${free ? "free" : "draw"}:${requestId}`, p_day: kstDay(), p_free: free });
  if (error) throw gameError(error.message);
  const r = data as { cardId: string; isNewPhilosopher?: boolean; free: boolean; autoFeatured?: boolean; coins: number; replayed: boolean };
  return { card: await ownedCard(learner, r.cardId), isNewPhilosopher: Boolean(r.isNewPhilosopher), free: r.free, autoFeatured: Boolean(r.autoFeatured), coins: r.coins, replayed: r.replayed };
}

/** 레벨업: 사상가별 강화 조각 + 코인 (확정 성공) */
export async function levelUpCard(learner: string, cardId: string, requestId: string) {
  const db = getAdminClient();
  const { data: row, error } = await db.from("game_user_cards").select("level").eq("learner", learner).eq("id", cardId).eq("status", "owned").maybeSingle();
  if (error) throw gameError(error.message);
  if (!row) throw new GameError(MESSAGES.GAME_NOT_OWNED);
  const cost = upgradeCost(row.level as number);
  const { data, error: e } = await db.rpc("game_level_up", {
    p_learner: learner,
    p_card: cardId,
    p_ref: `upgrade:${requestId}`,
    p_day: kstDay(),
    p_from_level: row.level,
    p_shards: cost.shards,
    p_coins: cost.coins,
  });
  if (e) throw gameError(e.message);
  return data as { fromLevel: number; level: number; coins: number; replayed: boolean };
}

/** 합성(진화): 기준 카드 + 같은 사상가 · 같은 등급 재료 → 기준 카드가 한 단계 위 등급 (확정) */
export async function fuseCards(learner: string, baseId: string, materialIds: string[], requestId: string) {
  // 같은 사상가끼리만 (DB 함수 010 도 같은 조건을 확인 — 010 적용 전에도 여기서 막는다).
  // 이미 소모된 카드(재시도)는 DB 가 처음 결과를 돌려주도록 그대로 넘긴다.
  const { data: rows, error: readErr } = await getAdminClient().from("game_user_cards").select("id, philosopher_id, status").eq("learner", learner).in("id", [baseId, ...materialIds]);
  if (readErr) throw gameError(readErr.message);
  const base = rows?.find((r) => r.id === baseId);
  if (base && base.status === "owned" && rows!.some((r) => r.id !== baseId && r.status === "owned" && r.philosopher_id !== base.philosopher_id)) {
    throw new GameError(MESSAGES.GAME_FUSION_PHILOSOPHER);
  }
  const { data, error } = await getAdminClient().rpc("game_fuse", { p_learner: learner, p_base: baseId, p_materials: materialIds, p_ref: `fusion:${requestId}`, p_day: kstDay() });
  if (error) throw gameError(error.message);
  const r = data as { cardId: string; rarity: Rarity; level: number; coins: number; replayed: boolean };
  return { ...r, card: await ownedCard(learner, r.cardId) };
}

/** 카드 → 같은 사상가 강화 조각 (카드는 소모, 다시 합성에 못 씀) */
export async function cardToShards(learner: string, cardId: string) {
  const { data, error } = await getAdminClient().rpc("game_card_to_shards", { p_learner: learner, p_card: cardId });
  if (error) throw gameError(error.message);
  return data as { shardsGained: number; shards: number; philosopherId: string };
}

export async function setLocked(learner: string, cardId: string, locked: boolean) {
  const { data, error } = await getAdminClient().from("game_user_cards").update({ locked, updated_at: new Date().toISOString() }).eq("learner", learner).eq("id", cardId).eq("status", "owned").select("id");
  if (error) throw gameError(error.message);
  if (!data?.length) throw new GameError(MESSAGES.GAME_NOT_OWNED);
}

async function assertOwned(learner: string, ids: string[]) {
  const { data, error } = await getAdminClient().from("game_user_cards").select("id").eq("learner", learner).eq("status", "owned").in("id", ids);
  if (error) throw gameError(error.message);
  if ((data ?? []).length !== new Set(ids).size) throw new GameError(MESSAGES.GAME_NOT_OWNED);
}

export async function setFeatured(learner: string, cardId: string | null) {
  if (cardId) await assertOwned(learner, [cardId]);
  const { error } = await getAdminClient()
    .from("game_profiles")
    .upsert({ learner, featured_card_id: cardId, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) throw gameError(error.message);
}

export async function setDeck(learner: string, ids: string[]) {
  if (new Set(ids).size !== ids.length || ids.length > 3) throw new GameError("서로 다른 카드 3장까지 고르세요.");
  if (ids.length) await assertOwned(learner, ids);
  const { error } = await getAdminClient().from("game_profiles").upsert({ learner, deck_cards: ids, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) throw gameError(error.message);
}

// ---------------------------------------------------------------------
// 배틀 (보상 없음: 코인은 학습으로만)
// ---------------------------------------------------------------------
export interface BattleCard {
  key: string;
  cardId: string | null;
  philosopherId: string;
  name: string;
  rarity: Rarity;
  level: number;
  atk: number;
  hp: number;
  skillName: string;
  skillEffect: SkillEffect;
  artUrl: string | null;
  tradition: string;
  battleArtUrl?: string | null;
}
export interface BattleReplay {
  id: string;
  difficulty: Difficulty;
  me: BattleCard[];
  foe: BattleCard[];
  first: "me" | "foe";
  winner: "me" | "foe";
  events: BattleEvent[];
  record: { wins: number; losses: number };
}

export async function playBattle(learner: string, deckIds: string[], difficulty: Difficulty): Promise<BattleReplay> {
  if (deckIds.length !== 3 || new Set(deckIds).size !== 3) throw new GameError("서로 다른 카드 3장으로 덱을 구성하세요.");
  const [state, settings] = await Promise.all([getGameState(learner), getGameSettings()]);
  const mine = deckIds.map((id) => state.owned.find((o) => o.cardId === id));
  if (mine.some((m) => !m)) throw new GameError(MESSAGES.GAME_NOT_OWNED);
  if (state.cards.length < 3) throw new GameError("상대 덱을 만들 공개 카드가 아직 3장 미만입니다.", 409);
  const seed = crypto.randomUUID();
  // 상대: 공개 사상가 중 무작위 3명. 등급은 내 덱과 같은 구성(섞어서), 레벨은 내 덱 기준 ± 난이도
  const lv = opponentLevel(mine.map((m) => m!.level), difficulty, state.settings.maxLevel);
  const shuffled = [...state.cards].map((c, i) => ({ c, k: hashSeed(`${seed}:${i}`) })).sort((a, b) => a.k - b.k).map((x) => x.c);
  const foeRarities = mine.map((m) => m!.rarity).sort((a, b) => hashSeed(`${seed}:r:${a}`) - hashSeed(`${seed}:r:${b}`));
  const asBattle = (c: CardView, rarity: Rarity, level: number, key: string, cardId: string | null): BattleCard => {
    const st = statsFor({ atk: c.baseAtk, hp: c.baseHp }, rarity, level, settings.rarity_mult);
    return { key, cardId, philosopherId: c.philosopherId, name: c.name, rarity, level, atk: st.atk, hp: st.hp, skillName: c.skillName, skillEffect: c.skillEffect, artUrl: c.artUrl, tradition: c.tradition };
  };
  const me = mine.map((m, i) => asBattle(m!, m!.rarity, m!.level, `me-${i}`, m!.cardId));
  const foe = shuffled.slice(0, 3).map((c, i) => asBattle(c, foeRarities[i], lv, `foe-${i}`, null));
  const toFighter = (b: BattleCard): Fighter => ({ key: b.key, philosopherId: b.philosopherId, name: b.name, atk: b.atk, hp: b.hp, skillName: b.skillName, skillEffect: b.skillEffect });
  const r = runBattle(me.map(toFighter), foe.map(toFighter), seed);

  const db = getAdminClient();
  const { data: saved, error } = await db
    .from("game_battles")
    .insert({ learner, difficulty, deck: me, opponent: foe, seed, result: r.winner === "me" ? "win" : "lose", turns: r.actions })
    .select("id")
    .single();
  if (error) throw gameError(error.message);
  const record = { wins: state.record.wins + (r.winner === "me" ? 1 : 0), losses: state.record.losses + (r.winner === "me" ? 0 : 1) };
  await db.from("game_profiles").upsert({ learner, deck_cards: deckIds, wins: record.wins, losses: record.losses, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  return { id: saved.id as string, difficulty, me, foe, first: r.first, winner: r.winner, events: r.events, record };
}

// ---------------------------------------------------------------------
// 사상가 도장깨기: 내 배틀 덱 3장 vs 관 보스 1명 (자동 배틀, 서버가 결과를 정함)
// ---------------------------------------------------------------------
export const GAME_014_HINT = "사상가 도장깨기 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/014_game_campaign.sql 을 실행하세요.";

export interface StageReplay extends BattleReplay {
  stage: { bossId: string; no: number; total: number };
  /** 이번에 처음 깼으면 보상: 공용 강화석(017) 또는 보스 강화 조각(017 전) */
  firstClear: boolean;
  reward: { kind: "stones" | "shards"; amount: number } | null;
  cleared: number; // 이번 결과까지 깬 관 수
}

export async function playStage(learner: string, bossId: string, deckIds: string[]): Promise<StageReplay> {
  if (deckIds.length !== 3 || new Set(deckIds).size !== 3) throw new GameError("뽑기로 얻은 서로 다른 카드 3장으로 팀을 꾸리세요.");
  const [state, settings] = await Promise.all([getGameState(learner), getGameSettings()]);
  if (!state.campaign.ready) throw new GameError(GAME_014_HINT, 503);
  const mine = deckIds.map((id) => state.owned.find((o) => o.cardId === id));
  if (mine.some((m) => !m)) throw new GameError(MESSAGES.GAME_NOT_OWNED);
  const stages = buildCampaign(state.cards, state.settings.maxLevel);
  const stage = stages.find((x) => x.bossId === bossId);
  const card = state.cards.find((c) => c.philosopherId === bossId);
  if (!stage || !card) throw new GameError("없는 관입니다.", 404);
  const cleared = new Set(state.campaign.cleared.map((c) => c.id));
  if (!canPlayStage(stages, cleared, bossId)) throw new GameError("앞 관을 먼저 깨야 열립니다.", 409);

  const seed = crypto.randomUUID();
  const me: BattleCard[] = mine.map((m, i) => ({ key: `me-${i}`, cardId: m!.cardId, philosopherId: m!.philosopherId, name: m!.name, rarity: m!.rarity, level: m!.level, atk: m!.atk, hp: m!.hp, skillName: m!.skillName, skillEffect: m!.skillEffect, artUrl: m!.artUrl, tradition: m!.tradition, battleArtUrl: m!.battleArtUrl ?? null }));
  const bs = stageBossStats(stage, settings.rarity_mult);
  const boss: BattleCard = { key: "foe-0", cardId: null, philosopherId: card.philosopherId, name: card.name, rarity: stage.rarity, level: stage.level, atk: bs.atk, hp: bs.hp, skillName: card.skillName, skillEffect: card.skillEffect, artUrl: card.artUrl, tradition: card.tradition, battleArtUrl: card.battleArtUrl ?? null };
  const toFighter = (b: BattleCard): Fighter => ({ key: b.key, philosopherId: b.philosopherId, name: b.name, atk: b.atk, hp: b.hp, skillName: b.skillName, skillEffect: b.skillEffect });
  const r = runBattle(me.map(toFighter), [stageBoss(stage, card, settings.rarity_mult)], seed);
  const win = r.winner === "me";
  const difficulty: Difficulty = stage.tier < 2 ? "easy" : stage.tier < 4 ? "normal" : "hard";

  const db = getAdminClient();
  const { data: saved, error } = await db
    .from("game_battles")
    .insert({ learner, difficulty, deck: me, opponent: [{ ...boss, stage: stage.no }], seed, result: win ? "win" : "lose", turns: r.actions })
    .select("id")
    .single();
  if (error) throw gameError(error.message);
  // 팀(배틀 덱)은 빠른 대전과 같이 저장
  await db.from("game_profiles").upsert({ learner, deck_cards: deckIds, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  let firstClear = false;
  if (win) {
    const withStones = state.stones.ready;
    const { data: ok, error: e } = withStones
      ? await db.rpc("game_campaign_clear_stones", { p_learner: learner, p_philosopher: bossId, p_duel: saved.id, p_turns: r.actions, p_stones: stageStones(stage.no) })
      : await db.rpc("game_campaign_clear", { p_learner: learner, p_philosopher: bossId, p_duel: saved.id, p_turns: r.actions, p_shards: STAGE_CLEAR_SHARDS });
    if (e) throw /game_campaign/.test(e.message) ? new GameError(GAME_014_HINT, 503) : gameError(e.message);
    firstClear = ok === true;
    cleared.add(bossId);
  }
  return {
    id: saved.id as string,
    difficulty,
    me,
    foe: [boss],
    first: r.first,
    winner: r.winner,
    events: r.events,
    record: state.record,
    stage: { bossId, no: stage.no, total: stages.length },
    firstClear,
    reward: firstClear ? (state.stones.ready ? { kind: "stones", amount: stageStones(stage.no) } : { kind: "shards", amount: STAGE_CLEAR_SHARDS }) : null,
    cleared: stages.filter((x) => cleared.has(x.bossId)).length,
  };
}

export const GAME_017_HINT = "강화석 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/017_game_stones.sql 을 실행하세요.";

/** 공용 강화석 → 그 사상가의 강화 조각 (1개 = 1조각). 보유 카드가 있는 사상가에게만 */
export async function spendStones(learner: string, philosopherId: string, count: number): Promise<{ stones: number; shards: number }> {
  if (!Number.isInteger(count) || count < 1 || count > 999) throw new GameError("강화석 개수를 확인하세요.");
  const state = await getGameState(learner);
  if (!state.stones.ready) throw new GameError(GAME_017_HINT, 503);
  if (!state.owned.some((o) => o.philosopherId === philosopherId)) throw new GameError("보유한 사상가에게만 강화석을 쓸 수 있습니다.");
  if (state.stones.count < count) throw new GameError(`강화석이 모자랍니다 (보유 ${state.stones.count}개).`);
  const { data, error } = await getAdminClient().rpc("game_use_stones", { p_learner: learner, p_philosopher: philosopherId, p_count: count });
  if (error) {
    if (/GAME_STONES_SHORT/.test(error.message)) throw new GameError("강화석이 모자랍니다.");
    if (/game_use_stones/.test(error.message)) throw new GameError(GAME_017_HINT, 503);
    throw gameError(error.message);
  }
  return { stones: data as number, shards: (state.shards[philosopherId] ?? 0) + count };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------
// 학습 코인 (윤리 퀴즈에서 호출). 실패해도 퀴즈 기록은 그대로
// ---------------------------------------------------------------------
export async function grantQuizCoins(
  learner: string,
  a: { attemptId: string; format: "fill" | "essay"; selfGraded: boolean; result: "correct" | "partial" | "wrong"; answerLength: number; xpAwarded: boolean; reconquered: boolean; missionDay: string | null },
): Promise<{ coins: number; note: string }> {
  try {
    const settings = await getGameSettings();
    const rules = settings.coin_rules;
    const c = quizCoins(a, rules);
    const db = getAdminClient();
    const day = kstDay();
    let total = 0;
    const grant = async (amount: number, kind: string, ref: string, cap: number | null) => {
      if (amount <= 0) return;
      const { data, error } = await db.rpc("game_grant", { p_learner: learner, p_amount: amount, p_kind: kind, p_ref: ref, p_day: day, p_meta: { attemptId: a.attemptId }, p_daily_cap: cap });
      if (error) throw new Error(error.message);
      total += (data as number) ?? 0;
    };
    await grant(c.base, "quiz", `attempt:${a.attemptId}`, rules.daily_cap);
    await grant(c.reconquer, "reconquer", `reconquer:${a.attemptId}`, rules.daily_cap);
    if (a.missionDay) await grant(rules.mission, "mission", `mission:${a.missionDay}`, null);
    const capped = c.base + c.reconquer > 0 && total < c.base + c.reconquer + (a.missionDay ? rules.mission : 0);
    return { coins: total, note: c.reason || (capped ? "오늘 학습 코인 상한에 도달했습니다" : "") };
  } catch (e) {
    console.error("[game] coin grant skipped", e instanceof Error ? e.message : e);
    return { coins: 0, note: "" };
  }
}

// ---------------------------------------------------------------------
// 관리자: 카드 후보 (기출 분석 DB 기준)
// ---------------------------------------------------------------------
export interface CandidateRow {
  philosopherId: string;
  name: string;
  aliases: string[];
  originalName: string | null;
  era: string | null;
  tradition: string;
  questions: number; // 주요·비교로 연결된 기출 문항 수
  card: CardView | null;
  status: "ready" | "draft" | "missing-art" | "none";
  duplicateOf: string | null; // 표기가 다른 같은 사상가로 보이는 항목
  suggestion: ReturnType<typeof suggestFor>;
}

export async function listCandidates(): Promise<CandidateRow[]> {
  const db = getAdminClient();
  const [counts, { data: ps, error }, { data: cs, error: ce }] = await Promise.all([
    linkedCounts(),
    db.from("philosophers").select("id, name, aliases, original_name, tradition, era"),
    db.from("game_cards").select("*"),
  ]);
  if (error) throw gameError(error.message);
  if (ce) throw gameError(ce.message);
  const phs = ((ps ?? []) as PhRow[]).filter((p) => counts.has(p.id));
  const cards = new Map(((cs ?? []) as CardRow[]).map((c) => [c.philosopher_id, c]));
  const norm = (s: string) => s.replace(/\s+/g, "");
  const nameOf = new Map<string, string>();
  for (const p of phs) for (const n of [p.name, ...(p.aliases ?? [])]) if (!nameOf.has(norm(n))) nameOf.set(norm(n), p.id);
  return phs
    .map((p): CandidateRow => {
      const c = cards.get(p.id);
      const view = c ? toView(c, p) : null;
      const tradition = classifyPhilosopher({ name: p.name, tradition: p.tradition });
      const dup = [p.name, ...(p.aliases ?? [])].map((n) => nameOf.get(norm(n))).find((id) => id && id !== p.id) ?? null;
      return {
        philosopherId: p.id,
        name: p.name,
        aliases: p.aliases ?? [],
        originalName: p.original_name,
        era: p.era,
        tradition,
        questions: counts.get(p.id) ?? 0,
        card: view,
        status: !c ? "none" : !c.art_url ? "missing-art" : c.published && c.skill_name ? "ready" : "draft",
        duplicateOf: dup ? (phs.find((x) => x.id === dup)?.name ?? null) : null,
        suggestion: suggestFor(p.name, p.aliases ?? [], tradition),
      };
    })
    .sort((a, b) => b.questions - a.questions || a.name.localeCompare(b.name));
}

export interface CardInput {
  base_atk: number;
  base_hp: number;
  skill_name: string;
  skill_effect: SkillEffect;
  skill_desc: string;
  quote: string;
  art_url: string | null;
  art_basis: "portrait" | "reconstruction";
  art_note: string;
  published: boolean;
}

/** 카드 저장. 공개는 일러스트·필살기가 있고 기출 분석에 연결된 사상가만 */
export async function saveCard(philosopherId: string, input: CardInput) {
  const counts = await linkedCounts();
  if (!counts.has(philosopherId)) throw new GameError("기출 분석에 (주요·비교 사상가로) 연결된 사상가만 카드로 만들 수 있습니다.");
  if (input.published && (!input.art_url || !input.skill_name.trim())) throw new GameError("일러스트와 필살기 이름이 있어야 공개할 수 있습니다.");
  const { error } = await getAdminClient()
    .from("game_cards")
    .upsert({ philosopher_id: philosopherId, ...input, updated_at: new Date().toISOString() }, { onConflict: "philosopher_id" });
  if (error) throw gameError(error.message);
  invalidateContent();
}

export const GAME_015_HINT = "전투 캐릭터 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/015_game_battle_art.sql 을 실행하세요.";

/** 관리자: 전투 캐릭터 그림 저장 (null = 지우기). 카드를 먼저 저장해야 함 */
export async function saveBattleArt(philosopherId: string, url: string | null) {
  const { data, error } = await getAdminClient()
    .from("game_cards")
    .update({ battle_art_url: url, updated_at: new Date().toISOString() })
    .eq("philosopher_id", philosopherId)
    .select("philosopher_id");
  if (error) throw /battle_art_url/.test(error.message) ? new GameError(GAME_015_HINT, 503) : gameError(error.message);
  if (!data?.length) throw new GameError("카드를 먼저 저장한 뒤 전투 캐릭터를 올리세요.", 409);
  invalidateContent();
}

/** 관리자: 최초 무료 뽑기 사용 현황 */
export async function freeDrawStats(): Promise<{ used: number; players: number; members: number }> {
  const db = getAdminClient();
  const [used, players, members] = await Promise.all([
    db.from("game_free_draws").select("learner", { count: "exact", head: true }),
    db.from("game_wallets").select("learner", { count: "exact", head: true }),
    db.from("members").select("id", { count: "exact", head: true }),
  ]);
  if (used.error) throw gameError(used.error.message);
  return { used: used.count ?? 0, players: players.count ?? 0, members: members.count ?? 0 };
}

// ---------------------------------------------------------------------
// 논쟁 대전 (턴제 카드 배틀, 012). 보상 없음 — 전적만
// ---------------------------------------------------------------------
export const GAME_012_HINT = "논쟁 대전 업데이트가 아직 적용되지 않았습니다. 관리자: Supabase SQL Editor 에서 supabase/migrations/012_game_duel.sql 을 실행하세요.";

const duelError = (message: string) =>
  /(game_duels|duel_deck|duel_wins|duel_losses|duel_draws)/.test(message) && /(does not exist|schema cache|Could not find)/i.test(message) ? new GameError(GAME_012_HINT, 503) : gameError(message);

export interface DuelSetup {
  me: DuelCardDef[];
  foe: DuelCardDef[];
  seed: string;
  rules: DuelRules;
}



export async function startDuel(learner: string, difficulty: Difficulty): Promise<{ duelId: string; difficulty: Difficulty } & DuelSetup> {
  const [state, settings, prof] = await Promise.all([
    getGameState(learner),
    getGameSettings(),
    getAdminClient().from("game_profiles").select("duel_deck").eq("learner", learner).maybeSingle(),
  ]);
  if (prof.error && !/duel_deck/.test(prof.error.message)) throw duelError(prof.error.message);
  if (prof.error) throw new GameError(GAME_012_HINT, 503);
  if (state.owned.length < 3) throw new GameError("논쟁 대전은 카드 3장 이상부터 할 수 있습니다. 카드를 더 모아 보세요.", 409);
  if (state.cards.length < 3) throw new GameError("상대 덱을 만들 공개 카드가 아직 3장 미만입니다.", 409);
  const rules = settings.duel_rules;
  const mine = pickDuelDeck(state.owned, ((prof.data?.duel_deck as string[] | null) ?? []).filter(Boolean), rules.deckSize);
  const seed = crypto.randomUUID();
  const me = mine.map((o, i) =>
    toDuelCard({ uid: `m${i}`, cardId: o.cardId, philosopherId: o.philosopherId, name: o.name, tradition: o.tradition, rarity: o.rarity, level: o.level, effect: o.skillEffect, skillName: o.skillName, artUrl: o.artUrl, statAtk: o.atk, statHp: o.hp }, rules),
  );
  let foe: DuelCardDef[];
  {
    // 상대: 공개 사상가 중 무작위, 등급 구성은 내 덱과 같게(섞어서), 레벨은 내 덱 평균 ± 난이도
    const lv = opponentLevel(mine.map((o) => o.level), difficulty, state.settings.maxLevel);
    const r = seededRandomFor(seed);
    const rarities = mine.map((o) => o.rarity).sort(() => r() - 0.5);
    foe = rarities.map((rarity, i) => {
      const c = state.cards[Math.floor(r() * state.cards.length)];
      const st = statsFor({ atk: c.baseAtk, hp: c.baseHp }, rarity, lv, settings.rarity_mult);
      return toDuelCard({ uid: `f${i}`, cardId: null, philosopherId: c.philosopherId, name: c.name, tradition: c.tradition, rarity, level: lv, effect: c.skillEffect, skillName: c.skillName, artUrl: c.artUrl, statAtk: st.atk, statHp: st.hp }, rules);
    });
  }
  const setup: DuelSetup = { me, foe, seed, rules };
  const { data, error } = await getAdminClient().from("game_duels").insert({ learner, difficulty, setup: { me, foe, rules }, seed }).select("id").single();
  if (error) throw duelError(error.message);
  return { duelId: data.id as string, difficulty, ...setup };
}

/** 논쟁 대전 덱 저장: 서로 다른 보유 카드 최대 덱 크기만큼 (빈 목록 = 자동). 모자란 칸은 대전 때 자동으로 채운다 */
export async function setDuelDeck(learner: string, ids: string[]) {
  const { duel_rules: rules } = await getGameSettings();
  if (new Set(ids).size !== ids.length) throw new GameError("같은 카드를 두 번 넣을 수 없습니다.");
  if (ids.length > rules.deckSize) throw new GameError(`덱은 최대 ${rules.deckSize}장입니다.`);
  if (ids.length) await assertOwned(learner, ids);
  const { error } = await getAdminClient().from("game_profiles").upsert({ learner, duel_deck: ids, updated_at: new Date().toISOString() }, { onConflict: "learner" });
  if (error) throw duelError(error.message);
}

export interface DuelOutcome {
  result: "win" | "lose" | "draw";
  turns: number;
  record: { wins: number; losses: number; draws: number };
  replayed: boolean;
}

/** 대전 결과 확인: 서버가 처음부터 다시 계산 (내 행동 = 기록, 상대 행동 = 같은 컴퓨터 규칙). 이미 끝난 대전이면 그 결과 */
export async function finishDuel(learner: string, duelId: string, actions: DuelAction[]): Promise<DuelOutcome> {
  const db = getAdminClient();
  const { data: row, error } = await db.from("game_duels").select("*").eq("id", duelId).eq("learner", learner).maybeSingle();
  if (error) throw duelError(error.message);
  if (!row) throw new GameError("대전을 찾을 수 없습니다.", 404);
  const record = async () => {
    const { data: p } = await db.from("game_profiles").select("duel_wins, duel_losses, duel_draws").eq("learner", learner).maybeSingle();
    return { wins: (p?.duel_wins as number) ?? 0, losses: (p?.duel_losses as number) ?? 0, draws: (p?.duel_draws as number) ?? 0 };
  };
  if (row.status !== "open") {
    if (row.status === "void") throw new GameError("기록이 맞지 않아 무효 처리된 대전입니다.");
    return { result: row.status as DuelOutcome["result"], turns: (row.turns as number) ?? 0, record: await record(), replayed: true };
  }
  const setup = row.setup as { me: DuelCardDef[]; foe: DuelCardDef[]; rules: DuelRules };
  const level = row.difficulty as Difficulty;
  let outcome: ReturnType<typeof replayDuel>;
  try {
    outcome = replayDuel({ ...setup, seed: row.seed as string }, actions, (s, side) => chooseDuelAction(s, side, level));
  } catch (e) {
    await db.from("game_duels").update({ status: "void", log: actions, finished_at: new Date().toISOString() }).eq("id", duelId).eq("status", "open");
    throw new GameError(`대전 기록이 규칙과 맞지 않습니다 (${e instanceof Error ? e.message : String(e)}).`);
  }
  if (!outcome.finished) throw new GameError("대전이 아직 끝나지 않았습니다.");
  const w = outcome.state.winner;
  const result: DuelOutcome["result"] = w === "me" ? "win" : w === "foe" ? "lose" : "draw";
  // 상태가 open 일 때만 확정 (같은 요청이 두 번 와도 전적은 한 번)
  const { data: done, error: e2 } = await db
    .from("game_duels")
    .update({ status: result, log: actions.slice(0, outcome.used), turns: outcome.state.turn, finished_at: new Date().toISOString() })
    .eq("id", duelId)
    .eq("status", "open")
    .select("id");
  if (e2) throw duelError(e2.message);
  if (done?.length) {
    const key = result === "win" ? "wins" : result === "lose" ? "losses" : "draws";
    const next = { ...(await record()) };
    next[key]++;
    const { error: e3 } = await db.from("game_profiles").upsert({ learner, [`duel_${key}`]: next[key], updated_at: new Date().toISOString() }, { onConflict: "learner" });
    if (e3) throw duelError(e3.message);
    return { result, turns: outcome.state.turn, record: next, replayed: false };
  }
  return { result, turns: outcome.state.turn, record: await record(), replayed: true };
}
