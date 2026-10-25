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
