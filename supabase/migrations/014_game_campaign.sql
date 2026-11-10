-- 014: 철학자 대난투 — 논쟁 대전 사상가 도장깨기 (관 클리어 기록)
-- 추가만 합니다: 표 1개, 함수 1개. 기존 카드·보유·코인·전적·대전 기록은 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 설계: docs/game-duel-design.md
--
--   game_campaign        : 학습자가 깬 관 (보스 사상가마다 한 줄, 처음 깬 대전·턴 수)
--   game_campaign_clear  : 처음 깰 때만 기록 + 보스 사상가 강화 조각 지급 (같은 관을 다시 깨도 보상은 한 번)

create table if not exists public.game_campaign (
  learner text not null,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  duel_id uuid,
  turns int,
  shards int not null default 0,
  cleared_at timestamptz not null default now(),
  primary key (learner, philosopher_id)
);
alter table public.game_campaign enable row level security;
revoke all on public.game_campaign from public, anon, authenticated;
grant all on public.game_campaign to service_role;

create or replace function public.game_campaign_clear(p_learner text, p_philosopher uuid, p_duel uuid, p_turns int, p_shards int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  insert into game_campaign (learner, philosopher_id, duel_id, turns, shards)
  values (p_learner, p_philosopher, p_duel, p_turns, greatest(p_shards, 0))
  on conflict (learner, philosopher_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;
  if p_shards > 0 then
    insert into game_collection (learner, philosopher_id, level, shards, copies)
    values (p_learner, p_philosopher, 1, p_shards, 1)
    on conflict (learner, philosopher_id) do update set shards = game_collection.shards + excluded.shards, updated_at = now();
  end if;
  return true;
end;
$$;
revoke all on function public.game_campaign_clear(text, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.game_campaign_clear(text, uuid, uuid, int, int) to service_role;

-- 확인
--   select count(*) from game_campaign;   -- 0 (새 표)
-- 되돌리기
--   drop function if exists public.game_campaign_clear(text, uuid, uuid, int, int);
--   drop table if exists public.game_campaign;
