// pdf.js worker / cMap / 표준 폰트 파일을 public/pdfjs 로 복사한다. (npm install 후 자동 실행)
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(pkg)) {
  console.warn("[copy-pdf-worker] pdfjs-dist not found, skipping");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(join(pkg, "build", "pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
cpSync(join(pkg, "cmaps"), join(dest, "cmaps"), { recursive: true });
cpSync(join(pkg, "standard_fonts"), join(dest, "standard_fonts"), { recursive: true });
console.log("[copy-pdf-worker] copied pdf.js assets to public/pdfjs/");

// OCR (tesseract.js) — 그림으로 들어간 제시문의 글자를 브라우저에서 읽기 위한 엔진과 한국어/영어 모델
const tess = join(root, "node_modules", "tesseract.js");
const core = join(root, "node_modules", "tesseract.js-core");
if (existsSync(tess) && existsSync(core)) {
  const out = join(root, "public", "tesseract");
  mkdirSync(join(out, "lang"), { recursive: true });
  cpSync(join(tess, "dist", "worker.min.js"), join(out, "worker.min.js"));
  for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
    cpSync(join(core, f), join(out, f));
  }
  for (const lang of ["kor", "eng"]) {
    const src = join(root, "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`);
    if (existsSync(src)) cpSync(src, join(out, "lang", `${lang}.traineddata.gz`));
  }
  console.log("[copy-pdf-worker] copied tesseract OCR assets to public/tesseract/");
}
