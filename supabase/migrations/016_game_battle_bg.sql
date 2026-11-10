-- 016: 철학자 대난투 — 도장깨기 전장 배경 (분야별 그림)
-- 추가만 합니다: game_settings 에 열 1개. 기존 설정은 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
--
--   game_settings.battle_bg : { "동양윤리": "<그림 주소>", "한국윤리": …, "서양윤리": …, "사회사상": … }
--                             비어 있는 분야는 코드로 그린 기본 배경이 나옵니다.

alter table public.game_settings add column if not exists battle_bg jsonb not null default '{}'::jsonb;

-- 확인
--   select battle_bg from game_settings;   -- {}
-- 되돌리기
--   alter table public.game_settings drop column if exists battle_bg;
