-- =====================================================================
-- 005: 윤리 퀴즈 (문제은행 · 학습 기록 · 일일 미션)
-- 기존 테이블은 건드리지 않고 새 테이블만 만든다. 여러 번 실행해도 안전하다.
-- 모든 퀴즈 테이블은 공개 읽기 정책이 없다 → 서버(service role)만 읽고 쓴다.
-- =====================================================================

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
