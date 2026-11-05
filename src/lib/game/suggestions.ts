/**
 * 카드 준비용 제안 (관리자 화면에서 '제안 채우기'로만 쓰인다. 자동 공개되지 않음).
 * - 필살기·대사는 사상을 모티브로 한 게임용 창작 문구 (원문 인용이 아님)
 * - look: 일러스트 프롬프트용 외형 참고. basis 가 reconstruction 이면 카드에 '재구성' 표시
 * - living: 생존 인물 → 사실적 얼굴 대신 상징 중심 구성을 권장
 * 등급은 출제 빈도·유명도와 무관하게 게임 균형으로 정한 초기값이다 (전설 4 · 영웅 9 · 희귀·일반 다수, 전통별로 고루).
 */
import type { Rarity, SkillEffect } from "./rules.ts";

export interface CardSuggestion {
  rarity: Rarity;
  skill: string;
  effect: SkillEffect;
  skillDesc: string;
  quote: string;
  basis: "portrait" | "reconstruction";
  look: string;
  living?: boolean;
}

const S = (rarity: Rarity, skill: string, effect: SkillEffect, skillDesc: string, quote: string, basis: CardSuggestion["basis"], look: string, living = false): CardSuggestion => ({
  rarity, skill, effect, skillDesc, quote, basis, look, living,
});

export const SUGGESTIONS: Record<string, CardSuggestion> = {
  // 동양윤리
  공자: S("epic", "극기복례", "guard", "사욕을 이기고 예로 돌아가 아군을 지킨다", "배우고 때때로 익히니, 오늘의 복습도 즐겁지 않은가?", "reconstruction", "춘추시대 노나라 학자, 긴 수염, 유학자의 넓은 소매 도포와 관, 죽간과 서당 배경 (전통 도상 참고)"),
  맹자: S("rare", "측은지심", "heal", "차마 어쩌지 못하는 마음으로 아군을 치유한다", "우물가의 아이를 보면 누구라도 달려가지. 문제를 보면 너도 달려가라!", "reconstruction", "전국시대 유학자, 단정한 수염, 짙은 색 도포와 관, 왕도정치를 상징하는 궁정 배경 (전통 도상 참고)"),
  순자: S("common", "화성기위", "stun", "본성을 교정하는 예의 일격으로 상대를 멈춘다", "본성은 굽은 나무, 공부는 그걸 펴는 도지개다.", "reconstruction", "전국시대 학자, 엄격한 표정, 유학자 도포, 굽은 나무를 바로잡는 도지개 모티프"),
  노자: S("legendary", "무위자연", "guard", "다투지 않는 물처럼 아군 피해를 흘려보낸다", "애쓰지 않는 듯 꾸준히. 물처럼 스며드는 공부.", "reconstruction", "흰 수염의 노학자, 소박한 도복, 푸른 소를 탄 함곡관 전설 모티프, 안개 낀 산수 (전통 도상 참고)"),
  장자: S("legendary", "호접몽", "stun", "꿈과 현실의 경계를 흐려 상대의 다음 행동을 멈춘다", "공부하는 내가 꿈속의 나비일지도?", "reconstruction", "자유로운 은자의 복장, 헝클어진 머리, 나비 떼와 넓은 하늘 배경 (전통 도상 참고)"),
  묵자: S("common", "겸애교리", "sweep", "모두를 차별 없이(!) 공격한다", "차별 없는 사랑, 차별 없는 복습!", "reconstruction", "소박한 거친 옷의 장인풍 사상가, 수성 도구와 성벽 배경"),
  한비자: S("common", "법술세", "strike", "법과 술의 냉정한 일격", "규칙은 지키라고 있는 것. 오늘 미션도.", "reconstruction", "전국시대 법가 사상가, 단호한 표정, 죽간 법전과 궁정 배경"),
  주희: S("rare", "격물치지", "strike", "사물의 이치를 끝까지 궁구한 일격", "하나씩 따져 보면 이치가 보인다. 오늘도 격물!", "portrait", "남송 성리학자, 오사모와 학자 도포, 얼굴의 점이 표현된 전통 초상 참고, 서원과 책 배경"),
  왕수인: S("epic", "치양지", "heal", "마음의 양지를 일깨워 아군을 회복시킨다", "아는 것과 하는 것은 하나. 알았으면 지금 풀자.", "portrait", "명대 학자 관료, 관복 또는 학자 도포, 전통 초상 참고, 대나무 정원 배경"),
  석가모니: S("epic", "팔정도", "heal", "괴로움을 덜어 아군을 치유한다", "집착을 내려놓고, 틀린 문제는 붙잡아라.", "reconstruction", "고대 인도 수행자, 승복, 보리수 아래 명상 (불교 도상 참고, 신성 모독적 표현 금지)"),
  // 한국윤리
  이황: S("epic", "경(敬)의 수양", "guard", "경건한 마음가짐으로 아군 전체를 지킨다", "마음을 하나로 모으면 어려운 원문도 열린다.", "reconstruction", "조선 중기 유학자, 정자관과 학자 도포, 표준영정 도상 참고, 도산서원 배경"),
  이이: S("rare", "이통기국", "sweep", "이치는 통하고 기는 국한되니, 모두에게 닿는 일격", "변통 없이는 개혁도 없다. 공부 방법도 바꿔 보자.", "reconstruction", "조선 중기 유학자 관료, 사모관대 또는 도포, 표준영정 도상 참고, 서책과 소나무 배경"),
  정약용: S("rare", "목민심서", "heal", "백성을 돌보는 마음으로 아군을 회복시킨다", "실학은 실천! 오늘의 10문제부터.", "reconstruction", "조선 후기 실학자, 도포와 갓, 표준영정 참고, 거중기와 서책 배경"),
  원효: S("legendary", "화쟁", "guard", "다툼을 조화시켜 아군 피해를 줄인다", "모든 논쟁은 한 마음에서 화해한다. 오답도 내 편이다.", "reconstruction", "신라 승려, 승복과 바랑, 해골물 일화 모티프의 동굴과 달빛 배경"),
  지눌: S("common", "돈오점수", "heal", "단번에 깨닫고 꾸준히 닦아 회복한다", "깨달음은 한순간, 복습은 꾸준히.", "reconstruction", "고려 승려, 승복, 송광사 산사 배경"),
  // 서양윤리
  소크라테스: S("epic", "질문 폭탄", "stun", "끝없는 질문으로 상대를 멈춰 세운다", "오늘도 질문할 준비가 되었는가?", "portrait", "고대 아테네 철학자, 대머리와 넓은 코·짙은 수염 (조각상 참고), 히마티온, 아고라 배경"),
  플라톤: S("legendary", "이데아의 빛", "sweep", "동굴 밖 이데아의 빛이 적 전체를 비춘다", "그림자 말고 이데아를 보라. 해설 말고 원문을!", "portrait", "고대 그리스 철학자, 긴 수염 (흉상 참고), 히마티온, 동굴과 빛 배경"),
  아리스토텔레스: S("rare", "중용의 일격", "strike", "지나치지도 모자라지도 않은 정확한 일격", "탁월함은 습관이다. 매일 10문제처럼.", "portrait", "고대 그리스 철학자, 짧은 수염 (흉상 참고), 히마티온, 리케이온 회랑 배경"),
  에피쿠로스: S("common", "아타락시아", "heal", "마음의 평정으로 회복한다", "불안 없는 공부가 가장 큰 쾌락.", "portrait", "고대 그리스 철학자, 수염 (흉상 참고), 정원 배경"),
  아퀴나스: S("common", "자연법", "guard", "자연법의 질서로 아군을 지킨다", "이성과 신앙, 기출과 해설. 둘 다 챙기자.", "reconstruction", "13세기 도미니코회 수도사, 흑백 수도복, 중세 수도원 도서관 배경 (전통 도상 참고)"),
  홉스: S("rare", "리바이어던", "sweep", "만인에 대한 만인의 투쟁, 전체 공격", "자연 상태의 공부는 고독하고 짧다. 계약하라, 미션과!", "portrait", "17세기 영국 철학자, 흰 수염과 긴 머리 (초상화 참고), 리바이어던 표지 모티프"),
  로크: S("common", "자연권 수호", "guard", "생명·자유·재산을 지키는 수호막", "마음은 백지. 오늘 무엇을 채울까?", "portrait", "17세기 영국 철학자, 긴 머리 (초상화 참고), 백지와 깃펜 배경"),
  루소: S("rare", "일반의지", "heal", "공동체의 일반의지로 아군을 회복시킨다", "자연으로 돌아가라… 아니, 문제로 돌아가라.", "portrait", "18세기 제네바 출신 사상가, 털모자 또는 가발 (초상화 참고), 숲과 사회계약 문서"),
  흄: S("common", "감정의 노예", "stun", "이성은 감정의 노예, 상대를 흔들어 멈춘다", "습관이 지식을 만든다. 오늘도 습관처럼.", "portrait", "18세기 스코틀랜드 철학자, 가발과 둥근 얼굴 (초상화 참고), 에든버러 서재 배경"),
  칸트: S("epic", "정언명령", "strike", "보편 법칙이 되어 버린 일격", "오늘의 의무는 다했는가?", "portrait", "18세기 쾨니히스베르크 철학자, 단정한 가발과 프록코트 (초상화 참고), 별이 빛나는 하늘 배경"),
  벤담: S("common", "쾌락 계산법", "sweep", "최대 다수에게 최대 피해", "최대 다수의 최대 정답!", "portrait", "18~19세기 영국 철학자, 흰 머리와 모자 (초상화 참고), 파놉티콘 설계도 배경"),
  밀: S("rare", "질적 공리", "heal", "높은 질의 쾌락으로 아군을 회복시킨다", "배부른 돼지보다 배고픈 수험생이 낫다.", "portrait", "19세기 영국 철학자, 넓은 이마와 검은 정장 (초상화 참고), 의회와 서재 배경"),
  헤겔: S("rare", "변증법", "sweep", "정·반·합의 세 갈래 공격", "틀림(반)이 있어야 정답(합)도 있다.", "portrait", "19세기 독일 철학자, 망토 차림 (초상화 참고), 역사의 흐름을 상징하는 배경"),
  마르크스: S("rare", "계급투쟁", "sweep", "모든 적에게 혁명적 피해", "공부하는 자들이여, 단결하라!", "portrait", "19세기 독일 사상가, 덥수룩한 수염 (사진 기반 초상 참고, 사진 그대로 사용 금지), 공장과 자본론 배경"),
  니체: S("epic", "초인", "strike", "스스로를 넘어서는 일격", "나를 죽이지 못하는 문제는 나를 더 강하게 한다.", "portrait", "19세기 독일 철학자, 굵은 콧수염 (초상 참고), 알프스 산정 배경"),
  키르케고르: S("common", "신앙의 도약", "stun", "실존의 도약으로 상대를 멈춘다", "불안은 자유의 현기증. 그래도 한 문제 더!", "portrait", "19세기 덴마크 철학자, 높은 머리 (초상 참고), 코펜하겐 거리 배경"),
  사르트르: S("rare", "실존은 본질에 앞선다", "strike", "스스로 만든 본질로 일격", "합격은 주어지지 않는다. 내가 선택한다.", "portrait", "20세기 프랑스 철학자, 둥근 안경 (사진 기반 초상 참고, 사진 그대로 사용 금지), 파리 카페 배경"),
  데카르트: S("epic", "방법적 회의", "stun", "모든 것을 의심해 상대를 멈춘다", "나는 공부한다. 고로 성장한다.", "portrait", "17세기 프랑스 철학자, 긴 머리와 콧수염 (할스 초상 참고), 좌표와 촛불 배경"),
  스피노자: S("rare", "신 즉 자연", "guard", "영원의 관점에서 아군을 지킨다", "기출을 영원의 관점에서 보라.", "portrait", "17세기 네덜란드 철학자, 긴 곱슬머리 (초상 참고), 렌즈 연마 도구 배경"),
  // 사회사상 · 현대
  롤스: S("epic", "무지의 베일", "guard", "베일 뒤에서 모두를 공정하게 지킨다", "내가 어떤 수험생일지 모른다면? 그래서 모두 복습하자.", "portrait", "20세기 미국 철학자, 단정한 정장 (사진 기반 초상 참고, 사진 그대로 사용 금지), 저울과 베일 배경"),
  노직: S("common", "최소 국가", "strike", "간섭 없는 자유의 일격", "내 공부 시간은 내 것이다.", "portrait", "20세기 미국 철학자, 곱슬머리 (사진 기반 초상 참고, 사진 그대로 사용 금지), 경험 기계 모티프"),
  싱어: S("rare", "평등한 고려", "heal", "모든 존재의 고통을 고려해 회복시킨다", "고통받는 모든 존재를 고려하라. 오답 노트도.", "portrait", "현대 철학자 (생존 인물: 사실적 얼굴 대신 실루엣·상징 중심), 동물과 지구 모티프", true),
  샌델: S("common", "공동선", "guard", "공동체의 연대로 아군을 지킨다", "정의란 무엇인가? 일단 오늘 미션부터.", "portrait", "현대 정치철학자 (생존 인물: 사실적 얼굴 대신 실루엣·상징 중심), 강의실과 공동체 모티프", true),
  하버마스: S("rare", "의사소통적 합리성", "stun", "이상적 담화로 상대를 설득해 멈춘다", "더 나은 논증의 강제 없는 강제!", "portrait", "현대 독일 철학자 (생존 인물: 사실적 얼굴 대신 실루엣·상징 중심), 공론장 모티프", true),
  누스바움: S("common", "역량 접근", "heal", "핵심 역량을 회복시킨다", "할 수 있는 것이 곧 자유다.", "portrait", "현대 철학자 (생존 인물: 사실적 얼굴 대신 실루엣·상징 중심), 꽃과 인간 역량 모티프", true),
  아렌트: S("epic", "악의 평범성", "stun", "생각 없음을 꿰뚫어 상대를 멈춘다", "생각하라. 생각 없는 정답은 위험하다.", "portrait", "20세기 정치사상가, 단발과 지적인 표정 (사진 기반 초상 참고, 사진 그대로 사용 금지), 공적 영역 모티프"),
  // 도덕교육론
  콜버그: S("rare", "도덕 발달 6단계", "stun", "단계를 뛰어넘는 딜레마로 상대를 멈춘다", "하인츠는 약을 훔쳐야 할까? 일단 문제부터 풀자.", "portrait", "20세기 미국 심리학자, 안경과 정장 (사진 기반 초상 참고, 사진 그대로 사용 금지), 계단 모티프"),
  피아제: S("common", "인지 발달", "heal", "동화와 조절로 회복한다", "틀림은 조절의 기회다.", "portrait", "20세기 스위스 심리학자, 베레모를 쓴 노학자 (사진 기반 초상 참고, 사진 그대로 사용 금지), 아이들 놀이 모티프"),
  길리건: S("common", "배려의 목소리", "heal", "배려의 윤리로 아군을 치유한다", "다른 목소리에도 귀 기울이자.", "portrait", "현대 심리학자 (생존 인물: 사실적 얼굴 대신 실루엣·상징 중심), 대화하는 사람들 모티프", true),
  나딩스: S("common", "배려 관계", "guard", "배려하는 관계로 아군을 지킨다", "배려는 관계에서 완성된다.", "portrait", "현대 교육철학자, 따뜻한 표정 (사진 기반 초상 참고, 사진 그대로 사용 금지), 교실 모티프"),
  뒤르켐: S("common", "사회적 사실", "sweep", "사회의 힘으로 전체 공격", "규율·애착·자율, 공부의 세 요소!", "portrait", "19~20세기 프랑스 사회학자, 수염 (사진 기반 초상 참고, 사진 그대로 사용 금지), 사회 연대 모티프"),
  레스트: S("common", "4구성 요소", "strike", "민감성·판단·동기·품성의 일격", "알고, 판단하고, 원하고, 해내라.", "portrait", "20세기 미국 심리학자, 정장 (사진 기반 초상 참고, 사진 그대로 사용 금지), 네 개의 원 모티프"),
  리코나: S("common", "인격 교육", "heal", "알고 바라고 행하는 인격으로 회복", "좋은 인격은 좋은 습관에서.", "portrait", "현대 교육학자 (생존 인물: 사실적 얼굴 대신 실루엣·상징 중심), 교실 모티프", true),
  듀이: S("rare", "경험의 재구성", "heal", "경험을 재구성해 회복한다", "해 보면서 배운다. 문제를 풀어 보면서!", "portrait", "20세기 미국 철학자, 콧수염과 안경 (사진 기반 초상 참고, 사진 그대로 사용 금지), 실험 학교 모티프"),
};

const TRADITION_FALLBACK: Record<string, Omit<CardSuggestion, "look" | "basis">> = {
  동양윤리: { rarity: "common", skill: "수양의 기운", effect: "heal", skillDesc: "마음을 닦아 아군을 회복시킨다", quote: "수양도 공부도 하루하루." },
  한국윤리: { rarity: "common", skill: "경(敬)의 마음", effect: "guard", skillDesc: "경건한 마음으로 아군을 지킨다", quote: "마음을 바르게, 답안도 바르게." },
  서양윤리: { rarity: "common", skill: "논증의 일격", effect: "strike", skillDesc: "타당한 논증으로 강하게 공격한다", quote: "전제가 참이면 결론도 참. 공부하면 합격도?" },
  사회사상: { rarity: "common", skill: "정의의 저울", effect: "guard", skillDesc: "공정한 질서로 아군을 지킨다", quote: "공정한 공부, 공정한 결과." },
  도덕교육론: { rarity: "common", skill: "발달 단계", effect: "stun", skillDesc: "한 단계 높은 사고로 상대를 멈춘다", quote: "한 단계씩 올라가자." },
};

const norm = (s: string) => s.replace(/\s+/g, "");

/** 이름(또는 별칭)으로 제안 찾기. 없으면 분류별 기본값 */
export function suggestFor(name: string, aliases: string[], tradition: string): CardSuggestion {
  for (const n of [name, ...aliases]) {
    const hit = SUGGESTIONS[norm(n)];
    if (hit) return hit;
  }
  const f = TRADITION_FALLBACK[tradition] ?? TRADITION_FALLBACK["서양윤리"];
  return { ...f, basis: "reconstruction", look: "시대·지역에 맞는 학자 복식, 사상을 상징하는 배경 (확인된 초상이 없으면 재구성)" };
}

/** 카드 일러스트 프롬프트 (모든 카드 같은 화풍·비율) */
export function artPrompt(p: { name: string; originalName: string | null; era: string | null; tradition: string; look: string; living?: boolean }): string {
  return [
    `Premium collectible trading-card character illustration of the philosopher ${p.originalName ? `${p.originalName} (${p.name})` : p.name}.`,
    `Appearance & setting reference: ${p.look}${p.era ? ` · era: ${p.era}` : ""}.`,
    p.living
      ? "This is a living person: do NOT depict a realistic likeness of the face; use a stylized silhouette / three-quarter back view or symbolic composition instead."
      : "Respect historically recorded likeness (portraits / busts / traditional iconography). Dignified and serious, not a caricature, not comedic.",
    "Style: unified high-end 2D digital painting, realistic human proportions, refined painterly rendering, cinematic rim light, rich but harmonious colors.",
    "Composition: vertical 3:4, half-body (chest-up) portrait centered, face and costume details sharp, symbolic background elements of their philosophy softly blurred, leave the bottom 25% calmer (card text overlays there).",
    "No text, no letters, no logos, no frame, no watermark, no photo, no modern objects unless historically appropriate.",
    "Output: 1200x1600 px.",
  ].join("\n");
}
