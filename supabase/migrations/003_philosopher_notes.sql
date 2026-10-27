-- =====================================================================
-- 003: 사상가 개념 정리 노트
-- 기출 AI 분석을 채팅 AI 로 재구성한 "개념 정리"를 사상가별로 저장한다.
-- 이미 schema.sql 을 실행한 DB 에서는 이 파일만 SQL Editor 에서 실행하면 됩니다.
-- (여러 번 실행해도 안전합니다)
-- =====================================================================

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
