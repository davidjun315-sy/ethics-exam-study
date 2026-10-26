"use client";

/**
 * 브라우저 OCR (tesseract.js, 한국어 + 영어).
 * PDF 에 그림으로 들어간 박스·말풍선 제시문의 글자를 읽는다. API 비용 없음.
 * 엔진과 모델은 postinstall 이 public/tesseract 로 복사해 두며, 처음 한 번만 내려받고 브라우저에 캐시된다.
 */
import type { Worker } from "tesseract.js";

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

function cleanup(text: string): string {
  return text
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/** canvas 의 글자를 읽는다. onProgress 는 0~1 */
export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (ratio: number, status: string) => void,
): Promise<string> {
  progressHandler = onProgress ?? null;
  try {
    const w = await getWorker();
    const { data } = await w.recognize(canvas);
    return cleanup(data.text ?? "");
  } finally {
    progressHandler = null;
  }
}
