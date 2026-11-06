-- 010: 철학자 대난투 — 합성은 "같은 등급 · 같은 사상가" 카드끼리만
-- 009 의 game_fuse 함수만 바꿉니다 (표·데이터 변경 없음). 여러 번 실행해도 안전합니다.
--   가능: 일반 콜버그 + 일반 콜버그 → 희귀 콜버그
--   불가: 일반 콜버그 + 일반 루소 (오류 GAME_FUSION_PHILOSOPHER)
-- 이미 합성된 카드는 그대로 둡니다 (되돌리지 않음).

create or replace function public.game_fuse(p_learner text, p_base uuid, p_materials uuid[], p_ref text, p_day date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  v_prev jsonb;
  s game_settings;
  v_base game_user_cards;
  v_next text;
  v_n int;
  v_ok int;
  v_featured uuid;
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
  v_next := case v_base.rarity when 'common' then 'rare' when 'rare' then 'epic' when 'epic' then 'legendary' else null end;
  if v_next is null then raise exception 'GAME_FUSION_MAX' using errcode = 'P0001'; end if;
  -- 재료를 잠그고 조건 확인
  perform 1 from game_user_cards where id = any (p_materials) for update;
  select count(*) into v_ok from game_user_cards
    where id = any (p_materials) and learner = p_learner and status = 'owned' and rarity = v_base.rarity;
  if v_ok <> v_n then raise exception 'GAME_FUSION_RARITY' using errcode = 'P0001'; end if;
  -- 010: 같은 사상가 카드끼리만 (예: 일반 콜버그 + 일반 콜버그 가능, 일반 콜버그 + 일반 루소 불가)
  if exists (select 1 from game_user_cards where id = any (p_materials) and philosopher_id <> v_base.philosopher_id) then
    raise exception 'GAME_FUSION_PHILOSOPHER' using errcode = 'P0001';
  end if;
  if exists (select 1 from game_user_cards where id = any (p_materials) and locked) then
    raise exception 'GAME_FUSION_LOCKED' using errcode = 'P0001';
  end if;
  select featured_card_id into v_featured from game_profiles where learner = p_learner;
  if v_featured = any (p_materials) then raise exception 'GAME_FUSION_FEATURED' using errcode = 'P0001'; end if;
  if v_coins < s.fusion_cost then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  update game_user_cards set status = 'consumed', consumed_reason = 'fusion', consumed_into = p_base, consumed_at = now(), updated_at = now()
    where id = any (p_materials);
  update game_user_cards set rarity = v_next, updated_at = now() where id = p_base returning * into v_base;
  -- 덱에서 재료 빼기 (기준 카드는 그대로)
  update game_profiles set deck_cards = array(select d from unnest(deck_cards) d where not (d = any (p_materials))), updated_at = now()
    where learner = p_learner and deck_cards && p_materials;

  v_meta := jsonb_build_object('cardId', p_base, 'philosopherId', v_base.philosopher_id, 'rarity', v_next, 'level', v_base.level,
    'materials', to_jsonb(p_materials), 'cost', s.fusion_cost);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -s.fusion_cost, 'fusion', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - s.fusion_cost, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

revoke all on function public.game_fuse(text, uuid, uuid[], text, date) from public, anon, authenticated;
grant execute on function public.game_fuse(text, uuid, uuid[], text, date) to service_role;

-- 확인: 함수 본문에 새 조건이 들어갔는지
--   select position('GAME_FUSION_PHILOSOPHER' in prosrc) > 0 from pg_proc where proname = 'game_fuse';   -- true
-- 되돌리기: 009_game_cards_fusion.sql 의 "5. 합성" game_fuse 부분을 다시 실행
