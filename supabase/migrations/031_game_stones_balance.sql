-- 031: 강화석 조율 — 필요에 비해 너무 많이 생기던 것을 줄임
-- 교체만 합니다: 함수 2개. 가진 강화석 · 카드 · 기록은 그대로입니다. 여러 번 실행해도 안전합니다.
--
--   사상의 탑   : 보스층 강화석은 그 층을 처음 깰 때만 (최고 기록을 넘을 때). 코인은 지금처럼 매번
--   카드 분해   : 일반 카드는 분해 불가 (합성 재료로), 희귀 1 · 영웅 2 · 전설 4 (전에는 1 · 2 · 4 · 8)
--   도장깨기    : 첫 클리어 강화석은 서버 코드에서 정함 (5관마다 1~4개 + 특수 보스 +1) — SQL 변경 없음
-- 027(사상의 탑) · 018(강화석 통일) 다음에 실행하세요.

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
  v_best int;
  v_stones int;
begin
  perform game_lock_wallet(p_learner);
  if exists (select 1 from game_ledger where learner = p_learner and ref = v_ref) then
    return jsonb_build_object('coins', 0, 'stones', 0, 'ticket', false, 'replayed', true);
  end if;
  insert into game_wallets (learner) values (p_learner) on conflict (learner) do nothing;
  -- 031: 강화석은 그 층을 처음 깰 때만 (최고 기록을 넘을 때)
  select best_floor into v_best from game_tower_profiles where learner = p_learner;
  v_stones := case when p_floor > coalesce(v_best, 0) then greatest(p_stones, 0) else 0 end;
  v_coins := game_grant(p_learner, p_coins, 'tower', v_ref, p_day, jsonb_build_object('floor', p_floor, 'run', p_run), null);
  if v_stones > 0 then
    insert into game_profiles (learner, stones) values (p_learner, v_stones)
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
  update game_tower_runs set cleared = greatest(cleared, p_floor), coins = coins + v_coins, stones = stones + v_stones, updated_at = now()
    where id = p_run;
  return jsonb_build_object('coins', v_coins, 'stones', v_stones, 'ticket', v_ticket, 'replayed', false);
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
  -- 031: 일반은 분해 불가 · 희귀 1 · 영웅 2 · 전설 4
  v_gain := case v_card.rarity when 'rare' then 1 when 'epic' then 2 when 'legendary' then 4 else 0 end;
  if v_gain <= 0 then raise exception 'GAME_DISMANTLE_COMMON' using errcode = 'P0001'; end if;
  update game_user_cards set status = 'consumed', consumed_reason = 'shards', consumed_at = now(), updated_at = now() where id = p_card;
  insert into game_profiles (learner, stones) values (p_learner, v_gain)
    on conflict (learner) do update set stones = game_profiles.stones + excluded.stones, updated_at = now()
    returning stones into v_bank;
  update game_profiles set deck_cards = array_remove(deck_cards, p_card), updated_at = now() where learner = p_learner and p_card = any (deck_cards);
  return jsonb_build_object('cardId', p_card, 'philosopherId', v_card.philosopher_id, 'stonesGained', v_gain, 'stones', v_bank);
end $$;

revoke all on function public.game_card_to_stones(text, uuid) from public, anon, authenticated;
grant execute on function public.game_card_to_stones(text, uuid) to service_role;

notify pgrst, 'reload schema';

-- 되돌리기: 027 의 game_tower_clear, 018 의 game_card_to_stones 를 다시 실행
