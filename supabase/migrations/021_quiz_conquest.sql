-- 021: 윤리 퀴즈 — 사상가 정복 지도 보상 (사상가의 모든 문제를 한 번 이상 맞히면 그 사상가 카드)
-- 추가만 합니다: 표 1개 + 함수 1개 + 카드 출처에 'conquest' 허용. 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 이 SQL 을 실행하기 전에도 정복 지도는 보입니다 (보상 받기만 막힘).
--
--   quiz_conquest          : 학습자가 정복 보상을 받은 사상가 (사상가마다 한 번)
--   quiz_conquest_claim    : 보상 기록 + 카드 지급을 한 번에 (같은 사상가 두 번 받지 못함)
--   정복 여부(모든 문제 정답 기록)는 서버가 확인한 뒤에만 이 함수를 부릅니다.

create table if not exists public.quiz_conquest (
  learner text not null,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  card_id uuid,
  claimed_at timestamptz not null default now(),
  primary key (learner, philosopher_id)
);
alter table public.quiz_conquest enable row level security;
revoke all on public.quiz_conquest from public, anon, authenticated;
grant all on public.quiz_conquest to service_role;

-- 카드 출처에 '정복 보상' 추가
alter table public.game_user_cards drop constraint if exists game_user_cards_source_check;
alter table public.game_user_cards add constraint game_user_cards_source_check check (source in ('legacy', 'draw', 'free', 'conquest'));

create or replace function public.quiz_conquest_claim(p_learner text, p_philosopher uuid, p_rarity text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
  v_card uuid;
begin
  insert into quiz_conquest (learner, philosopher_id) values (p_learner, p_philosopher) on conflict (learner, philosopher_id) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return jsonb_build_object('ok', false, 'already', true);
  end if;
  insert into game_user_cards (learner, philosopher_id, rarity, source) values (p_learner, p_philosopher, p_rarity, 'conquest') returning id into v_card;
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, p_philosopher, 1, 0, 1)
    on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();
  update quiz_conquest set card_id = v_card where learner = p_learner and philosopher_id = p_philosopher;
  return jsonb_build_object('ok', true, 'cardId', v_card);
end $$;

revoke all on function public.quiz_conquest_claim(text, uuid, text) from public, anon, authenticated;
grant execute on function public.quiz_conquest_claim(text, uuid, text) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select * from quiz_conquest limit 5;
-- 되돌리기 (받은 카드는 남음):
--   drop function if exists public.quiz_conquest_claim(text, uuid, text);
--   drop table if exists public.quiz_conquest;
