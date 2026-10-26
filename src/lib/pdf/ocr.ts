"use client";

/**
 * 브라우저 OCR (tesseract.js, 한국어 + 영어).
 * PDF 에 그림으로 들어간 박스·말풍선 제시문의 글자를 읽는다. API 비용 없음.
 * 엔진과 모델은 postinstall 이 public/tesseract 로 복사해 두며, 처음 한 번만 내려받고 브라우저에 캐시된다.
 */
import type { Worker } from "tesseract.js";
import { cleanOcrText } from "./ocr-clean";

let workerPromise: Promise<Worker> | null = null;
let progressHandler: ((ratio: number, status: string) => void) | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const w = await createWorker(["kor", "eng"], 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/",
        langPath: "/tesseract/lang",
        gzip: true,
        workerBlobURL: false,
        logger: (m) => progressHandler?.(m.progress ?? 0, m.status ?? ""),
      });
      await w.setParameters({ preserve_interword_spaces: "1" });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

// 실제 기출 지면으로 비교해 보니 한 단 폭을 약 1600px 로 키웠을 때 가장 정확했다. (원본 크기 대비 2배 확대 시 약 92→95%)
const TARGET_WIDTH = 1600;

function upscale(src: HTMLCanvasElement): HTMLCanvasElement {
  const factor = Math.min(3, TARGET_WIDTH / src.width);
  if (factor <= 1.05) return src;
  const out = document.createElement("canvas");
  out.width = Math.round(src.width * factor);
  out.height = Math.round(src.height * factor);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/** canvas 의 글자를 읽는다. onProgress 는 0~1 */
export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (ratio: number, status: string) => void,
): Promise<string> {
  progressHandler = onProgress ?? null;
  try {
    const w = await getWorker();
    const { data } = await w.recognize(upscale(canvas));
    return cleanOcrText(data.text ?? "");
  } finally {
    progressHandler = null;
  }
}
