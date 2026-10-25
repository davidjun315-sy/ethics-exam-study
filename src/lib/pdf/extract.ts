/**
 * pdf.js 페이지에서 텍스트 조각과 좌표를 추출한다. (브라우저 / Node 공용)
 * 좌표는 scale=1 viewport 기준(좌상단 원점, PDF point 단위)으로 변환한다.
 */
import type { PageText, TextItem } from "./segment.ts";

type Matrix = number[];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

// pdf.js 타입에 의존하지 않도록 필요한 부분만 정의
export interface PdfPageLike {
  pageNumber: number;
  getViewport(opts: { scale: number }): { width: number; height: number; transform: number[] };
  getTextContent(): Promise<{ items: unknown[] }>;
}

interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(v: unknown): v is RawTextItem {
  return typeof v === "object" && v !== null && "str" in v && "transform" in v;
}

export async function extractPageText(page: PdfPageLike): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const raw of content.items) {
    if (!isTextItem(raw) || !raw.str || !raw.str.trim()) continue;
    const tx = multiply(viewport.transform, raw.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || raw.height || 10;
    const width = raw.width * Math.hypot(viewport.transform[0], viewport.transform[1]);
    items.push({ str: raw.str, x: tx[4], y: tx[5] - fontHeight, w: width, h: fontHeight });
  }
  return { pageNumber: page.pageNumber, width: viewport.width, height: viewport.height, items };
}
