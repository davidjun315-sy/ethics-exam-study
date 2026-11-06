-- 011: 윤리 퀴즈 — 기출 기반 연습문제 (개념 다지기)
-- 실제 기출의 원문 분석·정답 개념·채점 요소·자주 하는 실수로 만든 '연습문제'를 문제은행에 함께 둡니다.
-- 추가만 합니다: 열 2개 추가, 허용 값 확장. 기존 문제·학습 기록·미션·XP 는 그대로입니다. 여러 번 실행해도 안전합니다.
--
--   quiz_items.kind     : 'practice' 추가 (기출 기반 연습문제. 실제 기출 'exam' 과 구분)
--   quiz_items.format   : 'choice'(하나 고르기) · 'multi'(모두 고르기) · 'classify'(입장 분류) 추가
--   quiz_items.payload  : 연습문제의 발문·보기·정답·해설 (jsonb, 기존 문제는 null)
--   quiz_profiles.track : 학습 단계 'mixed'(연습+실전, 기본) · 'practice'(연습만) · 'real'(실전만 = 예전 방식)

alter table public.quiz_items add column if not exists payload jsonb;
alter table public.quiz_profiles add column if not exists track text not null default 'mixed';

do $$
begin
  -- kind / format 허용 값 확장 (기존 값은 모두 그대로 허용)
  if exists (select 1 from pg_constraint where conname = 'quiz_items_kind_check') then
    alter table public.quiz_items drop constraint quiz_items_kind_check;
  end if;
  alter table public.quiz_items add constraint quiz_items_kind_check check (kind in ('exam', 'expected', 'practice'));

  if exists (select 1 from pg_constraint where conname = 'quiz_items_format_check') then
    alter table public.quiz_items drop constraint quiz_items_format_check;
  end if;
  alter table public.quiz_items add constraint quiz_items_format_check check (format in ('fill', 'essay', 'choice', 'multi', 'classify'));

  if not exists (select 1 from pg_constraint where conname = 'quiz_profiles_track_check') then
    alter table public.quiz_profiles add constraint quiz_profiles_track_check check (track in ('mixed', 'practice', 'real'));
  end if;
end $$;

-- 확인
--   select kind, format, count(*) from quiz_items group by 1, 2;              -- 기존 행 그대로
--   select track, count(*) from quiz_profiles group by 1;                      -- 모두 mixed
-- 되돌리기 (연습문제를 지운 뒤에만):
--   delete from quiz_items where kind = 'practice';   -- 연습문제 학습 기록(quiz_progress·attempts)도 함께 정리 필요
--   alter table quiz_items drop constraint quiz_items_kind_check, add constraint quiz_items_kind_check check (kind in ('exam','expected'));
--   alter table quiz_items drop constraint quiz_items_format_check, add constraint quiz_items_format_check check (format in ('fill','essay'));
--   alter table quiz_items drop column payload; alter table quiz_profiles drop column track;
