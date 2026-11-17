/**
 * 꾸미기 이미지 칸 (순수 · 관리자 화면과 사용자 화면 공통).
 * 관리자가 ChatGPT 로 그린 그림을 칸마다 올리면 그 자리에 쓰이고, 비어 있으면 기본(그라데이션) 그림이 나온다.
 * 그림은 game_settings.art (027) 에 칸 이름 → 주소로 저장.
 */
export type ArtSlotKey = "tower-lobby" | "tower-t1" | "tower-t2" | "tower-t3" | "tower-t4" | "tower-boss" | "tower-result" | "home-hero" | "attend-header";

export interface ArtSlot {
  key: ArtSlotKey;
  label: string;
  /** 어디에 나오나 */
  where: string;
  group: "사상의 탑" | "메인 · 출석";
  /** 가로:세로 (미리보기 · 안내) */
  ratio: "16:9" | "21:9" | "3:1";
  /** 올릴 때 줄이는 가장 긴 변 */
  maxSide: number;
  /** 기본 그림 (CSS 배경) */
  fallback: string;
  /** ChatGPT 이미지 요청문 */
  prompt: string;
}

const STYLE =
  "rich painterly cel-shaded 2D fantasy illustration matching a cute chibi mobile game, soft volumetric light, elegant muted palette, high detail but calm composition, no characters, no people, no text, no letters, no UI, no watermark";

export const ART_SLOTS: ArtSlot[] = [
  {
    key: "tower-lobby",
    label: "탑 입구 (대표 그림)",
    where: "게임 › 배틀 아레나 › 사상의 탑 첫 화면 위쪽",
    group: "사상의 탑",
    ratio: "21:9",
    maxSide: 2400,
    fallback: "linear-gradient(180deg,#1b2140 0%,#2d3566 45%,#8a7bb0 78%,#e8c79a 100%)",
    prompt: `Ultra-wide 21:9 banner: a colossal ancient tower of philosophy rising into the clouds at twilight, built from stacked marble libraries, Greek columns, East Asian pagoda roofs and Korean hanok eaves blended together, glowing windows, floating scrolls and open books orbiting the spire, a long stone stairway leading to its gate in the foreground, stars appearing in a violet-gold sky. Tower slightly right of center, empty calm sky on the left for a title. ${STYLE}.`,
  },
  {
    key: "tower-t1",
    label: "1~10층 · 기초의 회랑",
    where: "사상의 탑 1~10층 문제 화면 배경",
    group: "사상의 탑",
    ratio: "16:9",
    maxSide: 1920,
    fallback: "linear-gradient(180deg,#d9e4f5 0%,#b7c8e6 55%,#8d9bbf 100%)",
    prompt: `Wide 16:9 background: the inside of a bright ground-floor hall of an ancient philosophy tower, long corridor of warm stone arches and tall bookshelves, morning sunlight through high windows, dust motes, potted olive trees and a few scrolls on lecterns, gentle and welcoming mood, slightly blurred depth so text can sit on top. ${STYLE}.`,
  },
  {
    key: "tower-t2",
    label: "11~20층 · 논증의 계단",
    where: "사상의 탑 11~20층 문제 화면 배경",
    group: "사상의 탑",
    ratio: "16:9",
    maxSide: 1920,
    fallback: "linear-gradient(180deg,#e9dcc4 0%,#c9a77a 55%,#7c5b3a 100%)",
    prompt: `Wide 16:9 background: a grand spiral staircase climbing through the middle of a philosophy tower, carved marble balustrades, hanging brass lanterns, chalkboards with faint diagrams, warm amber afternoon light, a sense of ascending and reasoning step by step, slightly blurred depth so text can sit on top. ${STYLE}.`,
  },
  {
    key: "tower-t3",
    label: "21~30층 · 비판의 첨탑",
    where: "사상의 탑 21~30층 문제 화면 배경",
    group: "사상의 탑",
    ratio: "16:9",
    maxSide: 1920,
    fallback: "linear-gradient(180deg,#2a2f55 0%,#4a3f78 55%,#7a5a8c 100%)",
    prompt: `Wide 16:9 background: a high open-air spire chamber of a philosophy tower above the clouds at dusk, gothic and East Asian architecture mixed, wind-blown banners, stormy purple sky with distant lightning, floating stone platforms, tense but beautiful mood, slightly blurred depth so text can sit on top. ${STYLE}.`,
  },
  {
    key: "tower-t4",
    label: "31층~ · 성찰의 정상",
    where: "사상의 탑 31층 이상 문제 화면 배경",
    group: "사상의 탑",
    ratio: "16:9",
    maxSide: 1920,
    fallback: "linear-gradient(180deg,#0d1028 0%,#1d2150 50%,#3b2f6b 80%,#c9a86a 100%)",
    prompt: `Wide 16:9 background: the summit of a philosophy tower above the sky at night, a quiet circular observatory platform open to a vast starfield and aurora, a golden armillary sphere and ancient star maps, serene and awe-inspiring, deep navy and gold palette, slightly blurred depth so text can sit on top. ${STYLE}.`,
  },
  {
    key: "tower-boss",
    label: "보스층 (10층마다)",
    where: "사상의 탑 10 · 20 · 30 …층 문제 화면 배경",
    group: "사상의 탑",
    ratio: "16:9",
    maxSide: 1920,
    fallback: "linear-gradient(180deg,#2b0f1d 0%,#5a1830 50%,#b0563a 100%)",
    prompt: `Wide 16:9 background: a dramatic throne-like debate hall at the top of a tower floor, huge circular stained-glass window glowing crimson and gold behind an empty stone podium, rows of ancient books, embers and light rays, epic boss-battle atmosphere, slightly blurred depth so text can sit on top. ${STYLE}.`,
  },
  {
    key: "tower-result",
    label: "도전 결과",
    where: "사상의 탑 도전이 끝났을 때 결과 화면 위쪽",
    group: "사상의 탑",
    ratio: "3:1",
    maxSide: 1800,
    fallback: "linear-gradient(120deg,#2d3566 0%,#6a5aa8 50%,#e8c79a 100%)",
    prompt: `Wide 3:1 banner: view from a balcony of a tall philosophy tower looking out over a sea of clouds at sunrise, golden light, a few birds, a feeling of accomplishment and reflection, empty center area for text. ${STYLE}.`,
  },
  {
    key: "home-hero",
    label: "메인 인사 배너",
    where: "메인 화면 맨 위 인사 상자의 배경 (글자가 위에 올라가므로 밝고 은은하게)",
    group: "메인 · 출석",
    ratio: "3:1",
    maxSide: 2400,
    fallback: "linear-gradient(135deg,#eef2fc 0%,#f7f4fb 55%,#fbf7ef 100%)",
    prompt: `Wide 3:1 banner, very light and airy: a soft pastel watercolor scene of a quiet library terrace at morning, faint marble columns, an open book and a cup of tea on the right side, sheer curtains and gentle light, very low contrast with lots of empty pale space on the left two thirds for overlaid text, ivory and pale navy tones. ${STYLE}.`,
  },
  {
    key: "attend-header",
    label: "출석 팝업 머리 그림",
    where: "하루 한 번 뜨는 출석 팝업 위쪽",
    group: "메인 · 출석",
    ratio: "3:1",
    maxSide: 1600,
    fallback: "radial-gradient(closest-side,rgba(255,211,107,.35),transparent)",
    prompt: `Wide 3:1 banner: a cozy scholar's desk seen from above with a calendar page, a red traditional seal stamp and ink pad, a brush, an hourglass and warm morning light, soft and cheerful, light background, low contrast so a title can sit on top. ${STYLE}.`,
  },
];

export const ART_SLOT_KEYS = ART_SLOTS.map((s) => s.key) as [ArtSlotKey, ...ArtSlotKey[]];
export const slotOf = (k: ArtSlotKey) => ART_SLOTS.find((s) => s.key === k)!;

/** 저장된 값 정리 (모르는 칸 · 주소가 아닌 값은 버림) */
export function cleanArt(v: unknown): Partial<Record<ArtSlotKey, string>> {
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, u]) => (ART_SLOT_KEYS as string[]).includes(k) && typeof u === "string" && /^https?:\/\//.test(u))) as Partial<Record<ArtSlotKey, string>>;
}

/** 탑 층 배경 칸 */
export const towerSlotFor = (floor: number): ArtSlotKey => (floor % 10 === 0 ? "tower-boss" : floor <= 10 ? "tower-t1" : floor <= 20 ? "tower-t2" : floor <= 30 ? "tower-t3" : "tower-t4");
