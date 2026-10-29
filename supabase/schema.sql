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
