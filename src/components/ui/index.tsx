import Link from "next/link";
import type { ReactNode } from "react";
import { isLowConfidence, pct } from "@/lib/format";
import { ROLE_LABEL, STATUS_LABEL, VERIFICATION_LABEL, type AnalysisStatus, type PhilosopherRole, type VerificationStatus } from "@/lib/types";

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {right}
    </div>
  );
}

type Tone = "neutral" | "navy" | "warn" | "danger" | "ok";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  navy: "bg-navy-soft text-navy border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
};

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function ConfidenceBadge({ label, value, warnBelow = 0.6 }: { label?: string; value: number | null | undefined; warnBelow?: number }) {
  if (value === null || value === undefined) return <Badge>{label ? `${label} -` : "-"}</Badge>;
  const tone: Tone = value < warnBelow ? "warn" : value >= 0.85 ? "ok" : "navy";
  return (
    <Badge tone={tone} title="AI 확신도">
      {label ? `${label} ` : ""}
      {pct(value)}
    </Badge>
  );
}

export function ReviewBadge({ show }: { show: boolean }) {
  return show ? <Badge tone="warn">⚠ 검토 필요</Badge> : null;
}

export function StatusBadge({ status }: { status: AnalysisStatus | null | undefined }) {
  if (!status) return <Badge>분석 전</Badge>;
  const tone: Tone =
    status === "verified" ? "ok" : status === "needs_review" ? "warn" : status === "error" ? "danger" : status === "analyzed" ? "navy" : "neutral";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function RoleBadge({ role }: { role: PhilosopherRole }) {
  const tone: Tone = role === "main" ? "navy" : role === "distractor" ? "danger" : "neutral";
  return <Badge tone={tone}>{ROLE_LABEL[role]}</Badge>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const tone: Tone = status === "confirmed" ? "ok" : status === "likely" ? "navy" : status === "candidate" ? "warn" : "neutral";
  return (
    <Badge tone={tone} title={status}>
      {VERIFICATION_LABEL[status]} ({status})
    </Badge>
  );
}

export function Tag({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-sm text-ink hover:border-navy hover:text-navy">
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function StatCard({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <div className="card px-4 py-3 hover:border-line-strong">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export { isLowConfidence };
