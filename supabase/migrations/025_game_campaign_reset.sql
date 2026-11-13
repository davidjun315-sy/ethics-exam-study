-- 025: 사상가 도장깨기 관 순서를 '빈출 순'으로 바꾸면서 진행 기록을 한 번 처음부터 (사용자 승인)
-- 깬 관 기록(game_campaign)을 보관용 표(game_campaign_archive)에 모두 옮겨 둔 뒤 지웁니다.
-- 한 번만 실행됩니다: 두 번째 실행부터는 아무것도 하지 않습니다 (game_resets 에 기록).
-- 지워지지 않는 것: 카드 · 강화석 · 코인 · 대전 기록 · 주간 랭킹 · 칭호 선택. 처음 깰 때 받는 강화석은 다시 받을 수 있습니다.

create table if not exists public.game_resets (
  id text primary key,
  done_at timestamptz not null default now(),
  note text
);
alter table public.game_resets enable row level security;
revoke all on public.game_resets from public, anon, authenticated;
grant all on public.game_resets to service_role;

create table if not exists public.game_campaign_archive (like public.game_campaign);
alter table public.game_campaign_archive add column if not exists archived_at timestamptz not null default now();
alter table public.game_campaign_archive add column if not exists reset_id text;
alter table public.game_campaign_archive enable row level security;
revoke all on public.game_campaign_archive from public, anon, authenticated;
grant all on public.game_campaign_archive to service_role;

do $$
declare
  moved int;
begin
  if exists (select 1 from public.game_resets where id = 'campaign-frequency-order') then
    raise notice '이미 초기화했습니다. 건너뜁니다.';
    return;
  end if;
  insert into public.game_campaign_archive select c.*, now(), 'campaign-frequency-order' from public.game_campaign c;
  get diagnostics moved = row_count;
  delete from public.game_campaign;
  insert into public.game_resets (id, note) values ('campaign-frequency-order', format('도장깨기 빈출 순 재정렬 · 보관 %s줄', moved));
  raise notice '도장깨기 기록 %줄을 보관하고 초기화했습니다.', moved;
end $$;

notify pgrst, 'reload schema';

-- 확인:
--   select * from game_resets;
--   select count(*) from game_campaign_archive where reset_id = 'campaign-frequency-order';
--   select count(*) from game_campaign;   -- 0 (실행 직후)
-- 되돌리기 (보관한 기록 복원):
--   insert into game_campaign (learner, philosopher_id, duel_id, turns, shards, cleared_at)
--     select learner, philosopher_id, duel_id, turns, shards, cleared_at from game_campaign_archive where reset_id = 'campaign-frequency-order' on conflict do nothing;
