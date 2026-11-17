-- 032: 사상의 탑 2.0 — 떠돌이 상인 (탑 안에서 코인 쓰기)
-- 추가만 합니다: 함수 1개. 027 · 031 의 표 · 함수는 그대로입니다. 여러 번 실행해도 안전합니다.
-- 2.0 의 나머지(사유력 · 필살기 · 보스 게이지 · 유물 · 이벤트)는 game_tower_runs.state(jsonb) 안에 저장되므로 SQL 이 필요 없습니다.
-- 이 SQL 을 실행하기 전에는 이벤트 층에 '떠돌이 상인'만 나오지 않습니다.
--
-- 규칙 (서버가 정함)
--   - 같은 도전 · 같은 층에서 한 번만 (ref = 'tower-shop:도전:층'), 같은 요청은 처음 결과 그대로
--   - 지갑 코인이 모자라면 거절 (GAME_NOT_ENOUGH_COINS)
--   - 값이 0 이하면 아무것도 바꾸지 않고 ok (서버가 이 함수가 있는지 확인할 때 씀)

create or replace function public.game_tower_spend(p_learner text, p_run uuid, p_floor int, p_cost int, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := 'tower-shop:' || p_run::text || ':' || p_floor::text;
  v_coins int;
  v_prev jsonb;
begin
  if p_cost <= 0 then
    return jsonb_build_object('ok', true, 'probe', true);
  end if;
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = v_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
  end if;
  if not exists (select 1 from game_tower_runs where id = p_run and learner = p_learner and status = 'active') then
    raise exception 'GAME_TOWER_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_coins < p_cost then
    raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001';
  end if;
  insert into game_ledger (learner, amount, kind, ref, meta, day)
    values (p_learner, -p_cost, 'tower', v_ref, jsonb_build_object('shop', true, 'floor', p_floor, 'run', p_run, 'cost', p_cost), p_day);
  update game_wallets set coins = coins - p_cost, updated_at = now() where learner = p_learner returning coins into v_coins;
  return jsonb_build_object('ok', true, 'cost', p_cost, 'coins', v_coins, 'replayed', false);
end $$;

revoke all on function public.game_tower_spend(text, uuid, int, int, date) from public, anon, authenticated;
grant execute on function public.game_tower_spend(text, uuid, int, int, date) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select learner, amount, meta from game_ledger where ref like 'tower-shop:%' order by created_at desc limit 10;
-- 되돌리기 (쓴 코인은 돌아오지 않음):
--   drop function if exists public.game_tower_spend(text, uuid, int, int, date);
