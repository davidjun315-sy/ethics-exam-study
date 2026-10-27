/** ZIP 작성기 점검: 만든 zip 을 시스템 unzip 으로 풀어 내용이 같은지 확인.  npm run test:zip */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, createZip, padLabel, safeFileName } from "../src/lib/zip.ts";

let failed = 0;
const check = (label: string, ok: boolean, d = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${d ? ` — ${d}` : ""}`);
};
check("CRC32 표준값", crc32(new TextEncoder().encode("123456789")) === 0xcbf43926);
check("번호 정렬용 패딩", padLabel("3") === "03" && padLabel("12-1") === "12-1" && padLabel("3-1") === "03-1");
check("파일 이름 정리", safeFileName('2026 A/3:번?') === "2026 A_3_번_");

const a = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
const b = new TextEncoder().encode("두 번째 파일");
const dir = mkdtempSync(join(tmpdir(), "zip-"));
writeFileSync(join(dir, "t.zip"), createZip([{ name: "2026 전공A 01번.png", data: a }, { name: "2026 전공A 02번.png", data: b }]));
try {
  const list = execFileSync("unzip", ["-Z1", join(dir, "t.zip")], { encoding: "utf8" });
  check("한글 파일 이름 목록", list.includes("2026 전공A 01번.png") && list.includes("2026 전공A 02번.png"), list.trim().replace(/\n/g, ", "));
  execFileSync("unzip", ["-q", "-o", join(dir, "t.zip"), "-d", join(dir, "out")]);
  check("내용 일치", Buffer.compare(readFileSync(join(dir, "out", "2026 전공A 01번.png")), Buffer.from(a)) === 0 && readFileSync(join(dir, "out", "2026 전공A 02번.png"), "utf8") === "두 번째 파일");
  execFileSync("unzip", ["-tq", join(dir, "t.zip")]);
  check("무결성 검사 (unzip -t)", true);
} catch (e) {
  check("unzip 으로 풀기", false, (e as Error).message);
}
if (failed) process.exit(1);
