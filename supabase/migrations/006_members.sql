-- =====================================================================
-- 006: 회원 (윤리 퀴즈를 각자 계정으로)
-- 아이디 + 비밀번호(scrypt 해시)만 저장한다. 이메일 등 개인정보는 받지 않는다.
-- 공개 읽기 정책이 없어 서버(service role)만 읽고 쓴다. 여러 번 실행해도 안전하다.
-- =====================================================================

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
