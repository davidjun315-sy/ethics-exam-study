import { requireAdmin, jsonError } from "@/lib/admin-guard";
import { loadExportData } from "@/lib/data/export";
import { combinedFile, indexFile, philosopherFile, philosopherUpdatedAt, romanize } from "@/lib/export/markdown";
import { createZip, safeFileName } from "@/lib/zip";
import { TRADITIONS, UNCLASSIFIED } from "@/lib/traditions";

export const maxDuration = 60;

const TRADITION_SLUG: Record<string, string> = { 동양윤리: "east", 한국윤리: "korea", 서양윤리: "west", 사회사상: "social", 도덕교육론: "moral-edu", [UNCLASSIFIED]: "etc" };

/** 파일 이름은 영문만: 한글 이름(filename*)은 일부 브라우저에서 'download' 로 바뀌어 버린다 */
function download(body: string | Uint8Array, name: string, type: string) {
  return new Response(typeof body === "string" ? new TextEncoder().encode(body) : (body as BodyInit), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 관리자: 분석 자료를 채팅 AI 용 Markdown 으로 내보내기. 요청할 때마다 DB 에서 새로 만든다.
 * scope=all | tradition(&tradition=동양윤리) | philosopher(&id=) | zip(&since=ISO 시각: 그 뒤 바뀐 사상가만)
 * text=0 → 문제 원문 빼기, future=0 → 향후 출제 빼기
 */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const opt = { questionText: url.searchParams.get("text") !== "0", future: url.searchParams.get("future") !== "0" };
  const now = new Date();
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now); // 2026-10-30
  const md = "text/markdown; charset=utf-8";
  try {
    const { philosophers, questions } = await loadExportData();

    if (scope === "philosopher") {
      const p = philosophers.find((x) => x.id === url.searchParams.get("id"));
      if (!p) return Response.json({ error: "내보낼 자료가 있는 사상가를 찾을 수 없습니다." }, { status: 404 });
      return download(philosopherFile(p, questions, opt, now), `ethics-${romanize(p.name)}-${day}.md`, md);
    }

    if (scope === "tradition") {
      const t = url.searchParams.get("tradition") ?? "";
      if (![...TRADITIONS, UNCLASSIFIED].includes(t as never)) return Response.json({ error: "분류를 확인하세요." }, { status: 400 });
      const ps = philosophers.filter((p) => p.tradition === t);
      const ids = new Set(ps.map((p) => p.id));
      const qs = questions.filter((q) => q.philosophers.some((p) => ids.has(p.id)));
      return download(combinedFile(`${t} — 기출 분석 자료`, ps, qs, opt, now), `ethics-${TRADITION_SLUG[t]}-${day}.md`, md);
    }

    if (scope === "zip") {
      const since = url.searchParams.get("since");
      const ps = since && !Number.isNaN(Date.parse(since)) ? philosophers.filter((p) => (philosopherUpdatedAt(p, questions) ?? "") > since) : philosophers;
      if (!ps.length) return Response.json({ error: "마지막 내보내기 이후 바뀐 사상가가 없습니다." }, { status: 404 });
      // 안의 파일 이름은 늘 같게 (바뀐 것만 받아도 채팅 AI 에 올려 둔 같은 이름의 파일을 바꾸면 되도록)
      const names = new Map(ps.map((p) => [p.id, `${safeFileName(p.tradition ?? "")}_${safeFileName(p.name)}.md`]));
      const enc = new TextEncoder();
      const files = [
        { name: "00_안내.md", data: enc.encode(indexFile(ps, questions, names, now, since)) },
        ...ps.map((p) => ({ name: names.get(p.id)!, data: enc.encode(philosopherFile(p, questions, opt, now)) })),
      ];
      return download(createZip(files, now), `ethics-${since ? "changed" : "philosophers"}-${day}.zip`, "application/zip");
    }

    return download(combinedFile("윤리 기출 — 전체 분석 자료", philosophers, questions, opt, now), `ethics-all-${day}.md`, md);
  } catch (e) {
    return jsonError(e);
  }
}
