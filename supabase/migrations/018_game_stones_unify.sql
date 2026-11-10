-- 018: 철학자 대난투 — 강화 재료를 '강화석' 하나로 통일 (017 먼저 실행)
-- 사상가별 강화 조각을 같은 수의 강화석으로 옮깁니다 (총량 그대로). 옮기기 전 값은 game_shards_backup 에 남깁니다.
-- 여러 번 실행해도 안전합니다 (이미 옮긴 조각은 0 이라 다시 옮겨지지 않음, 백업은 처음 값 유지).
--
--   game_shards_backup            : 옮기기 전 사상가별 조각 (되돌리기용)
--   game_settings.stones_unified  : 통일 적용 표시 (화면·서버가 강화석 방식으로 동작)
--   game_level_up_stones          : 레벨업 (강화석 + 코인)
--   game_card_to_stones           : 카드 → 강화석 (일반 1 · 희귀 2 · 영웅 4 · 전설 8)

create table if not exists public.game_shards_backup (
  learner text not null,
  philosopher_id uuid not null,
  shards int not null,
  backed_up_at timestamptz not null default now(),
  primary key (learner, philosopher_id)
);
alter table public.game_shards_backup enable row level security;
revoke all on public.game_shards_backup from public, anon, authenticated;
grant all on public.game_shards_backup to service_role;

do $$
begin
  -- 1) 백업 (처음 한 번의 값만)
  insert into game_shards_backup (learner, philosopher_id, shards)
    select learner, philosopher_id, shards from game_collection where shards > 0
    on conflict (learner, philosopher_id) do nothing;
  -- 2) 학습자별 조각 합계를 강화석으로
  insert into game_profiles (learner, stones)
    select learner, sum(shards)::int from game_collection where shards > 0 group by learner
    on conflict (learner) do update set stones = game_profiles.stones + excluded.stones, updated_at = now();
  -- 3) 옮긴 조각은 0
  update game_collection set shards = 0, updated_at = now() where shards > 0;
end $$;

alter table public.game_settings add column if not exists stones_unified boolean not null default true;

create or replace function public.game_level_up_stones(
  p_learner text, p_card uuid, p_ref text, p_day date, p_from_level int, p_stones int, p_coins int
)
returns jsonb
language plpgsql
security definer
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
  select stones into v_bank from game_profiles where learner = p_learner for update;
  if coalesce(v_bank, 0) < p_stones then raise exception 'GAME_NOT_ENOUGH_SHARDS' using errcode = 'P0001'; end if;
  if v_coins < p_coins then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  update game_user_cards set level = level + 1, updated_at = now() where id = p_card returning * into v_card;
  update game_profiles set stones = stones - p_stones, updated_at = now() where learner = p_learner;
  v_meta := jsonb_build_object('cardId', p_card, 'philosopherId', v_card.philosopher_id, 'fromLevel', p_from_level, 'level', v_card.level, 'cost', p_coins, 'stonesUsed', p_stones);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -p_coins, 'upgrade', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - p_coins, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

create or replace function public.game_card_to_stones(p_learner text, p_card uuid)
returns jsonb
language plpgsql
security definer
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
  insert into game_profiles (learner, stones) values (p_learner, v_gain)
    on conflict (learner) do update set stones = game_profiles.stones + excluded.stones, updated_at = now()
    returning stones into v_bank;
  update game_profiles set deck_cards = array_remove(deck_cards, p_card), updated_at = now() where learner = p_learner and p_card = any (deck_cards);
  return jsonb_build_object('cardId', p_card, 'philosopherId', v_card.philosopher_id, 'stonesGained', v_gain, 'stones', v_bank);
end $$;

revoke all on function public.game_level_up_stones(text, uuid, text, date, int, int, int) from public, anon, authenticated;
revoke all on function public.game_card_to_stones(text, uuid) from public, anon, authenticated;
grant execute on function public.game_level_up_stones(text, uuid, text, date, int, int, int) to service_role;
grant execute on function public.game_card_to_stones(text, uuid) to service_role;

-- 확인
--   select count(*), sum(shards) from game_shards_backup;          -- 옮긴 조각 (백업)
--   select sum(shards) from game_collection;                       -- 0
-- 되돌리기 (조각 방식으로): 백업 조각을 되살리고 강화석에서 빼기
--   update game_collection c set shards = b.shards from game_shards_backup b where b.learner = c.learner and b.philosopher_id = c.philosopher_id;
--   update game_profiles p set stones = greatest(0, p.stones - s.total) from (select learner, sum(shards) total from game_shards_backup group by learner) s where s.learner = p.learner;
--   alter table public.game_settings drop column if exists stones_unified;
