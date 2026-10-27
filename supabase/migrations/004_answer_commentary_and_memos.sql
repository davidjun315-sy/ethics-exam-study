-- =====================================================================
-- 004: 원전 해설 + 내 메모 (모든 기기에서 보기)
-- 이미 schema.sql 을 실행한 DB 에서는 이 파일만 SQL Editor 에서 실행하면 됩니다.
-- (여러 번 실행해도 안전합니다)
-- =====================================================================

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
