-- 023: 윤리 퀴즈 '완전 기출' (문항 전체를 한 문제로) + 실전만 안에서 부분 기출 / 완전 기출 고르기
-- 추가만 합니다: 허용 값 1개 + 열 1개. 기존 문제 · 학습 기록은 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 실행한 뒤 관리자 화면 → 윤리 퀴즈 문제은행에서 '동기화'를 한 번 누르면 완전 기출 문제가 만들어집니다.
--
--   quiz_items.origin 'full'   : 기출 문항 전체를 한 문제로 (kind 는 그대로 'exam', 서술형 · 스스로 채점)
--   quiz_profiles.real_unit    : 학습 단계가 '실전만'일 때 'part'(부분 기출, 기본 · 예전 방식) / 'full'(완전 기출)

alter table public.quiz_items drop constraint if exists quiz_items_origin_check;
alter table public.quiz_items add constraint quiz_items_origin_check check (origin in ('analysis', 'practice', 'manual', 'full'));

alter table public.quiz_profiles add column if not exists real_unit text not null default 'part';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quiz_profiles_real_unit_check') then
    alter table public.quiz_profiles add constraint quiz_profiles_real_unit_check check (real_unit in ('part', 'full'));
  end if;
end $$;

notify pgrst, 'reload schema';

-- 확인:
--   select origin, status, count(*) from quiz_items group by 1, 2;   -- 동기화 뒤 origin 'full' 이 생김
--   select real_unit, count(*) from quiz_profiles group by 1;          -- 모두 part
-- 되돌리기 (완전 기출 문제를 먼저 숨김):
--   update quiz_items set status = 'hidden' where origin = 'full';
--   alter table quiz_profiles drop column real_unit;
