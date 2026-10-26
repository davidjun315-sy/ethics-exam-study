"use client";

/**
 * 관리자 화면(브라우저)에서 쓰는 헬퍼.
 * PDF 렌더링 / 텍스트 추출 / 문항 분리 / 이미지 크롭은 브라우저에서 수행하고,
 * 결과만 서버 API 로 보낸다. (서버리스 환경에서 canvas 의존성을 피하고 비용을 줄이기 위함)
 */
import { getBrowserClient } from "@/lib/supabase/browser";
import { canvasToBlob, cropRegions, loadImage, openPdf, renderPageToCanvas, type ImageSource } from "@/lib/pdf/browser";
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
    texts.push(await extractPageText(page as unknown as PdfPageLike));
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
export async function extractRegionsText(pdfUrl: string, regions: Region[]): Promise<string> {
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
  const parts: string[] = [];
  for (const r of regions) {
    if (r.page < 1 || r.page > doc.numPages) continue;
    if (!cache.has(r.page)) {
      const page = await doc.getPage(r.page);
      cache.set(r.page, await extractPageText(page as unknown as PdfPageLike));
    }
    const pt = cache.get(r.page)!;
    const inside = pt.items.filter((it) => {
      const cx = (it.x + it.w / 2) / pt.width;
      const cy = (it.y + it.h / 2) / pt.height;
      return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1;
    });
    const text = groupLines(inside)
      .map((l) => l.text)
      .join("\n")
      .trim();
    if (text) parts.push(text);
  }
  return parts.join("\n");
}
