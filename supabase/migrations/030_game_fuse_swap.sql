-- 030: 교환 합성 — 같은 등급 · 다른 사상가 카드를 합치면 같은 등급의 다른 사상가가 무작위로
-- 추가만 합니다: 함수 1개. 기존 진화 합성(game_fuse: 같은 사상가 → 윗등급)은 그대로입니다. 여러 번 실행해도 안전합니다.
-- 이 SQL 을 실행하기 전에는 교환 합성 버튼만 안내 문구를 보여 줍니다.
--
-- 규칙 (서버가 정함)
--   - 기준 카드 1장 + 재료 (합성 장수 - 1)장, 모두 같은 등급 · 재료는 기준과 다른 사상가
--   - 결과: 기준 카드가 같은 등급의 다른 사상가로 바뀜 (넣은 카드들의 사상가는 나오지 않음, 후보가 없으면 기준 사상가만 제외)
--   - 결과 레벨 = 넣은 카드 중 가장 높은 레벨 (키운 만큼 손해 보지 않게)
--   - 재료는 사라짐. 잠긴 카드 · 대표 카드는 재료가 될 수 없고, 잠긴 카드는 기준도 될 수 없음
--   - 비용은 진화 합성과 같음 (game_settings.fusion_cost). 같은 요청은 처음 결과 그대로

create or replace function public.game_fuse_swap(p_learner text, p_base uuid, p_materials uuid[], p_ref text, p_day date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  v_prev jsonb;
  s game_settings;
  v_base game_user_cards;
  v_n int;
  v_ok int;
  v_featured uuid;
  v_exclude uuid[];
  v_new uuid;
  v_level int;
  v_from uuid;
  v_new_ph boolean;
  v_meta jsonb;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins); end if;
  select * into s from game_settings where id = 1;
  v_n := coalesce(array_length(p_materials, 1), 0);
  if v_n <> s.fusion_count - 1 or p_base = any (p_materials) or (select count(distinct m) from unnest(p_materials) m) <> v_n then
    raise exception 'GAME_FUSION_COUNT' using errcode = 'P0001';
  end if;
  select * into v_base from game_user_cards where id = p_base and learner = p_learner and status = 'owned' for update;
  if not found then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  if v_base.locked then raise exception 'GAME_FUSION_LOCKED' using errcode = 'P0001'; end if;
  perform 1 from game_user_cards where id = any (p_materials) for update;
  select count(*) into v_ok from game_user_cards
    where id = any (p_materials) and learner = p_learner and status = 'owned' and rarity = v_base.rarity;
  if v_ok <> v_n then raise exception 'GAME_FUSION_RARITY' using errcode = 'P0001'; end if;
  -- 교환: 재료는 모두 기준과 다른 사상가
  if exists (select 1 from game_user_cards where id = any (p_materials) and philosopher_id = v_base.philosopher_id) then
    raise exception 'GAME_SWAP_SAME' using errcode = 'P0001';
  end if;
  if exists (select 1 from game_user_cards where id = any (p_materials) and locked) then
    raise exception 'GAME_FUSION_LOCKED' using errcode = 'P0001';
  end if;
  select featured_card_id into v_featured from game_profiles where learner = p_learner;
  if v_featured = any (p_materials) then raise exception 'GAME_FUSION_FEATURED' using errcode = 'P0001'; end if;
  if v_coins < s.fusion_cost then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  -- 새 사상가: 넣은 카드들의 사상가를 뺀 공개 사상가 중 무작위 (없으면 기준 사상가만 빼고)
  select array_agg(distinct philosopher_id) into v_exclude from game_user_cards where id = p_base or id = any (p_materials);
  select philosopher_id into v_new from game_draw_pool() where not (philosopher_id = any (v_exclude)) order by random() limit 1;
  if v_new is null then
    select philosopher_id into v_new from game_draw_pool() where philosopher_id <> v_base.philosopher_id order by random() limit 1;
  end if;
  if v_new is null then raise exception 'GAME_NO_CARDS' using errcode = 'P0001'; end if;
  select max(level) into v_level from game_user_cards where id = p_base or id = any (p_materials);
  v_from := v_base.philosopher_id;
  v_new_ph := not exists (select 1 from game_user_cards where learner = p_learner and philosopher_id = v_new and status = 'owned');

  update game_user_cards set status = 'consumed', consumed_reason = 'fusion', consumed_into = p_base, consumed_at = now(), updated_at = now()
    where id = any (p_materials);
  update game_user_cards set philosopher_id = v_new, level = greatest(level, coalesce(v_level, 1)), updated_at = now() where id = p_base returning * into v_base;
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_new, 1, 0, 1)
    on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();
  update game_profiles set deck_cards = array(select d from unnest(deck_cards) d where not (d = any (p_materials))), updated_at = now()
    where learner = p_learner and deck_cards && p_materials;

  v_meta := jsonb_build_object('swap', true, 'cardId', p_base, 'from', v_from, 'philosopherId', v_new, 'rarity', v_base.rarity, 'level', v_base.level,
    'isNewPhilosopher', v_new_ph, 'materials', to_jsonb(p_materials), 'cost', s.fusion_cost);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -s.fusion_cost, 'fusion', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - s.fusion_cost, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

revoke all on function public.game_fuse_swap(text, uuid, uuid[], text, date) from public, anon, authenticated;
grant execute on function public.game_fuse_swap(text, uuid, uuid[], text, date) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select learner, meta->>'from' from_ph, meta->>'philosopherId' to_ph, meta->>'rarity' r from game_ledger where meta->>'swap' = 'true' order by created_at desc limit 5;
-- 되돌리기 (바뀐 카드는 그대로):
--   drop function if exists public.game_fuse_swap(text, uuid, uuid[], text, date);
