import { existsSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";

// 홈 화면 아이콘: public/icons 에 실제 이미지가 있을 때만 연결 (없는 파일을 가리키지 않음).
// 필요한 파일과 규격은 docs/pwa-icons.md 참고.
const ICONS: { file: string; sizes: string; purpose?: "any" | "maskable" }[] = [
  { file: "icon-192.png", sizes: "192x192", purpose: "any" },
  { file: "icon-512.png", sizes: "512x512", purpose: "any" },
  { file: "icon-maskable-512.png", sizes: "512x512", purpose: "maskable" },
];

export default function manifest(): MetadataRoute.Manifest {
  const icons = ICONS.filter((i) => existsSync(path.join(process.cwd(), "public", "icons", i.file))).map((i) => ({
    src: `/icons/${i.file}`,
    sizes: i.sizes,
    type: "image/png",
    purpose: i.purpose,
  }));
  return {
    name: "ETHOS 에토스 — 도덕·윤리 학습 플랫폼",
    short_name: "ETHOS",
    description: "기출 분석 · 사상가 탐구 · 사상가 카드와 함께하는 매일의 윤리 학습",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7fb",
    theme_color: "#f6f7fb",
    categories: ["education"],
    icons,
  };
}
