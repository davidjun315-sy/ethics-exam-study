-- 026: 출석 보상 (28일 한 바퀴) + 확정 뽑기권
-- 추가만 합니다: 표 3개 + 함수 2개 + 카드 출처에 'ticket' 허용. 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 이 SQL 을 실행하기 전에는 출석 기능만 숨겨지고 사이트는 그대로 동작합니다.
--
-- 규칙 (서버가 정함, 화면이 바꿀 수 없음)
--   - 로그인해서 들어오면 하루(한국 시간) 한 번 출석. 어제 출석했으면 출석일 +1, 아니면 1일차부터
--   - 28일차 다음 날은 다시 1일차
--   - 코인: 일주일 단위로 10 → 70 반복 (1일차 10 … 7일차 70, 8일차 10 …)
--   - 7일차: 희귀 확정 뽑기권 — 단, 받은 뒤 28일차 영웅 확정을 받기 전까지는 다시 주지 않음 (rare_pending)
--   - 28일차: 영웅 확정 뽑기권 (rare_pending 해제 → 다음 바퀴 7일차에 희귀 확정 다시)
--
--   game_attendance        : 학습자별 상태 (마지막 출석일 · 지금 출석일차 · 가장 멀리 간 출석일차 · 희귀 확정 받고 영웅 대기 중)
--   game_attendance_log    : 하루 한 줄 (그날 출석일차 · 코인 · 뽑기권)
--   game_tickets           : 가진 확정 뽑기권 수 (rare · epic)
--   game_attend            : 출석 처리 (같은 날 다시 불러도 한 번만)
--   game_use_ticket        : 확정 뽑기권으로 카드 뽑기 (같은 요청 재시도 → 처음 결과)

create table if not exists public.game_attendance (
  learner text primary key,
  last_day date,
  cycle_day int not null default 0,
  best_day int not null default 0,
  rare_pending boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.game_attendance_log (
  learner text not null,
  day date not null,
  cycle_day int not null,
  coins int not null default 0,
  ticket text,
  created_at timestamptz not null default now(),
  primary key (learner, day)
);
create table if not exists public.game_tickets (
  learner text not null,
  kind text not null check (kind in ('rare', 'epic')),
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (learner, kind)
);
alter table public.game_attendance enable row level security;
alter table public.game_attendance_log enable row level security;
alter table public.game_tickets enable row level security;
revoke all on public.game_attendance, public.game_attendance_log, public.game_tickets from public, anon, authenticated;
grant all on public.game_attendance, public.game_attendance_log, public.game_tickets to service_role;

-- 카드 출처에 '확정 뽑기권' 추가 (021 의 conquest 포함)
alter table public.game_user_cards drop constraint if exists game_user_cards_source_check;
alter table public.game_user_cards add constraint game_user_cards_source_check check (source in ('legacy', 'draw', 'free', 'conquest', 'ticket'));

-- 코인 기록 종류에 '출석' · '뽑기권' 추가 (009 의 종류는 그대로 유지)
alter table public.game_ledger drop constraint if exists game_ledger_kind_check;
alter table public.game_ledger add constraint game_ledger_kind_check
  check (kind in ('quiz', 'reconquer', 'mission', 'draw', 'upgrade', 'refund', 'admin', 'fusion', 'attend', 'ticket'));

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
begin
  perform game_lock_wallet(p_learner);
  insert into game_attendance (learner) values (p_learner) on conflict (learner) do nothing;
  select * into st from game_attendance where learner = p_learner for update;

  -- 오늘 이미 출석 → 그대로
  select * into v_log from game_attendance_log where learner = p_learner and day = p_day;
  if found then
    return jsonb_build_object('already', true, 'day', v_log.cycle_day, 'coins', v_log.coins, 'ticket', v_log.ticket,
      'bestDay', st.best_day, 'rarePending', st.rare_pending);
  end if;

  -- 출석일차: 어제 출석 → +1 (28일차 다음은 1), 아니면 1일차부터
  if st.last_day = p_day - 1 and st.cycle_day between 1 and 27 then
    v_day := st.cycle_day + 1;
  else
    v_day := 1;
  end if;
  v_coins := ((v_day - 1) % 7 + 1) * 10;
  v_ticket := null;
  if v_day = 7 and not st.rare_pending then
    v_ticket := 'rare';
    st.rare_pending := true;
  elsif v_day = 28 then
    v_ticket := 'epic';
    st.rare_pending := false;
  end if;

  insert into game_attendance_log (learner, day, cycle_day, coins, ticket) values (p_learner, p_day, v_day, v_coins, v_ticket);
  v_granted := game_grant(p_learner, v_coins, 'attend', 'attend:' || p_day::text, p_day, jsonb_build_object('day', v_day, 'ticket', v_ticket), null);
  if v_ticket is not null then
    insert into game_tickets (learner, kind, count) values (p_learner, v_ticket, 1)
      on conflict (learner, kind) do update set count = game_tickets.count + 1, updated_at = now();
  end if;
  update game_attendance set last_day = p_day, cycle_day = v_day, best_day = greatest(best_day, v_day),
    rare_pending = st.rare_pending, updated_at = now()
    where learner = p_learner returning * into st;
  return jsonb_build_object('already', false, 'day', v_day, 'coins', v_granted, 'ticket', v_ticket,
    'bestDay', st.best_day, 'rarePending', st.rare_pending);
end $$;

-- 확정 뽑기권: rare = 희귀 80 · 영웅 17 · 전설 3 / epic = 영웅 85 · 전설 15 (%)
create or replace function public.game_use_ticket(p_learner text, p_kind text, p_ref text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev jsonb;
  v_left int;
  v_roll numeric;
  v_rarity text;
  v_ph uuid;
  v_card game_user_cards;
  v_new_ph boolean;
  v_meta jsonb;
begin
  if p_kind not in ('rare', 'epic') then
    raise exception 'GAME_BAD_TICKET' using errcode = 'P0001';
  end if;
  perform game_lock_wallet(p_learner);
  -- 같은 요청 재시도 → 처음 결과
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

  v_roll := random() * 100;
  if p_kind = 'rare' then
    v_rarity := case when v_roll < 3 then 'legendary' when v_roll < 20 then 'epic' else 'rare' end;
  else
    v_rarity := case when v_roll < 15 then 'legendary' else 'epic' end;
  end if;
  select philosopher_id into v_ph from game_draw_pool() order by random() limit 1;

  v_new_ph := not exists (select 1 from game_user_cards where learner = p_learner and philosopher_id = v_ph and status = 'owned');
  insert into game_user_cards (learner, philosopher_id, rarity, source) values (p_learner, v_ph, v_rarity, 'ticket') returning * into v_card;
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_ph, 1, 0, 1)
    on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();

  v_meta := jsonb_build_object('cardId', v_card.id, 'philosopherId', v_ph, 'rarity', v_rarity, 'level', 1,
    'isNewPhilosopher', v_new_ph, 'ticket', p_kind, 'ticketsLeft', v_left);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, 0, 'ticket', p_ref, v_meta, p_day);
  return v_meta || jsonb_build_object('replayed', false);
end $$;

revoke all on function public.game_attend(text, date) from public, anon, authenticated;
revoke all on function public.game_use_ticket(text, text, text, date) from public, anon, authenticated;
grant execute on function public.game_attend(text, date) to service_role;
grant execute on function public.game_use_ticket(text, text, text, date) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select * from game_attendance order by updated_at desc limit 5;
--   select * from game_tickets;
-- 되돌리기 (받은 코인 · 카드는 남음):
--   drop function if exists public.game_attend(text, date), public.game_use_ticket(text, text, text, date);
--   drop table if exists public.game_attendance_log, public.game_attendance, public.game_tickets;
