-- 027: 사상의 탑 (기출 퀴즈로 오르는 탑) + 게임 꾸미기 이미지 칸
-- 추가만 합니다: 표 3개 + 함수 2개 + game_settings.art 열 + 코인 기록 종류 'tower'. 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 이 SQL 을 실행하기 전에는 사상의 탑과 꾸미기 이미지만 숨겨지고 사이트는 그대로 동작합니다.
-- 026(출석 · 뽑기권) 다음에 실행하세요 (30층 첫 돌파 보상인 영웅 확정 뽑기권이 026 의 game_tickets 를 씁니다).
--
-- 규칙 (서버가 정함, 화면이 바꿀 수 없음)
--   - 하루(한국 시간) 3번 도전, 그날 출석했으면 +1. 진행 중인 도전이 있으면 새로 시작하지 않고 이어서
--   - 문제 고르기 · 채점 · 층 진행 · 보상은 모두 서버. 층을 깰 때마다 코인 (5 + 층, 보스층 ×3), 보스층은 강화석 (층 / 10)
--   - 처음으로 30층을 깨면 영웅 확정 뽑기권 1장 (평생 한 번)
--
--   game_tower_runs     : 도전 한 번 (팀 · 진행 상태 · 지금 문제 · 고를 강화)
--   game_tower_profiles : 학습자별 최고 층 · 30층 뽑기권 받음
--   game_tower_weekly   : 주간 최고 층 (랭킹)
--   game_tower_start    : 도전 시작 (하루 횟수 확인 · 진행 중이면 그 도전)
--   game_tower_clear    : 층 돌파 보상 (같은 층은 한 번만)
--   game_settings.art   : 관리자가 올린 꾸미기 이미지 (탑 배경 · 보스층 배경 등, 칸 이름 → 주소)

create table if not exists public.game_tower_runs (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  day date not null,
  status text not null default 'active' check (status in ('active', 'over', 'quit')),
  team jsonb not null default '[]'::jsonb,
  state jsonb not null default '{}'::jsonb,
  current jsonb,
  choices text[],
  cleared int not null default 0,
  coins int not null default 0,
  stones int not null default 0,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists game_tower_runs_learner_idx on public.game_tower_runs (learner, day);
create unique index if not exists game_tower_runs_active_idx on public.game_tower_runs (learner) where status = 'active';

create table if not exists public.game_tower_profiles (
  learner text primary key,
  best_floor int not null default 0,
  runs int not null default 0,
  epic_ticket boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.game_tower_weekly (
  learner text not null,
  week_start date not null,
  best_floor int not null default 0,
  reached_at timestamptz not null default now(),
  primary key (learner, week_start)
);
alter table public.game_tower_runs enable row level security;
alter table public.game_tower_profiles enable row level security;
alter table public.game_tower_weekly enable row level security;
revoke all on public.game_tower_runs, public.game_tower_profiles, public.game_tower_weekly from public, anon, authenticated;
grant all on public.game_tower_runs, public.game_tower_profiles, public.game_tower_weekly to service_role;

-- 꾸미기 이미지 칸 (관리자 업로드)
alter table public.game_settings add column if not exists art jsonb not null default '{}'::jsonb;

-- 코인 기록 종류에 '탑' 추가 (009 · 026 의 종류는 그대로 유지)
alter table public.game_ledger drop constraint if exists game_ledger_kind_check;
alter table public.game_ledger add constraint game_ledger_kind_check
  check (kind in ('quiz', 'reconquer', 'mission', 'draw', 'upgrade', 'refund', 'admin', 'fusion', 'attend', 'ticket', 'tower'));

-- 도전 시작: 진행 중이면 그것을, 아니면 오늘 횟수가 남았을 때 새로 (반환: {id, resumed, used})
create or replace function public.game_tower_start(p_learner text, p_day date, p_max int, p_team jsonb, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run game_tower_runs;
  v_used int;
begin
  perform game_lock_wallet(p_learner);
  select * into v_run from game_tower_runs where learner = p_learner and status = 'active';
  if found then
    return jsonb_build_object('id', v_run.id, 'resumed', true);
  end if;
  select count(*) into v_used from game_tower_runs where learner = p_learner and day = p_day;
  if v_used >= p_max then
    raise exception 'GAME_TOWER_NO_TRIES' using errcode = 'P0001';
  end if;
  insert into game_tower_runs (learner, day, team, state) values (p_learner, p_day, p_team, p_state) returning * into v_run;
  insert into game_tower_profiles (learner, runs) values (p_learner, 1)
    on conflict (learner) do update set runs = game_tower_profiles.runs + 1, updated_at = now();
  return jsonb_build_object('id', v_run.id, 'resumed', false, 'used', v_used + 1);
end $$;

-- 층 돌파: 코인 · 강화석 · (처음 30층) 영웅 확정 뽑기권 + 최고 층 기록. 같은 도전 · 같은 층은 한 번만
create or replace function public.game_tower_clear(
  p_learner text, p_run uuid, p_floor int, p_coins int, p_stones int, p_ticket_floor int, p_day date, p_week date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := 'tower:' || p_run::text || ':' || p_floor::text;
  v_coins int := 0;
  v_ticket boolean := false;
  v_prof game_tower_profiles;
begin
  perform game_lock_wallet(p_learner);
  if exists (select 1 from game_ledger where learner = p_learner and ref = v_ref) then
    return jsonb_build_object('coins', 0, 'stones', 0, 'ticket', false, 'replayed', true);
  end if;
  insert into game_wallets (learner) values (p_learner) on conflict (learner) do nothing;
  v_coins := game_grant(p_learner, p_coins, 'tower', v_ref, p_day, jsonb_build_object('floor', p_floor, 'run', p_run), null);
  if p_stones > 0 then
    insert into game_profiles (learner, stones) values (p_learner, p_stones)
      on conflict (learner) do update set stones = game_profiles.stones + excluded.stones, updated_at = now();
  end if;
  insert into game_tower_profiles (learner, best_floor) values (p_learner, p_floor)
    on conflict (learner) do update set best_floor = greatest(game_tower_profiles.best_floor, p_floor), updated_at = now()
    returning * into v_prof;
  if p_floor >= p_ticket_floor and not v_prof.epic_ticket then
    insert into game_tickets (learner, kind, count) values (p_learner, 'epic', 1)
      on conflict (learner, kind) do update set count = game_tickets.count + 1, updated_at = now();
    update game_tower_profiles set epic_ticket = true where learner = p_learner;
    v_ticket := true;
  end if;
  insert into game_tower_weekly (learner, week_start, best_floor) values (p_learner, p_week, p_floor)
    on conflict (learner, week_start) do update set
      reached_at = case when excluded.best_floor > game_tower_weekly.best_floor then now() else game_tower_weekly.reached_at end,
      best_floor = greatest(game_tower_weekly.best_floor, excluded.best_floor);
  update game_tower_runs set cleared = greatest(cleared, p_floor), coins = coins + v_coins, stones = stones + greatest(p_stones, 0), updated_at = now()
    where id = p_run;
  return jsonb_build_object('coins', v_coins, 'stones', greatest(p_stones, 0), 'ticket', v_ticket, 'replayed', false);
end $$;

revoke all on function public.game_tower_start(text, date, int, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.game_tower_clear(text, uuid, int, int, int, int, date, date) from public, anon, authenticated;
grant execute on function public.game_tower_start(text, date, int, jsonb, jsonb) to service_role;
grant execute on function public.game_tower_clear(text, uuid, int, int, int, int, date, date) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select learner, best_floor, runs from game_tower_profiles order by best_floor desc limit 10;
--   select * from game_tower_weekly order by week_start desc, best_floor desc limit 10;
-- 되돌리기 (받은 코인 · 강화석 · 뽑기권은 남음):
--   drop function if exists public.game_tower_start(text, date, int, jsonb, jsonb), public.game_tower_clear(text, uuid, int, int, int, int, date, date);
--   drop table if exists public.game_tower_runs, public.game_tower_profiles, public.game_tower_weekly;
--   alter table public.game_settings drop column if exists art;
