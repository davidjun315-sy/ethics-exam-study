-- 015: 철학자 대난투 — 전투 캐릭터 그림 (도장깨기 전장에 서는 전신 캐릭터)
-- 추가만 합니다: game_cards 에 열 1개. 기존 카드·일러스트·보유는 바꾸지 않습니다. 여러 번 실행해도 안전합니다.
--
--   game_cards.battle_art_url : 투명 배경 전신 캐릭터 (오른쪽을 보는 그림). 없으면 전장에서 카드 일러스트 초상으로 나옴

alter table public.game_cards add column if not exists battle_art_url text;

-- 확인
--   select count(battle_art_url) from game_cards;   -- 0
-- 되돌리기
--   alter table public.game_cards drop column if exists battle_art_url;
