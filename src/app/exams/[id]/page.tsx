import Link from "next/link";
import { notFound } from "next/navigation";
import { DataError, load } from "@/components/DataError";
import { QuestionCard } from "@/components/QuestionCard";
import { Empty, PageTitle } from "@/components/ui";
import { isAdmin } from "@/lib/admin-guard";
import { getExam, listQuestionSummaries } from "@/lib/data/queries";
import { examFullLabel } from "@/lib/format";

export default async function ExamPage({ params, searchParams }: PageProps<"/exams/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const hide = sp.hide === "1";
  const { data, error } = await load(async () => {
    const [exam, questions, admin] = await Promise.all([getExam(id), listQuestionSummaries({ examId: id }), isAdmin()]);
    return { exam, questions, admin };
  });
  if (error || !data) return <DataError error={error} />;
  if (!data.exam) notFound();
  const { exam, questions, admin } = data;

  return (
    <div>
      <PageTitle
        title={examFullLabel(exam)}
        subtitle={exam.note ?? `${questions.length}문항`}
        actions={
          <>
            <Link href={hide ? `/exams/${id}` : `/exams/${id}?hide=1`} className="btn">
              {hide ? "정답 표시" : "정답 숨기기"}
            </Link>
            {exam.pdf_url && (
              <a href={exam.pdf_url} target="_blank" rel="noreferrer" className="btn">
                원본 PDF
              </a>
            )}
            {admin && (
              <Link href={`/admin/exams/${id}`} className="btn-primary">
                관리
              </Link>
            )}
          </>
        }
      />
      {questions.length === 0 ? (
        <Empty>아직 문항이 분리되지 않았습니다.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {questions.map((q) => (
            <QuestionCard key={q.id} q={q} showExam={false} hideAnswer={hide} />
          ))}
        </div>
      )}
    </div>
  );
}
