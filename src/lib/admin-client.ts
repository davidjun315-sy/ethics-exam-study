"use client";

/**
 * 관리자 화면(브라우저)에서 쓰는 헬퍼.
 * PDF 렌더링 / 텍스트 추출 / 문항 분리 / 이미지 크롭은 브라우저에서 수행하고,
 * 결과만 서버 API 로 보낸다. (서버리스 환경에서 canvas 의존성을 피하고 비용을 줄이기 위함)
 */
import { getBrowserClient } from "@/lib/supabase/browser";
import { canvasToBlob, cropRegions, findImageBoxes, imageCoverage, loadImage, openPdf, renderPageToCanvas, type Box, type ImageSource } from "@/lib/pdf/browser";
import { extractPageText, type PdfPageLike } from "@/lib/pdf/extract";
import { groupLines, segmentQuestions, type PageText, type SegmentationResult } from "@/lib/pdf/segment";
import type { Region } from "@/lib/types";

export async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((json as { error?: string }).error ?? `요청 실패 (${res.status})`) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json as T;
}

/** 이미지들을 signed URL 로 Supabase Storage(question-images)에 업로드하고 public URL 을 돌려준다. */
export async function uploadImages(items: { path: string; blob: Blob }[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const supabase = getBrowserClient();
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    const { uploads } = await api<{ uploads: { path: string; token: string; publicUrl: string }[] }>(
      "/api/admin/storage/sign",
      "POST",
      { paths: chunk.map((c) => c.path) },
    );
    await Promise.all(
      uploads.map(async (u, j) => {
        const { error } = await supabase.storage
          .from("question-images")
          .uploadToSignedUrl(u.path, u.token, chunk[j].blob, { contentType: chunk[j].blob.type, upsert: true });
        if (error) throw new Error(`이미지 업로드 실패 (${u.path}): ${error.message}`);
        // CDN 캐시를 피하기 위해 버전 파라미터를 붙인다.
        result.set(u.path, `${u.publicUrl}?v=${Date.now()}`);
      }),
    );
  }
  return result;
}

export async function uploadPdf(path: string, token: string, file: Blob) {
  const { error } = await getBrowserClient()
    .storage.from("exam-pdfs")
    .uploadToSignedUrl(path, token, file, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`PDF 업로드 실패: ${error.message}`);
}

export interface ProcessProgress {
  step: string;
  done: number;
  total: number;
}

const RENDER_SCALE = 1.75;

/**
 * PDF 페이지 분석 전체 파이프라인.
 * 렌더링 → 페이지 이미지 → 텍스트 레이어 → 레이아웃 분석 → 문항 번호 탐지 → 영역 분리 → 문항 이미지 → 저장
 */
export async function processExamPdf(
  examId: string,
  source: ArrayBuffer | string,
  onProgress: (p: ProcessProgress) => void,
): Promise<SegmentationResult & { saved: number }> {
  onProgress({ step: "PDF 여는 중", done: 0, total: 1 });
  const doc = await openPdf(source);
  const total = doc.numPages;
  const canvases = new Map<number, HTMLCanvasElement>();
  const texts: PageText[] = [];

  for (let n = 1; n <= total; n++) {
    onProgress({ step: `페이지 렌더링 / 텍스트 추출 (${n}/${total})`, done: n - 1, total });
    const page = await doc.getPage(n);
    const pt = await extractPageText(page as unknown as PdfPageLike);
    const imgs = await findImageBoxes(doc, n).catch(() => []);
    pt.images = imgs.map((b) => ({ x: b.x0 * pt.width, y: b.y0 * pt.height, w: (b.x1 - b.x0) * pt.width, h: (b.y1 - b.y0) * pt.height }));
    texts.push(pt);
    canvases.set(n, await renderPageToCanvas(doc, n, RENDER_SCALE));
  }

  onProgress({ step: "레이아웃 분석 / 문항 분리", done: total, total });
  const seg = segmentQuestions(texts);

  // 페이지 이미지 + 문항 이미지 생성
  const stamp = Date.now().toString(36);
  const pageBlobs: { path: string; blob: Blob; n: number }[] = [];
  for (const [n, c] of canvases) {
    pageBlobs.push({ path: `${examId}/pages/p${n}.jpg`, blob: await canvasToBlob(c, "image/jpeg", 0.85), n });
  }
  const questionBlobs: { path: string; blob: Blob; i: number }[] = [];
  for (let i = 0; i < seg.questions.length; i++) {
    onProgress({ step: `문항 이미지 생성 (${i + 1}/${seg.questions.length})`, done: i, total: seg.questions.length });
    const q = seg.questions[i];
    if (q.regions.length === 0) continue;
    const canvas = await cropRegions(q.regions, (p) => canvases.get(p)!);
    questionBlobs.push({ path: `${examId}/questions/q${q.questionNumber}-${stamp}.jpg`, blob: await canvasToBlob(canvas, "image/jpeg", 0.9), i });
  }

  onProgress({ step: "이미지 업로드", done: 0, total: pageBlobs.length + questionBlobs.length });
  const urls = await uploadImages([...pageBlobs, ...questionBlobs]);

  onProgress({ step: "문항 저장", done: 0, total: 1 });
  const res = await api<{ questions: { id: string }[] }>(`/api/admin/exams/${examId}/segmentation`, "POST", {
    replace: true,
    pages: seg.pages.map((p) => ({
      page_number: p.pageNumber,
      image_url: urls.get(`${examId}/pages/p${p.pageNumber}.jpg`) ?? null,
      width: texts[p.pageNumber - 1]?.width ?? null,
      height: texts[p.pageNumber - 1]?.height ?? null,
      text_content: p.text.slice(0, 100000),
      has_text_layer: p.hasTextLayer,
    })),
    questions: seg.questions.map((q, i) => {
      const qb = questionBlobs.find((b) => b.i === i);
      return {
        question_number: q.questionNumber,
        label: q.label,
        page_start: q.pageStart,
        page_end: q.pageEnd,
        regions: q.regions,
        question_text: q.text || null,
        question_image_url: qb ? (urls.get(qb.path) ?? null) : null,
        score: q.score,
        question_type: q.questionType,
        needs_review: q.needsReview,
      };
    }),
  });
  canvases.clear();
  return { ...seg, saved: res.questions.length };
}

/** 저장된 페이지 이미지로부터 문항 이미지를 다시 잘라 업로드한다. (영역 수정 / 합치기 / 나누기 후) */
export async function recropQuestion(
  examId: string,
  questionNumber: number,
  regions: Region[],
  pageImages: Record<number, string>,
): Promise<string> {
  const cache = new Map<number, ImageSource>();
  const canvas = await cropRegions(regions, async (p) => {
    if (!cache.has(p)) {
      const url = pageImages[p];
      if (!url) throw new Error(`${p}페이지 이미지가 없습니다. 페이지 분석을 먼저 실행하세요.`);
      cache.set(p, await loadImage(url));
    }
    return cache.get(p)!;
  });
  const path = `${examId}/questions/q${questionNumber}-${Date.now().toString(36)}.jpg`;
  const urls = await uploadImages([{ path, blob: await canvasToBlob(canvas, "image/jpeg", 0.9) }]);
  return urls.get(path)!;
}

/**
 * PDF 텍스트 레이어에서 영역 안에 있는 글자만 다시 뽑는다. (영역 수정 / 나누기 후 원문 텍스트 갱신)
 * 텍스트 레이어가 없는 스캔 페이지는 빈 문자열을 돌려준다.
 */
export interface RegionTextResult {
  text: string;
  /** 영역 중 이미지(그림으로 들어간 글)가 차지하는 최대 비율 0~1 */
  imageRatio: number;
  /** 최종 텍스트를 어디서 얻었는지 */
  method: "text" | "ocr";
}

export interface ExtractOptions {
  /** auto: 그림이 많거나 글자가 거의 없을 때만 OCR / always: 항상 OCR / never: 텍스트 레이어만 */
  ocr?: "auto" | "always" | "never";
  onProgress?: (message: string) => void;
}

const OCR_SCALE = 3; // 약 216 dpi. OCR 정확도를 위해 화면용보다 크게 렌더링한다.

export async function extractRegionsText(pdfUrl: string, regions: Region[]): Promise<string> {
  return (await extractRegionsTextDetailed(pdfUrl, regions, { ocr: "never" })).text;
}

export async function extractRegionsTextDetailed(
  pdfUrl: string,
  regions: Region[],
  options: ExtractOptions = {},
): Promise<RegionTextResult> {
  const mode = options.ocr ?? "auto";
  let doc;
  try {
    // URL 을 pdf.js 에 바로 넘기면 일부 환경에서 range 요청이 실패하므로 먼저 통째로 받아온다.
    const res = await fetch(pdfUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    doc = await openPdf(await res.arrayBuffer());
  } catch (e) {
    throw new Error(`원본 PDF 를 불러오지 못했습니다 (${e instanceof Error ? e.message : String(e)}). Supabase Storage 의 exam-pdfs 버킷이 public 인지 확인하세요.`);
  }
  const cache = new Map<number, PageText>();
  const imageCache = new Map<number, Box[]>();
  // 읽기 순서대로 합치기 위한 조각: 텍스트 레이어의 줄 + 그림 부분의 OCR 결과
  type Piece = { region: number; y: number; text: string };
  const pieces: Piece[] = [];
  const ocrTargets: { region: number; page: number; box: Box }[] = [];
  let imageRatio = 0;

  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri];
    if (r.page < 1 || r.page > doc.numPages) continue;
    if (!cache.has(r.page)) {
      const page = await doc.getPage(r.page);
      cache.set(r.page, await extractPageText(page as unknown as PdfPageLike));
    }
    if (!imageCache.has(r.page)) imageCache.set(r.page, await findImageBoxes(doc, r.page).catch(() => []));
    imageRatio = Math.max(imageRatio, imageCoverage(r, imageCache.get(r.page)!));
    const pt = cache.get(r.page)!;
    // 글자 폭 정보가 부정확한 폰트도 있어서, 가로는 "시작점", 세로는 "중심"이 영역 안에 있으면 포함한다.
    const inside = pt.items.filter((it) => {
      const sx = (it.x + Math.min(it.w, it.h) / 2) / pt.width;
      const cy = (it.y + it.h / 2) / pt.height;
      return sx >= r.x0 && sx <= r.x1 && cy >= r.y0 && cy <= r.y1;
    });
    const lines = groupLines(inside).map((l) => ({ ...l, y: l.top / pt.height, cx: (l.x0 + l.x1) / 2 / pt.width }));
    for (const l of lines) if (l.text.trim()) pieces.push({ region: ri, y: l.y, text: l.text.trim() });

    // 영역 안의 그림 중, 위에 텍스트 레이어 글자가 거의 없는 것만 OCR 대상 (글자가 그림 위에 따로 있으면 중복되므로 제외)
    for (const img of imageCache.get(r.page)!) {
      const box = { x0: Math.max(r.x0, img.x0), y0: Math.max(r.y0, img.y0), x1: Math.min(r.x1, img.x1), y1: Math.min(r.y1, img.y1) };
      if (box.x1 - box.x0 < 0.03 || box.y1 - box.y0 < 0.015) continue;
      const covered = lines.filter((l) => l.y >= box.y0 && l.y <= box.y1 && l.cx >= box.x0 && l.cx <= box.x1);
      if (covered.reduce((n, l) => n + l.text.length, 0) > 20) continue;
      ocrTargets.push({ region: ri, page: r.page, box });
    }
  }
  const order = (a: Piece, b: Piece) => a.region - b.region || a.y - b.y;
  const layerText = [...pieces].sort(order).map((p) => p.text).join("\n");
  const scanned = layerText.replace(/\s/g, "").length < 10;

  if (mode === "never" || (mode === "auto" && !scanned && ocrTargets.length === 0)) {
    return { text: layerText, imageRatio, method: "text" };
  }

  options.onProgress?.("OCR 준비 중… (처음 한 번은 한국어 모델을 내려받느라 10~30초 걸릴 수 있습니다)");
  const { ocrCanvas } = await import("@/lib/pdf/ocr");
  const rendered = new Map<number, HTMLCanvasElement>();
  const pageCanvas = async (p: number) => {
    if (!rendered.has(p)) rendered.set(p, await renderPageToCanvas(doc, p, OCR_SCALE));
    return rendered.get(p)!;
  };
  const report = (label: string) => (ratio: number, status: string) => {
    if (status.includes("recogniz")) options.onProgress?.(`${label} ${Math.round(ratio * 100)}%`);
  };

  try {
    // 항상 OCR 또는 스캔 페이지: 영역 전체를 OCR
    if (mode === "always" || scanned) {
      const canvas = await cropRegions(regions, pageCanvas);
      const ocrText = await ocrCanvas(canvas, report("OCR 로 글자 읽는 중…"));
      return ocrText ? { text: ocrText, imageRatio, method: "ocr" } : { text: layerText, imageRatio, method: "text" };
    }
    // 자동: 텍스트는 텍스트 레이어 그대로 (기호까지 정확), 그림 부분만 OCR 해서 제자리에 끼워 넣는다.
    let used = false;
    for (let i = 0; i < ocrTargets.length; i++) {
      const t = ocrTargets[i];
      const canvas = await cropRegions([{ page: t.page, ...t.box }], pageCanvas);
      const text = await ocrCanvas(canvas, report(`그림 속 글자 OCR (${i + 1}/${ocrTargets.length})…`));
      if (text) {
        pieces.push({ region: t.region, y: t.box.y0, text });
        used = true;
      }
    }
    return { text: [...pieces].sort(order).map((p) => p.text).join("\n"), imageRatio, method: used ? "ocr" : "text" };
  } finally {
    rendered.clear();
  }
}
