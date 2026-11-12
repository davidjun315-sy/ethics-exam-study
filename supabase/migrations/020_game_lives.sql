-- 020: 철학자 대난투 — 도장깨기 생명력 (최대 5개 · 30분마다 1개씩 다시 참)
-- 추가만 합니다: game_profiles 에 열 2개 + 함수 1개. 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 이 SQL 을 실행하기 전에는 도장깨기에 제한이 없습니다 (지금과 같음).
--
--   game_profiles.lives     : 마지막으로 계산한 생명력 (없으면 가득)
--   game_profiles.lives_at  : 그 기준 시각 (가득이면 시계가 멈춤)
--   game_use_life           : 지금 생명력을 계산해 1개 사용 (모자라면 사용하지 않고 다음 충전 시각을 돌려줌)

alter table public.game_profiles add column if not exists lives int;
alter table public.game_profiles add column if not exists lives_at timestamptz;

create or replace function public.game_use_life(p_learner text, p_max int, p_regen int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lives int;
  v_at timestamptz;
  v_gained int;
  v_cur int;
  v_base timestamptz;
begin
  insert into game_profiles (learner) values (p_learner) on conflict (learner) do nothing;
  select coalesce(lives, p_max), coalesce(lives_at, now()) into v_lives, v_at from game_profiles where learner = p_learner for update;

  if v_lives >= p_max then
    v_cur := p_max;
    v_base := now();
  else
    v_gained := greatest(0, floor(extract(epoch from (now() - v_at)) / p_regen))::int;
    v_cur := least(p_max, v_lives + v_gained);
    v_base := case when v_cur >= p_max then now() else v_at + make_interval(secs => v_gained * p_regen) end;
  end if;

  if v_cur < 1 then
    -- 사용하지 않음 (지금까지 찬 만큼만 저장)
    update game_profiles set lives = v_cur, lives_at = v_base, updated_at = now() where learner = p_learner;
    return jsonb_build_object('ok', false, 'lives', v_cur, 'livesAt', v_base);
  end if;

  update game_profiles set lives = v_cur - 1, lives_at = v_base, updated_at = now() where learner = p_learner;
  return jsonb_build_object('ok', true, 'lives', v_cur - 1, 'livesAt', v_base);
end $$;

revoke all on function public.game_use_life(text, int, int) from public, anon, authenticated;
grant execute on function public.game_use_life(text, int, int) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select learner, lives, lives_at from game_profiles limit 5;
-- 되돌리기 (생명력 제한이 사라짐):
--   drop function if exists public.game_use_life(text, int, int);
--   alter table public.game_profiles drop column if exists lives, drop column if exists lives_at;
