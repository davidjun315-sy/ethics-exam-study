-- 024: 사상가 정복 보상을 '부분 기출' / '완전 기출'로 나눠서 (사상가마다 각각 한 번)
-- 추가만 합니다: 열 1개 + 함수 1개, 기본 키에 track 을 더함. 이미 받은 보상은 그대로 '부분 기출' 보상으로 남습니다.
-- 여러 번 실행해도 안전합니다. 021 이 먼저 적용되어 있어야 합니다.
-- 이 SQL 을 실행하기 전에는 부분 기출 보상만 받을 수 있습니다 (완전 기출 보상은 막힘).
--
--   quiz_conquest.track            : 'part'(부분 기출 · 일반/희귀/영웅) · 'full'(완전 기출 · 전설)
--   quiz_conquest_claim_track      : 보상 기록 + 카드 지급을 한 번에 (사상가 × track 마다 한 번)

alter table public.quiz_conquest add column if not exists track text not null default 'part';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_conquest_track_check') then
    alter table public.quiz_conquest add constraint quiz_conquest_track_check check (track in ('part', 'full'));
  end if;
  -- 기본 키: (학습자, 사상가) → (학습자, 사상가, track)
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.quiz_conquest'::regclass and c.contype = 'p'
      and not exists (select 1 from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k where a.attname = 'track')
  ) then
    alter table public.quiz_conquest drop constraint quiz_conquest_pkey;
    alter table public.quiz_conquest add primary key (learner, philosopher_id, track);
  end if;
end $$;

create or replace function public.quiz_conquest_claim_track(p_learner text, p_philosopher uuid, p_rarity text, p_track text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted int;
  v_card uuid;
begin
  if p_track not in ('part', 'full') then
    raise exception 'bad track';
  end if;
  insert into quiz_conquest (learner, philosopher_id, track) values (p_learner, p_philosopher, p_track) on conflict (learner, philosopher_id, track) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return jsonb_build_object('ok', false, 'already', true);
  end if;
  insert into game_user_cards (learner, philosopher_id, rarity, source) values (p_learner, p_philosopher, p_rarity, 'conquest') returning id into v_card;
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, p_philosopher, 1, 0, 1)
    on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();
  update quiz_conquest set card_id = v_card where learner = p_learner and philosopher_id = p_philosopher and track = p_track;
  return jsonb_build_object('ok', true, 'cardId', v_card);
end $$;

revoke all on function public.quiz_conquest_claim_track(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.quiz_conquest_claim_track(text, uuid, text, text) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select track, count(*) from quiz_conquest group by 1;
-- 되돌리기 (받은 카드는 남음, 완전 기출 보상 기록을 지운 뒤):
--   drop function if exists public.quiz_conquest_claim_track(text, uuid, text, text);
--   delete from quiz_conquest where track = 'full';
--   alter table quiz_conquest drop constraint quiz_conquest_pkey; alter table quiz_conquest add primary key (learner, philosopher_id);
--   alter table quiz_conquest drop column track;
