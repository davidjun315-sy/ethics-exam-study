-- 009: 철학자 대난투 — 카드별 등급 · 합성(진화) · 최초 1회 무료 뽑기
-- 008 위에 추가만 합니다. 기존 표·열·함수(game_draw · game_upgrade 등)는 지우거나 바꾸지 않습니다 (되돌리기용).
-- 기출 분석·사상가·퀴즈 데이터는 건드리지 않습니다. 여러 번 실행해도 안전합니다.
--
-- 바뀌는 구조
--   game_user_cards  : 보유 카드 한 장 = 한 행 (고유 id · 사상가 · 등급 · 레벨 · 잠금). 같은 사상가의 여러 등급·여러 장 가능
--   game_collection  : 사상가별 강화 조각 은행으로 계속 사용 (shards). level 열은 더 이상 쓰지 않음 (보존)
--   game_profiles    : featured_card_id · deck_cards 추가 (카드 id 기준). 기존 featured_philosopher_id · deck 은 보존
--   game_free_draws  : 계정당 최초 1회 무료 뽑기 기록 (learner 가 기본 키 → 1회만)
--   game_settings    : 등급 배율 · 합성 장수 · 합성 비용 추가
--   game_cards.rarity: 더 이상 뽑기에 쓰지 않음 (보존, 기존 보유 카드 이전에만 사용)
--
-- 기존 데이터 이전
--   - 008 의 game_collection 한 행(사상가별 1장) → game_user_cards 1장 (등급 = 당시 그 사상가 카드 등급, 레벨 그대로)
--   - 과거 뽑은 횟수(copies)만큼 카드를 새로 만들지 않음 (중복 지급 없음). 강화 조각은 그대로
--   - 대표 카드·배틀 덱은 옮긴 카드 id 로 연결
--   - 코인 잔액·거래 내역은 그대로
--   - 무료 뽑기: 기록이 없는 모든 계정(기존 이용자 포함)이 1회 사용 가능

-- ---------------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------------
create table if not exists public.game_user_cards (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  level int not null default 1 check (level >= 1),
  locked boolean not null default false,
  source text not null default 'draw' check (source in ('legacy', 'draw', 'free')),
  status text not null default 'owned' check (status in ('owned', 'consumed')),
  consumed_reason text check (consumed_reason in ('fusion', 'shards')),
  consumed_into uuid,                       -- 합성 재료였다면 결과(기준) 카드 id
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_user_cards_owner_idx on public.game_user_cards (learner, status);
-- 기존 카드 이전은 학습자·사상가당 한 번만
create unique index if not exists game_user_cards_legacy_once on public.game_user_cards (learner, philosopher_id) where source = 'legacy';

create table if not exists public.game_free_draws (
  learner text primary key,                 -- 계정당 1회
  card_id uuid not null,
  ref text not null,                        -- 같은 요청 재시도 판별
  created_at timestamptz not null default now()
);

alter table public.game_profiles add column if not exists featured_card_id uuid;
alter table public.game_profiles add column if not exists deck_cards uuid[] not null default '{}';

alter table public.game_settings add column if not exists rarity_mult jsonb not null default '{"common": 1.0, "rare": 1.2, "epic": 1.45, "legendary": 1.75}'::jsonb;
alter table public.game_settings add column if not exists fusion_count int not null default 2;
alter table public.game_settings add column if not exists fusion_cost int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_settings_fusion_count_check') then
    alter table public.game_settings add constraint game_settings_fusion_count_check check (fusion_count between 2 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'game_settings_fusion_cost_check') then
    alter table public.game_settings add constraint game_settings_fusion_cost_check check (fusion_cost >= 0);
  end if;
end $$;

-- 거래 내역 종류에 합성 추가 (기존 종류는 그대로)
alter table public.game_ledger drop constraint if exists game_ledger_kind_check;
alter table public.game_ledger add constraint game_ledger_kind_check
  check (kind in ('quiz', 'reconquer', 'mission', 'draw', 'upgrade', 'refund', 'admin', 'fusion'));

alter table public.game_user_cards enable row level security;
alter table public.game_free_draws enable row level security;
grant all on public.game_user_cards, public.game_free_draws to service_role;

-- ---------------------------------------------------------------------
-- 2. 기존 데이터 이전 (한 번만: 학습자·사상가당 legacy 카드 1장)
-- ---------------------------------------------------------------------
insert into public.game_user_cards (learner, philosopher_id, rarity, level, source, created_at)
select c.learner, c.philosopher_id, coalesce(g.rarity, 'common'), c.level, 'legacy', c.first_at
from public.game_collection c
left join public.game_cards g on g.philosopher_id = c.philosopher_id
where not exists (
  select 1 from public.game_user_cards u where u.learner = c.learner and u.philosopher_id = c.philosopher_id and u.source = 'legacy'
);

-- 대표 카드 · 덱: 사상가 id → 옮긴 카드 id (아직 연결 안 된 경우만)
update public.game_profiles p
set featured_card_id = u.id
from public.game_user_cards u
where p.featured_card_id is null and p.featured_philosopher_id is not null
  and u.learner = p.learner and u.philosopher_id = p.featured_philosopher_id and u.source = 'legacy';

update public.game_profiles p
set deck_cards = coalesce((
  select array_agg(u.id order by array_position(p.deck, u.philosopher_id))
  from public.game_user_cards u
  where u.learner = p.learner and u.source = 'legacy' and u.philosopher_id = any (p.deck)
), '{}')
where coalesce(array_length(p.deck_cards, 1), 0) = 0 and coalesce(array_length(p.deck, 1), 0) > 0;

-- 사상가 기본 능력치: 008 에서 등급 기본값을 그대로 쓴 카드는 '일반 Lv.1' 기준값으로 (관리자가 바꾼 값은 그대로)
update public.game_cards set base_atk = 40, base_hp = 300
where (rarity, base_atk, base_hp) in (('rare', 46, 340), ('epic', 53, 380), ('legendary', 60, 420));

-- ---------------------------------------------------------------------
-- 3. 뽑기 (유료 / 최초 1회 무료). 등급은 모든 사상가에 공통 확률, 사상가는 공개 카드 중 하나
-- ---------------------------------------------------------------------
create or replace function public.game_draw_card(p_learner text, p_ref text, p_day date, p_free boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  s game_settings;
  v_prev jsonb;
  v_free game_free_draws;
  v_total numeric;
  v_roll numeric;
  v_acc numeric := 0;
  v_rarity text;
  v_ph uuid;
  v_card game_user_cards;
  v_new_ph boolean;
  v_featured boolean := false;
  v_meta jsonb;
  r record;
begin
  v_coins := game_lock_wallet(p_learner);

  -- 같은 요청 재시도 → 처음 결과
  if p_free then
    select * into v_free from game_free_draws where learner = p_learner;
    if found then
      if v_free.ref = p_ref then
        select * into v_card from game_user_cards where id = v_free.card_id;
        return jsonb_build_object('cardId', v_card.id, 'philosopherId', v_card.philosopher_id, 'rarity', v_card.rarity, 'level', v_card.level,
          'free', true, 'replayed', true, 'coins', v_coins);
      end if;
      raise exception 'GAME_FREE_USED' using errcode = 'P0001';
    end if;
  else
    select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
    if found then
      return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
    end if;
  end if;

  select * into s from game_settings where id = 1;
  if not p_free and v_coins < s.draw_cost then
    raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001';
  end if;
  if not exists (select 1 from game_draw_pool()) then
    raise exception 'GAME_NO_CARDS' using errcode = 'P0001';
  end if;

  -- 등급: 설정 확률 (모든 사상가 공통)
  select sum(greatest(0, coalesce((s.rates ->> k)::numeric, 0))) into v_total
    from unnest(array['common', 'rare', 'epic', 'legendary']) k;
  if v_total is null or v_total <= 0 then v_total := 1; end if;
  v_roll := random() * v_total;
  for r in select k, greatest(0, coalesce((s.rates ->> k)::numeric, 0)) as w from unnest(array['legendary', 'epic', 'rare', 'common']) k loop
    v_acc := v_acc + r.w;
    if v_rarity is null and r.w > 0 and v_roll < v_acc then v_rarity := r.k; end if;
  end loop;
  v_rarity := coalesce(v_rarity, 'common');
  -- 사상가: 공개 카드 중 균등
  select philosopher_id into v_ph from game_draw_pool() order by random() limit 1;

  v_new_ph := not exists (select 1 from game_user_cards where learner = p_learner and philosopher_id = v_ph and status = 'owned');
  insert into game_user_cards (learner, philosopher_id, rarity, source)
    values (p_learner, v_ph, v_rarity, case when p_free then 'free' else 'draw' end) returning * into v_card;
  -- 사상가별 기록(조각 은행) 행: 없으면 만들고, 뽑은 횟수만 센다 (조각은 자동으로 늘리지 않음)
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_ph, 1, 0, 1)
    on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();

  -- 대표 카드가 없으면 이 카드를 대표로 (기존 선택은 덮어쓰지 않음)
  insert into game_profiles (learner) values (p_learner) on conflict (learner) do nothing;
  update game_profiles set featured_card_id = v_card.id, updated_at = now()
    where learner = p_learner
      and (featured_card_id is null or not exists (select 1 from game_user_cards u where u.id = featured_card_id and u.status = 'owned'));
  v_featured := found;

  v_meta := jsonb_build_object('cardId', v_card.id, 'philosopherId', v_ph, 'rarity', v_rarity, 'level', 1,
    'isNewPhilosopher', v_new_ph, 'free', p_free, 'autoFeatured', v_featured, 'cost', case when p_free then 0 else s.draw_cost end);
  if p_free then
    insert into game_free_draws (learner, card_id, ref) values (p_learner, v_card.id, p_ref);
  else
    insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -s.draw_cost, 'draw', p_ref, v_meta, p_day);
    update game_wallets set coins = coins - s.draw_cost, updated_at = now() where learner = p_learner returning coins into v_coins;
  end if;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------
-- 4. 레벨업 (카드별): 사상가별 강화 조각 + 코인. 확정 성공
-- ---------------------------------------------------------------------
create or replace function public.game_level_up(
  p_learner text, p_card uuid, p_ref text, p_day date, p_from_level int, p_shards int, p_coins int
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  v_prev jsonb;
  v_card game_user_cards;
  v_bank int;
  v_max int;
  v_meta jsonb;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins); end if;
  select max_level into v_max from game_settings where id = 1;
  select * into v_card from game_user_cards where id = p_card and learner = p_learner and status = 'owned' for update;
  if not found then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  if v_card.level >= v_max then raise exception 'GAME_MAX_LEVEL' using errcode = 'P0001'; end if;
  if v_card.level <> p_from_level then raise exception 'GAME_LEVEL_CHANGED' using errcode = 'P0001'; end if;
  select shards into v_bank from game_collection where learner = p_learner and philosopher_id = v_card.philosopher_id for update;
  if coalesce(v_bank, 0) < p_shards then raise exception 'GAME_NOT_ENOUGH_SHARDS' using errcode = 'P0001'; end if;
  if v_coins < p_coins then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  update game_user_cards set level = level + 1, updated_at = now() where id = p_card returning * into v_card;
  update game_collection set shards = shards - p_shards, updated_at = now() where learner = p_learner and philosopher_id = v_card.philosopher_id;
  v_meta := jsonb_build_object('cardId', p_card, 'philosopherId', v_card.philosopher_id, 'fromLevel', p_from_level, 'level', v_card.level, 'cost', p_coins, 'shardsUsed', p_shards);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -p_coins, 'upgrade', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - p_coins, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------
-- 5. 합성(진화): 같은 등급 카드 n 장 → 기준 카드가 한 단계 위 등급. 재료는 소모. 확정 성공
--    재료 조건: 보유 중 · 잠금 아님 · 대표 카드 아님 (덱에 있으면 덱에서 빠짐)
-- ---------------------------------------------------------------------
create or replace function public.game_fuse(p_learner text, p_base uuid, p_materials uuid[], p_ref text, p_day date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  v_prev jsonb;
  s game_settings;
  v_base game_user_cards;
  v_next text;
  v_n int;
  v_ok int;
  v_featured uuid;
  v_meta jsonb;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins); end if;
  select * into s from game_settings where id = 1;
  v_n := coalesce(array_length(p_materials, 1), 0);
  if v_n <> s.fusion_count - 1 or p_base = any (p_materials) or (select count(distinct m) from unnest(p_materials) m) <> v_n then
    raise exception 'GAME_FUSION_COUNT' using errcode = 'P0001';
  end if;
  select * into v_base from game_user_cards where id = p_base and learner = p_learner and status = 'owned' for update;
  if not found then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  v_next := case v_base.rarity when 'common' then 'rare' when 'rare' then 'epic' when 'epic' then 'legendary' else null end;
  if v_next is null then raise exception 'GAME_FUSION_MAX' using errcode = 'P0001'; end if;
  -- 재료를 잠그고 조건 확인
  perform 1 from game_user_cards where id = any (p_materials) for update;
  select count(*) into v_ok from game_user_cards
    where id = any (p_materials) and learner = p_learner and status = 'owned' and rarity = v_base.rarity;
  if v_ok <> v_n then raise exception 'GAME_FUSION_RARITY' using errcode = 'P0001'; end if;
  if exists (select 1 from game_user_cards where id = any (p_materials) and locked) then
    raise exception 'GAME_FUSION_LOCKED' using errcode = 'P0001';
  end if;
  select featured_card_id into v_featured from game_profiles where learner = p_learner;
  if v_featured = any (p_materials) then raise exception 'GAME_FUSION_FEATURED' using errcode = 'P0001'; end if;
  if v_coins < s.fusion_cost then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  update game_user_cards set status = 'consumed', consumed_reason = 'fusion', consumed_into = p_base, consumed_at = now(), updated_at = now()
    where id = any (p_materials);
  update game_user_cards set rarity = v_next, updated_at = now() where id = p_base returning * into v_base;
  -- 덱에서 재료 빼기 (기준 카드는 그대로)
  update game_profiles set deck_cards = array(select d from unnest(deck_cards) d where not (d = any (p_materials))), updated_at = now()
    where learner = p_learner and deck_cards && p_materials;

  v_meta := jsonb_build_object('cardId', p_base, 'philosopherId', v_base.philosopher_id, 'rarity', v_next, 'level', v_base.level,
    'materials', to_jsonb(p_materials), 'cost', s.fusion_cost);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -s.fusion_cost, 'fusion', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - s.fusion_cost, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------
-- 6. 카드 → 같은 사상가 강화 조각 (등급이 높을수록 많이: 1·2·4·8). 카드는 소모되어 합성에 다시 못 씀
-- ---------------------------------------------------------------------
create or replace function public.game_card_to_shards(p_learner text, p_card uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_card game_user_cards;
  v_featured uuid;
  v_gain int;
  v_bank int;
begin
  perform game_lock_wallet(p_learner);
  select * into v_card from game_user_cards where id = p_card and learner = p_learner for update;
  if not found or v_card.status <> 'owned' then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  if v_card.locked then raise exception 'GAME_FUSION_LOCKED' using errcode = 'P0001'; end if;
  select featured_card_id into v_featured from game_profiles where learner = p_learner;
  if v_featured = p_card then raise exception 'GAME_FUSION_FEATURED' using errcode = 'P0001'; end if;
  v_gain := case v_card.rarity when 'common' then 1 when 'rare' then 2 when 'epic' then 4 else 8 end;
  update game_user_cards set status = 'consumed', consumed_reason = 'shards', consumed_at = now(), updated_at = now() where id = p_card;
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_card.philosopher_id, 1, v_gain, 1)
    on conflict (learner, philosopher_id) do update set shards = game_collection.shards + v_gain, updated_at = now()
    returning shards into v_bank;
  update game_profiles set deck_cards = array_remove(deck_cards, p_card), updated_at = now() where learner = p_learner and p_card = any (deck_cards);
  return jsonb_build_object('cardId', p_card, 'philosopherId', v_card.philosopher_id, 'shardsGained', v_gain, 'shards', v_bank);
end $$;

revoke all on function public.game_draw_card(text, text, date, boolean) from public, anon, authenticated;
revoke all on function public.game_level_up(text, uuid, text, date, int, int, int) from public, anon, authenticated;
revoke all on function public.game_fuse(text, uuid, uuid[], text, date) from public, anon, authenticated;
revoke all on function public.game_card_to_shards(text, uuid) from public, anon, authenticated;
grant execute on function public.game_draw_card(text, text, date, boolean) to service_role;
grant execute on function public.game_level_up(text, uuid, text, date, int, int, int) to service_role;
grant execute on function public.game_fuse(text, uuid, uuid[], text, date) to service_role;
grant execute on function public.game_card_to_shards(text, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 이전 검증 (실행 후 SQL Editor 에서 확인용)
--   select count(*) from game_collection;                                   -- 이전 대상 수
--   select count(*) from game_user_cards where source = 'legacy';          -- 위와 같아야 함
--   select count(*) from game_profiles where featured_philosopher_id is not null and featured_card_id is null;  -- 0 이어야 함
--
-- 되돌리기 (필요할 때만): 새 표·열만 지우면 008 상태로 돌아감 (기존 표·함수는 그대로라 008 코드가 동작)
--   drop function if exists public.game_draw_card(text, text, date, boolean), public.game_level_up(text, uuid, text, date, int, int, int),
--     public.game_fuse(text, uuid, uuid[], text, date), public.game_card_to_shards(text, uuid);
--   drop table if exists public.game_free_draws, public.game_user_cards;
--   alter table public.game_profiles drop column if exists featured_card_id, drop column if exists deck_cards;
--   (game_settings 의 새 열·game_cards 기본 능력치 정리는 남겨도 008 코드에 영향 없음)
-- ---------------------------------------------------------------------
