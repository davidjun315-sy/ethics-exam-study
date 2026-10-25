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
