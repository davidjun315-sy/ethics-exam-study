import Link from "next/link";
import type { QuestionSummary } from "@/lib/data/queries";
import { isLowConfidence, questionRef } from "@/lib/format";
import { Badge, ConfidenceBadge, ReviewBadge } from "./ui";
import { LocalMarks } from "./study/LocalMarks";

export function QuestionCard({
  q,
  showExam = true,
  hideAnswer = false,
  extra,
}: {
  q: QuestionSummary;
  showExam?: boolean;
  hideAnswer?: boolean;
  extra?: React.ReactNode;
}) {
  const a = q.analysis;
  const main = q.philosophers.filter((p) => p.role === "main" || p.role === "comparison");
  const review = a?.status === "needs_review" || isLowConfidence(a?.source_confidence);
  return (
    <Link href={`/questions/${q.id}`} className="card block p-4 transition-colors hover:border-navy/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[15px] font-bold text-ink">{showExam ? questionRef(q.exam, q.label) : `${q.label}번`}</span>
          {q.score !== null && <Badge>{q.score}점</Badge>}
          {q.question_type && <Badge>{q.question_type}</Badge>}
          {a?.area && <Badge tone="navy">{a.area}</Badge>}
        </div>
        <LocalMarks questionId={q.id} />
      </div>
      {main.length > 0 && (
        <div className="mt-2 text-sm font-semibold text-navy">{main.map((p) => p.name).join(" · ")}</div>
      )}
      {q.concepts.length > 0 && (
        <div className="mt-1 line-clamp-1 text-sm text-muted">{q.concepts.map((c) => c.name).join(", ")}</div>
      )}
      {!a && q.question_text && <p className="mt-2 line-clamp-2 text-sm text-muted">{q.question_text}</p>}
      {a?.answer && !hideAnswer && (
        <div className="mt-2 line-clamp-2 text-sm">
          <span className="font-semibold text-muted">정답 </span>
          {a.answer}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {a?.difficulty && <Badge>난이도 {a.difficulty}</Badge>}
        {a ? <ConfidenceBadge label="확신도" value={a.overall_confidence} /> : <Badge>분석 전</Badge>}
        <ReviewBadge show={review} />
        {extra}
      </div>
    </Link>
  );
}
