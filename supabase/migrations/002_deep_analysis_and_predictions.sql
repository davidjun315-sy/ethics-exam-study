-- =====================================================================
-- 002: 심화 문항 분석 + 전체 기출 출제 예측
-- 이미 schema.sql 을 실행한 DB 에서는 이 파일만 SQL Editor 에서 실행하면 됩니다.
-- (여러 번 실행해도 안전합니다)
-- =====================================================================

-- 문항 분석 버전: 1 = 기존, 2 = 출제자의 의도 / 개념 정리 / 향후 출제 포함
-- 새 항목은 question_analysis.details(jsonb) 의 examinerIntent / studyConcepts / futureExtensions 에 저장된다.
alter table public.question_analysis add column if not exists analysis_version int not null default 1;
update public.question_analysis
   set analysis_version = 2
 where analysis_version < 2 and details ? 'examinerIntent';

-- 예측 실행: 어떤 데이터로 언제 계산했는지 (AI 해석 포함) 를 기록하는 캐시
create table if not exists public.prediction_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  fingerprint text not null,              -- 계산 당시 데이터 지문 (바뀌면 "업데이트 필요")
  year_from int,
  year_to int,
  exam_count int not null default 0,
  exam_ids uuid[] not null default '{}',
  question_count int not null default 0,  -- 사용한 분석 완료 문항 수
  scoring_version text not null,          -- 점수 계산 규칙 버전
  stats jsonb not null default '{}'::jsonb, -- 패턴 요약 스냅샷 (AI 입력으로도 사용)
  ai_provider text,
  ai_model text,
  ai_method text check (ai_method in ('api', 'manual')),
  prompt_version text,
  ai_output jsonb,                        -- { overview, caveats }
  ai_at timestamptz
);
create index if not exists prediction_runs_created_idx on public.prediction_runs (created_at desc);

-- 예측 주제: 점수 요소, DB 사실, 근거 문항, AI 해석을 분리 저장
create table if not exists public.prediction_topics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.prediction_runs(id) on delete cascade,
  rank int not null,
  topic_key text not null,
  kind text not null check (kind in ('philosopher_concept', 'comparison')),
  title text not null,
  philosopher_ids uuid[] not null default '{}',
  concept_ids uuid[] not null default '{}',
  source_ids uuid[] not null default '{}',
  score real not null,                    -- 0~100 학습 우선순위 점수 (확률 아님)
  factors jsonb not null default '{}'::jsonb, -- historical_frequency, recent_frequency, years_since_last_appearance, concept_gap, source_gap, comparison_gap, trend_score
  facts jsonb not null default '[]'::jsonb,   -- DB 에서 계산된 사실 [{label, value}]
  evidence_question_ids uuid[] not null default '{}', -- 근거가 된 기출
  expected_format text,                   -- 데이터 기반 예상 출제 방식
  study_concepts text[] not null default '{}',
  ai_title text,
  ai_interpretation text,                 -- AI 해석 (DB 사실과 구분)
  ai_expected_format text,
  ai_study_concepts text[] not null default '{}',
  ai_likelihood text check (ai_likelihood in ('high', 'medium', 'low')),
  ai_cautions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, topic_key)
);
create index if not exists prediction_topics_run_idx on public.prediction_topics (run_id, rank);

-- 예상 연습문제 (기존 기출을 복제하지 않고 출제 경향으로 새로 만든 문제)
create table if not exists public.practice_questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.prediction_topics(id) on delete cascade,
  run_id uuid not null references public.prediction_runs(id) on delete cascade,
  passage text not null,
  passage_note text,
  question text not null,
  conditions text[] not null default '{}',
  model_answer text not null,
  required_keywords text[] not null default '{}',
  scoring_points text[] not null default '{}',
  rationale text not null,
  related_question_ids uuid[] not null default '{}',
  provider text,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);
create index if not exists practice_questions_run_idx on public.practice_questions (run_id);

do $$
declare t text;
begin
  foreach t in array array['prediction_runs', 'prediction_topics', 'practice_questions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;
