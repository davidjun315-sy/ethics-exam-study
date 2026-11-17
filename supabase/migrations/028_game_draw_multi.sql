-- 028: 카드 10+1 뽑기 (10장 값으로 11장)
-- 추가만 합니다: 함수 1개. 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 이 SQL 을 실행하기 전에는 10+1 뽑기 버튼만 안내 문구를 보여 주고, 1장 뽑기는 그대로 동작합니다.
--
-- 규칙 (서버가 정함, 화면이 바꿀 수 없음)
--   - 비용: 1장 뽑기 비용 × 10 (기본 100 × 10 = 1000 코인), 한 번에 차감
--   - 카드 11장: 1장 뽑기와 같은 등급 확률 · 같은 사상가 후보 (game_draw_card 와 같은 방식)
--   - 같은 요청(ref)을 다시 보내면 처음 결과를 그대로 (중복 차감 없음)
--   - 코인 기록(game_ledger)에는 한 줄 (kind 'draw', 금액 -비용, 뽑은 카드 11장 목록)

create or replace function public.game_draw_multi(p_learner text, p_ref text, p_day date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  c_paid constant int := 10;
  c_bonus constant int := 1;
  v_coins int;
  s game_settings;
  v_prev jsonb;
  v_cost int;
  v_total numeric;
  v_roll numeric;
  v_acc numeric;
  v_rarity text;
  v_ph uuid;
  v_card game_user_cards;
  v_new_ph boolean;
  v_featured boolean := false;
  v_cards jsonb := '[]'::jsonb;
  v_meta jsonb;
  r record;
  i int;
begin
  v_coins := game_lock_wallet(p_learner);

  -- 같은 요청 재시도 → 처음 결과
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
  end if;

  select * into s from game_settings where id = 1;
  v_cost := s.draw_cost * c_paid;
  if v_coins < v_cost then
    raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001';
  end if;
  if not exists (select 1 from game_draw_pool()) then
    raise exception 'GAME_NO_CARDS' using errcode = 'P0001';
  end if;

  select sum(greatest(0, coalesce((s.rates ->> k)::numeric, 0))) into v_total
    from unnest(array['common', 'rare', 'epic', 'legendary']) k;
  if v_total is null or v_total <= 0 then v_total := 1; end if;

  for i in 1 .. (c_paid + c_bonus) loop
    -- 등급: 설정 확률 (1장 뽑기와 같음)
    v_roll := random() * v_total;
    v_acc := 0;
    v_rarity := null;
    for r in select k, greatest(0, coalesce((s.rates ->> k)::numeric, 0)) as w from unnest(array['legendary', 'epic', 'rare', 'common']) k loop
      v_acc := v_acc + r.w;
      if v_rarity is null and r.w > 0 and v_roll < v_acc then v_rarity := r.k; end if;
    end loop;
    v_rarity := coalesce(v_rarity, 'common');
    -- 사상가: 공개 카드 중 균등
    select philosopher_id into v_ph from game_draw_pool() order by random() limit 1;

    v_new_ph := not exists (select 1 from game_user_cards where learner = p_learner and philosopher_id = v_ph and status = 'owned');
    insert into game_user_cards (learner, philosopher_id, rarity, source) values (p_learner, v_ph, v_rarity, 'draw') returning * into v_card;
    insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_ph, 1, 0, 1)
      on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();

    v_cards := v_cards || jsonb_build_array(jsonb_build_object('cardId', v_card.id, 'philosopherId', v_ph, 'rarity', v_rarity, 'isNewPhilosopher', v_new_ph, 'bonus', i > c_paid));
  end loop;

  -- 대표 카드가 없으면 처음 뽑은 카드를 대표로 (기존 선택은 덮어쓰지 않음)
  insert into game_profiles (learner) values (p_learner) on conflict (learner) do nothing;
  update game_profiles set featured_card_id = (v_cards -> 0 ->> 'cardId')::uuid, updated_at = now()
    where learner = p_learner
      and (featured_card_id is null or not exists (select 1 from game_user_cards u where u.id = featured_card_id and u.status = 'owned'));
  v_featured := found;

  v_meta := jsonb_build_object('multi', true, 'cards', v_cards, 'cost', v_cost, 'paid', c_paid, 'bonus', c_bonus, 'autoFeatured', v_featured);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -v_cost, 'draw', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - v_cost, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

revoke all on function public.game_draw_multi(text, text, date) from public, anon, authenticated;
grant execute on function public.game_draw_multi(text, text, date) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select learner, amount, meta->>'paid' paid, meta->>'bonus' bonus, jsonb_array_length(meta->'cards') n from game_ledger where meta->>'multi' = 'true' order by created_at desc limit 5;
-- 되돌리기 (뽑은 카드 · 쓴 코인은 그대로):
--   drop function if exists public.game_draw_multi(text, text, date);
