import type { Exam } from "./types";

type ExamLike = Pick<Exam, "exam_year" | "exam_name" | "subject" | "section">;

export function examShortLabel(e: Pick<Exam, "exam_year" | "section">): string {
  return `${e.exam_year}${e.section ? ` 전공${e.section}` : ""}`;
}

export function examFullLabel(e: ExamLike): string {
  return `${e.exam_year}학년도 ${e.exam_name} ${e.subject}${e.section ? ` 전공 ${e.section}` : ""}`;
}

export function questionRef(e: Pick<Exam, "exam_year" | "section">, label: string): string {
  return `${e.exam_year} ${e.section ?? ""} ${label}번`.replace(/\s+/g, " ");
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return `${Math.round(v * 100)}%`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** 『전습록』, 「...」 등 괄호를 벗기고 공백을 정리한다. */
export function normalizeTitle(s: string): string {
  return s.replace(/[『』「」《》〈〉<>]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** 원전 확신도 / 전체 확신도가 낮으면 검토 필요 */
export const LOW_CONFIDENCE = 0.6;
export function isLowConfidence(v: number | null | undefined): boolean {
  return v !== null && v !== undefined && v < LOW_CONFIDENCE;
}
