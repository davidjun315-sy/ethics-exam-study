-- 019: 철학자 대난투 — 칭호 (업적으로 얻은 칭호 하나를 골라 표시)
-- 추가만 합니다: game_profiles 에 열 1개. 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
--
--   game_profiles.title : 고른 칭호 (없으면 null). 업적 달성 여부는 서버가 지금 상태로 계산해 확인합니다.
--   (팀 시너지 · 특수 보스 · 주간 랭킹은 이 SQL 없이도 동작합니다. 랭킹 옆 칭호 표시만 이 열이 필요합니다.)

alter table public.game_profiles add column if not exists title text;

-- 주간 랭킹: 이번 주 도장깨기 승리 기록을 빨리 찾도록
create index if not exists game_battles_win_time_idx on public.game_battles (created_at desc) where result = 'win';

notify pgrst, 'reload schema';

-- 확인:
--   select column_name from information_schema.columns where table_name = 'game_profiles' and column_name = 'title';
-- 되돌리기 (칭호만 사라짐):
--   alter table public.game_profiles drop column if exists title;
