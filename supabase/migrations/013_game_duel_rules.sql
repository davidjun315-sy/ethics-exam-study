-- 013: 철학자 대난투 — 논쟁 대전 관리자 조정값
-- 추가만 합니다: game_settings 에 열 1개. 기존 값·카드·전적·대전 기록은 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
-- 설계: docs/game-duel-design.md
--
--   game_settings.duel_rules : 논자 신념 · 최대 사유력 · 필드/손패/덱 크기 · 제한 턴 · 능력치 변환 계수 · 등급별 비용/보정
--                              비어 있는 값은 코드의 기본값을 씁니다. 이미 시작한 대전은 시작할 때의 규칙으로 끝까지 진행합니다.

alter table public.game_settings add column if not exists duel_rules jsonb not null default '{}'::jsonb;

-- 확인
--   select duel_rules from game_settings;   -- {} (기본값 사용)
-- 되돌리기
--   alter table public.game_settings drop column if exists duel_rules;
