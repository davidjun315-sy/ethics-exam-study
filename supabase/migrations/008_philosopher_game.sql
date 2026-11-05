-- 008: 철학자 대난투 (철학자 카드 수집 · 강화 · 배틀)
-- 새 테이블과 함수만 만듭니다. 기존 기출·분석·사상가·퀴즈 데이터는 읽기만 하고 바꾸지 않습니다.
-- 여러 번 실행해도 안전합니다.
--
-- 구성
--   game_cards       : 사상가별 카드 게임 정보 (사상가 원본 philosophers 와 분리, 1:1)
--   game_settings    : 뽑기 비용 · 등급 확률 · 코인 지급 기준 (한 줄)
--   game_wallets     : 계정별 코인 잔액
--   game_ledger      : 코인 지급·사용 이력 (같은 요청은 ref 로 한 번만 처리)
--   game_collection  : 계정별 보유 카드 · 레벨 · 강화 조각
--   game_profiles    : 대표 카드 · 배틀 덱 · 전적
--   game_battles     : 배틀 기록
-- 코인 지급 · 뽑기 · 강화는 아래 함수 하나 안에서 잔액 행을 잠그고 처리합니다 (중복 클릭·동시 요청에도 한 번만).

-- ---------------------------------------------------------------------
-- 카드 정보 (관리자가 준비 · 공개)
-- ---------------------------------------------------------------------
create table if not exists public.game_cards (
  philosopher_id uuid primary key references public.philosophers(id) on delete cascade,
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  base_atk int not null default 40 check (base_atk between 1 and 999),
  base_hp int not null default 300 check (base_hp between 1 and 9999),
  skill_name text not null default '',
  skill_effect text not null default 'strike' check (skill_effect in ('strike', 'sweep', 'heal', 'guard', 'stun')),
  skill_desc text not null default '',
  quote text not null default '',              -- 대표 카드 대사 (게임용 창작 문구)
  art_url text,                                -- 카드 일러스트 (없으면 공개 불가)
  art_basis text not null default 'portrait' check (art_basis in ('portrait', 'reconstruction')),
  art_note text not null default '',
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_settings (
  id int primary key default 1 check (id = 1),
  draw_cost int not null default 100 check (draw_cost > 0),
  -- 등급 확률 (가중치, 합이 100 이 아니어도 비율로 계산)
  rates jsonb not null default '{"common": 60, "rare": 28, "epic": 10, "legendary": 2}'::jsonb,
  -- 학습 코인 지급 기준
  coin_rules jsonb not null default '{"fill_correct": 20, "essay_correct": 30, "essay_partial": 15, "wrong": 5, "mission": 50, "reconquer": 15, "daily_cap": 600, "essay_min_chars": 30}'::jsonb,
  max_level int not null default 5 check (max_level between 2 and 20),
  dup_refund int not null default 20 check (dup_refund >= 0),  -- 최대 레벨 카드 중복 시 돌려주는 코인
  updated_at timestamptz not null default now()
);
insert into public.game_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 계정별 데이터 (learner: 퀴즈와 같은 학습자 키, 회원 'm:<id>' / 관리자 'owner')
-- ---------------------------------------------------------------------
create table if not exists public.game_wallets (
  learner text primary key,
  coins int not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_ledger (
  id bigint generated always as identity primary key,
  learner text not null,
  amount int not null,                          -- 지급 +, 사용 -
  kind text not null check (kind in ('quiz', 'reconquer', 'mission', 'draw', 'upgrade', 'refund', 'admin')),
  ref text not null,                            -- 같은 요청 판별 (예: attempt:<id>, draw:<요청 id>)
  meta jsonb not null default '{}'::jsonb,
  day date not null,                            -- 한국 시간 기준 날짜
  created_at timestamptz not null default now(),
  unique (learner, ref)
);
create index if not exists game_ledger_learner_idx on public.game_ledger (learner, created_at desc);

create table if not exists public.game_collection (
  learner text not null,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  level int not null default 1 check (level >= 1),
  shards int not null default 0 check (shards >= 0),
  copies int not null default 1 check (copies >= 1),  -- 지금까지 뽑은 횟수
  first_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (learner, philosopher_id)
);

create table if not exists public.game_profiles (
  learner text primary key,
  featured_philosopher_id uuid references public.philosophers(id) on delete set null,
  deck uuid[] not null default '{}',
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_battles (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  deck jsonb not null,
  opponent jsonb not null,
  seed text not null,
  result text not null check (result in ('win', 'lose')),
  turns int not null,
  created_at timestamptz not null default now()
);
create index if not exists game_battles_learner_idx on public.game_battles (learner, created_at desc);

-- 서버(service role)만 읽고 쓴다: RLS 를 켜고 공개 정책은 두지 않음
alter table public.game_cards enable row level security;
alter table public.game_settings enable row level security;
alter table public.game_wallets enable row level security;
alter table public.game_ledger enable row level security;
alter table public.game_collection enable row level security;
alter table public.game_profiles enable row level security;
alter table public.game_battles enable row level security;

-- ---------------------------------------------------------------------
-- 뽑기 대상: 공개 + 일러스트 있음 + 지금도 기출 분석에 (주요·비교 사상가로) 연결된 사상가
-- ---------------------------------------------------------------------
create or replace function public.game_draw_pool()
returns table (philosopher_id uuid, rarity text)
language sql stable
set search_path = public
as $$
  select c.philosopher_id, c.rarity
  from game_cards c
  where c.published
    and c.art_url is not null and c.art_url <> ''
    and c.skill_name <> ''
    and exists (
      select 1 from question_philosophers qp
      where qp.philosopher_id = c.philosopher_id and qp.role in ('main', 'comparison')
    );
$$;

-- 잔액 행을 만들고 잠근다 (같은 학습자의 코인 처리를 한 줄로 세움)
create or replace function public.game_lock_wallet(p_learner text)
returns int
language plpgsql
set search_path = public
as $$
declare v int;
begin
  insert into game_wallets (learner) values (p_learner) on conflict (learner) do nothing;
  select coins into v from game_wallets where learner = p_learner for update;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 코인 지급 (학습 활동). 같은 ref 는 한 번만. 하루 상한(quiz·reconquer 합계)
-- 반환: 실제로 지급한 코인
-- ---------------------------------------------------------------------
create or replace function public.game_grant(
  p_learner text, p_amount int, p_kind text, p_ref text, p_day date, p_meta jsonb default '{}'::jsonb, p_daily_cap int default null
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_today int;
  v_amount int := greatest(0, p_amount);
begin
  perform game_lock_wallet(p_learner);
  if exists (select 1 from game_ledger where learner = p_learner and ref = p_ref) then
    return 0;
  end if;
  if p_daily_cap is not null then
    select coalesce(sum(amount), 0) into v_today from game_ledger
      where learner = p_learner and day = p_day and kind in ('quiz', 'reconquer');
    v_amount := least(v_amount, greatest(0, p_daily_cap - v_today));
  end if;
  insert into game_ledger (learner, amount, kind, ref, meta, day)
    values (p_learner, v_amount, p_kind, p_ref, p_meta || jsonb_build_object('requested', p_amount), p_day);
  update game_wallets set coins = coins + v_amount, updated_at = now() where learner = p_learner;
  return v_amount;
end $$;

-- ---------------------------------------------------------------------
-- 카드 뽑기: 확률·결과는 DB 안에서 정한다. 같은 ref 를 다시 보내면 처음 결과를 그대로 돌려준다
-- ---------------------------------------------------------------------
create or replace function public.game_draw(p_learner text, p_ref text, p_day date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  s game_settings;
  v_prev jsonb;
  v_total numeric;
  v_roll numeric;
  v_acc numeric := 0;
  v_rarity text;
  v_card uuid;
  v_row game_collection;
  v_new boolean := false;
  v_refund int := 0;
  v_meta jsonb;
  r record;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
  end if;
  select * into s from game_settings where id = 1;
  if v_coins < s.draw_cost then
    raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001';
  end if;

  -- 공개 카드가 있는 등급만으로 확률을 다시 나눈다
  select sum(greatest(0, coalesce((s.rates ->> p.rarity)::numeric, 0))) into v_total
    from (select distinct rarity from game_draw_pool()) p;
  if v_total is null or v_total <= 0 then
    raise exception 'GAME_NO_CARDS' using errcode = 'P0001';
  end if;
  v_roll := random() * v_total;
  for r in
    select p.rarity, greatest(0, coalesce((s.rates ->> p.rarity)::numeric, 0)) as w
    from (select distinct rarity from game_draw_pool()) p
    order by array_position(array['legendary', 'epic', 'rare', 'common'], p.rarity)
  loop
    v_acc := v_acc + r.w;
    if v_rarity is null and r.w > 0 and v_roll < v_acc then
      v_rarity := r.rarity;
    end if;
  end loop;
  if v_rarity is null then
    select p.rarity into v_rarity from game_draw_pool() p where coalesce((s.rates ->> p.rarity)::numeric, 0) > 0 limit 1;
  end if;
  select p.philosopher_id into v_card from game_draw_pool() p where p.rarity = v_rarity order by random() limit 1;

  -- 새 카드 / 중복 → 강화 조각 (최대 레벨이면 코인 일부 환급)
  select * into v_row from game_collection where learner = p_learner and philosopher_id = v_card for update;
  if not found then
    insert into game_collection (learner, philosopher_id) values (p_learner, v_card) returning * into v_row;
    v_new := true;
  elsif v_row.level >= s.max_level then
    update game_collection set copies = copies + 1, updated_at = now()
      where learner = p_learner and philosopher_id = v_card returning * into v_row;
    v_refund := s.dup_refund;
  else
    update game_collection set copies = copies + 1, shards = shards + 1, updated_at = now()
      where learner = p_learner and philosopher_id = v_card returning * into v_row;
  end if;

  v_meta := jsonb_build_object(
    'philosopherId', v_card, 'rarity', v_rarity, 'isNew', v_new, 'level', v_row.level,
    'shards', v_row.shards, 'copies', v_row.copies, 'refund', v_refund, 'cost', s.draw_cost
  );
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -s.draw_cost, 'draw', p_ref, v_meta, p_day);
  if v_refund > 0 then
    insert into game_ledger (learner, amount, kind, ref, meta, day)
      values (p_learner, v_refund, 'refund', p_ref || ':refund', jsonb_build_object('philosopherId', v_card), p_day);
  end if;
  update game_wallets set coins = coins - s.draw_cost + v_refund, updated_at = now()
    where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------
-- 강화: 확정 성공. 서버가 계산한 필요 조각·코인과 지금 레벨이 맞을 때만 (동시 요청 시 한 번만 오른다)
-- ---------------------------------------------------------------------
create or replace function public.game_upgrade(
  p_learner text, p_philosopher uuid, p_ref text, p_day date, p_from_level int, p_shards int, p_coins int
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  v_prev jsonb;
  v_row game_collection;
  v_max int;
  v_meta jsonb;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
  end if;
  select max_level into v_max from game_settings where id = 1;
  select * into v_row from game_collection where learner = p_learner and philosopher_id = p_philosopher for update;
  if not found then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  if v_row.level >= v_max then raise exception 'GAME_MAX_LEVEL' using errcode = 'P0001'; end if;
  if v_row.level <> p_from_level then raise exception 'GAME_LEVEL_CHANGED' using errcode = 'P0001'; end if;
  if v_row.shards < p_shards then raise exception 'GAME_NOT_ENOUGH_SHARDS' using errcode = 'P0001'; end if;
  if v_coins < p_coins then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  update game_collection set level = level + 1, shards = shards - p_shards, updated_at = now()
    where learner = p_learner and philosopher_id = p_philosopher returning * into v_row;
  v_meta := jsonb_build_object('philosopherId', p_philosopher, 'fromLevel', p_from_level, 'level', v_row.level, 'shards', v_row.shards, 'cost', p_coins);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -p_coins, 'upgrade', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - p_coins, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- 함수는 서버(service role)만 호출할 수 있게 (브라우저의 anon 키로는 호출 불가)
revoke all on function public.game_draw_pool() from public, anon, authenticated;
revoke all on function public.game_lock_wallet(text) from public, anon, authenticated;
revoke all on function public.game_grant(text, int, text, text, date, jsonb, int) from public, anon, authenticated;
revoke all on function public.game_draw(text, text, date) from public, anon, authenticated;
revoke all on function public.game_upgrade(text, uuid, text, date, int, int, int) from public, anon, authenticated;
grant execute on function public.game_draw_pool() to service_role;
grant execute on function public.game_lock_wallet(text) to service_role;
grant execute on function public.game_grant(text, int, text, text, date, jsonb, int) to service_role;
grant execute on function public.game_draw(text, text, date) to service_role;
grant execute on function public.game_upgrade(text, uuid, text, date, int, int, int) to service_role;
grant all on public.game_cards, public.game_settings, public.game_wallets, public.game_ledger,
  public.game_collection, public.game_profiles, public.game_battles to service_role;
grant usage, select on all sequences in schema public to service_role;
