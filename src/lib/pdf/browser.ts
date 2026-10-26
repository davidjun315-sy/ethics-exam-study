"use client";

/**
 * 브라우저 전용 PDF 처리: pdf.js 로 페이지 렌더링, 텍스트 추출, 문항 이미지 크롭.
 * pdf.js 는 용량이 크므로 필요한 순간에만 동적으로 import 한다.
 */
import type { Region } from "@/lib/types";

type PdfJs = typeof import("pdfjs-dist");
export type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // worker 는 postinstall 스크립트가 public/ 에 복사해 둔다.
      mod.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

export async function openPdf(data: ArrayBuffer | string): Promise<PdfDocument> {
  const pdfjs = await loadPdfJs();
  const source = typeof data === "string" ? { url: data } : { data: new Uint8Array(data.slice(0)) };
  return pdfjs.getDocument({
    ...source,
    // 한글 CID 폰트 텍스트 추출에 cMap 이 필요하다.
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
  }).promise;
}

export async function renderPageToCanvas(doc: PdfDocument, pageNumber: number, scale = 2): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context 를 만들 수 없습니다.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), type, quality),
  );
}

export type ImageSource = HTMLCanvasElement | HTMLImageElement;

function sourceSize(src: ImageSource): { w: number; h: number } {
  return src instanceof HTMLCanvasElement ? { w: src.width, h: src.height } : { w: src.naturalWidth, h: src.naturalHeight };
}

/**
 * 여러 영역(여러 단/페이지)을 세로로 이어 붙여 하나의 문항 이미지를 만든다.
 * getPage 는 페이지 번호에 해당하는 렌더링된 canvas 또는 페이지 이미지를 돌려준다.
 */
export async function cropRegions(
  regions: Region[],
  getPage: (page: number) => Promise<ImageSource> | ImageSource,
): Promise<HTMLCanvasElement> {
  const parts: { src: ImageSource; sx: number; sy: number; sw: number; sh: number }[] = [];
  for (const r of regions) {
    const src = await getPage(r.page);
    const { w, h } = sourceSize(src);
    const sx = Math.max(0, Math.floor(r.x0 * w));
    const sy = Math.max(0, Math.floor(r.y0 * h));
    const sw = Math.min(w - sx, Math.ceil((r.x1 - r.x0) * w));
    const sh = Math.min(h - sy, Math.ceil((r.y1 - r.y0) * h));
    if (sw > 2 && sh > 2) parts.push({ src, sx, sy, sw, sh });
  }
  if (parts.length === 0) throw new Error("잘라낼 문항 영역이 없습니다.");
  const width = Math.max(...parts.map((p) => p.sw));
  const gap = 12;
  const height = parts.reduce((s, p) => s + p.sh, 0) + gap * (parts.length - 1);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const p of parts) {
    ctx.drawImage(p.src, p.sx, p.sy, p.sw, p.sh, 0, y, p.sw, p.sh);
    y += p.sh;
    if (p !== parts[parts.length - 1]) {
      ctx.strokeStyle = "#cbd5e1";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y + gap / 2);
      ctx.lineTo(width, y + gap / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      y += gap;
    }
  }
  return out;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${url}`));
    img.src = url;
  });
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 0~1 정규화 좌표의 사각형 */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 페이지에 그려진 이미지들의 위치를 찾는다. (박스 제시문이 그림으로 들어간 PDF 감지용)
 * pdf.js operator list 를 따라가며 변환 행렬(CTM)을 추적한다.
 */
export async function findImageBoxes(doc: PdfDocument, pageNumber: number): Promise<Box[]> {
  const pdfjs = await loadPdfJs();
  const OPS = pdfjs.OPS;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const imageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintInlineImageXObjectGroup,
  ]);
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const boxes: Box[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as number[]);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0] as number[] | null;
      if (Array.isArray(m) && m.length === 6) ctm = mul(ctm, m);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (imageOps.has(fn)) {
      // 이미지는 단위 정사각형(0,0)-(1,1)에 그려진다.
      const m = mul(viewport.transform, ctm);
      const pts = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
      const xs = pts.map((p) => p[0] / viewport.width);
      const ys = pts.map((p) => p[1] / viewport.height);
      const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      // 아주 작은 아이콘 / 선은 무시
      if ((box.x1 - box.x0) * (box.y1 - box.y0) > 0.002) boxes.push(box);
    }
  }
  return boxes;
}

/** 영역 중 이미지가 덮고 있는 비율 (겹치는 이미지는 단순 합산 후 1 로 자름) */
export function imageCoverage(region: Box, images: Box[]): number {
  const area = (region.x1 - region.x0) * (region.y1 - region.y0);
  if (area <= 0) return 0;
  let covered = 0;
  for (const b of images) {
    const w = Math.min(region.x1, b.x1) - Math.max(region.x0, b.x0);
    const h = Math.min(region.y1, b.y1) - Math.max(region.y0, b.y0);
    if (w > 0 && h > 0) covered += w * h;
  }
  return Math.min(1, covered / area);
}
