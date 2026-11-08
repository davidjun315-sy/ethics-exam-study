-- 012: 철학자 대난투 — 논쟁 대전 (턴제 카드 배틀)
-- 추가만 합니다: 표 1개, 열 몇 개. 기존 카드·보유·코인·전적·빠른 대전 기록은 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 설계: docs/game-duel-design.md
--
--   game_duels          : 대전 한 판 (서버가 만든 덱·시드 → 화면에서 진행 → 서버가 행동 기록을 다시 계산해 승패 확정)
--   game_profiles       : duel_deck(대전 덱 카드 id, 비어 있으면 자동), duel_wins / duel_losses / duel_draws
--   대전에는 코인·카드 보상이 없습니다 (학습으로만 코인).

create table if not exists public.game_duels (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  setup jsonb not null,            -- { me: [...], foe: [...], rules } 대전용 카드 스냅샷
  seed text not null,
  status text not null default 'open' check (status in ('open', 'win', 'lose', 'draw', 'void')),
  log jsonb,                       -- 플레이어 행동 목록 (상대 행동은 서버가 다시 계산)
  turns int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists game_duels_learner_idx on public.game_duels (learner, created_at desc);
alter table public.game_duels enable row level security;

alter table public.game_profiles add column if not exists duel_deck uuid[] not null default '{}';
alter table public.game_profiles add column if not exists duel_wins int not null default 0;
alter table public.game_profiles add column if not exists duel_losses int not null default 0;
alter table public.game_profiles add column if not exists duel_draws int not null default 0;

revoke all on public.game_duels from public, anon, authenticated;
grant all on public.game_duels to service_role;

-- 확인
--   select count(*) from game_duels;                                     -- 0 (새 표)
--   select duel_wins, duel_losses, duel_draws from game_profiles limit 3; -- 모두 0
-- 되돌리기
--   drop table if exists public.game_duels;
--   alter table public.game_profiles drop column if exists duel_deck, drop column if exists duel_wins,
--     drop column if exists duel_losses, drop column if exists duel_draws;
