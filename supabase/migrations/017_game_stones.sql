-- 017: 철학자 대난투 — 공용 강화석 (도장깨기 보상)
-- 추가만 합니다: 열 2개, 함수 2개. 기존 조각·카드·관 기록은 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
--
--   game_profiles.stones : 공용 강화석. 어느 사상가에게나 그 사상가의 강화 조각으로 바꿔 쓸 수 있음 (1개 = 조각 1개)
--   game_campaign.stones : 그 관을 처음 깼을 때 받은 강화석
--   game_campaign_clear_stones(학습자, 보스, 대전, 턴, 강화석) : 처음 깰 때만 기록 + 강화석 지급
--   game_use_stones(학습자, 사상가, 개수) : 강화석 → 그 사상가의 강화 조각 (원자적, 모자라면 오류)

alter table public.game_profiles add column if not exists stones int not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'game_profiles_stones_check') then
    alter table public.game_profiles add constraint game_profiles_stones_check check (stones >= 0);
  end if;
end $$;
alter table public.game_campaign add column if not exists stones int not null default 0;

create or replace function public.game_campaign_clear_stones(p_learner text, p_philosopher uuid, p_duel uuid, p_turns int, p_stones int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  insert into game_campaign (learner, philosopher_id, duel_id, turns, shards, stones)
  values (p_learner, p_philosopher, p_duel, p_turns, 0, greatest(p_stones, 0))
  on conflict (learner, philosopher_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;
  if p_stones > 0 then
    insert into game_profiles (learner, stones) values (p_learner, p_stones)
    on conflict (learner) do update set stones = game_profiles.stones + excluded.stones, updated_at = now();
  end if;
  return true;
end;
$$;

create or replace function public.game_use_stones(p_learner text, p_philosopher uuid, p_count int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  left_stones int;
begin
  if p_count is null or p_count <= 0 then
    raise exception 'GAME_STONES_COUNT' using errcode = 'P0001';
  end if;
  update game_profiles set stones = stones - p_count, updated_at = now()
    where learner = p_learner and stones >= p_count
    returning stones into left_stones;
  if not found then
    raise exception 'GAME_STONES_SHORT' using errcode = 'P0001';
  end if;
  insert into game_collection (learner, philosopher_id, level, shards, copies)
  values (p_learner, p_philosopher, 1, p_count, 1)
  on conflict (learner, philosopher_id) do update set shards = game_collection.shards + excluded.shards, updated_at = now();
  return left_stones;
end;
$$;

revoke all on function public.game_campaign_clear_stones(text, uuid, uuid, int, int) from public, anon, authenticated;
revoke all on function public.game_use_stones(text, uuid, int) from public, anon, authenticated;
grant execute on function public.game_campaign_clear_stones(text, uuid, uuid, int, int) to service_role;
grant execute on function public.game_use_stones(text, uuid, int) to service_role;

-- 확인
--   select stones from game_profiles limit 3;   -- 0
-- 되돌리기
--   drop function if exists public.game_use_stones(text, uuid, int);
--   drop function if exists public.game_campaign_clear_stones(text, uuid, uuid, int, int);
--   alter table public.game_campaign drop column if exists stones;
--   alter table public.game_profiles drop constraint if exists game_profiles_stones_check, drop column if exists stones;
