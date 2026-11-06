-- =====================================================================
-- ethics-exam-study : Supabase schema
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전하도록 if not exists / on conflict 를 사용합니다.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 시험
-- ---------------------------------------------------------------------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  exam_year int not null,                       -- 학년도 (예: 2026)
  exam_name text not null default '중등교사 임용시험',
  subject text not null default '도덕·윤리',
  section text check (section in ('A', 'B')),   -- 전공 A / 전공 B
  note text,
  pdf_path text,                                -- storage 내부 경로
  pdf_url text,                                 -- public URL
  pdf_hash text not null unique,                -- SHA-256 (중복 업로드 방지)
  pdf_size bigint,
  page_count int,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'segmented', 'analyzing', 'analyzed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exams_year_idx on public.exams (exam_year desc, section);
drop trigger if exists exams_updated_at on public.exams;
create trigger exams_updated_at before update on public.exams
  for each row execute function public.set_updated_at();

-- 페이지 렌더링 결과 (페이지 이미지 + 텍스트 레이어)
create table if not exists public.exam_pages (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  page_number int not null,
  image_url text,
  width real,
  height real,
  text_content text,
  has_text_layer boolean not null default true,  -- false 이면 스캔 PDF (OCR / vision 필요)
  created_at timestamptz not null default now(),
  unique (exam_id, page_number)
);

-- ---------------------------------------------------------------------
-- 문항
-- ---------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  parent_id uuid references public.questions(id) on delete cascade, -- 소문항이면 상위 문항
  question_number int not null,
  sub_question_number text,                      -- 예: '1', '2' → 3-1, 3-2
  label text not null,                           -- 화면 표시용 (예: '3', '3-1')
  sort_order int not null default 0,
  page_start int,
  page_end int,
  -- 문항 영역: [{ page, x0, y0, x1, y1 }] (0~1 로 정규화된 좌표)
  regions jsonb not null default '[]'::jsonb,
  question_text text,
  question_image_url text,
  score numeric,                                 -- 배점
  question_type text,                            -- 기입형 / 서술형 / 논술형 등
  segmentation_source text not null default 'auto' check (segmentation_source in ('auto', 'manual')),
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists questions_exam_idx on public.questions (exam_id, sort_order);
create index if not exists questions_text_trgm on public.questions using gin (question_text gin_trgm_ops);
drop trigger if exists questions_updated_at on public.questions;
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 사상가 / 개념 / 원전 (마스터 데이터)
-- ---------------------------------------------------------------------
create table if not exists public.philosophers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                     -- 예: 왕수인
  aliases text[] not null default '{}',          -- 예: {왕양명, 양명}
  original_name text,                            -- 王守仁 / Immanuel Kant
  tradition text,                                -- 동양윤리 / 서양윤리 / 한국윤리 / 사회사상 ...
  school text,                                   -- 학파 (예: 양명학)
  era text,                                      -- 시대 (예: 명대)
  core_ideas text,                               -- 핵심 사상
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists philosophers_updated_at on public.philosophers;
create trigger philosophers_updated_at before update on public.philosophers
  for each row execute function public.set_updated_at();

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                     -- 예: 양지
  aliases text[] not null default '{}',
  definition text,
  similar_concepts text[] not null default '{}',
  confusable_concepts text[] not null default '{}', -- 반대 또는 혼동 개념
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists concepts_updated_at on public.concepts;
create trigger concepts_updated_at before update on public.concepts
  for each row execute function public.set_updated_at();

-- 개념 ↔ 사상가 (질문 연결과 별개로 직접 정리하는 관계)
create table if not exists public.concept_philosophers (
  concept_id uuid not null references public.concepts(id) on delete cascade,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  primary key (concept_id, philosopher_id)
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,                    -- 예: 전습록 (『』 없이 저장)
  aliases text[] not null default '{}',
  philosopher_id uuid references public.philosophers(id) on delete set null,
  summary text,                                  -- 핵심 내용
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists sources_updated_at on public.sources;
create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();

-- 원전 원문 / 번역문 DB (직접 입력하는 검증된 자료)
create table if not exists public.source_passages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  volume text,                                   -- 권
  chapter text,                                  -- 장 / 편
  section text,                                  -- 절
  page text,
  original_text text,                            -- 원문
  translation text,                              -- 번역문
  citation text,                                 -- 출처 (번역본, 출판사 등)
  related_concepts text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists source_passages_source_idx on public.source_passages (source_id);
drop trigger if exists source_passages_updated_at on public.source_passages;
create trigger source_passages_updated_at before update on public.source_passages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 문항 분석
-- ---------------------------------------------------------------------
create table if not exists public.question_analysis (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions(id) on delete cascade,
  area text,                                     -- 출제 영역
  school text,                                   -- 학파
  era text,                                      -- 시대
  question_type text,                            -- 문제 유형
  difficulty text check (difficulty in ('상', '중', '하')),
  answer text,
  answer_explanation text,
  question_intent text,                          -- 문제에서 요구하는 것
  required_keywords text[] not null default '{}',
  common_mistakes jsonb not null default '[]'::jsonb,
  -- 나머지 상세 분석 (핵심 단서, 제시문 분석, 풀이 과정, 모범답안, 채점 포인트 ...)
  details jsonb not null default '{}'::jsonb,
  philosopher_confidence real,
  answer_confidence real,
  source_confidence real,
  concept_confidence real,
  overall_confidence real,
  status text not null default 'pending'
    check (status in ('pending', 'analyzed', 'needs_review', 'verified', 'error')),
  review_reasons text[] not null default '{}',
  -- AI 최초(최신) 분석 원본. 관리자 수정은 위 컬럼에만 반영되고 이 값은 그대로 유지된다.
  ai_original jsonb,
  edited_fields text[] not null default '{}',    -- 관리자가 수정한 필드 목록
  edited_at timestamptz,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists question_analysis_updated_at on public.question_analysis;
create trigger question_analysis_updated_at before update on public.question_analysis
  for each row execute function public.set_updated_at();

-- 문항 ↔ 사상가 (복수 사상가 + 역할)
create table if not exists public.question_philosophers (
  question_id uuid not null references public.questions(id) on delete cascade,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  role text not null default 'main' check (role in ('main', 'comparison', 'distractor', 'mentioned')),
  confidence real,
  -- { decisiveExpressions: [], similarPhilosophers: [], distinguishingPoints: '', reasoning: '' }
  reasoning jsonb not null default '{}'::jsonb,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (question_id, philosopher_id)
);
create index if not exists qp_philosopher_idx on public.question_philosophers (philosopher_id);

-- 문항 ↔ 개념
create table if not exists public.question_concepts (
  question_id uuid not null references public.questions(id) on delete cascade,
  concept_id uuid not null references public.concepts(id) on delete cascade,
  philosopher_id uuid references public.philosophers(id) on delete set null, -- 어느 사상가의 개념인지
  confidence real,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (question_id, concept_id)
);
create index if not exists qc_concept_idx on public.question_concepts (concept_id);

-- 문항 ↔ 원전 (출전 분석)
create table if not exists public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  passage_id uuid references public.source_passages(id) on delete set null,
  philosopher_name text,
  title_raw text,                                -- AI 가 제시한 원전명 원문
  location text,                                 -- 장 / 편 / 권 (모르면 null)
  related_content text,
  relation_to_question text,
  quoted_text text,                              -- 출제된 문장 (제시문 일부)
  verification_status text not null default 'unknown'
    check (verification_status in ('confirmed', 'likely', 'candidate', 'unknown')),
  confidence real,
  reasoning text,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists qs_question_idx on public.question_sources (question_id);
create index if not exists qs_source_idx on public.question_sources (source_id);

-- AI 호출 기록 (비용 / 디버깅 / 원본 응답 보관)
create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.questions(id) on delete cascade,
  scope text not null,                           -- full / answer / philosophers / sources / explanation
  provider text,
  model text,
  status text not null check (status in ('success', 'error')),
  input_tokens int,
  output_tokens int,
  raw_output jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists analysis_runs_question_idx on public.analysis_runs (question_id, created_at desc);

-- 사상가 비교 결과 캐시 (같은 비교는 AI 를 다시 호출하지 않음)
create table if not exists public.philosopher_comparisons (
  id uuid primary key default gen_random_uuid(),
  philosopher_a_id uuid not null references public.philosophers(id) on delete cascade,
  philosopher_b_id uuid not null references public.philosophers(id) on delete cascade,
  content jsonb not null,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  unique (philosopher_a_id, philosopher_b_id)
);

-- ---------------------------------------------------------------------
-- (향후) embedding 기반 유사 기출 검색
-- Supabase → Database → Extensions 에서 vector 를 켠 뒤 아래 주석을 해제하세요.
-- ---------------------------------------------------------------------
-- create extension if not exists vector;
-- create table if not exists public.question_embeddings (
--   question_id uuid primary key references public.questions(id) on delete cascade,
--   embedding vector(1536),
--   model text,
--   created_at timestamptz not null default now()
-- );

-- ---------------------------------------------------------------------
-- RLS: 누구나 읽기 가능, 쓰기는 서버(Service Role Key)에서만
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'exams','exam_pages','questions','philosophers','concepts','concept_philosophers',
    'sources','source_passages','question_analysis','question_philosophers',
    'question_concepts','question_sources','philosopher_comparisons'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- analysis_runs 는 내부 기록이므로 공개 읽기 정책 없이 RLS 만 켠다.
alter table public.analysis_runs enable row level security;

-- ---------------------------------------------------------------------
-- Storage 버킷 (public read; 업로드는 서버가 발급한 signed URL 로만 가능)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-pdfs', 'exam-pdfs', true, 104857600, array['application/pdf'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 20971520, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 002: 심화 문항 분석 + 전체 기출 출제 예측 (supabase/migrations/002_deep_analysis_and_predictions.sql 과 동일)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 003: 사상가 개념 정리 노트 (supabase/migrations/003_philosopher_notes.sql 과 동일)
-- ---------------------------------------------------------------------
create table if not exists public.philosopher_notes (
  id uuid primary key default gen_random_uuid(),
  philosopher_id uuid not null unique references public.philosophers(id) on delete cascade,
  content jsonb not null,                       -- PhilosopherStudyNote (src/lib/ai/schemas.ts)
  ref_map jsonb not null default '{}'::jsonb,   -- { "2024 A 3번": question_id } 저장 당시 기출 ref → 문항
  source text,                                  -- Claude 채팅 / ChatGPT 채팅 / Gemini 채팅 / 직접 작성 ...
  prompt_version text,
  based_on_question_ids uuid[] not null default '{}', -- 정리할 때 사용한 분석 문항
  edited boolean not null default false,        -- 붙여넣은 뒤 관리자가 직접 수정했는지
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.philosopher_notes enable row level security;
drop policy if exists "public read" on public.philosopher_notes;
create policy "public read" on public.philosopher_notes for select using (true);

-- ---------------------------------------------------------------------
-- 004: 원전 해설 + 내 메모 (supabase/migrations/004_answer_commentary_and_memos.sql 과 동일)
-- ---------------------------------------------------------------------
-- 원전 해설: 어떤 저작인지, 구성, 핵심 주제 (문항 분석 v3)
alter table public.question_sources add column if not exists source_overview text;

-- 내 메모: 관리자(본인) 로그인 상태에서만 읽고 쓴다.
-- 공개 읽기 정책을 만들지 않으므로 anon key 로는 읽을 수 없고, 서버가 service role 로만 접근한다.
create table if not exists public.study_memos (
  question_id uuid primary key references public.questions(id) on delete cascade,
  memo text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists study_memos_updated_idx on public.study_memos (updated_at desc);
alter table public.study_memos enable row level security;

-- ---------------------------------------------------------------------
-- 005: 윤리 퀴즈 (supabase/migrations/005_quiz.sql 과 동일)
-- ---------------------------------------------------------------------
-- 문제은행: 기출 문항을 답할 수 있는 최소 단위로 나눈 문제 + AI 예상 문제
-- 해설은 복사하지 않고 question_id + label 로 기존 분석(question_analysis)에 연결해 매번 읽는다.
create table if not exists public.quiz_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                 -- 중복 방지 키: q:{문항}:{요구사항} / x:{문항}:{예상문제} / p:{연습문제} / m:{직접 추가}
  kind text not null check (kind in ('exam', 'expected')),
  origin text not null default 'analysis' check (origin in ('analysis', 'practice', 'manual')),
  question_id uuid references public.questions(id) on delete set null, -- 원본 기출 (예상 문제는 근거가 된 기출)
  practice_question_id uuid references public.practice_questions(id) on delete set null,
  label text not null default '',           -- ㉠, (가), 작성 방법 2 …
  format text not null check (format in ('fill', 'essay')),       -- 기입형 / 서술형
  grading text not null check (grading in ('auto', 'self')),      -- 자동 채점 / 자기평가
  prompt text,                              -- 세부 발문 (원문 그대로)
  passage text,                             -- 예상 문제의 제시문 (기출은 questions.question_text 를 읽는다)
  answer text,                              -- 이 세부 문제의 정답
  accepted_answers text[] not null default '{}', -- 정답으로 인정하는 표현 (관리자 검증)
  model_answer text,                        -- 예상 문제의 모범답안
  explanation text,                         -- 예상 문제의 해설
  area text,
  philosopher_names text[] not null default '{}',
  concept_names text[] not null default '{}',
  exam_year int,
  difficulty smallint not null default 2 check (difficulty between 1 and 3), -- 1 하 · 2 중 · 3 상
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden', 'stale')),
  review_reasons text[] not null default '{}',
  source_hash text,                         -- 만들 때 쓴 원본 분석의 지문 (바뀌면 '분석 변경됨')
  source_changed boolean not null default false,
  edited boolean not null default false,    -- 관리자가 직접 고침 → 동기화로 덮어쓰지 않음
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quiz_items_question_idx on public.quiz_items (question_id);
create index if not exists quiz_items_status_idx on public.quiz_items (status, kind);

-- 설정 (한 줄)
create table if not exists public.quiz_settings (
  id smallint primary key default 1 check (id = 1),
  daily_total int not null default 10,
  daily_exam int not null default 6,
  daily_expected int not null default 2,
  daily_review int not null default 2,
  auto_approve_exam boolean not null default true, -- 분리가 분명한 기출 세부 문제는 자동 승인
  updated_at timestamptz not null default now()
);
insert into public.quiz_settings (id) values (1) on conflict (id) do nothing;

-- 학습자 프로필 (learner = 학습자 키. 지금은 관리자 로그인 = 'owner')
create table if not exists public.quiz_profiles (
  learner text primary key,
  start_level text not null default 'basic' check (start_level in ('basic', 'advanced', 'expert')),
  xp int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  last_completed_day date,
  badges text[] not null default '{}',
  total_answered int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 문제별 숙련도 · 복습 일정
create table if not exists public.quiz_progress (
  learner text not null,
  item_id uuid not null references public.quiz_items(id) on delete cascade,
  attempts int not null default 0,
  correct_count int not null default 0,
  last_result text check (last_result in ('correct', 'partial', 'wrong')),
  streak int not null default 0,            -- 연속 정답
  ease real not null default 2.5,
  interval_days real not null default 0,
  due_on date,
  mastery smallint not null default 0 check (mastery between 0 and 5),
  last_at timestamptz,
  last_xp_day date,                         -- 같은 날 같은 문제로 경험치를 반복 획득하지 못하게
  primary key (learner, item_id)
);
create index if not exists quiz_progress_due_idx on public.quiz_progress (learner, due_on);

-- 풀이 기록 (자동 채점과 자기평가를 구분해 저장)
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  item_id uuid not null references public.quiz_items(id) on delete cascade,
  mode text not null check (mode in ('daily', 'free', 'review')),
  result text not null check (result in ('correct', 'partial', 'wrong')),
  graded_by text not null check (graded_by in ('auto', 'self')),
  answer_text text,
  xp int not null default 0,
  day date not null,                        -- 한국 시간 기준 날짜
  created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_learner_idx on public.quiz_attempts (learner, created_at desc);

-- 일일 미션 (한국 시간 하루 한 번)
create table if not exists public.quiz_daily (
  learner text not null,
  day date not null,
  item_ids uuid[] not null,
  slots text[] not null default '{}',       -- 배정 이유: exam / expected / review / fill
  results jsonb not null default '{}'::jsonb, -- { item_id: result }
  xp int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (learner, day)
);

-- 자동 채점에서 오답 처리된 답에 대한 검수 요청 (관리자가 정답으로 인정할 수 있음)
create table if not exists public.quiz_reports (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  item_id uuid not null references public.quiz_items(id) on delete cascade,
  answer_text text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['quiz_items', 'quiz_settings', 'quiz_profiles', 'quiz_progress', 'quiz_attempts', 'quiz_daily', 'quiz_reports'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 006: 회원 (supabase/migrations/006_members.sql 과 동일)
-- ---------------------------------------------------------------------
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,          -- 로그인 아이디 (영문 소문자·숫자·_)
  display_name text not null,             -- 화면에 보이는 이름
  password_hash text not null,            -- scrypt$salt$hash
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table public.members enable row level security;

-- 관리자가 회원가입을 열고 닫을 수 있게
alter table public.quiz_settings add column if not exists signup_open boolean not null default true;

-- 내 메모도 회원별로: 학습자 키(관리자 = 'owner', 회원 = 'm:<id>') + 문항
alter table public.study_memos add column if not exists learner text not null default 'owner';
alter table public.study_memos drop constraint if exists study_memos_pkey;
alter table public.study_memos add primary key (learner, question_id);

-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 008: 철학자 대난투 (철학자 카드 수집 · 강화 · 배틀)
-- 새 테이블과 함수만 만듭니다. 기존 기출·분석·사상가·퀴즈 데이터는 읽기만 하고 바꾸지 않습니다.
-- 여러 번 실행해도 안전합니다.
--
-- 구성
--   game_cards       : 사상가별 카드 게임 정보 (사상가 원본 philosophers 와 분리, 1:1)
--   game_settings    : 뽑기 비용 · 등급 확률 · 코인 지급 기준 (한 줄)
--   game_wallets     : 계정별 코인 잔액
--   game_ledger      : 코인 지급·사용 이력 (같은 요청은 ref 로 한 번만 처리)
--   game_collection  : 계정별 보유 카드 · 레벨 · 강화 조각
--   game_profiles    : 대표 카드 · 배틀 덱 · 전적
--   game_battles     : 배틀 기록
-- 코인 지급 · 뽑기 · 강화는 아래 함수 하나 안에서 잔액 행을 잠그고 처리합니다 (중복 클릭·동시 요청에도 한 번만).

-- ---------------------------------------------------------------------
-- 카드 정보 (관리자가 준비 · 공개)
-- ---------------------------------------------------------------------
create table if not exists public.game_cards (
  philosopher_id uuid primary key references public.philosophers(id) on delete cascade,
  rarity text not null default 'common' check (rarity in ('common', 'rare', 'epic', 'legendary')),
  base_atk int not null default 40 check (base_atk between 1 and 999),
  base_hp int not null default 300 check (base_hp between 1 and 9999),
  skill_name text not null default '',
  skill_effect text not null default 'strike' check (skill_effect in ('strike', 'sweep', 'heal', 'guard', 'stun')),
  skill_desc text not null default '',
  quote text not null default '',              -- 대표 카드 대사 (게임용 창작 문구)
  art_url text,                                -- 카드 일러스트 (없으면 공개 불가)
  art_basis text not null default 'portrait' check (art_basis in ('portrait', 'reconstruction')),
  art_note text not null default '',
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_settings (
  id int primary key default 1 check (id = 1),
  draw_cost int not null default 100 check (draw_cost > 0),
  -- 등급 확률 (가중치, 합이 100 이 아니어도 비율로 계산)
  rates jsonb not null default '{"common": 60, "rare": 28, "epic": 10, "legendary": 2}'::jsonb,
  -- 학습 코인 지급 기준
  coin_rules jsonb not null default '{"fill_correct": 20, "essay_correct": 30, "essay_partial": 15, "wrong": 5, "mission": 50, "reconquer": 15, "daily_cap": 600, "essay_min_chars": 30}'::jsonb,
  max_level int not null default 5 check (max_level between 2 and 20),
  dup_refund int not null default 20 check (dup_refund >= 0),  -- 최대 레벨 카드 중복 시 돌려주는 코인
  updated_at timestamptz not null default now()
);
insert into public.game_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 계정별 데이터 (learner: 퀴즈와 같은 학습자 키, 회원 'm:<id>' / 관리자 'owner')
-- ---------------------------------------------------------------------
create table if not exists public.game_wallets (
  learner text primary key,
  coins int not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_ledger (
  id bigint generated always as identity primary key,
  learner text not null,
  amount int not null,                          -- 지급 +, 사용 -
  kind text not null check (kind in ('quiz', 'reconquer', 'mission', 'draw', 'upgrade', 'refund', 'admin')),
  ref text not null,                            -- 같은 요청 판별 (예: attempt:<id>, draw:<요청 id>)
  meta jsonb not null default '{}'::jsonb,
  day date not null,                            -- 한국 시간 기준 날짜
  created_at timestamptz not null default now(),
  unique (learner, ref)
);
create index if not exists game_ledger_learner_idx on public.game_ledger (learner, created_at desc);

create table if not exists public.game_collection (
  learner text not null,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  level int not null default 1 check (level >= 1),
  shards int not null default 0 check (shards >= 0),
  copies int not null default 1 check (copies >= 1),  -- 지금까지 뽑은 횟수
  first_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (learner, philosopher_id)
);

create table if not exists public.game_profiles (
  learner text primary key,
  featured_philosopher_id uuid references public.philosophers(id) on delete set null,
  deck uuid[] not null default '{}',
  wins int not null default 0,
  losses int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_battles (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard')),
  deck jsonb not null,
  opponent jsonb not null,
  seed text not null,
  result text not null check (result in ('win', 'lose')),
  turns int not null,
  created_at timestamptz not null default now()
);
create index if not exists game_battles_learner_idx on public.game_battles (learner, created_at desc);

-- 서버(service role)만 읽고 쓴다: RLS 를 켜고 공개 정책은 두지 않음
alter table public.game_cards enable row level security;
alter table public.game_settings enable row level security;
alter table public.game_wallets enable row level security;
alter table public.game_ledger enable row level security;
alter table public.game_collection enable row level security;
alter table public.game_profiles enable row level security;
alter table public.game_battles enable row level security;

-- ---------------------------------------------------------------------
-- 뽑기 대상: 공개 + 일러스트 있음 + 지금도 기출 분석에 (주요·비교 사상가로) 연결된 사상가
-- ---------------------------------------------------------------------
create or replace function public.game_draw_pool()
returns table (philosopher_id uuid, rarity text)
language sql stable
set search_path = public
as $$
  select c.philosopher_id, c.rarity
  from game_cards c
  where c.published
    and c.art_url is not null and c.art_url <> ''
    and c.skill_name <> ''
    and exists (
      select 1 from question_philosophers qp
      where qp.philosopher_id = c.philosopher_id and qp.role in ('main', 'comparison')
    );
$$;

-- 잔액 행을 만들고 잠근다 (같은 학습자의 코인 처리를 한 줄로 세움)
create or replace function public.game_lock_wallet(p_learner text)
returns int
language plpgsql
set search_path = public
as $$
declare v int;
begin
  insert into game_wallets (learner) values (p_learner) on conflict (learner) do nothing;
  select coins into v from game_wallets where learner = p_learner for update;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 코인 지급 (학습 활동). 같은 ref 는 한 번만. 하루 상한(quiz·reconquer 합계)
-- 반환: 실제로 지급한 코인
-- ---------------------------------------------------------------------
create or replace function public.game_grant(
  p_learner text, p_amount int, p_kind text, p_ref text, p_day date, p_meta jsonb default '{}'::jsonb, p_daily_cap int default null
)
returns int
language plpgsql
set search_path = public
as $$
declare
  v_today int;
  v_amount int := greatest(0, p_amount);
begin
  perform game_lock_wallet(p_learner);
  if exists (select 1 from game_ledger where learner = p_learner and ref = p_ref) then
    return 0;
  end if;
  if p_daily_cap is not null then
    select coalesce(sum(amount), 0) into v_today from game_ledger
      where learner = p_learner and day = p_day and kind in ('quiz', 'reconquer');
    v_amount := least(v_amount, greatest(0, p_daily_cap - v_today));
  end if;
  insert into game_ledger (learner, amount, kind, ref, meta, day)
    values (p_learner, v_amount, p_kind, p_ref, p_meta || jsonb_build_object('requested', p_amount), p_day);
  update game_wallets set coins = coins + v_amount, updated_at = now() where learner = p_learner;
  return v_amount;
end $$;

-- ---------------------------------------------------------------------
-- 카드 뽑기: 확률·결과는 DB 안에서 정한다. 같은 ref 를 다시 보내면 처음 결과를 그대로 돌려준다
-- ---------------------------------------------------------------------
create or replace function public.game_draw(p_learner text, p_ref text, p_day date)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  s game_settings;
  v_prev jsonb;
  v_total numeric;
  v_roll numeric;
  v_acc numeric := 0;
  v_rarity text;
  v_card uuid;
  v_row game_collection;
  v_new boolean := false;
  v_refund int := 0;
  v_meta jsonb;
  r record;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
  end if;
  select * into s from game_settings where id = 1;
  if v_coins < s.draw_cost then
    raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001';
  end if;

  -- 공개 카드가 있는 등급만으로 확률을 다시 나눈다
  select sum(greatest(0, coalesce((s.rates ->> p.rarity)::numeric, 0))) into v_total
    from (select distinct rarity from game_draw_pool()) p;
  if v_total is null or v_total <= 0 then
    raise exception 'GAME_NO_CARDS' using errcode = 'P0001';
  end if;
  v_roll := random() * v_total;
  for r in
    select p.rarity, greatest(0, coalesce((s.rates ->> p.rarity)::numeric, 0)) as w
    from (select distinct rarity from game_draw_pool()) p
    order by array_position(array['legendary', 'epic', 'rare', 'common'], p.rarity)
  loop
    v_acc := v_acc + r.w;
    if v_rarity is null and r.w > 0 and v_roll < v_acc then
      v_rarity := r.rarity;
    end if;
  end loop;
  if v_rarity is null then
    select p.rarity into v_rarity from game_draw_pool() p where coalesce((s.rates ->> p.rarity)::numeric, 0) > 0 limit 1;
  end if;
  select p.philosopher_id into v_card from game_draw_pool() p where p.rarity = v_rarity order by random() limit 1;

  -- 새 카드 / 중복 → 강화 조각 (최대 레벨이면 코인 일부 환급)
  select * into v_row from game_collection where learner = p_learner and philosopher_id = v_card for update;
  if not found then
    insert into game_collection (learner, philosopher_id) values (p_learner, v_card) returning * into v_row;
    v_new := true;
  elsif v_row.level >= s.max_level then
    update game_collection set copies = copies + 1, updated_at = now()
      where learner = p_learner and philosopher_id = v_card returning * into v_row;
    v_refund := s.dup_refund;
  else
    update game_collection set copies = copies + 1, shards = shards + 1, updated_at = now()
      where learner = p_learner and philosopher_id = v_card returning * into v_row;
  end if;

  v_meta := jsonb_build_object(
    'philosopherId', v_card, 'rarity', v_rarity, 'isNew', v_new, 'level', v_row.level,
    'shards', v_row.shards, 'copies', v_row.copies, 'refund', v_refund, 'cost', s.draw_cost
  );
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -s.draw_cost, 'draw', p_ref, v_meta, p_day);
  if v_refund > 0 then
    insert into game_ledger (learner, amount, kind, ref, meta, day)
      values (p_learner, v_refund, 'refund', p_ref || ':refund', jsonb_build_object('philosopherId', v_card), p_day);
  end if;
  update game_wallets set coins = coins - s.draw_cost + v_refund, updated_at = now()
    where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------
-- 강화: 확정 성공. 서버가 계산한 필요 조각·코인과 지금 레벨이 맞을 때만 (동시 요청 시 한 번만 오른다)
-- ---------------------------------------------------------------------
create or replace function public.game_upgrade(
  p_learner text, p_philosopher uuid, p_ref text, p_day date, p_from_level int, p_shards int, p_coins int
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  v_prev jsonb;
  v_row game_collection;
  v_max int;
  v_meta jsonb;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then
    return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
  end if;
  select max_level into v_max from game_settings where id = 1;
  select * into v_row from game_collection where learner = p_learner and philosopher_id = p_philosopher for update;
  if not found then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  if v_row.level >= v_max then raise exception 'GAME_MAX_LEVEL' using errcode = 'P0001'; end if;
  if v_row.level <> p_from_level then raise exception 'GAME_LEVEL_CHANGED' using errcode = 'P0001'; end if;
  if v_row.shards < p_shards then raise exception 'GAME_NOT_ENOUGH_SHARDS' using errcode = 'P0001'; end if;
  if v_coins < p_coins then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  update game_collection set level = level + 1, shards = shards - p_shards, updated_at = now()
    where learner = p_learner and philosopher_id = p_philosopher returning * into v_row;
  v_meta := jsonb_build_object('philosopherId', p_philosopher, 'fromLevel', p_from_level, 'level', v_row.level, 'shards', v_row.shards, 'cost', p_coins);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -p_coins, 'upgrade', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - p_coins, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- 함수는 서버(service role)만 호출할 수 있게 (브라우저의 anon 키로는 호출 불가)
revoke all on function public.game_draw_pool() from public, anon, authenticated;
revoke all on function public.game_lock_wallet(text) from public, anon, authenticated;
revoke all on function public.game_grant(text, int, text, text, date, jsonb, int) from public, anon, authenticated;
revoke all on function public.game_draw(text, text, date) from public, anon, authenticated;
revoke all on function public.game_upgrade(text, uuid, text, date, int, int, int) from public, anon, authenticated;
grant execute on function public.game_draw_pool() to service_role;
grant execute on function public.game_lock_wallet(text) to service_role;
grant execute on function public.game_grant(text, int, text, text, date, jsonb, int) to service_role;
grant execute on function public.game_draw(text, text, date) to service_role;
grant execute on function public.game_upgrade(text, uuid, text, date, int, int, int) to service_role;
grant all on public.game_cards, public.game_settings, public.game_wallets, public.game_ledger,
  public.game_collection, public.game_profiles, public.game_battles to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------
-- 009: 철학자 대난투 — 카드별 등급 · 합성(진화) · 최초 1회 무료 뽑기 (supabase/migrations/009_game_cards_fusion.sql 과 동일)
-- 008 위에 추가만 합니다. 기존 표·열·함수(game_draw · game_upgrade 등)는 지우거나 바꾸지 않습니다 (되돌리기용).
-- 기출 분석·사상가·퀴즈 데이터는 건드리지 않습니다. 여러 번 실행해도 안전합니다.
--
-- 바뀌는 구조
--   game_user_cards  : 보유 카드 한 장 = 한 행 (고유 id · 사상가 · 등급 · 레벨 · 잠금). 같은 사상가의 여러 등급·여러 장 가능
--   game_collection  : 사상가별 강화 조각 은행으로 계속 사용 (shards). level 열은 더 이상 쓰지 않음 (보존)
--   game_profiles    : featured_card_id · deck_cards 추가 (카드 id 기준). 기존 featured_philosopher_id · deck 은 보존
--   game_free_draws  : 계정당 최초 1회 무료 뽑기 기록 (learner 가 기본 키 → 1회만)
--   game_settings    : 등급 배율 · 합성 장수 · 합성 비용 추가
--   game_cards.rarity: 더 이상 뽑기에 쓰지 않음 (보존, 기존 보유 카드 이전에만 사용)
--
-- 기존 데이터 이전
--   - 008 의 game_collection 한 행(사상가별 1장) → game_user_cards 1장 (등급 = 당시 그 사상가 카드 등급, 레벨 그대로)
--   - 과거 뽑은 횟수(copies)만큼 카드를 새로 만들지 않음 (중복 지급 없음). 강화 조각은 그대로
--   - 대표 카드·배틀 덱은 옮긴 카드 id 로 연결
--   - 코인 잔액·거래 내역은 그대로
--   - 무료 뽑기: 기록이 없는 모든 계정(기존 이용자 포함)이 1회 사용 가능

-- ---------------------------------------------------------------------
-- 1. 표
-- ---------------------------------------------------------------------
create table if not exists public.game_user_cards (
  id uuid primary key default gen_random_uuid(),
  learner text not null,
  philosopher_id uuid not null references public.philosophers(id) on delete cascade,
  rarity text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  level int not null default 1 check (level >= 1),
  locked boolean not null default false,
  source text not null default 'draw' check (source in ('legacy', 'draw', 'free')),
  status text not null default 'owned' check (status in ('owned', 'consumed')),
  consumed_reason text check (consumed_reason in ('fusion', 'shards')),
  consumed_into uuid,                       -- 합성 재료였다면 결과(기준) 카드 id
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_user_cards_owner_idx on public.game_user_cards (learner, status);
-- 기존 카드 이전은 학습자·사상가당 한 번만
create unique index if not exists game_user_cards_legacy_once on public.game_user_cards (learner, philosopher_id) where source = 'legacy';

create table if not exists public.game_free_draws (
  learner text primary key,                 -- 계정당 1회
  card_id uuid not null,
  ref text not null,                        -- 같은 요청 재시도 판별
  created_at timestamptz not null default now()
);

alter table public.game_profiles add column if not exists featured_card_id uuid;
alter table public.game_profiles add column if not exists deck_cards uuid[] not null default '{}';

alter table public.game_settings add column if not exists rarity_mult jsonb not null default '{"common": 1.0, "rare": 1.2, "epic": 1.45, "legendary": 1.75}'::jsonb;
alter table public.game_settings add column if not exists fusion_count int not null default 2;
alter table public.game_settings add column if not exists fusion_cost int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_settings_fusion_count_check') then
    alter table public.game_settings add constraint game_settings_fusion_count_check check (fusion_count between 2 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'game_settings_fusion_cost_check') then
    alter table public.game_settings add constraint game_settings_fusion_cost_check check (fusion_cost >= 0);
  end if;
end $$;

-- 거래 내역 종류에 합성 추가 (기존 종류는 그대로)
alter table public.game_ledger drop constraint if exists game_ledger_kind_check;
alter table public.game_ledger add constraint game_ledger_kind_check
  check (kind in ('quiz', 'reconquer', 'mission', 'draw', 'upgrade', 'refund', 'admin', 'fusion'));

alter table public.game_user_cards enable row level security;
alter table public.game_free_draws enable row level security;
grant all on public.game_user_cards, public.game_free_draws to service_role;

-- ---------------------------------------------------------------------
-- 2. 기존 데이터 이전 (한 번만: 학습자·사상가당 legacy 카드 1장)
-- ---------------------------------------------------------------------
insert into public.game_user_cards (learner, philosopher_id, rarity, level, source, created_at)
select c.learner, c.philosopher_id, coalesce(g.rarity, 'common'), c.level, 'legacy', c.first_at
from public.game_collection c
left join public.game_cards g on g.philosopher_id = c.philosopher_id
where not exists (
  select 1 from public.game_user_cards u where u.learner = c.learner and u.philosopher_id = c.philosopher_id and u.source = 'legacy'
);

-- 대표 카드 · 덱: 사상가 id → 옮긴 카드 id (아직 연결 안 된 경우만)
update public.game_profiles p
set featured_card_id = u.id
from public.game_user_cards u
where p.featured_card_id is null and p.featured_philosopher_id is not null
  and u.learner = p.learner and u.philosopher_id = p.featured_philosopher_id and u.source = 'legacy';

update public.game_profiles p
set deck_cards = coalesce((
  select array_agg(u.id order by array_position(p.deck, u.philosopher_id))
  from public.game_user_cards u
  where u.learner = p.learner and u.source = 'legacy' and u.philosopher_id = any (p.deck)
), '{}')
where coalesce(array_length(p.deck_cards, 1), 0) = 0 and coalesce(array_length(p.deck, 1), 0) > 0;

-- 사상가 기본 능력치: 008 에서 등급 기본값을 그대로 쓴 카드는 '일반 Lv.1' 기준값으로 (관리자가 바꾼 값은 그대로)
update public.game_cards set base_atk = 40, base_hp = 300
where (rarity, base_atk, base_hp) in (('rare', 46, 340), ('epic', 53, 380), ('legendary', 60, 420));

-- ---------------------------------------------------------------------
-- 3. 뽑기 (유료 / 최초 1회 무료). 등급은 모든 사상가에 공통 확률, 사상가는 공개 카드 중 하나
-- ---------------------------------------------------------------------
create or replace function public.game_draw_card(p_learner text, p_ref text, p_day date, p_free boolean)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  s game_settings;
  v_prev jsonb;
  v_free game_free_draws;
  v_total numeric;
  v_roll numeric;
  v_acc numeric := 0;
  v_rarity text;
  v_ph uuid;
  v_card game_user_cards;
  v_new_ph boolean;
  v_featured boolean := false;
  v_meta jsonb;
  r record;
begin
  v_coins := game_lock_wallet(p_learner);

  -- 같은 요청 재시도 → 처음 결과
  if p_free then
    select * into v_free from game_free_draws where learner = p_learner;
    if found then
      if v_free.ref = p_ref then
        select * into v_card from game_user_cards where id = v_free.card_id;
        return jsonb_build_object('cardId', v_card.id, 'philosopherId', v_card.philosopher_id, 'rarity', v_card.rarity, 'level', v_card.level,
          'free', true, 'replayed', true, 'coins', v_coins);
      end if;
      raise exception 'GAME_FREE_USED' using errcode = 'P0001';
    end if;
  else
    select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
    if found then
      return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins);
    end if;
  end if;

  select * into s from game_settings where id = 1;
  if not p_free and v_coins < s.draw_cost then
    raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001';
  end if;
  if not exists (select 1 from game_draw_pool()) then
    raise exception 'GAME_NO_CARDS' using errcode = 'P0001';
  end if;

  -- 등급: 설정 확률 (모든 사상가 공통)
  select sum(greatest(0, coalesce((s.rates ->> k)::numeric, 0))) into v_total
    from unnest(array['common', 'rare', 'epic', 'legendary']) k;
  if v_total is null or v_total <= 0 then v_total := 1; end if;
  v_roll := random() * v_total;
  for r in select k, greatest(0, coalesce((s.rates ->> k)::numeric, 0)) as w from unnest(array['legendary', 'epic', 'rare', 'common']) k loop
    v_acc := v_acc + r.w;
    if v_rarity is null and r.w > 0 and v_roll < v_acc then v_rarity := r.k; end if;
  end loop;
  v_rarity := coalesce(v_rarity, 'common');
  -- 사상가: 공개 카드 중 균등
  select philosopher_id into v_ph from game_draw_pool() order by random() limit 1;

  v_new_ph := not exists (select 1 from game_user_cards where learner = p_learner and philosopher_id = v_ph and status = 'owned');
  insert into game_user_cards (learner, philosopher_id, rarity, source)
    values (p_learner, v_ph, v_rarity, case when p_free then 'free' else 'draw' end) returning * into v_card;
  -- 사상가별 기록(조각 은행) 행: 없으면 만들고, 뽑은 횟수만 센다 (조각은 자동으로 늘리지 않음)
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_ph, 1, 0, 1)
    on conflict (learner, philosopher_id) do update set copies = game_collection.copies + 1, updated_at = now();

  -- 대표 카드가 없으면 이 카드를 대표로 (기존 선택은 덮어쓰지 않음)
  insert into game_profiles (learner) values (p_learner) on conflict (learner) do nothing;
  update game_profiles set featured_card_id = v_card.id, updated_at = now()
    where learner = p_learner
      and (featured_card_id is null or not exists (select 1 from game_user_cards u where u.id = featured_card_id and u.status = 'owned'));
  v_featured := found;

  v_meta := jsonb_build_object('cardId', v_card.id, 'philosopherId', v_ph, 'rarity', v_rarity, 'level', 1,
    'isNewPhilosopher', v_new_ph, 'free', p_free, 'autoFeatured', v_featured, 'cost', case when p_free then 0 else s.draw_cost end);
  if p_free then
    insert into game_free_draws (learner, card_id, ref) values (p_learner, v_card.id, p_ref);
  else
    insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -s.draw_cost, 'draw', p_ref, v_meta, p_day);
    update game_wallets set coins = coins - s.draw_cost, updated_at = now() where learner = p_learner returning coins into v_coins;
  end if;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------
-- 4. 레벨업 (카드별): 사상가별 강화 조각 + 코인. 확정 성공
-- ---------------------------------------------------------------------
create or replace function public.game_level_up(
  p_learner text, p_card uuid, p_ref text, p_day date, p_from_level int, p_shards int, p_coins int
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_coins int;
  v_prev jsonb;
  v_card game_user_cards;
  v_bank int;
  v_max int;
  v_meta jsonb;
begin
  v_coins := game_lock_wallet(p_learner);
  select meta into v_prev from game_ledger where learner = p_learner and ref = p_ref;
  if found then return v_prev || jsonb_build_object('replayed', true, 'coins', v_coins); end if;
  select max_level into v_max from game_settings where id = 1;
  select * into v_card from game_user_cards where id = p_card and learner = p_learner and status = 'owned' for update;
  if not found then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  if v_card.level >= v_max then raise exception 'GAME_MAX_LEVEL' using errcode = 'P0001'; end if;
  if v_card.level <> p_from_level then raise exception 'GAME_LEVEL_CHANGED' using errcode = 'P0001'; end if;
  select shards into v_bank from game_collection where learner = p_learner and philosopher_id = v_card.philosopher_id for update;
  if coalesce(v_bank, 0) < p_shards then raise exception 'GAME_NOT_ENOUGH_SHARDS' using errcode = 'P0001'; end if;
  if v_coins < p_coins then raise exception 'GAME_NOT_ENOUGH_COINS' using errcode = 'P0001'; end if;

  update game_user_cards set level = level + 1, updated_at = now() where id = p_card returning * into v_card;
  update game_collection set shards = shards - p_shards, updated_at = now() where learner = p_learner and philosopher_id = v_card.philosopher_id;
  v_meta := jsonb_build_object('cardId', p_card, 'philosopherId', v_card.philosopher_id, 'fromLevel', p_from_level, 'level', v_card.level, 'cost', p_coins, 'shardsUsed', p_shards);
  insert into game_ledger (learner, amount, kind, ref, meta, day) values (p_learner, -p_coins, 'upgrade', p_ref, v_meta, p_day);
  update game_wallets set coins = coins - p_coins, updated_at = now() where learner = p_learner returning coins into v_coins;
  return v_meta || jsonb_build_object('coins', v_coins, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------
-- 5. 합성(진화): 같은 등급 카드 n 장 → 기준 카드가 한 단계 위 등급. 재료는 소모. 확정 성공
--    재료 조건: 보유 중 · 잠금 아님 · 대표 카드 아님 (덱에 있으면 덱에서 빠짐)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6. 카드 → 같은 사상가 강화 조각 (등급이 높을수록 많이: 1·2·4·8). 카드는 소모되어 합성에 다시 못 씀
-- ---------------------------------------------------------------------
create or replace function public.game_card_to_shards(p_learner text, p_card uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_card game_user_cards;
  v_featured uuid;
  v_gain int;
  v_bank int;
begin
  perform game_lock_wallet(p_learner);
  select * into v_card from game_user_cards where id = p_card and learner = p_learner for update;
  if not found or v_card.status <> 'owned' then raise exception 'GAME_NOT_OWNED' using errcode = 'P0001'; end if;
  if v_card.locked then raise exception 'GAME_FUSION_LOCKED' using errcode = 'P0001'; end if;
  select featured_card_id into v_featured from game_profiles where learner = p_learner;
  if v_featured = p_card then raise exception 'GAME_FUSION_FEATURED' using errcode = 'P0001'; end if;
  v_gain := case v_card.rarity when 'common' then 1 when 'rare' then 2 when 'epic' then 4 else 8 end;
  update game_user_cards set status = 'consumed', consumed_reason = 'shards', consumed_at = now(), updated_at = now() where id = p_card;
  insert into game_collection (learner, philosopher_id, level, shards, copies) values (p_learner, v_card.philosopher_id, 1, v_gain, 1)
    on conflict (learner, philosopher_id) do update set shards = game_collection.shards + v_gain, updated_at = now()
    returning shards into v_bank;
  update game_profiles set deck_cards = array_remove(deck_cards, p_card), updated_at = now() where learner = p_learner and p_card = any (deck_cards);
  return jsonb_build_object('cardId', p_card, 'philosopherId', v_card.philosopher_id, 'shardsGained', v_gain, 'shards', v_bank);
end $$;

revoke all on function public.game_draw_card(text, text, date, boolean) from public, anon, authenticated;
revoke all on function public.game_level_up(text, uuid, text, date, int, int, int) from public, anon, authenticated;
revoke all on function public.game_fuse(text, uuid, uuid[], text, date) from public, anon, authenticated;
revoke all on function public.game_card_to_shards(text, uuid) from public, anon, authenticated;
grant execute on function public.game_draw_card(text, text, date, boolean) to service_role;
grant execute on function public.game_level_up(text, uuid, text, date, int, int, int) to service_role;
grant execute on function public.game_fuse(text, uuid, uuid[], text, date) to service_role;
grant execute on function public.game_card_to_shards(text, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 이전 검증 (실행 후 SQL Editor 에서 확인용)
--   select count(*) from game_collection;                                   -- 이전 대상 수
--   select count(*) from game_user_cards where source = 'legacy';          -- 위와 같아야 함
--   select count(*) from game_profiles where featured_philosopher_id is not null and featured_card_id is null;  -- 0 이어야 함
--
-- 되돌리기 (필요할 때만): 새 표·열만 지우면 008 상태로 돌아감 (기존 표·함수는 그대로라 008 코드가 동작)
--   drop function if exists public.game_draw_card(text, text, date, boolean), public.game_level_up(text, uuid, text, date, int, int, int),
--     public.game_fuse(text, uuid, uuid[], text, date), public.game_card_to_shards(text, uuid);
--   drop table if exists public.game_free_draws, public.game_user_cards;
--   alter table public.game_profiles drop column if exists featured_card_id, drop column if exists deck_cards;
--   (game_settings 의 새 열·game_cards 기본 능력치 정리는 남겨도 008 코드에 영향 없음)
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 010: 철학자 대난투 — 합성은 "같은 등급 · 같은 사상가" 카드끼리만 (supabase/migrations/010_fusion_same_philosopher.sql 과 동일)
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
