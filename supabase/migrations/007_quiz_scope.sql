-- 007: 윤리 퀴즈 출제 범위 (기출문제 / AI 예상문제 / 기출문제+AI 예상문제)
-- 열 하나만 추가합니다. 기존 데이터(학습 기록·XP·미션·start_level)는 그대로 둡니다. 여러 번 실행해도 안전합니다.

alter table public.quiz_profiles add column if not exists question_scope text not null default 'both';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_profiles_question_scope_check') then
    alter table public.quiz_profiles
      add constraint quiz_profiles_question_scope_check check (question_scope in ('exam', 'expected', 'both'));
  end if;
end $$;
