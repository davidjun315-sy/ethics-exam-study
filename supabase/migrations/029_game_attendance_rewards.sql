-- 029: 출석 보상 개편 — 7 · 14 · 21 · 28일차 카드 보상
-- 추가 · 교체만 합니다: 열 1개 · 표 1개 · 함수 3개 추가, game_attend 교체, 뽑기권 종류 확장. 기존 출석 기록 · 가진 뽑기권 · 카드는 그대로입니다.
-- 026(출석) 다음에 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 보상 (서버가 정함)
--   7일차  일반 10장권  : 일반 카드 10장 (사상가 무작위)
--   14일차 희귀 선택권  : 희귀 카드 10장이 펼쳐지고 그중 1장 고르기
--   21일차 희귀 10장권  : 희귀 카드 10장
--   28일차 영웅 선택권  : 영웅 카드 10장 중 1장 고르기
-- 규칙
--   - 하루 빠지면 다시 1일차 (코인 · 출석일차는 026 과 같음)
--   - 이미 받은 보상은 이번 판에서 다시 주지 않음 (끊겨서 다시 7일차가 와도 건너뜀)
--   - 28일차 보상을 받으면 한 판이 끝나고, 다음 판에서는 네 보상을 다시 받을 수 있음
--   - 선택권의 후보 10장은 처음 열 때 정해져 저장됨 (새로고침해도 바뀌지 않음 · 고르면 사라짐)
--   - 예전 '희귀 확정' · '영웅 확정' 뽑기권을 가진 사람은 그대로 쓸 수 있음

alter table public.game_attendance add column if not exists claimed int[] not null default '{}';

alter table public.game_tickets drop constraint if exists game_tickets_kind_check;
alter table public.game_tickets add constraint game_tickets_kind_check check (kind in ('rare', 'epic', 'normal10', 'rare_pick', 'rare10', 'epic_pick'));

create table if not exists public.game_ticket_offers (
  learner text not null,
  kind text not null check (kind in ('rare_pick', 'epic_pick')),
  options uuid[] not null,
  created_at timestamptz not null default now(),
  primary key (learner, kind)
);
alter table public.game_ticket_offers enable row level security;
revoke all on public.game_ticket_offers from public, anon, authenticated;
grant all on public.game_ticket_offers to service_role;

-- 출석 (026 을 교체): 보상 4개 · 받은 보상 기록(claimed)
create or replace function public.game_attend(p_learner text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st game_attendance;
  v_log game_attendance_log;
  v_day int;
  v_coins int;
  v_ticket text;
  v_granted int;
  v_claimed int[];
begin
  perform game_lock_wallet(p_learner);
  insert into game_attendance (learner) values (p_learner) on conflict (learner) do nothing;
  select * into st from game_attendance where learner = p_learner for update;

  select * into v_log from game_attendance_log where learner = p_learner and day = p_day;
  if found then
    return jsonb_build_object('already', true, 'day', v_log.cycle_day, 'coins', v_log.coins, 'ticket', v_log.ticket,
      'bestDay', st.best_day, 'claimed', to_jsonb(st.claimed));
  end if;

  if st.last_day = p_day - 1 and st.cycle_day between 1 and 27 then
    v_day := st.cycle_day + 1;
  else
    v_day := 1;
  end if;
  v_coins := ((v_day - 1) % 7 + 1) * 10;
  v_claimed := coalesce(st.claimed, '{}');
  v_ticket := null;
  if v_day in (7, 14, 21, 28) and not (v_day = any(v_claimed)) then
    v_ticket := case v_day when 7 then 'normal10' when 14 then 'rare_pick' when 21 then 'rare10' else 'epic_pick' end;
    v_claimed := array_append(v_claimed, v_day);
  end if;
  -- 28일차 보상을 받으면 한 판 끝 → 다음 판은 네 보상을 다시
  if v_day = 28 then
    v_claimed := '{}';
  end if;

  insert into game_attendance_log (learner, day, cycle_day, coins, ticket) values (p_learner, p_day, v_day, v_coins, v_ticket);
  v_granted := game_grant(p_learner, v_coins, 'attend', 'attend:' || p_day::text, p_day, jsonb_build_object('day', v_day, 'ticket', v_ticket), null);
  if v_ticket is not null then
    insert into game_tickets (learner, kind, count) values (p_learner, v_ticket, 1)
      on conflict (learner, kind) do update set count = game_tickets.count + 1, updated_at = now();
  end if;
  update game_attendance set last_day = p_day, cycle_day = v_day, best_day = greatest(best_day, v_day),
    claimed = v_claimed, rare_pending = false, updated_at = now()
    where learner = p_learner returning * into st;
  return jsonb_build_object('already', false, 'day', v_day, 'coins', v_granted, 'ticket', v_ticket,
    'bestDay', st.best_day, 'claimed', to_jsonb(st.claimed));
end $$;

-- 10장권 열기: 일반 10장권 → 일반 10장 / 희귀 10장권 → 희귀 10장. 같은 요청은 처음 결과
create or replace function public.game_open_pack(p_learner text, p_kind text, p_ref text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev jsonb;
  v_left int;
  v_rarity text;
  v_ph uuid;
  v_card game_user_cards;
  v_new boolean;
  v_cards jsonb := '[]'::jsonb;
  v_meta jsonb;
  i int;
begin
  if p_kind not in ('normal10', 'rare10') then
    raise exception 'GAME_BAD_TICKET' using errcode = 'P0001';
  end if;
  perform game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  update game_tickets set count = count - 1, updated_at = now()
    where learner = p_learner and kind = p_kind and count > 0 returning count into v_left;
  if not found then
    raise exception 'GAME_NO_TICKET' using errcode = 'P0001';
  end if;
  if not exists (select 1 from game_draw_pool()) then
    raise exception 'GAME_NO_CARDS' using errcode = 'P0001';
  end if;
  v_rarity := case p_kind when 'normal10' then 'common' else 'rare' end;
  for i in 1 .. 10 loop
    select philosopher_id into v_ph from game_draw_pool() order by random() limit 1;
    v_new := not exists (select 1 from game_user_cards where learner = p_learner and philosopher_id = v_ph and status = 'owned');
    insert into game_user_cards (learner, philosopher_id, rarity, source) values (p_learner, v_ph, v_rarity, 'ticket') returning * into v_card;
    insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_ph, 1, 0, 1)
      on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();
    v_cards := v_cards || jsonb_build_array(jsonb_build_object('cardId', v_card.id, 'philosopherId', v_ph, 'rarity', v_rarity, 'isNewPhilosopher', v_new));
  end loop;
  v_meta := jsonb_build_object('pack', p_kind, 'cards', v_cards, 'ticketsLeft', v_left);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, 0, 'ticket', p_ref, v_meta, p_day);
  return v_meta || jsonb_build_object('replayed', false);
end $$;

-- 선택권 열기: 후보 10장 (이미 열었으면 같은 후보). 뽑기권은 고를 때 씀
create or replace function public.game_pick_offer(p_learner text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer game_ticket_offers;
  v_has int;
  v_opts uuid[];
begin
  if p_kind not in ('rare_pick', 'epic_pick') then
    raise exception 'GAME_BAD_TICKET' using errcode = 'P0001';
  end if;
  perform game_lock_wallet(p_learner);
  select * into v_offer from game_ticket_offers where learner = p_learner and kind = p_kind;
  if found then
    return jsonb_build_object('kind', p_kind, 'options', to_jsonb(v_offer.options));
  end if;
  select count into v_has from game_tickets where learner = p_learner and kind = p_kind;
  if coalesce(v_has, 0) <= 0 then
    raise exception 'GAME_NO_TICKET' using errcode = 'P0001';
  end if;
  select array_agg(philosopher_id) into v_opts from (select philosopher_id from game_draw_pool() order by random() limit 10) x;
  if v_opts is null then
    raise exception 'GAME_NO_CARDS' using errcode = 'P0001';
  end if;
  insert into game_ticket_offers (learner, kind, options) values (p_learner, p_kind, v_opts);
  return jsonb_build_object('kind', p_kind, 'options', to_jsonb(v_opts));
end $$;

-- 선택권으로 고르기: 후보 중 하나 → 희귀(rare_pick) · 영웅(epic_pick) 카드. 같은 요청은 처음 결과
create or replace function public.game_pick_choose(p_learner text, p_kind text, p_philosopher uuid, p_ref text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev jsonb;
  v_offer game_ticket_offers;
  v_left int;
  v_rarity text;
  v_card game_user_cards;
  v_new boolean;
  v_meta jsonb;
begin
  if p_kind not in ('rare_pick', 'epic_pick') then
    raise exception 'GAME_BAD_TICKET' using errcode = 'P0001';
  end if;
  perform game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  select * into v_offer from game_ticket_offers where learner = p_learner and kind = p_kind for update;
  if not found or not (p_philosopher = any(v_offer.options)) then
    raise exception 'GAME_BAD_PICK' using errcode = 'P0001';
  end if;
  update game_tickets set count = count - 1, updated_at = now()
    where learner = p_learner and kind = p_kind and count > 0 returning count into v_left;
  if not found then
    raise exception 'GAME_NO_TICKET' using errcode = 'P0001';
  end if;
  v_rarity := case p_kind when 'rare_pick' then 'rare' else 'epic' end;
  v_new := not exists (select 1 from game_user_cards where learner = p_learner and philosopher_id = p_philosopher and status = 'owned');
  insert into game_user_cards (learner, philosopher_id, rarity, source) values (p_learner, p_philosopher, v_rarity, 'ticket') returning * into v_card;
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, p_philosopher, 1, 0, 1)
    on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();
  delete from game_ticket_offers where learner = p_learner and kind = p_kind;
  v_meta := jsonb_build_object('pick', p_kind, 'cardId', v_card.id, 'philosopherId', p_philosopher, 'rarity', v_rarity, 'isNewPhilosopher', v_new, 'ticketsLeft', v_left);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, 0, 'ticket', p_ref, v_meta, p_day);
  return v_meta || jsonb_build_object('replayed', false);
end $$;

revoke all on function public.game_open_pack(text, text, text, date) from public, anon, authenticated;
revoke all on function public.game_pick_offer(text, text) from public, anon, authenticated;
revoke all on function public.game_pick_choose(text, text, uuid, text, date) from public, anon, authenticated;
grant execute on function public.game_open_pack(text, text, text, date) to service_role;
grant execute on function public.game_pick_offer(text, text) to service_role;
grant execute on function public.game_pick_choose(text, text, uuid, text, date) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select learner, cycle_day, claimed from game_attendance order by updated_at desc limit 5;
--   select * from game_tickets order by updated_at desc limit 10;
-- 되돌리기: 026 의 game_attend 를 다시 실행하면 예전 보상(7일차 희귀 확정 · 28일차 영웅 확정)으로 돌아갑니다 (받은 뽑기권 · 카드는 남음)
