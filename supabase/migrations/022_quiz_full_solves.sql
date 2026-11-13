-- 022: 완전 기출문제 풀이 기록 (기출문제 탭에서 문항 전체를 풀고 맞힌 기록 → 사상가 정복 지도에 반영)
-- 추가만 합니다: 표 1개 + 함수 1개. 기존 데이터는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 이 SQL 을 실행하기 전에도 사이트는 그대로 동작합니다 (완전 기출문제 기록만 남지 않음).
--
--   quiz_full_solves        : 학습자 × 기출 문항. 가장 높은 AI 점수 · 시도 수 · 처음 맞힌 시각
--   quiz_record_full_solve  : 기록을 한 번에 갱신 (점수는 높은 쪽 유지, 한 번 맞히면 계속 맞힌 것으로)
--   맞힘 판정(AI 80점 이상 또는 모범답안 확인 뒤 스스로 '다 맞혔어요')은 서버가 정해서 이 함수를 부릅니다.

create table if not exists public.quiz_full_solves (
  learner text not null,
  question_id uuid not null references public.questions(id) on delete cascade,
  best_score real,
  attempts int not null default 0,
  correct_at timestamptz,
  how text,
  last_at timestamptz not null default now(),
  primary key (learner, question_id)
);
create index if not exists quiz_full_solves_learner_idx on public.quiz_full_solves (learner);
alter table public.quiz_full_solves enable row level security;
revoke all on public.quiz_full_solves from public, anon, authenticated;
grant all on public.quiz_full_solves to service_role;

-- p_score: AI 점수 (스스로 채점이면 null) · p_correct: 이번에 맞혔나 · p_how: 'ai' | 'self'
create or replace function public.quiz_record_full_solve(p_learner text, p_question uuid, p_score real, p_correct boolean, p_how text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r quiz_full_solves;
  was boolean;
begin
  select (correct_at is not null) into was from quiz_full_solves where learner = p_learner and question_id = p_question;
  insert into quiz_full_solves as s (learner, question_id, best_score, attempts, correct_at, how, last_at)
  values (p_learner, p_question, p_score, 1, case when p_correct then now() end, case when p_correct then p_how end, now())
  on conflict (learner, question_id) do update set
    best_score = greatest(coalesce(s.best_score, excluded.best_score), coalesce(excluded.best_score, s.best_score)),
    attempts = s.attempts + 1,
    correct_at = coalesce(s.correct_at, excluded.correct_at),
    how = coalesce(s.how, excluded.how),
    last_at = now()
  returning * into r;
  return jsonb_build_object('ok', true, 'correct', r.correct_at is not null, 'newly', coalesce(was, false) = false and r.correct_at is not null, 'bestScore', r.best_score, 'attempts', r.attempts);
end $$;

revoke all on function public.quiz_record_full_solve(text, uuid, real, boolean, text) from public, anon, authenticated;
grant execute on function public.quiz_record_full_solve(text, uuid, real, boolean, text) to service_role;

notify pgrst, 'reload schema';

-- 확인:
--   select * from quiz_full_solves order by last_at desc limit 5;
-- 되돌리기:
--   drop function if exists public.quiz_record_full_solve(text, uuid, real, boolean, text);
--   drop table if exists public.quiz_full_solves;
