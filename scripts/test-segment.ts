/**
 * 문항 자동 분리 로직을 Node 에서 테스트한다.
 *   npm run test:segment -- path/to/exam.pdf
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPageText } from "../src/lib/pdf/extract.ts";
import { segmentQuestions, type PageText } from "../src/lib/pdf/segment.ts";

const file = process.argv[2];
if (!file) {
  console.error("사용법: npm run test:segment -- <pdf 경로>");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const cMapUrl = require.resolve("pdfjs-dist/package.json").replace("package.json", "cmaps/");
const standardFontDataUrl = cMapUrl.replace("cmaps/", "standard_fonts/");

const doc = await getDocument({
  data: new Uint8Array(readFileSync(file)),
  cMapUrl,
  cMapPacked: true,
  standardFontDataUrl,
}).promise;

const pages: PageText[] = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  pages.push(await extractPageText(page));
}

const result = segmentQuestions(pages);
console.log(`pages=${doc.numPages} scanned=${result.scanned}`);
for (const p of result.pages) console.log(`  page ${p.pageNumber}: columns=${p.columns} gutter=${p.gutterX ?? "-"}`);
for (const q of result.questions) {
  console.log(
    `Q${q.label} score=${q.score} type=${q.questionType} pages=${q.pageStart}-${q.pageEnd} regions=${JSON.stringify(q.regions)}`,
  );
  console.log("   " + q.text.split("\n").slice(0, 2).join(" / "));
}
if (result.warnings.length) console.log("warnings:", result.warnings);
